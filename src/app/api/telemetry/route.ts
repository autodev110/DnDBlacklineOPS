import { NextRequest, NextResponse } from "next/server";
import {
  clearTelemetryErrors,
  getTelemetrySummary,
  isTelemetryEvent,
  recordTelemetryEvent,
  type TelemetryEvent
} from "@/lib/telemetryStore";

export const runtime = "nodejs";

export async function GET() {
  const summary = getTelemetrySummary();
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as TelemetryEvent;
    if (!isTelemetryEvent(payload)) {
      return NextResponse.json({ error: "Invalid telemetry payload." }, { status: 400 });
    }

    recordTelemetryEvent(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telemetry ingestion failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const cleared = clearTelemetryErrors();
  return NextResponse.json({ ok: true, cleared });
}
