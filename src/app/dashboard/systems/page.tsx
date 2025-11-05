import { Panel } from "@/components/Panel";

export default function SystemsPage() {
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <Panel
        title="Systems Sync"
        subtitle="Telemetry stream ready for uplink"
        accent="SYNC"
      >
        <div
          style={{
            display: "grid",
            gap: "1rem"
          }}
        >
          <div
            style={{
              borderRadius: "0.65rem",
              border: "1px solid rgba(255,102,0,0.45)",
              padding: "1.1rem 1.3rem",
              background: "rgba(255,255,255,0.88)",
              fontSize: "0.85rem",
              letterSpacing: "0.15rem",
              textTransform: "uppercase",
              color: "#1a1a1a"
            }}
          >
            Diagnostics uplink ready. Awaiting node handshake.
          </div>
          <div
            style={{
              borderRadius: "0.65rem",
              border: "1px solid rgba(0,198,255,0.35)",
              padding: "1rem 1.3rem",
              background: "rgba(5,5,5,0.88)",
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.12rem",
              textTransform: "uppercase"
            }}
          >
            Deploy interface components as automation endpoints come online.
          </div>
        </div>
      </Panel>
    </div>
  );
}
