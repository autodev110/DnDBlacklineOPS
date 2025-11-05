import type { TelemetryEvent } from "./telemetryStore";

export function postTelemetry(event: TelemetryEvent) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    fetch("/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    }).catch(() => undefined);
  } catch {
    // Ignored: telemetry should never break UX.
  }
}
