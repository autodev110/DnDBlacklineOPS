"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { Panel } from "@/components/Panel";
import { usePdfCache } from "@/hooks/usePdfCache";
import { postTelemetry } from "@/lib/telemetryClient";
import type { DocumentType } from "@/lib/telemetryStore";
import { usePersistentState, clearPersistentState } from "@/hooks/usePersistentState";

type ContractFormState = {
  targetAddress: string;
  targetAcquisitionPrice: string;
  targetSellingPrice: string;
  earnestDeposit: string;
  inspectionPeriod: string;
  parcelId: string;
};

type ContractGenerationPayload = ContractFormState;

type ContractGenerationResponse = {
  acquisition: string;
  investor: string;
  error?: never;
};

type ContractGenerationError = {
  error: string;
  acquisition?: never;
  investor?: never;
};

const INITIAL_FORM: ContractFormState = {
  targetAddress: "",
  targetAcquisitionPrice: "",
  targetSellingPrice: "",
  earnestDeposit: "",
  inspectionPeriod: "",
  parcelId: ""
};

const fieldConfig: Array<{
  name: keyof ContractFormState;
  label: string;
  placeholder: string;
  type?: string;
}> = [
  {
    name: "targetAddress",
    label: "Target Address",
    placeholder: "123 Neon Ave, Synth City, CA"
  },
  {
    name: "targetAcquisitionPrice",
    label: "Target Acquisition Price",
    placeholder: "$25,000"
  },
  {
    name: "targetSellingPrice",
    label: "Target Selling Price",
    placeholder: "$42,000"
  },
  {
    name: "earnestDeposit",
    label: "Earnest Deposit",
    placeholder: "$500"
  },
  {
    name: "inspectionPeriod",
    label: "Closing Time (days)",
    placeholder: "30",
    type: "number"
  },
  {
    name: "parcelId",
    label: "Parcel ID",
    placeholder: "TBD-12345"
  }
];

