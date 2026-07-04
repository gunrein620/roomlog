"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { validateSplatFile } from "./splat-validate";
import type { SplatValidationResult } from "./splat-validate";

const KIND_LABELS: Record<SplatValidationResult["kind"], string> = {
  spz: "SPZ",
  "splat-ply": "Gaussian Splat PLY",
  "mesh-ply": "Mesh PLY",
  "pointcloud-ply": "Point Cloud PLY",
  unknown: "알 수 없는 파일"
};

export function SplatDropzone({ onAccept }: { onAccept: (url: string, fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<SplatValidationResult | null>(null);

  async function inspectFile(file: File | undefined) {
    if (!file || isChecking) return;

    setIsChecking(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const nextResult = validateSplatFile(buffer, file.name);
      setResult(nextResult);

      if (nextResult.ok) {
        onAccept(URL.createObjectURL(file), file.name);
      }
    } catch {
      setResult({
        ok: false,
        kind: "unknown",
        reason: "파일을 읽는 중 오류가 발생했습니다. 원본 파일을 다시 선택해 주세요."
      });
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="splat-dropzone">
      <style>
        {`
          .splat-dropzone {
            display: grid;
            gap: 10px;
            width: min(340px, calc(100vw - 32px));
            color: var(--ink);
          }

          .splat-dropzone-target {
            display: grid;
            justify-items: center;
            gap: 8px;
            min-height: 132px;
            padding: 16px;
            border: 1px dashed var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 92%, transparent);
            color: var(--ink);
            cursor: pointer;
            text-align: center;
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease;
          }

          .splat-dropzone-target.is-dragging {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
          }

          .splat-dropzone-target:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .splat-dropzone-icon {
            display: grid;
            width: 34px;
            height: 34px;
            place-items: center;
            border-radius: 999px;
            background: var(--blue-soft);
            color: var(--blue);
          }

          .splat-dropzone-target strong {
            font-size: 14px;
            line-height: 1.25;
          }

          .splat-dropzone-target span {
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
          }

          .splat-dropzone-input {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
          }

          .splat-validation-card {
            display: grid;
            gap: 6px;
            padding: 12px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 94%, transparent);
            box-shadow: var(--shadow);
          }

          .splat-validation-card.is-accepted {
            border-color: var(--blue);
            background: var(--blue-soft);
          }

          .splat-validation-card p {
            margin: 0;
            color: var(--ink);
            font-size: 13px;
            font-weight: 800;
            line-height: 1.35;
          }

          .splat-validation-card small {
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.4;
          }
        `}
      </style>
      <button
        className={`splat-dropzone-target${isDragging ? " is-dragging" : ""}`}
        disabled={isChecking}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void inspectFile(event.dataTransfer.files[0]);
        }}
        type="button"
      >
        <span aria-hidden className="splat-dropzone-icon">
          <UploadCloud size={18} strokeWidth={2.4} />
        </span>
        <strong>{isChecking ? "파일 검사 중" : "SPZ 또는 splat PLY 업로드"}</strong>
        <span>{fileName || "드래그하거나 클릭해서 선택"}</span>
      </button>
      <input
        accept=".spz,.ply"
        className="splat-dropzone-input"
        onChange={(event) => {
          void inspectFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      {result ? (
        <div className={`splat-validation-card${result.ok ? " is-accepted" : ""}`} role="status">
          <p>
            {result.ok ? "통과" : "반려"} · {KIND_LABELS[result.kind]}
            {result.stats?.vertexCount !== undefined ? ` · vertex ${result.stats.vertexCount.toLocaleString("ko-KR")}` : ""}
          </p>
          <small>{result.reason}</small>
        </div>
      ) : null}
    </div>
  );
}
