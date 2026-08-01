/// <reference lib="webworker" />

import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

let pipe: FeatureExtractionPipeline | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipe) {
    pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      progress_callback: (progress: any) => {
        if (progress?.status === "progress") {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          self.postMessage({ type: "model_progress", status: "downloading", progress: pct });
        } else if (progress?.status === "ready") {
          self.postMessage({ type: "model_progress", status: "ready", progress: 100 });
        }
      },
    });
    self.postMessage({ type: "model_progress", status: "ready", progress: 100 });
  }
  return pipe;
}

async function embed(texts: string[]): Promise<number[][]> {
  const p = await getPipeline();
  const results: number[][] = [];
  for (const text of texts) {
    const output = await p(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}

self.onmessage = async (e: MessageEvent<{ type: string; id: string; texts?: string[] }>) => {
  const { type, id, texts } = e.data;
  if (type !== "embed" || !texts) return;

  try {
    const vectors = await embed(texts);
    self.postMessage({ type: "embed_result", id, vectors });
  } catch (err: any) {
    self.postMessage({ type: "embed_error", id, error: err.message || "Unknown error" });
  }
};