export default function ContractGeneratorPage() {
  const [form, setForm] = usePersistentState<ContractFormState>(
    "contractgen-form",
    INITIAL_FORM
  );
  const [statusMessage, setStatusMessage] = usePersistentState<string>(
    "contractgen-status-message",
    ""
  );
  const [statusVariant, setStatusVariant] = usePersistentState<"idle" | "success" | "error">(
    "contractgen-status-variant",
    "idle"
  );
  const [acquisitionOutput, setAcquisitionOutput] = usePersistentState<string>(
    "contractgen-acquisition-output",
    ""
  );
  const [investorOutput, setInvestorOutput] = usePersistentState<string>(
    "contractgen-investor-output",
    ""
  );
  const [compileMessage, setCompileMessage] = usePersistentState<string>(
    "contractgen-compile-message",
    ""
  );
  const [compileVariant, setCompileVariant] = usePersistentState<
    "idle" | "loading" | "success" | "error"
  >("contractgen-compile-variant", "idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompilingPdf, setIsCompilingPdf] = useState(false);
  const [acquisitionPdfUrl, setAcquisitionPdfUrl] = useState<string | null>(null);
  const [investorPdfUrl, setInvestorPdfUrl] = useState<string | null>(null);
  const [acquisitionPdfBase64, setAcquisitionPdfBase64] = useState<string | null>(null);
  const [investorPdfBase64, setInvestorPdfBase64] = useState<string | null>(null);
  const pdfUrlRegistry = useRef<string[]>([]);
  const { entries: cacheEntries, addEntry, clearCache } = usePdfCache();

  const isGenerateDisabled = useMemo(() => {
    return fieldConfig.some(({ name }) => !form[name].trim());
  }, [form]);

  const handleChange =
    (field: keyof ContractFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm({
        ...form,
        [field]: value
      });
    };

  const revokePdfUrls = useCallback(() => {
    pdfUrlRegistry.current.forEach((url) => URL.revokeObjectURL(url));
    pdfUrlRegistry.current = [];
  }, []);

  const resetPreviewState = useCallback(() => {
    revokePdfUrls();
    setAcquisitionPdfUrl(null);
    setInvestorPdfUrl(null);
    setAcquisitionPdfBase64(null);
    setInvestorPdfBase64(null);
    setCompileMessage("");
    setIsCompilingPdf(false);
    setCompileVariant("idle");
  }, [revokePdfUrls]);

  const clearPdfCache = useCallback(() => {
    const cleared = clearCache();
    resetPreviewState();
    clearPersistentState("contractgen-form");
    clearPersistentState("contractgen-status-message");
    clearPersistentState("contractgen-status-variant");
    clearPersistentState("contractgen-acquisition-output");
    clearPersistentState("contractgen-investor-output");
    clearPersistentState("contractgen-compile-message");
    clearPersistentState("contractgen-compile-variant");
    if (cleared > 0) {
      postTelemetry({
        type: "pdf_cache_cleared",
        count: cleared,
        timestamp: Date.now()
      });
    }
  }, [clearCache, resetPreviewState]);

  useEffect(() => {
    return () => {
      revokePdfUrls();
    };
  }, [revokePdfUrls]);

  const base64ToPdfUrl = useCallback(
    (base64: string) => {
      const binary = atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      pdfUrlRegistry.current.push(url);
      return url;
    },
    []
  );

  const compileLatexToPdf = useCallback(
    async (
      latex: string,
      docType: DocumentType,
      propertyAddress: string,
      variant: "initial" | "recompile" = "initial"
    ) => {
      const startedAt = performance.now();
      const telemetryTimestamp = Date.now();
      const propertyLabel = propertyAddress.trim() || "Unspecified Property";

      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ latexSource: latex })
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          const message =
            (detail && (detail.error as string)) ||
            `PDF compilation failed with status ${response.status}`;
          throw new Error(message);
        }

        const payload = await response.json();
        const base64 = payload?.pdfBase64;

        if (!base64 || typeof base64 !== "string") {
          throw new Error("Compilation completed but returned no PDF data.");
        }

        const durationMs = performance.now() - startedAt;
        const url = base64ToPdfUrl(base64);

        postTelemetry({
          type: "pdf_compiled",
          property: propertyLabel,
          docType,
          durationMs,
          timestamp: telemetryTimestamp,
          variant
        });

        return { base64, url, durationMs };
      } catch (error) {
        postTelemetry({
          type: "pdf_compile_failure",
          property: propertyLabel,
          docType,
          reason: error instanceof Error ? error.message : "Unknown PDF compile error",
          timestamp: telemetryTimestamp,
          variant
        });
        throw error;
      }
    },
    [base64ToPdfUrl]
  );

  const handleCopyToClipboard = useCallback((value: string) => {
    if (!value.trim()) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(value).catch(() => undefined);
  }, []);

  const sanitizedFileStem = useMemo(() => {
    const trimmed = form.targetAddress.trim();
    if (!trimmed) {
      return "dnd_blackline";
    }
    return trimmed.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "dnd_blackline";
  }, [form.targetAddress]);

  const getPdfFileName = useCallback(
    (docType: DocumentType) => {
      const suffix = docType === "acquisition" ? "acquisition" : "investor_proposal";
      return `${sanitizedFileStem}_${suffix}.pdf`;
    },
    [sanitizedFileStem]
  );

  const handleDownloadPdf = useCallback(
    (url: string | null, docType: DocumentType) => {
      if (!url) {
        return;
      }

      if (typeof window === "undefined" || !window.document) {
        return;
      }

      const doc = window.document;
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = getPdfFileName(docType);
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      if (form.targetAddress.trim()) {
        postTelemetry({
          type: "pdf_downloaded",
          property: form.targetAddress,
          docType,
          timestamp: Date.now()
        });
      }
    },
    [form.targetAddress, getPdfFileName]
  );

  const handleRecompile = useCallback(
    async (docType: DocumentType) => {
      const source = docType === "acquisition" ? acquisitionOutput : investorOutput;
      if (!source.trim()) {
        setCompileVariant("error");
        setCompileMessage("No LaTeX content to compile.");
        return;
      }

      setIsCompilingPdf(true);
      setCompileVariant("loading");
      setCompileMessage(
        docType === "acquisition"
          ? "Recompiling acquisition PDF…"
          : "Recompiling investor PDF…"
      );

      try {
        const result = await compileLatexToPdf(source, docType, form.targetAddress, "recompile");

        if (docType === "acquisition") {
          if (acquisitionPdfUrl) {
            URL.revokeObjectURL(acquisitionPdfUrl);
          }
          setAcquisitionPdfUrl(result.url);
          setAcquisitionPdfBase64(result.base64);
        } else {
          if (investorPdfUrl) {
            URL.revokeObjectURL(investorPdfUrl);
          }
          setInvestorPdfUrl(result.url);
          setInvestorPdfBase64(result.base64);
        }

        const nextAcquisition = docType === "acquisition" ? result.base64 : acquisitionPdfBase64;
        const nextInvestor = docType === "investor" ? result.base64 : investorPdfBase64;

        if (nextAcquisition && nextInvestor) {
          const cacheSize = addEntry({
            propertyAddress: form.targetAddress,
            fileStem: sanitizedFileStem,
            variant: "recompile",
            acquisitionPdfBase64: nextAcquisition,
            investorPdfBase64: nextInvestor,
            generatedAt: Date.now()
          });

          if (form.targetAddress.trim()) {
            postTelemetry({
              type: "pdf_cached",
              property: form.targetAddress,
              cacheSize,
              timestamp: Date.now()
            });
          }
        }

        setCompileVariant("success");
        setCompileMessage(
          docType === "acquisition"
            ? "Acquisition PDF refreshed."
            : "Investor proposal PDF refreshed."
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while recompiling.";
        setCompileVariant("error");
        setCompileMessage(message);
      } finally {
        setIsCompilingPdf(false);
      }
    },
    [
      acquisitionOutput,
      investorOutput,
      form.targetAddress,
      compileLatexToPdf,
      acquisitionPdfUrl,
      investorPdfUrl,
      addEntry,
      acquisitionPdfBase64,
      investorPdfBase64,
      sanitizedFileStem
    ]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (isGenerateDisabled) {
      setStatusMessage("All fields are required before generating contracts.");
      setStatusVariant("error");
      return;
    }

    setStatusMessage("");
    setStatusVariant("idle");
    setIsSubmitting(true);
    setAcquisitionOutput("");
    setInvestorOutput("");
    resetPreviewState();

    if (form.targetAddress.trim()) {
      postTelemetry({
        type: "contract_attempt",
        property: form.targetAddress,
        timestamp: Date.now()
      });
    }

    const contractStartedAt = performance.now();

    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form as ContractGenerationPayload)
      });

      const payload = (await response.json()) as
        | ContractGenerationResponse
        | ContractGenerationError;

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Contract generation failed.";
        throw new Error(message);
      }

      setAcquisitionOutput(payload.acquisition ?? "");
      setInvestorOutput(payload.investor ?? "");
      setStatusMessage(
        "Gemini responses received. Review outputs and export to LaTeX as needed."
      );
      setStatusVariant("success");

      try {
        setIsCompilingPdf(true);
        setCompileVariant("loading");
        setCompileMessage("Compiling PDFs via CloudConvert…");
        const [acquisitionResult, investorResult] = await Promise.all([
          compileLatexToPdf(
            payload.acquisition ?? "",
            "acquisition",
            form.targetAddress,
            "initial"
          ),
          compileLatexToPdf(payload.investor ?? "", "investor", form.targetAddress, "initial")
        ]);
        setAcquisitionPdfUrl(acquisitionResult.url);
        setInvestorPdfUrl(investorResult.url);
        setAcquisitionPdfBase64(acquisitionResult.base64);
        setInvestorPdfBase64(investorResult.base64);

        const cacheSize = addEntry({
          propertyAddress: form.targetAddress,
          fileStem: sanitizedFileStem,
          variant: "initial",
          acquisitionPdfBase64: acquisitionResult.base64,
          investorPdfBase64: investorResult.base64,
          generatedAt: Date.now()
        });

        if (form.targetAddress.trim()) {
          postTelemetry({
            type: "pdf_cached",
            property: form.targetAddress,
            cacheSize,
            timestamp: Date.now()
          });
        }

        setCompileVariant("success");
        setCompileMessage("PDFs ready for review and download.");

        if (form.targetAddress.trim()) {
          postTelemetry({
            type: "contract_success",
            property: form.targetAddress,
            durationMs: performance.now() - contractStartedAt,
            timestamp: Date.now()
          });
        }
      } catch (compileError) {
        const message =
          compileError instanceof Error
            ? compileError.message
            : "An unexpected error occurred while compiling PDFs.";
        setCompileVariant("error");
        setCompileMessage(message);
        if (form.targetAddress.trim()) {
          postTelemetry({
            type: "contract_failure",
            property: form.targetAddress,
            reason: message,
            timestamp: Date.now()
          });
        }
      } finally {
        setIsCompilingPdf(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error during generation.";
      setStatusMessage(message);
      setStatusVariant("error");
      if (form.targetAddress.trim()) {
        postTelemetry({
          type: "contract_failure",
          property: form.targetAddress,
          reason: message,
          timestamp: Date.now()
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contractgen-shell">
      <Panel
        title="Contract Input Console"
        subtitle="Feed agent the parameters for target property to search, compile, and output the documents."
        accent="INPUT"
      >
        <form className="contract-form" onSubmit={handleSubmit} noValidate>
          <div className="contract-form-grid">
            {fieldConfig.map(({ name, label, placeholder, type }) => (
              <div key={name} className="contract-field">
                <label htmlFor={name}>{label}</label>
                <input
                  id={name}
                  name={name}
                  type={type ?? "text"}
                  className="contract-input"
                  placeholder={placeholder}
                  value={form[name]}
                  onChange={handleChange(name)}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            className="contract-submit"
            disabled={isSubmitting || isGenerateDisabled}
          >
            {isSubmitting ? "Generating…" : "Generate Contracts"}
          </button>
          {statusMessage ? (
            <span className={`contract-status contract-status--${statusVariant}`}>
              {statusMessage}
            </span>
          ) : null}
        </form>
      </Panel>
      <Panel
        title="Contract Output Relay"
        subtitle="LaTeX-ready responses streamed from agent."
        accent="OUTPUT"
      >
        <div className="contract-output-grid">
          <div className="contract-output-pane">
            <div className="contract-output-header">
              <span>Residential Acquisition</span>
              <div className="contract-output-actions">
                <button
                  type="button"
                  className="contract-copy"
                  onClick={() => handleCopyToClipboard(acquisitionOutput)}
                  disabled={!acquisitionOutput.trim()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="contract-secondary"
                  onClick={() => handleRecompile("acquisition")}
                  disabled={isCompilingPdf || !acquisitionOutput.trim()}
                >
                  Recompile
                </button>
              </div>
            </div>
            <textarea
              className="contract-output-body"
              value={acquisitionOutput}
              onChange={(event) => setAcquisitionOutput(event.target.value)}
              placeholder={
                isSubmitting
                  ? "Awaiting acquisition brief from Gemini…"
                  : "Generated LaTeX will appear here once available."
              }
            />
          </div>
          <div className="contract-output-pane">
            <div className="contract-output-header">
              <span>Investor Proposal</span>
              <div className="contract-output-actions">
                <button
                  type="button"
                  className="contract-copy"
                  onClick={() => handleCopyToClipboard(investorOutput)}
                  disabled={!investorOutput.trim()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="contract-secondary"
                  onClick={() => handleRecompile("investor")}
                  disabled={isCompilingPdf || !investorOutput.trim()}
                >
                  Recompile
                </button>
              </div>
            </div>
            <textarea
              className="contract-output-body"
              value={investorOutput}
              onChange={(event) => setInvestorOutput(event.target.value)}
              placeholder={
                isSubmitting
                  ? "Awaiting investor proposal from Gemini…"
                  : "Generated LaTeX will appear here once available."
              }
            />
          </div>
        </div>
      </Panel>
      <Panel
        title="Compiled PDF Deck"
        subtitle="CloudConvert renders ready-to-share documents for each channel."
        accent="PDF OUTPUT"
      >
        <div className="contract-pdf-stack">
          <div className="contract-pdf-card">
            <header className="contract-pdf-card__header">
              <h3>Residential Acquisition PDF</h3>
              <button
                type="button"
                className="contract-secondary"
                onClick={() => handleDownloadPdf(acquisitionPdfUrl, "acquisition")}
                disabled={!acquisitionPdfUrl}
              >
                Download PDF
              </button>
            </header>
            <div className="contract-pdf-card__viewport">
              {acquisitionPdfUrl ? (
                <iframe
                  title="Residential Acquisition PDF Preview"
                  src={acquisitionPdfUrl}
                  className="contract-pdf-frame"
                />
              ) : (
                <p className="contract-pdf-status">
                  {isCompilingPdf
                    ? "Rendering acquisition document…"
                    : "PDF will appear once compiled."}
                </p>
              )}
            </div>
          </div>
          <div className="contract-pdf-card">
            <header className="contract-pdf-card__header">
              <h3>Investor Proposal PDF</h3>
              <button
                type="button"
                className="contract-secondary"
                onClick={() => handleDownloadPdf(investorPdfUrl, "investor")}
                disabled={!investorPdfUrl}
              >
                Download PDF
              </button>
            </header>
            <div className="contract-pdf-card__viewport">
              {investorPdfUrl ? (
                <iframe
                  title="Investor Proposal PDF Preview"
                  src={investorPdfUrl}
                  className="contract-pdf-frame"
                />
              ) : (
                <p className="contract-pdf-status">
                  {isCompilingPdf
                    ? "Rendering investor document…"
                    : "PDF will appear once compiled."}
                </p>
              )}
            </div>
          </div>
        </div>
        <footer className="contract-pdf-footer">
          <button
            type="button"
            className="contract-secondary contract-secondary--danger"
            onClick={clearPdfCache}
            disabled={
              isCompilingPdf ||
              (cacheEntries.length === 0 && !acquisitionPdfUrl && !investorPdfUrl)
            }
          >
            Clear PDF Cache
          </button>
          {compileMessage ? (
            <span
              className={`contract-status${
                compileVariant === "success"
                  ? " contract-status--success"
                  : compileVariant === "error"
                  ? " contract-status--error"
                  : ""
              }`}
            >
              {compileMessage}
            </span>
          ) : null}
        </footer>
      </Panel>
    </div>
  );
}
