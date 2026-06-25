"use client";

import { useRef, useState } from "react";
import { validateFile } from "@/lib/file-validator";

interface FileUploaderProps {
  files: File[];
  onAdd: (file: File) => void;
  onRemove: (name: string) => void;
}

export function FileUploader({ files, onAdd, onRemove }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = validateFile(file);
    if (!result.valid) {
      setError(result.error ?? "Invalid file");
      e.target.value = "";
      return;
    }

    setError(null);
    onAdd(file);
    e.target.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.pdf,.md,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleChange}
        data-testid="file-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="p-2 text-gray-500 hover:text-gray-700"
        aria-label="Attach file"
        data-testid="attach-button"
      >
        📎
      </button>
      {error && (
        <p className="text-red-500 text-xs mt-1" data-testid="file-error">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {files.map((f) => (
            <span
              key={f.name}
              className="flex items-center gap-1 bg-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5"
            >
              {f.name}
              <button
                type="button"
                onClick={() => onRemove(f.name)}
                aria-label={`Remove ${f.name}`}
                className="ml-1 text-gray-500 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
