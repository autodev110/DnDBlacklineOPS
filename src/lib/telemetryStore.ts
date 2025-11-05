type DocumentType = "acquisition" | "investor";

type ContractStatus = "success" | "failure";

export type TelemetryEvent =
  | {
      type: "contract_attempt";
      property: string;
      timestamp: number;
    }
  | {
      type: "contract_success";
      property: string;
      durationMs: number;
      timestamp: number;
    }
  | {
      type: "contract_failure";
      property?: string;
      reason?: string;
      timestamp: number;
    }
  | {
      type: "pdf_compiled";
      property: string;
      docType: DocumentType;
      durationMs: number;
      timestamp: number;
    }
  | {
      type: "pdf_compile_failure";
      property?: string;
      docType?: DocumentType;
      reason?: string;
      timestamp: number;
    }
  | {
      type: "pdf_cached";
      property: string;
      cacheSize: number;
      timestamp: number;
    }
  | {
      type: "pdf_cache_cleared";
      count: number;
      timestamp: number;
    }
  | {
      type: "pdf_downloaded";
      property: string;
      docType: DocumentType;
      timestamp: number;
    };

export type TelemetrySummary = {
  totals: {
    contractAttempts: number;
    contractSuccesses: number;
    contractFailures: number;
    pdfCompilations: number;
    pdfCompilationFailures: number;
    pdfDownloads: number;
  };
  metrics: {
    contractAverageMs: number | null;
    pdfAverageMs: number | null;
    pdfNetJitterMs: number | null;
    contractSuccessRate: number | null;
    pdfSuccessRate: number | null;
  };
  cache: {
    entries: number;
    lastClearAt: number | null;
  };
  lastContract: {
    property: string;
    status: ContractStatus;
    timestamp: number;
    durationMs?: number;
  } | null;
  recentContracts: Array<{
    property: string;
    status: ContractStatus;
    timestamp: number;
    durationMs?: number;
  }>;
  recentErrors: Array<{
    source: "contract" | "pdf";
    message: string;
    timestamp: number;
  }>;
  lastUpdated: number;
};

const MAX_RECENT_CONTRACTS = 8;
const MAX_DURATION_SAMPLES = 50;
const MAX_ERROR_LOG = 10;

type TelemetryState = {
  contractAttempts: number;
  contractSuccesses: number;
  contractFailures: number;
  contractDurations: number[];
  pdfCompilations: number;
  pdfCompilationFailures: number;
  pdfDurations: number[];
  pdfDownloads: number;
  pdfCacheEntries: number;
  lastCacheClearAt: number | null;
  lastContract: TelemetrySummary["lastContract"];
  recentContracts: TelemetrySummary["recentContracts"];
  recentErrors: TelemetrySummary["recentErrors"];
  lastUpdated: number;
};

const state: TelemetryState = {
  contractAttempts: 0,
  contractSuccesses: 0,
  contractFailures: 0,
  contractDurations: [],
  pdfCompilations: 0,
  pdfCompilationFailures: 0,
  pdfDurations: [],
  pdfDownloads: 0,
  pdfCacheEntries: 0,
  lastCacheClearAt: null,
  lastContract: null,
  recentContracts: [],
  recentErrors: [],
  lastUpdated: Date.now()
};

function pushSample(buffer: number[], sample: number) {
  buffer.push(sample);
  if (buffer.length > MAX_DURATION_SAMPLES) {
    buffer.shift();
  }
}

function calculateAverage(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sum = values.reduce((acc, current) => acc + current, 0);
  return sum / values.length;
}

