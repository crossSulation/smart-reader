import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "privacy-mode";

export function getPrivacyMode(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setPrivacyMode(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function usePrivacyMode() {
  const [enabled, setEnabled] = useState(() => getPrivacyMode());

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      setPrivacyMode(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setEnabled(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { enabled, toggle };
}
