import { NextRequest, NextResponse } from "next/server";
import {
  generateContractDocuments,
  type ContractAgentVariables
} from "@/lib/agent";

export const runtime = "nodejs";

type ContractRequestPayload = {
  targetAddress?: string;
  targetAcquisitionPrice?: string;
  targetSellingPrice?: string;
  earnestDeposit?: string;
  inspectionPeriod?: string;
  parcelId?: string;
};

function validatePayload(payload: ContractRequestPayload): ContractAgentVariables {
  const requiredFields: Array<keyof ContractAgentVariables> = [
    "targetAddress",
    "targetAcquisitionPrice",
    "targetSellingPrice",
    "earnestDeposit",
    "inspectionPeriod",
    "parcelId"
  ];

  for (const field of requiredFields) {
    const value = payload[field];
    if (!value || !value.toString().trim()) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return {
    targetAddress: payload.targetAddress!.trim(),
    targetAcquisitionPrice: payload.targetAcquisitionPrice!.trim(),
    targetSellingPrice: payload.targetSellingPrice!.trim(),
    earnestDeposit: payload.earnestDeposit!.trim(),
    inspectionPeriod: payload.inspectionPeriod!.trim(),
    parcelId: payload.parcelId!.trim()
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as ContractRequestPayload;
    const variables = validatePayload(payload);

    const result = await generateContractDocuments(variables);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate contract documents.";
    const status = message.startsWith("Missing required field") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
