"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { usePdfCache } from "@/hooks/usePdfCache";
import { postTelemetry } from "@/lib/telemetryClient";
import type { CachedDocumentType, PdfCacheEntry } from "@/hooks/usePdfCache";
import type { TelemetrySummary } from "@/lib/telemetryStore";

const REFRESH_INTERVAL_MS = 5000;

type FetchState = {
  summary: TelemetrySummary | null;
  error: string | null;
  isLoading: boolean;
};

function formatNumber(value?: number | null, options?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatDurationMs(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }
  return `${Math.round(value)} ms`;
}

function formatPercentage(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(timestamp?: number | null) {
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

function ensureDownload(
  entry: PdfCacheEntry,
  docType: CachedDocumentType,
  downloadDocument: ReturnType<typeof usePdfCache>["downloadDocument"]
) {
  const stem = entry.fileStem || entry.propertyAddress.replace(/\s+/g, "_").toLowerCase();
  const filename =
    docType === "acquisition" ? `${stem}_acquisition.pdf` : `${stem}_investor_proposal.pdf`;
  const ok = downloadDocument(entry.id, docType, filename);
  if (ok) {
    postTelemetry({
      type: "pdf_downloaded",
      property: entry.propertyAddress,
      docType,
      timestamp: Date.now()
    });
  }
}

export function OpsDashboard() {
  const [state, setState] = useState<FetchState>({
    summary: null,
    error: null,
    isLoading: true
  });

  const { entries, clearCache, downloadDocument } = usePdfCache();

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`Telemetry request failed with status ${response.status}`);
      }
      const payload = (await response.json()) as TelemetrySummary;
      setState({ summary: payload, error: null, isLoading: false });
    } catch (error) {
      setState((previous) => ({
        summary: previous.summary,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load telemetry metrics.",
        isLoading: false
      }));
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = window.setInterval(fetchSummary, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchSummary]);

  const handleClearCache = useCallback(() => {
    const cleared = clearCache();
    if (cleared > 0) {
      postTelemetry({
        type: "pdf_cache_cleared",
        count: cleared,
        timestamp: Date.now()
      });
      fetchSummary();
    }
  }, [clearCache, fetchSummary]);

  const cacheMeta = useMemo(() => {
    if (!entries.length) {
      return {
        latest: null,
        count: 0
      };
    }
    const [latest] = entries;
    return { latest, count: entries.length };
  }, [entries]);

  const handleClearErrors = useCallback(async () => {
    try {
      const response = await fetch("/api/telemetry", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Failed to clear errors (status ${response.status})`);
      }
      fetchSummary();
    } catch (error) {
      console.error("Failed to clear telemetry errors", error);
    }
  }, [fetchSummary]);

  const summary = state.summary;

  return (
    <div className="dashboard-layered">
      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Panel
          title="Operations Telemetry"
          subtitle="Live metrics across contract generation and compilation."
          accent="LIVE DATA"
        >
          <div className="telemetry-grid">
            <div className="telemetry-card">
              <span className="telemetry-card__label">Contract Attempts</span>
              <strong className="telemetry-card__value">
                {formatNumber(summary?.totals.contractAttempts)}
              </strong>
              <span className="telemetry-card__meta">
                {`Successes: ${formatNumber(summary?.totals.contractSuccesses)} | Failures: ${formatNumber(
                  summary?.totals.contractFailures
                )}`}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-card__label">Average LLM Turnaround</span>
              <strong className="telemetry-card__value">
                {formatDurationMs(summary?.metrics.contractAverageMs)}
              </strong>
              <span className="telemetry-card__meta">
                Last Run: {formatTimestamp(summary?.lastContract?.timestamp)}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-card__label">PDF Compile Average</span>
              <strong className="telemetry-card__value">
                {formatDurationMs(summary?.metrics.pdfAverageMs)}
              </strong>
              <span className="telemetry-card__meta">
                Net Jitter: {formatDurationMs(summary?.metrics.pdfNetJitterMs)}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-card__label">PDF Success Rate</span>
              <strong className="telemetry-card__value">
                {formatPercentage(summary?.metrics.pdfSuccessRate)}
              </strong>
              <span className="telemetry-card__meta">
                {`Attempts: ${formatNumber(
                  (summary?.totals.pdfCompilations ?? 0) + (summary?.totals.pdfCompilationFailures ?? 0)
                )} | Failures: ${formatNumber(summary?.totals.pdfCompilationFailures)}`}
              </span>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-card__label">PDF Downloads</span>
              <strong className="telemetry-card__value">
                {formatNumber(summary?.totals.pdfDownloads)}
              </strong>
              <span className="telemetry-card__meta">
                Cache Entries: {formatNumber(summary?.cache.entries ?? cacheMeta.count)}
              </span>
            </div>
            <div className="telemetry-card telemetry-card--status">
              <span className="telemetry-card__label">Ops Pulse</span>
              <strong className="telemetry-card__value">
                {state.isLoading ? "SYNCING…" : state.error ? "ATTENTION" : "NOMINAL"}
              </strong>
              <span className="telemetry-card__meta">
                Updated: {formatTimestamp(summary?.lastUpdated ?? null)}
              </span>
            </div>
          </div>
          {state.error ? <p className="telemetry-error">{state.error}</p> : null}
        </Panel>
        <Panel
          title="Recent Activity"
          subtitle="Latest LLM generations and PDF compilations."
          accent="TIMELINE"
        >
          <ul className="telemetry-activity">
            {(summary?.recentActivity ?? []).length ? (
              summary?.recentActivity.map((activity) => (
                <li key={`${activity.kind}-${activity.property}-${activity.timestamp}`}>
                  <div>
                    <strong>{activity.property}</strong>
                    <span>{formatTimestamp(activity.timestamp)}</span>
                  </div>
                  <div className="telemetry-activity__meta">
                    <span
                      className={`telemetry-activity__badge telemetry-activity__badge--${activity.kind}`}
                    >
                      {activity.kind === "contract"
                        ? "LLM"
                        : `PDF ${activity.docType?.toUpperCase() ?? ""}`.trim() || "PDF"}
                    </span>
                    <span
                      className={`telemetry-activity__status telemetry-activity__status--${activity.status}`}
                    >
                      {activity.status === "success" ? "Success" : "Failure"}
                    </span>
                    {activity.durationMs !== undefined ? (
                      <span>{formatDurationMs(activity.durationMs)}</span>
                    ) : null}
                    {activity.detail ? <span>{activity.detail}</span> : null}
                  </div>
                </li>
              ))
            ) : (
              <li className="telemetry-activity__empty">
                {state.isLoading ? "Awaiting activity…" : "No runs yet."}
              </li>
            )}
          </ul>
        </Panel>
      </div>
      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Panel
          title="PDF Cache History"
          subtitle="Recently compiled packets ready for download."
          accent="ARCHIVE"
        >
          <div className="pdf-history">
            {entries.length === 0 ? (
              <p className="pdf-history__empty">Cache clean. Generate contracts to populate history.</p>
            ) : (
              <ul className="pdf-history__list">
                {entries.map((entry) => (
                  <li key={entry.id} className="pdf-history__item">
                    <div className="pdf-history__meta">
                      <strong>{entry.propertyAddress}</strong>
                      <span>{formatTimestamp(entry.createdAt)}</span>
                      <span className={`pdf-history__badge pdf-history__badge--${entry.variant}`}>
                        {entry.variant === "recompile" ? "Recompiled" : "Initial"}
                      </span>
                    </div>
                    <div className="pdf-history__actions">
                      <button
                        type="button"
                        className="contract-secondary"
                        onClick={() => ensureDownload(entry, "acquisition", downloadDocument)}
                      >
                        Acquisition PDF
                      </button>
                      <button
                        type="button"
                        className="contract-secondary"
                        onClick={() => ensureDownload(entry, "investor", downloadDocument)}
                      >
                        Investor PDF
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className="pdf-history__footer">
            <button
              type="button"
              className="contract-secondary contract-secondary--danger"
              onClick={handleClearCache}
              disabled={!entries.length}
            >
              Clear PDF Cache
            </button>
            {cacheMeta.latest ? (
              <span className="pdf-history__hint">
                Latest: {cacheMeta.latest.propertyAddress} &middot;{" "}
                {formatTimestamp(cacheMeta.latest.createdAt)}
              </span>
            ) : null}
          </footer>
        </Panel>
        <Panel
          title="Exception Feed"
          subtitle="Latest anomalies flagged during automation runs."
          accent="ALERTS"
        >
          <div className="telemetry-errors__wrapper">
            <ul className="telemetry-errors">
              {(summary?.recentErrors ?? []).length ? (
                summary?.recentErrors.map((error) => (
                  <li key={`${error.source}-${error.timestamp}`}>
                    <div>
                      <span className={`telemetry-errors__badge telemetry-errors__badge--${error.source}`}>
                        {error.source === "contract" ? "CONTRACT" : "PDF"}
                      </span>
                      <time>{formatTimestamp(error.timestamp)}</time>
                    </div>
                    <p>{error.message}</p>
                  </li>
                ))
              ) : (
                <li className="telemetry-errors__empty">All systems nominal.</li>
              )}
            </ul>
            <button
              type="button"
              className="contract-secondary contract-secondary--danger"
              onClick={handleClearErrors}
              disabled={!(summary?.recentErrors?.length)}
            >
              Clear Error Logs
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