function calculateStdDev(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  const average = calculateAverage(values);
  if (average === null) {
    return null;
  }
  const variance =
    values.reduce((acc, current) => acc + (current - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function addRecentContract(contract: {
  property: string;
  status: ContractStatus;
  timestamp: number;
  durationMs?: number;
}) {
  state.recentContracts = [contract, ...state.recentContracts].slice(
    0,
    MAX_RECENT_CONTRACTS
  );
}

function addErrorLog(error: { source: "contract" | "pdf"; message: string; timestamp: number }) {
  state.recentErrors = [error, ...state.recentErrors].slice(0, MAX_ERROR_LOG);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentType(value: unknown): value is DocumentType {
  return value === "acquisition" || value === "investor";
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!isObject(value) || typeof value.type !== "string" || typeof value.timestamp !== "number") {
    return false;
  }

  switch (value.type) {
    case "contract_attempt":
      return typeof value.property === "string";
    case "contract_success":
      return typeof value.property === "string" && typeof value.durationMs === "number";
    case "contract_failure":
      return value.property === undefined || typeof value.property === "string";
    case "pdf_compiled":
      return (
        typeof value.property === "string" &&
        isDocumentType(value.docType) &&
        typeof value.durationMs === "number"
      );
    case "pdf_compile_failure":
      return (
        (value.property === undefined || typeof value.property === "string") &&
        (value.docType === undefined || isDocumentType(value.docType))
      );
    case "pdf_cached":
      return typeof value.property === "string" && typeof value.cacheSize === "number";
    case "pdf_cache_cleared":
      return typeof value.count === "number";
    case "pdf_downloaded":
      return typeof value.property === "string" && isDocumentType(value.docType);
    default:
      return false;
  }
}

export function recordTelemetryEvent(event: TelemetryEvent): void {
  state.lastUpdated = Date.now();

  switch (event.type) {
    case "contract_attempt": {
      state.contractAttempts += 1;
      break;
    }
    case "contract_success": {
      state.contractSuccesses += 1;
      pushSample(state.contractDurations, event.durationMs);
      const contractLog = {
        property: event.property,
        status: "success" as const,
        timestamp: event.timestamp,
        durationMs: event.durationMs
      };
      state.lastContract = contractLog;
      addRecentContract(contractLog);
      break;
    }
    case "contract_failure": {
      state.contractFailures += 1;
      const contractLog = {
        property: event.property ?? "Unspecified",
        status: "failure" as const,
        timestamp: event.timestamp
      };
      state.lastContract = contractLog;
      addRecentContract(contractLog);
      if (event.reason) {
        addErrorLog({
          source: "contract",
          message: event.reason,
          timestamp: event.timestamp
        });
      }
      break;
    }
    case "pdf_compiled": {
      state.pdfCompilations += 1;
      pushSample(state.pdfDurations, event.durationMs);
      break;
    }
    case "pdf_compile_failure": {
      state.pdfCompilationFailures += 1;
      if (event.reason) {
        addErrorLog({
          source: "pdf",
          message: event.reason,
          timestamp: event.timestamp
        });
      }
      break;
    }
    case "pdf_cached": {
      state.pdfCacheEntries = Math.max(0, event.cacheSize);
      break;
    }
    case "pdf_cache_cleared": {
      state.pdfCacheEntries = 0;
      state.lastCacheClearAt = event.timestamp;
      break;
    }
    case "pdf_downloaded": {
      state.pdfDownloads += 1;
      break;
    }
    default:
      {
        const exhaustive: never = event;
        void exhaustive;
      }
  }
}

export function getTelemetrySummary(): TelemetrySummary {
  const contractAverageMs = calculateAverage(state.contractDurations);
  const pdfAverageMs = calculateAverage(state.pdfDurations);
  const pdfNetJitterMs = calculateStdDev(state.pdfDurations);
  const contractSuccessRate =
    state.contractAttempts > 0
      ? state.contractSuccesses / state.contractAttempts
      : null;
  const pdfSuccessRate =
    state.pdfCompilations + state.pdfCompilationFailures > 0
      ? state.pdfCompilations /
        (state.pdfCompilations + state.pdfCompilationFailures)
      : null;

  return {
    totals: {
      contractAttempts: state.contractAttempts,
      contractSuccesses: state.contractSuccesses,
      contractFailures: state.contractFailures,
      pdfCompilations: state.pdfCompilations,
      pdfCompilationFailures: state.pdfCompilationFailures,
      pdfDownloads: state.pdfDownloads
    },
    metrics: {
      contractAverageMs,
      pdfAverageMs,
      pdfNetJitterMs,
      contractSuccessRate,
      pdfSuccessRate
    },
    cache: {
      entries: state.pdfCacheEntries,
      lastClearAt: state.lastCacheClearAt
    },
    lastContract: state.lastContract,
    recentContracts: state.recentContracts,
    recentErrors: state.recentErrors,
    lastUpdated: state.lastUpdated
  };
}

export type { DocumentType };
