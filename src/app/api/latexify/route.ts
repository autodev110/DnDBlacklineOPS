import { NextRequest, NextResponse } from "next/server";
import { buildLatexFromInput } from "@/lib/latexifyAgent";

export const runtime = "nodejs";

type LatexifyPayload = {
  title?: string;
  input?: string;
};

const MAX_INPUT_LENGTH = 15000;

function sanitizeLatexOutput(raw: string): string {
  const trimmed = raw.trim();
  // Handle fenced blocks like ```latex ... ``` or ``` ... ```
  const fenced = trimmed.match(/^```(?:latex)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const fencedAnywhere = trimmed.replace(/```(?:latex)?/gi, "```");
  const tripleFence = fencedAnywhere.match(/^```\s*([\s\S]*?)\s*```$/);
  if (tripleFence) {
    return tripleFence[1].trim();
  }

  // Handle '''latex ... ''' or ''' ... '''
  const tripleLatex = trimmed.match(/^'''latex\s*([\s\S]*?)\s*'''$/i);
  if (tripleLatex) {
    return tripleLatex[1].trim();
  }
  const triple = trimmed.match(/^'''\s*([\s\S]*?)\s*'''$/);
  if (triple) {
    return triple[1].trim();
  }

  // If the string starts with latex then a newline and code, strip the prefix.
  if (/^latex\s+/i.test(trimmed)) {
    return trimmed.replace(/^latex\s+/i, "").trim();
  }

  return trimmed;
}

export async function POST(request: NextRequest) {
  let payload: LatexifyPayload;
  try {
    payload = (await request.json()) as LatexifyPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = (payload.title ?? "").toString();
  const input = (payload.input ?? "").toString();

  if (!input.trim()) {
    return NextResponse.json({ error: "Input text is required." }, { status: 400 });
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `Input too long. Limit to ${MAX_INPUT_LENGTH} characters.` },
      { status: 400 }
    );
  }

  try {
    const latex = await buildLatexFromInput({
      title,
      input
    });

    const cleanLatex = sanitizeLatexOutput(latex).replace(/\\newline\b/g, "\\mbox{}\\\\");

    return NextResponse.json({ latex: cleanLatex });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate LaTeX document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
