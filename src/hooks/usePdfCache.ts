import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dnd-blackline-ops-pdf-cache";
const LEGACY_STORAGE_KEYS = ["dnd-backline-ops-pdf-cache"];

export type CachedDocumentType = "acquisition" | "investor";

export type PdfCacheEntry = {
  id: string;
  propertyAddress: string;
  fileStem: string;
  createdAt: number;
  variant: "initial" | "recompile";
  documents: Array<{
    type: CachedDocumentType;
    base64: string;
  }>;
};

function readCache(): PdfCacheEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyValue = window.localStorage.getItem(legacyKey);
        if (legacyValue) {
          raw = legacyValue;
          try {
            window.localStorage.setItem(STORAGE_KEY, legacyValue);
            if (legacyKey !== STORAGE_KEY) {
              window.localStorage.removeItem(legacyKey);
            }
          } catch {
            // Ignore persistence failures during migration.
          }
          break;
        }
      }
    }
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized: PdfCacheEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Partial<PdfCacheEntry> & {
        id?: unknown;
        propertyAddress?: unknown;
        fileStem?: unknown;
        createdAt?: unknown;
        variant?: unknown;
        documents?: unknown;
      };
      if (
        typeof record.id !== "string" ||
        typeof record.propertyAddress !== "string" ||
        typeof record.createdAt !== "number" ||
        !Array.isArray(record.documents)
      ) {
        continue;
      }

      const fileStem =
        typeof record.fileStem === "string" && record.fileStem.trim().length
          ? record.fileStem
          : record.propertyAddress.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() ||
            "dnd_blackline";
      const variant: "initial" | "recompile" = record.variant === "recompile" ? "recompile" : "initial";

      normalized.push({
        id: record.id,
        propertyAddress: record.propertyAddress,
        fileStem,
        createdAt: record.createdAt,
        variant,
        documents: record.documents as PdfCacheEntry["documents"]
      });
    }
    return normalized;
  } catch {
    return [];
  }
}

function persistCache(entries: PdfCacheEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      if (legacyKey !== STORAGE_KEY) {
        window.localStorage.removeItem(legacyKey);
      }
    }
    window.dispatchEvent(new CustomEvent("dnd-pdf-cache-updated"));
  } catch {
    // Ignore storage quota errors
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function base64ToBlob(base64: string) {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

export function usePdfCache() {
  const [entries, setEntries] = useState<PdfCacheEntry[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialEntries = readCache();
    setEntries(initialEntries);
    setIsReady(true);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setEntries(readCache());
      }
    };

    const handleCustomUpdate = (_event?: Event) => {
      setEntries(readCache());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("dnd-pdf-cache-updated", handleCustomUpdate);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("dnd-pdf-cache-updated", handleCustomUpdate);
    };
  }, []);

  const addEntry = useCallback(
    (payload: {
      propertyAddress: string;
      fileStem: string;
      variant?: "initial" | "recompile";
      acquisitionPdfBase64: string;
      investorPdfBase64: string;
      generatedAt: number;
    }) => {
      const newEntry: PdfCacheEntry = {
        id: generateId(),
        propertyAddress: payload.propertyAddress,
        fileStem: payload.fileStem,
        createdAt: payload.generatedAt,
        variant: payload.variant ?? "initial",
        documents: [
          { type: "acquisition", base64: payload.acquisitionPdfBase64 },
          { type: "investor", base64: payload.investorPdfBase64 }
        ]
      };

      let newLength = 0;
      setEntries((previous) => {
        const updated = [newEntry, ...previous];
        newLength = updated.length;
        persistCache(updated);
        return updated;
      });
      return newLength;
    },
    []
  );

  const clearCache = useCallback(() => {
    let cleared = 0;
    setEntries((previous) => {
      cleared = previous.length;
      persistCache([]);
      return [];
    });
    if (typeof window !== "undefined") {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        if (legacyKey !== STORAGE_KEY) {
          window.localStorage.removeItem(legacyKey);
        }
      }
    }
    return cleared;
  }, []);

  const downloadDocument = useCallback(
    (entryId: string, docType: CachedDocumentType, suggestedFileName: string) => {
      if (!isReady || typeof window === "undefined" || !window.document) {
        return false;
      }

      const entry = entries.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      const cachedDoc = entry.documents.find((doc) => doc.type === docType);
      if (!cachedDoc) {
        return false;
      }

      const blob = base64ToBlob(cachedDoc.base64);
      const url = URL.createObjectURL(blob);
      const doc = window.document;

      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = suggestedFileName;
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return true;
    },
    [entries, isReady]
  );

  return {
    entries,
    isReady,
    addEntry,
    clearCache,
    downloadDocument
  };
}
