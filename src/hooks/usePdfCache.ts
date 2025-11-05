import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dnd-backline-ops-pdf-cache";

export type CachedDocumentType = "acquisition" | "investor";

export type PdfCacheEntry = {
  id: string;
  propertyAddress: string;
  createdAt: number;
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is PdfCacheEntry => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const record = item as PdfCacheEntry;
      return (
        typeof record.id === "string" &&
        typeof record.propertyAddress === "string" &&
        typeof record.createdAt === "number" &&
        Array.isArray(record.documents)
      );
    });
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
      acquisitionPdfBase64: string;
      investorPdfBase64: string;
      generatedAt: number;
    }) => {
      const newEntry: PdfCacheEntry = {
        id: generateId(),
        propertyAddress: payload.propertyAddress,
        createdAt: payload.generatedAt,
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
    return cleared;
  }, []);

  const downloadDocument = useCallback(
    (entryId: string, docType: CachedDocumentType, suggestedFileName: string) => {
      if (!isReady || typeof document === "undefined") {
        return false;
      }

      const entry = entries.find((item) => item.id === entryId);
      if (!entry) {
        return false;
      }
      const document = entry.documents.find((doc) => doc.type === docType);
      if (!document) {
        return false;
      }

      const blob = base64ToBlob(document.base64);
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedFileName;
      document.body.appendChild(anchor);
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
