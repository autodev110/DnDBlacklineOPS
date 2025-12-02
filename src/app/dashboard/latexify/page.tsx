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
import { postTelemetry } from "@/lib/telemetryClient";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { DocumentType } from "@/lib/telemetryStore";

type StatusVariant = "idle" | "success" | "error";
type CompileVariant = "idle" | "loading" | "success" | "error";

export default function LatexifyPage() {
  const [title, setTitle] = usePersistentState<string>("latexify-title", "");
  const [inputText, setInputText] = usePersistentState<string>("latexify-input", "");
  const [latexOutput, setLatexOutput] = usePersistentState<string>("latexify-output", "");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusVariant, setStatusVariant] = useState<StatusVariant>("idle");
  const [compileMessage, setCompileMessage] = useState("");
  const [compileVariant, setCompileVariant] = useState<CompileVariant>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const pdfUrlRegistry = useRef<string[]>([]);

  const hasRequiredFields = useMemo(
    () => Boolean(title.trim()) && Boolean(inputText.trim()),
    [title, inputText]
  );

  const sanitizedFileStem = useMemo(() => {
    const stem = title.trim() || "latexify_proposal";
    return stem.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "latexify";
  }, [title]);

  const handleInputChange =
    (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setter(event.target.value);

  const revokePdfUrls = useCallback(() => {
    pdfUrlRegistry.current.forEach((url) => URL.revokeObjectURL(url));
    pdfUrlRegistry.current = [];
  }, []);

  useEffect(() => {
    return () => revokePdfUrls();
  }, [revokePdfUrls]);

  const base64ToPdfUrl = useCallback((base64: string) => {
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
  }, []);

  const getPdfFileName = useCallback(() => {
    return `${sanitizedFileStem}.pdf`;
  }, [sanitizedFileStem]);

  const propertyLabel = useMemo(
    () => `LaTeX-ify: ${title.trim() || "Untitled Proposal"}`,
    [title]
  );

  const compileLatexToPdf = useCallback(
    async (latex: string, variant: "initial" | "recompile" = "initial") => {
      const startedAt = performance.now();
      const telemetryTimestamp = Date.now();

      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latexSource: latex, includeLogo: true })
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
          docType: "latexify" as DocumentType,
          durationMs,
          timestamp: telemetryTimestamp,
          variant
        });

        return { base64, url, durationMs };
      } catch (error) {
        postTelemetry({
          type: "pdf_compile_failure",
          property: propertyLabel,
          docType: "latexify",
          reason: error instanceof Error ? error.message : "Unknown PDF compile error",
          timestamp: telemetryTimestamp,
          variant
        });
        throw error;
      }
    },
    [base64ToPdfUrl, propertyLabel]
  );

  const handleDownloadPdf = useCallback(
    (url: string | null) => {
      if (!url || typeof window === "undefined" || !window.document) {
        return;
      }

      const doc = window.document;
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = getPdfFileName();
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      postTelemetry({
        type: "pdf_downloaded",
        property: propertyLabel,
        docType: "latexify",
        timestamp: Date.now()
      });
    },
    [getPdfFileName, propertyLabel]
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

  const handleRecompile = useCallback(async () => {
    if (!latexOutput.trim()) {
      setCompileVariant("error");
      setCompileMessage("No LaTeX content to compile.");
      return;
    }

    setIsCompiling(true);
    setCompileVariant("loading");
    setCompileMessage("Recompiling PDF with logo…");

    try {
      const result = await compileLatexToPdf(latexOutput, "recompile");
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(result.url);
      setPdfBase64(result.base64);
      setCompileVariant("success");
      setCompileMessage("PDF refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected compile error.";
      setCompileVariant("error");
      setCompileMessage(message);
    } finally {
      setIsCompiling(false);
    }
  }, [compileLatexToPdf, latexOutput, pdfUrl]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isGenerating) {
        return;
      }

      if (!hasRequiredFields) {
        setStatusVariant("error");
        setStatusMessage("Both title and input text are required.");
        return;
      }

      revokePdfUrls();
      setPdfUrl(null);
      setPdfBase64(null);
      setStatusVariant("idle");
      setStatusMessage("");
      setCompileVariant("idle");
      setCompileMessage("");
      setIsGenerating(true);

      postTelemetry({
        type: "contract_attempt",
        property: propertyLabel,
        timestamp: Date.now()
      });

      const requestStartedAt = performance.now();

      try {
        const response = await fetch("/api/latexify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, input: inputText })
        });

        const payload = await response.json();
        if (!response.ok) {
          const message =
            (payload && payload.error) || "Unable to generate LaTeX for the provided input.";
          throw new Error(message);
        }

        const latex = (payload as { latex?: string }).latex ?? "";
        setLatexOutput(latex);
        setStatusVariant("success");
        setStatusMessage("Gemini response received. Review and compile.");

        setIsCompiling(true);
        setCompileVariant("loading");
        setCompileMessage("Compiling PDF with logo…");
        const compileResult = await compileLatexToPdf(latex, "initial");
        setPdfUrl(compileResult.url);
        setPdfBase64(compileResult.base64);
        setCompileVariant("success");
        setCompileMessage("PDF ready for review and download.");

        postTelemetry({
          type: "contract_success",
          property: propertyLabel,
          durationMs: performance.now() - requestStartedAt,
          timestamp: Date.now()
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error during run.";
        setStatusVariant("error");
        setStatusMessage(message);
        setCompileVariant("error");
        setCompileMessage(message);
        postTelemetry({
          type: "contract_failure",
          property: propertyLabel,
          reason: message,
          timestamp: Date.now()
        });
      } finally {
        setIsGenerating(false);
        setIsCompiling(false);
      }
    },
    [
      compileLatexToPdf,
      hasRequiredFields,
      inputText,
      isGenerating,
      propertyLabel,
      revokePdfUrls,
      title
    ]
  );

  return (
    <div className="contractgen-shell">
      <Panel
        title="LaTeX-ify Console"
        subtitle="Paste raw text, title it, and convert to polished LaTeX with the DnD template."
        accent="INPUT"
      >
        <form className="contract-form" onSubmit={handleSubmit} noValidate>
          <div className="contract-form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="contract-field">
              <label htmlFor="latexify-title">Document Title</label>
              <input
                id="latexify-title"
                name="latexify-title"
                type="text"
                className="contract-input"
                placeholder="Proposal title (used for PDF name)"
                value={title}
                onChange={handleInputChange(setTitle)}
                autoComplete="off"
              />
            </div>
            <div className="contract-field">
              <label htmlFor="latexify-input">Plaintext Content</label>
              <textarea
                id="latexify-input"
                name="latexify-input"
                className="contract-output-body"
                style={{ minHeight: "240px" }}
                placeholder="Paste the raw content to transform into LaTeX…"
                value={inputText}
                onChange={handleInputChange(setInputText)}
              />
            </div>
          </div>
          <button type="submit" className="contract-submit" disabled={isGenerating || !hasRequiredFields}>
            {isGenerating ? "Generating…" : "Generate LaTeX + PDF"}
          </button>
          {statusMessage ? (
            <span className={`contract-status contract-status--${statusVariant}`}>
              {statusMessage}
            </span>
          ) : null}
        </form>
      </Panel>

      <Panel
        title="LaTeX Output"
        subtitle="Editable LaTeX returned from Gemini. Adjust and recompile as needed."
        accent="OUTPUT"
      >
        <div className="contract-output-pane" style={{ width: "100%" }}>
          <div className="contract-output-header">
            <span>LaTeX Document</span>
            <div className="contract-output-actions">
              <button
                type="button"
                className="contract-copy"
                onClick={() => handleCopyToClipboard(latexOutput)}
                disabled={!latexOutput.trim()}
              >
                Copy
              </button>
              <button
                type="button"
                className="contract-secondary"
                onClick={handleRecompile}
                disabled={isCompiling || !latexOutput.trim()}
              >
                Recompile
              </button>
            </div>
          </div>
          <textarea
            className="contract-output-body"
            value={latexOutput}
            onChange={handleInputChange(setLatexOutput)}
            placeholder={
              isGenerating
                ? "Awaiting LaTeX from Gemini…"
                : "Generated LaTeX will appear here once available."
            }
          />
        </div>
      </Panel>

      <Panel
        title="Compiled PDF"
        subtitle="Rendered with CloudConvert and includes the DnD logo on the title page."
        accent="PDF OUTPUT"
      >
        <div className="contract-pdf-card" style={{ width: "100%" }}>
          <header className="contract-pdf-card__header">
            <h3>{title.trim() || "LaTeX-ify Output"}</h3>
            <button
              type="button"
              className="contract-secondary"
              onClick={() => handleDownloadPdf(pdfUrl)}
              disabled={!pdfUrl}
            >
              Download PDF
            </button>
          </header>
          <div className="contract-pdf-card__viewport">
            {pdfUrl ? (
              <iframe
                title="LaTeX-ify PDF Preview"
                src={pdfUrl}
                className="contract-pdf-frame"
              />
            ) : (
              <p className="contract-pdf-status">
                {isCompiling
                  ? "Rendering PDF…"
                  : "PDF will appear once compiled. Generate to start."}
              </p>
            )}
          </div>
        </div>
        <footer className="contract-pdf-footer">
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
