import { NextRequest, NextResponse } from "next/server";
import { agentHandshake, type AgentPayload } from "@/lib/agent";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as AgentPayload;
  const result = await agentHandshake(payload);
  return NextResponse.json(result);
}

export async function GET() {
  const result = await agentHandshake({ action: "status" });
  return NextResponse.json(result);
}
