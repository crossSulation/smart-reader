export interface FrontendCapabilities {
  isDesktopApp: boolean;
  webgpuAvailable: boolean;
  transformersModelCached: boolean;
  onnxAvailable: boolean;
  isOnline: boolean;
}

let _reported = false;

function detect(): FrontendCapabilities {
  const isDesktopApp = typeof window !== "undefined" && !!(window as any).__TAURI__;

  let webgpuAvailable = false;
  try {
    if ((navigator as any)?.gpu) webgpuAvailable = true;
  } catch { /* ignore */ }

  return {
    isDesktopApp,
    webgpuAvailable,
    transformersModelCached: false,
    onnxAvailable: false,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
}

export async function reportCapabilities(): Promise<void> {
  if (_reported) return;
  _reported = true;

  try {
    const caps = detect();
    const token = localStorage.getItem("token");
    await fetch("/api/capabilities/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(caps),
    });
  } catch { /* non-critical */ }
}

export function getCapabilities(): FrontendCapabilities {
  return detect();
}

export function onOnlineChange(cb: (online: boolean) => void): () => void {
  const handler = () => cb(navigator.onLine);
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}
