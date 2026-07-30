type PendingRequest = {
  resolve: (vectors: number[][]) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();
let reqId = 0;
let workerFailed = false;

function getWorker(): Worker {
  if (!worker) {
    try {
      worker = new Worker(new URL("../workers/embedding.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e: MessageEvent) => {
        const { type, id, vectors, error } = e.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (type === "embed_result") {
          p.resolve(vectors);
        } else {
          p.reject(new Error(error || "Embedding failed"));
        }
      };
      worker.onerror = () => {
        workerFailed = true;
        worker?.terminate();
        worker = null;
      };
    } catch {
      workerFailed = true;
    }
  }
  return worker!;
}

async function embedWithWorker(texts: string[]): Promise<number[][]> {
  const w = getWorker();
  const id = `req_${++reqId}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "embed", id, texts });
  });
}

async function embedWithServer(texts: string[]): Promise<number[][]> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error("Server embedding failed");
  const data = await res.json();
  return data.vectors;
}

/**
 * Returns `true` if local embedding should be attempted.
 * Desktop (Tauri or browser) → yes. Mobile → no.
 */
export function canUseLocalEmbedding(): boolean {
  const ua = navigator.userAgent || "";
  if (/android|iphone|ipad/i.test(ua)) return false;
  return true;
}

/**
 * Embed texts. Tries local worker first, falls back to server API.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!canUseLocalEmbedding() || workerFailed) {
    return embedWithServer(texts);
  }

  try {
    return await embedWithWorker(texts);
  } catch {
    workerFailed = true;
    return embedWithServer(texts);
  }
}
