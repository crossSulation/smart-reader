// frontend/components/FileUpload.tsx
import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CloudUploadOutlined, InsertDriveFileOutlined, CloseOutlined } from "@mui/icons-material";

type FileUploadProps = {
  onUploadComplete: () => void;
  onClose: () => void;
};

export default function FileUpload({ onUploadComplete, onClose }: FileUploadProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload/", true);
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 200) {
        onUploadComplete();
      } else if (xhr.status === 401 || xhr.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
      } else {
        let detail = "";
        try { detail = JSON.parse(xhr.responseText)?.detail; } catch { /* ignore */ }
        setError(detail || t("fileUpload.error", "Upload failed. Please try again."));
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError(t("fileUpload.error", "Upload failed. Please try again."));
    };

    xhr.send(formData);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {t("fileUpload.title", "Upload Book")}
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
            aria-label="close"
          >
            <CloseOutlined fontSize="small" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {/* Drop zone */}
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
              py-10 cursor-pointer transition-colors select-none
              ${dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40"}
              ${uploading ? "pointer-events-none opacity-60" : ""}
            `}
          >
            <CloudUploadOutlined className="text-blue-400" sx={{ fontSize: 48 }} />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                {t("fileUpload.dropHint", "Drag & drop a file here, or click to browse")}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {t("fileUpload.supportedFormats", "PDF, EPUB supported")}
              </p>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.epub"
            onChange={handleInputChange}
            className="hidden"
          />

          {/* Selected file info */}
          {selectedFile && (
            <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <InsertDriveFileOutlined className="text-gray-400 flex-shrink-0" fontSize="small" />
              <span className="text-sm text-gray-700 truncate flex-1">{selectedFile.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t("fileUpload.uploading", "Uploading…")}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-blue-500 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}