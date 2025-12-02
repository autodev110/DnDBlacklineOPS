import { promises as fs } from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = "https://api.cloudconvert.com/v2";
const apiKey = process.env.CLOUDCONVERT_API_KEY;
const LOGO_PATH = path.join(process.cwd(), "logos", "dndlogo2.png");

type CompilePayload = {
  latexSource?: string;
  includeLogo?: boolean;
};

async function createJob(latexSource: string) {
  const tasks: Record<string, unknown> = {
    upload_tex: {
      operation: "import/base64",
      file: Buffer.from(latexSource, "utf8").toString("base64"),
      filename: "document.tex"
    },
    convert_pdf: {
      operation: "convert",
      input_format: "tex",
      output_format: "pdf",
      input: "upload_tex",
      main_file: "document.tex"
    },
    export_pdf: {
      operation: "export/url",
      input: "convert_pdf"
    }
  };

  const response = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to create CloudConvert job (status ${response.status}): ${detail || "No detail"}`
    );
  }

  const payload = await response.json();
  return payload?.data?.id as string;
}

function extractTaskError(job: any): string | null {
  const tasks: Array<Record<string, unknown>> = job?.tasks ?? [];
  for (const task of tasks) {
    if (task?.status === "error") {
      const message = (task as { message?: string }).message;
      const errors = (task as { result?: { errors?: Array<{ message?: string }> } })?.result?.errors;
      const errorMessages = errors?.map((item) => item.message).filter(Boolean);
      if (errorMessages && errorMessages.length) {
        return errorMessages.join("; ");
      }
      if (errors && errors.length) {
        return JSON.stringify(errors);
      }
      if (message) {
        return message;
      }
    }
  }
  return job?.message ?? null;
}

async function waitForJob(jobId: string) {
  const maxAttempts = 20;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Unable to fetch job status (status ${response.status}): ${detail || "No detail"}`
      );
    }

    const payload = await response.json();
    const job = payload?.data;
    const status = job?.status;

    if (status === "finished") {
      return job;
    }

    if (status === "error" || status === "failed") {
      const message =
        extractTaskError(job) ||
        payload?.data?.message ||
        "CloudConvert reported an error while processing the job.";
      let logDetail = "";
      const logUrl = findLogUrl(job);
      if (logUrl) {
        try {
          const logResponse = await fetch(logUrl);
          if (logResponse.ok) {
            const text = await logResponse.text();
            // Send only the tail to avoid huge payloads.
            logDetail = text.length > 2000 ? text.slice(-2000) : text;
          }
        } catch (logError) {
          console.error("Failed to fetch CloudConvert log", logError);
        }
      }

      console.error("CloudConvert job failed", {
        jobId,
        status,
        message,
        job,
        logTail: logDetail
      });
      throw new Error(logDetail ? `${message} | log: ${logDetail}` : message);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("CloudConvert job polling timed out.");
}

function findExportFileUrl(job: any): string {
  const tasks: Array<Record<string, unknown>> = job?.tasks ?? [];
  for (const task of tasks) {
    if (task?.operation === "export/url" && task?.status === "finished") {
      const files = (task?.result as { files?: Array<{ url?: string }> })?.files ?? [];
      const url = files[0]?.url;
      if (url) {
        return url;
      }
    }
  }
  throw new Error("CloudConvert did not return an export URL for the compiled PDF.");
}

function findLogUrl(job: any): string | null {
  const tasks: Array<Record<string, unknown>> = job?.tasks ?? [];
  for (const task of tasks) {
    if (task?.operation === "convert" && task?.result && (task as any).result?.files) {
      const files = (task as { result?: { files?: Array<{ url?: string; filename?: string; name?: string }> } })
        ?.result?.files;
      if (files && files.length) {
        const logFile = files.find((file) => {
          const name = file?.filename ?? file?.name ?? "";
          return typeof name === "string" && name.toLowerCase().endsWith(".log");
        });
        if (logFile?.url) {
          return logFile.url;
        }
      }
    }
  }
  return null;
}

function stripLogoInclude(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const lower = line.toLowerCase();
      if (lower.includes("\\includegraphics") && lower.includes("dndlogo2")) {
        // Reserve vertical space so the title stays lower on the page.
        return "\\vspace*{1.5cm} % logo placeholder";
      }
      return line;
    })
    .join("\n");
}

async function stampLogo(pdfBase64: string): Promise<string> {
  const logoBuffer = await fs.readFile(LOGO_PATH);
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const doc = await PDFDocument.load(pdfBytes);
  const png = await doc.embedPng(logoBuffer);
  const pages = doc.getPages();
  if (!pages.length) {
    return pdfBase64;
  }
  const page = pages[0];
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const maxWidth = pageWidth * 0.32; // slightly smaller logo
  const scale = maxWidth / png.width;
  const logoWidth = png.width * scale;
  const logoHeight = png.height * scale;
  const x = (pageWidth - logoWidth) / 2;
  const topMargin = 160; // pts from top; tweak if needed
  const y = pageHeight - topMargin - logoHeight;

  page.drawImage(png, {
    x,
    y,
    width: logoWidth,
    height: logoHeight
  });

  const stamped = await doc.save();
  return Buffer.from(stamped).toString("base64");
}

export async function POST(request: NextRequest) {
  if (!apiKey) {
    return NextResponse.json(
      { error: "CloudConvert API key is not configured." },
      { status: 500 }
    );
  }

  let payload: CompilePayload;
  try {
    payload = (await request.json()) as CompilePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { latexSource } = payload;
  const includeLogo = Boolean(payload.includeLogo);

  if (!latexSource || typeof latexSource !== "string" || !latexSource.trim()) {
    return NextResponse.json({ error: "Missing LaTeX source." }, { status: 400 });
  }

  const attemptCompile = async (source: string) => {
    const jobId = await createJob(source);
    const completedJob = await waitForJob(jobId);
    const fileUrl = findExportFileUrl(completedJob);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Unable to download PDF (status ${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  };

  try {
    const sanitizedSource = includeLogo ? stripLogoInclude(latexSource) : latexSource;
    const compiledBase64 = await attemptCompile(sanitizedSource);
    if (!includeLogo) {
      return NextResponse.json({ pdfBase64: compiledBase64, logoIncluded: false });
    }

    try {
      const stamped = await stampLogo(compiledBase64);
      return NextResponse.json({ pdfBase64: stamped, logoIncluded: true, stamped: true });
    } catch (stampError) {
      console.error("Logo stamping failed; returning unstamped PDF:", stampError);
      return NextResponse.json({
        pdfBase64: compiledBase64,
        logoIncluded: false,
        warning: "Logo could not be stamped; returning PDF without logo."
      });
    }
  } catch (error) {
    console.error("CloudConvert compilation failed:", error);
    const message =
      error instanceof Error ? error.message : "PDF compilation failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
