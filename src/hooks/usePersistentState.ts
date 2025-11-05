import { useCallback, useEffect, useRef, useState } from "react";

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type StorageMode = "local" | "session";

const noopStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined
};

function getStorage(mode: StorageMode): Storage {
  if (typeof window === "undefined") {
    return noopStorage;
  }
  return mode === "local" ? window.localStorage : window.sessionStorage;
}

export function usePersistentState<T extends JSONValue>(
  key: string,
  defaultValue: T,
  options: { storage?: StorageMode } = {}
) {
  const storage = getStorage(options.storage ?? "local");
  const [state, setState] = useState<T>(() => {
    try {
      const raw = storage.getItem(key);
      if (raw === null) {
        return defaultValue;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn("usePersistentState read failed", { key, error });
      return defaultValue;
    }
  });

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateState = useCallback(
    (updater: T | ((previous: T) => T)) => {
      setState((current) => {
        const nextValue = typeof updater === "function" ? (updater as (prev: T) => T)(current) : updater;
        try {
          storage.setItem(key, JSON.stringify(nextValue));
        } catch (error) {
          console.warn("usePersistentState write failed", { key, error });
        }
        return nextValue;
      });
    },
    [key, storage]
  );

  return [state, updateState] as const;
}

export function clearPersistentState(key: string, options: { storage?: StorageMode } = {}) {
  const storage = getStorage(options.storage ?? "local");
  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn("usePersistentState remove failed", { key, error });
  }
}
