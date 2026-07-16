"use client";

import { Card } from "@roomlog/ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  muted,
  sectionTitle,
} from "../../_components/ticket-manager-ui";
import { resolveManagerAttachmentUrl } from "../00/ticket-dashboard-model";

function attachmentFileName(url: string) {
  const pathName = url.split(/[?#]/, 1)[0];
  const encodedName = pathName.split("/").filter(Boolean).at(-1) ?? "첨부 이미지";

  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

export function TicketEvidenceGallery({
  attachmentUrls,
}: {
  attachmentUrls: string[];
}) {
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [failedAttachmentUrls, setFailedAttachmentUrls] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!selectedAttachmentUrl) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedAttachmentUrl(null);
        window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedAttachmentUrl]);

  function closePreview() {
    setSelectedAttachmentUrl(null);
    window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
  }

  function closePreviewOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closePreview();
  }

  function markAttachmentFailed(url: string) {
    setFailedAttachmentUrls((current) => new Set(current).add(url));
    setSelectedAttachmentUrl((current) => (current === url ? null : current));
  }

  const selectedPreviewUrl = selectedAttachmentUrl
    ? resolveManagerAttachmentUrl(selectedAttachmentUrl)
    : null;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={sectionTitle}>사진 비교·근거</div>
      {attachmentUrls.length === 0 ? (
        <div style={muted}>조회할 사진 비교·근거 내용이 없습니다.</div>
      ) : (
        <div
          className="manager-ticket-dialog__attachment-list"
          aria-label={`하자 접수 첨부 사진 ${attachmentUrls.length}장`}
        >
          {attachmentUrls.map((attachmentUrl) => {
            const previewUrl = resolveManagerAttachmentUrl(attachmentUrl);
            const fileName = attachmentFileName(attachmentUrl);

            return failedAttachmentUrls.has(attachmentUrl) ? (
              <a
                className="manager-ticket-dialog__attachment-fallback"
                href={previewUrl}
                key={attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                {fileName} 열기
              </a>
            ) : (
              <button
                className="manager-ticket-dialog__attachment-thumbnail"
                type="button"
                aria-label={`${fileName} 크게 보기`}
                key={attachmentUrl}
                onClick={(event) => {
                  previewTriggerRef.current = event.currentTarget;
                  setSelectedAttachmentUrl(attachmentUrl);
                }}
              >
                <img
                  src={previewUrl}
                  alt={`${fileName} 첨부 이미지`}
                  onError={() => markAttachmentFailed(attachmentUrl)}
                />
              </button>
            );
          })}
        </div>
      )}

      {selectedAttachmentUrl && selectedPreviewUrl ? (
        <div
          className="manager-ticket-image-preview"
          role="dialog"
          aria-modal="true"
          aria-label="첨부 이미지 크게 보기"
          onClick={closePreviewOnBackdrop}
        >
          <figure className="manager-ticket-image-preview__content">
            <button type="button" aria-label="큰 이미지 닫기" onClick={closePreview}>
              <X aria-hidden="true" />
            </button>
            <img
              src={selectedPreviewUrl}
              alt={`${attachmentFileName(selectedAttachmentUrl)} 원본`}
              onError={() => markAttachmentFailed(selectedAttachmentUrl)}
            />
          </figure>
        </div>
      ) : null}
    </Card>
  );
}
