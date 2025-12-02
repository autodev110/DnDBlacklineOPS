import { promises as fs } from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT_PATH = path.join(process.cwd(), "src", "prompts", "latexifyprompt.txt");

export type LatexifyRequest = {
  title: string;
  input: string;
};

export async function buildLatexFromInput(payload: LatexifyRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const [prompt, userInput] = await Promise.all([
    fs.readFile(PROMPT_PATH, "utf8"),
    Promise.resolve(payload.input.trim())
  ]);

  if (!userInput) {
    throw new Error("User input cannot be empty.");
  }

  const title = payload.title.trim();
  const combined = [
    prompt.trim(),
    "",
    "----",
    "",
    title ? `Project Title: ${title}` : "",
    "User Input:",
    userInput
  ]
    .filter(Boolean)
    .join("\n");

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(combined);
  const response = await result.response;

  return response.text().trim();
}
