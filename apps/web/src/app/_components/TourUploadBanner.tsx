"use client";

// 상단 네비 바로 아래 전역 진행바 — 3D 투어 파일이 백그라운드로 업로드되는 동안 어느 탭에서든 보인다.
// 상태는 tour-upload-store(모듈 싱글턴)에서 구독한다.

import { CircleAlert, UploadCloud, X } from "lucide-react";
import { dismissTourUpload, useTourUploadState } from "@/lib/tour-upload-store";

export default function TourUploadBanner() {
  const { active, percent, status, fileName } = useTourUploadState();
  if (!active) return null;

  const isError = status === "error";

  return (
    <div
      className={isError ? "tour-upload-banner is-error" : "tour-upload-banner"}
      role="status"
      aria-live="polite"
    >
      <span className="tour-upload-banner__icon" aria-hidden="true">
        {isError ? <CircleAlert size={16} strokeWidth={2.4} /> : <UploadCloud size={16} strokeWidth={2.4} />}
      </span>
      <span className="tour-upload-banner__label">
        {isError ? (
          <>3D 투어 업로드에 실패했습니다{fileName ? ` — ${fileName}` : ""}. 매물 편집에서 다시 올려 주세요.</>
        ) : (
          <>3D 투어 업로드 중… {percent}%{fileName ? <span className="tour-upload-banner__file"> · {fileName}</span> : null}</>
        )}
      </span>
      {isError ? null : (
        <span className="tour-upload-banner__track" aria-hidden="true">
          <span className="tour-upload-banner__fill" style={{ width: `${percent}%` }} />
        </span>
      )}
      {isError ? (
        <button
          type="button"
          className="tour-upload-banner__close"
          aria-label="알림 닫기"
          onClick={() => dismissTourUpload()}
        >
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
