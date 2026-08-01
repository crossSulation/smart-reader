import { useEffect, useState } from "react";
import { DownloadOutlined, CheckCircleOutlineOutlined } from "@mui/icons-material";

type ModelStatus = "idle" | "downloading" | "ready" | "error";

let _listeners: Array<(status: ModelStatus, progress: number) => void> = [];
let _currentStatus: ModelStatus = "idle";
let _currentProgress = 0;

export function setModelStatus(status: ModelStatus, progress = 0) {
  _currentStatus = status;
  _currentProgress = progress;
  _listeners.forEach((fn) => fn(status, progress));
}

export default function ModelDownloadProgress() {
  const [status, setStatus] = useState<ModelStatus>(_currentStatus);
  const [progress, setProgress] = useState(_currentProgress);

  useEffect(() => {
    const handler = (s: ModelStatus, p: number) => {
      setStatus(s);
      setProgress(p);
    };
    _listeners.push(handler);
    return () => {
      _listeners = _listeners.filter((h) => h !== handler);
    };
  }, []);

  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-1.5 text-xs dark:bg-gray-800">
      {status === "downloading" ? (
        <>
          <DownloadOutlined sx={{ fontSize: 14 }} className="text-blue-500" />
          <span className="text-gray-600 dark:text-gray-400">Downloading model... {progress}%</span>
          <div className="h-1 w-20 rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : status === "ready" ? (
        <>
          <CheckCircleOutlineOutlined sx={{ fontSize: 14 }} className="text-green-500" />
          <span className="text-green-600 dark:text-green-400">Model ready</span>
        </>
      ) : status === "error" ? (
        <>
          <span className="text-red-500">Model load failed</span>
        </>
      ) : null}
    </div>
  );
}
