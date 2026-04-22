// frontend/components/FileUpload.tsx
import { useState, type ChangeEvent } from "react";

type FileUploadProps = {
  onUploadComplete: () => void;
  onClose: () => void;
};
export default function FileUpload({ onUploadComplete, onClose }:FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);
      xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          onUploadComplete();
        }
      };
      
      xhr.send(formData);
    } catch {
      alert("上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-96">
        <h2 className="text-xl font-bold mb-4">上传书籍</h2>
        <input
          type="file"
          accept=".pdf,.epub"
          onChange={handleUpload}
          disabled={uploading}
          className="w-full"
        />
        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-center mt-2">{progress}%</p>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full bg-gray-200 py-2 rounded">
          取消
        </button>
      </div>
    </div>
  );
}