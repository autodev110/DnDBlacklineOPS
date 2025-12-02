"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";

type TelemetrySummary = {
  totals: {
    contractAttempts: number;
    contractSuccesses: number;
    contractFailures: number;
    pdfCompilations: number;
    pdfCompilationFailures: number;
  };
  lastUpdated: number;
  cache: {
    entries: number;
    lastClearAt: number | null;
  };
  recentActivity: Array<{
    kind: "contract" | "compile";
    property: string;
    status: "success" | "failure";
    timestamp: number;
    docType?: "acquisition" | "investor" | "latexify";
    detail?: string;
    variant?: "initial" | "recompile";
  }>;
};

const EMPTY_SUMMARY: TelemetrySummary = {
  totals: {
    contractAttempts: 0,
    contractSuccesses: 0,
    contractFailures: 0,
    pdfCompilations: 0,
    pdfCompilationFailures: 0
  },
  lastUpdated: Date.now(),
  cache: {
    entries: 0,
    lastClearAt: null
  },
  recentActivity: []
};

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

export default function SystemsPage() {
  const [summary, setSummary] = useState<TelemetrySummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/telemetry", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Telemetry request failed (${response.status})`);
        }
        const payload = (await response.json()) as TelemetrySummary;
        if (isMounted) {
          setSummary(payload);
        }
      } catch (error) {
        console.error("Failed to load systems telemetry", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    const interval = window.setInterval(load, 10_000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const compileHealth = useMemo(() => {
    const attempts =
      summary.totals.pdfCompilations + summary.totals.pdfCompilationFailures;
    const failureRate =
      attempts > 0 ? summary.totals.pdfCompilationFailures / attempts : 0;
    if (attempts === 0) {
      return { status: "Idle", tone: "neutral" as const };
    }
    if (failureRate > 0.25) {
      return { status: "Degraded", tone: "alert" as const };
    }
    if (failureRate > 0) {
      return { status: "Nominal · recovering", tone: "warn" as const };
    }
    return { status: "Nominal", tone: "ok" as const };
  }, [summary]);

  const llmHealth = useMemo(() => {
    if (summary.totals.contractAttempts === 0) {
      return { status: "Idle", tone: "neutral" as const };
    }
    if (summary.totals.contractFailures > 0) {
      return { status: "Nominal · watch", tone: "warn" as const };
    }
    return { status: "Nominal", tone: "ok" as const };
  }, [summary]);

  const recentSyncs = useMemo(
    () => summary.recentActivity.slice(0, 5),
    [summary.recentActivity]
  );

  return (
    <div className="systems-grid">
      <Panel
        title="Operational Sync Grid"
        subtitle="Real-time health across LLM and PDF pipelines."
        accent="LIVE"
      >
        <div className="systems-status-board">
          <div className={`systems-status systems-status--${llmHealth.tone}`}>
            <span className="systems-status__label">LLM Generation</span>
            <strong>{llmHealth.status}</strong>
            <span className="systems-status__meta">
              Attempts {formatNumber(summary.totals.contractAttempts)} · Failures{" "}
              {formatNumber(summary.totals.contractFailures)}
            </span>
          </div>
          <div className={`systems-status systems-status--${compileHealth.tone}`}>
            <span className="systems-status__label">PDF Compilation</span>
            <strong>{compileHealth.status}</strong>
            <span className="systems-status__meta">
              Attempts{" "}
              {formatNumber(
                summary.totals.pdfCompilations + summary.totals.pdfCompilationFailures
              )}{" "}
              · Failures {formatNumber(summary.totals.pdfCompilationFailures)}
            </span>
          </div>
          <div className="systems-status systems-status--neutral">
            <span className="systems-status__label">Cache Horizon</span>
            <strong>{formatNumber(summary.cache.entries)}</strong>
            <span className="systems-status__meta">
              Cleared {formatTimestamp(summary.cache.lastClearAt)}
            </span>
          </div>
        </div>
      </Panel>

      <Panel
        title="Node Heartbeat"
        subtitle="Infrastructure pings and last updated markers."
        accent="SYNC"
      >
        <div className="systems-heartbeat">
          <div>
            <span>Last telemetry update</span>
            <strong>{formatTimestamp(summary.lastUpdated)}</strong>
          </div>
          <div>
            <span>LLM Successes</span>
            <strong>{formatNumber(summary.totals.contractSuccesses)}</strong>
          </div>
          <div>
            <span>LLM Failures</span>
            <strong>{formatNumber(summary.totals.contractFailures)}</strong>
          </div>
          <div>
            <span>PDF Successes</span>
            <strong>{formatNumber(summary.totals.pdfCompilations)}</strong>
          </div>
          <div>
            <span>PDF Failures</span>
            <strong>{formatNumber(summary.totals.pdfCompilationFailures)}</strong>
          </div>
        </div>
      </Panel>

      <Panel
        title="Recent Sync Events"
        subtitle="Most recent coordination pings across systems."
        accent="LOG"
      >
        <ul className="systems-activity">
          {recentSyncs.length ? (
            recentSyncs.map((activity) => (
              <li key={`${activity.kind}-${activity.property}-${activity.timestamp}`}>
                <div>
                  <strong>{activity.property}</strong>
                  <span>{formatTimestamp(activity.timestamp)}</span>
                </div>
                <div className="systems-activity__meta">
                  <span className={`telemetry-activity__badge telemetry-activity__badge--${activity.kind}`}>
                    {activity.kind === "contract"
                      ? "LLM"
                      : `PDF ${activity.docType?.toUpperCase() ?? ""}`.trim() || "PDF"}
                  </span>
                  <span
                    className={`telemetry-activity__status telemetry-activity__status--${activity.status}`}
                  >
                    {activity.status === "success" ? "Success" : "Failure"}
                  </span>
                  {activity.detail ? <span>{activity.detail}</span> : null}
                </div>
              </li>
            ))
          ) : (
            <li className="telemetry-activity__empty">
              {isLoading ? "Awaiting telemetry…" : "No sync events logged."}
            </li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
