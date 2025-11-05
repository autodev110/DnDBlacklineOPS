import { promises as fs } from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AgentPayload = {
  action?: string;
  parameters?: Record<string, unknown>;
};

export type AgentResponse = {
  status: "ok";
  message: string;
  echo: AgentPayload;
  timestamp: string;
};

export async function agentHandshake(payload: AgentPayload): Promise<AgentResponse> {
  return {
    status: "ok",
    message:
      "Agent interface stub ready. Integrate automation protocols to extend functionality.",
    echo: payload,
    timestamp: new Date().toISOString()
  };
}

const PROMPTS_ROOT = path.join(process.cwd(), "src", "prompts");

const PROMPT_FILES = {
  acquisition: "acquisition_prompt.txt",
  investor: "investor_prompt.txt"
} as const;

type PromptKind = keyof typeof PROMPT_FILES;

const VARIABLE_LABELS = {
  targetAddress: "Target Address",
  targetAcquisitionPrice: "Target Acquisition Price",
  targetSellingPrice: "Target Selling Price",
  earnestDeposit: "Earnest Deposit",
  inspectionPeriod: "Inspection/Closing Period (days)",
  parcelId: "Parcel ID"
} as const;

type VariableKey = keyof typeof VARIABLE_LABELS;

export type ContractAgentVariables = {
  targetAddress: string;
  targetAcquisitionPrice: string;
  targetSellingPrice: string;
  earnestDeposit: string;
  inspectionPeriod: string;
  parcelId: string;
};

export type ContractGenerationResult = {
  acquisition: string;
  investor: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyVariableOverrides(
  prompt: string,
  variables: ContractAgentVariables,
  keys: VariableKey[]
): string {
  return keys.reduce((accumulator, key) => {
    const label = VARIABLE_LABELS[key];
    const safeValue = variables[key]?.toString().trim() ?? "";
    if (!safeValue) {
      return accumulator;
    }

    const pattern = new RegExp(
      `(${escapeRegExp(label)}:\\s*\\{)\\s*([^}]*)\\s*(\\})([ \\t]*)`,
      "i"
    );

    return accumulator.replace(pattern, (_match, start, _inner, end, trailing) => {
      return `${start}${safeValue}${end}${trailing}`;
    });
  }, prompt);
}

function buildOverlayBlock(variables: ContractAgentVariables, keys: VariableKey[]): string {
  const lines = keys.map((key) => {
    const label = VARIABLE_LABELS[key];
    const value = variables[key]?.toString().trim() ?? "";
    return ` ${label}: { ${value} }`;
  });

  return `Variable Input Overrides\n{\n${lines.join(",\n")}\n}\n`;
}

async function loadPrompt(kind: PromptKind): Promise<string> {
  const filePath = path.join(PROMPTS_ROOT, PROMPT_FILES[kind]);
  return fs.readFile(filePath, "utf8");
}

async function generateContent(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;

  return response.text().trim();
}

async function preparePrompt(
  kind: PromptKind,
  variables: ContractAgentVariables
): Promise<string> {
  const basePrompt = await loadPrompt(kind);

  const sharedKeys: VariableKey[] = ["targetAddress", "earnestDeposit", "inspectionPeriod", "parcelId"];
  const acquisitionOnly: VariableKey[] = ["targetAcquisitionPrice"];
  const investorOnly: VariableKey[] = ["targetSellingPrice"];

  let prepared = applyVariableOverrides(basePrompt, variables, sharedKeys);

  if (kind === "acquisition") {
    prepared = applyVariableOverrides(prepared, variables, acquisitionOnly);
    const overlay = buildOverlayBlock(variables, [...sharedKeys, ...acquisitionOnly]);
    return `${overlay}\n${prepared}`;
  }

  prepared = applyVariableOverrides(prepared, variables, investorOnly);
  const overlay = buildOverlayBlock(variables, [...sharedKeys, ...investorOnly]);
  return `${overlay}\n${prepared}`;
}

export async function generateContractDocuments(
  variables: ContractAgentVariables
): Promise<ContractGenerationResult> {
  const acquisitionPrompt = await preparePrompt("acquisition", variables);
  const acquisition = await generateContent(acquisitionPrompt);

  const investorPrompt = await preparePrompt("investor", variables);
  const investor = await generateContent(investorPrompt);

  return { acquisition, investor };
}
