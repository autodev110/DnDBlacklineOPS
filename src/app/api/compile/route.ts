import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = "https://api.cloudconvert.com/v2";
const apiKey = process.env.CLOUDCONVERT_API_KEY;

type CompilePayload = {
  latexSource?: string;
};

async function createJob(latexSource: string) {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tasks: {
        upload_tex: {
          operation: "import/base64",
          file: Buffer.from(latexSource, "utf8").toString("base64"),
          filename: "document.tex"
        },
        convert_pdf: {
          operation: "convert",
          input_format: "tex",
          output_format: "pdf",
          input: "upload_tex"
        },
        export_pdf: {
          operation: "export/url",
          input: "convert_pdf"
        }
      }
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
      const errors = (task as { result?: { errors?: Array<{ message?: string }> } })?.result
        ?.errors;
      if (errors && errors.length) {
        return errors.map((item) => item.message).filter(Boolean).join("; ");
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
      console.error("CloudConvert job failed", {
        jobId,
        status,
        message,
        job
      });
      throw new Error(message);
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

  if (!latexSource || typeof latexSource !== "string" || !latexSource.trim()) {
    return NextResponse.json({ error: "Missing LaTeX source." }, { status: 400 });
  }

  try {
    const jobId = await createJob(latexSource);
    const completedJob = await waitForJob(jobId);
    const fileUrl = findExportFileUrl(completedJob);

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Unable to download PDF (status ${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBase64 = Buffer.from(arrayBuffer).toString("base64");

    return NextResponse.json({ pdfBase64 });
  } catch (error) {
    console.error("CloudConvert compilation failed:", error);
    const message =
      error instanceof Error ? error.message : "PDF compilation failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
