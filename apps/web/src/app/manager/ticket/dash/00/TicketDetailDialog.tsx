"use client";

// 민원 상세 모달 — 대시보드에서 접수 건을 누르면 페이지 이동 없이 내용을 바로 보여준다.
// 행에 이미 실려 온 티켓+수리 데이터를 그대로 사용(추가 조회 없음), 깊은 작업은 상세 페이지 링크로 이어간다.
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { isDialogBackdropPoint } from "@/lib/manager-assistant";
import {
  ticketDashHref,
  ticketStatusLabel,
  urgencyLabel,
} from "../../_components/ticket-manager-ui";
import {
  defectDisplayStatus,
  formatDefectDate,
  formatDefectMoney,
  resolveManagerAttachmentUrl,
  type DefectDashboardRow,
} from "./ticket-dashboard-model";

const ticketTypeLabel = {
  defect: "하자 민원",
  complaint: "일반 민원",
} as const;

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function attachmentFileName(url: string) {
  const pathName = url.split(/[?#]/, 1)[0];
  const encodedName = pathName.split("/").filter(Boolean).at(-1) ?? "첨부 이미지";

  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

export function TicketDetailDialog({
  row,
  onClose,
}: {
  row: DefectDashboardRow | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedAttachmentUrl, setSelectedAttachmentUrl] = useState<string | null>(null);
  const [failedAttachmentUrls, setFailedAttachmentUrls] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (row && !dialog.open) dialog.showModal();
    if (!row && dialog.open) dialog.close();
  }, [row]);

  useEffect(() => {
    setSelectedAttachmentUrl(null);
    setFailedAttachmentUrls(new Set());
  }, [row?.ticket.id]);

  useEffect(() => {
    if (!selectedAttachmentUrl) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedAttachmentUrl(null);
        window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
      }
    }

    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [selectedAttachmentUrl]);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (!isDialogBackdropPoint(event, event.currentTarget.getBoundingClientRect())) return;
    onClose();
  }

  function closePreview() {
    setSelectedAttachmentUrl(null);
    window.requestAnimationFrame(() => previewTriggerRef.current?.focus());
  }

  function closePreviewOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.target === event.currentTarget) closePreview();
  }

  function keepDialogOpenForPreview(event: SyntheticEvent<HTMLDialogElement>) {
    if (!selectedAttachmentUrl) return;
    event.preventDefault();
    closePreview();
  }

  function markAttachmentFailed(url: string) {
    setFailedAttachmentUrls((current) => new Set(current).add(url));
    setSelectedAttachmentUrl((current) => (current === url ? null : current));
  }

  if (!row) return null;
  const { ticket, repair } = row;
  const selectedPreviewUrl = selectedAttachmentUrl
    ? resolveManagerAttachmentUrl(selectedAttachmentUrl)
    : null;

  return (
    <dialog
      ref={dialogRef}
      className="manager-ticket-dialog"
      aria-labelledby="manager-ticket-dialog-title"
      onClick={closeOnBackdrop}
      onClose={onClose}
      onCancel={keepDialogOpenForPreview}
    >
      <article className="manager-ticket-dialog__body">
        <header className="manager-ticket-dialog__header">
          <div>
            <p className="manager-ticket-dialog__badges">
              <span className="manager-defect-dashboard__type-badge" data-ticket-type={ticket.type}>
                {ticketTypeLabel[ticket.type]}
              </span>
              <span
                className="manager-defect-dashboard__status-badge"
                data-status={defectDisplayStatus(row)}
              >
                {ticketStatusLabel[ticket.status]}
              </span>
            </p>
            <h2 id="manager-ticket-dialog-title">{ticket.title}</h2>
            <p className="manager-ticket-dialog__meta">
              {formatCreatedAt(ticket.createdAt)} 접수 · 긴급도 {urgencyLabel[ticket.urgency]}
            </p>
          </div>
          <button type="button" aria-label="민원 상세 닫기" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <dl className="manager-ticket-dialog__facts">
          <div>
            <dt>건물/호실</dt>
            <dd>{row.buildingName ?? "—"} / {ticket.unitId || "—"}</dd>
          </div>
          <div>
            <dt>발생 위치</dt>
            <dd>{ticket.location || "—"}</dd>
          </div>
          <div>
            <dt>작업자</dt>
            <dd>{repair?.vendorName ?? "미배정"}</dd>
          </div>
          <div>
            <dt>예정일시</dt>
            <dd>{formatDefectDate(repair?.scheduledAt)}</dd>
          </div>
          <div>
            <dt>청구 금액</dt>
            <dd>{formatDefectMoney(repair?.quoteAmount)}</dd>
          </div>
        </dl>

        <section className="manager-ticket-dialog__description" aria-label="민원 상세 내용">
          <h3>상세 내용</h3>
          <p>{ticket.description || "세입자가 남긴 상세 설명이 없습니다."}</p>
        </section>

        {(row.attachmentUrls?.length ?? 0) > 0 && (
          <section
            className="manager-ticket-dialog__attachments"
            aria-labelledby="manager-ticket-dialog-attachments-title"
          >
            <h3 id="manager-ticket-dialog-attachments-title">첨부 이미지</h3>
            <div className="manager-ticket-dialog__attachment-list">
              {row.attachmentUrls?.map((attachmentUrl) => {
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
                    {fileName}
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
          </section>
        )}

        <footer className="manager-ticket-dialog__actions">
          <Link href={ticketDashHref("01", ticket.id)}>상세·정보입력</Link>
        </footer>

        {selectedAttachmentUrl && selectedPreviewUrl && (
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
                alt={`${attachmentFileName(selectedPreviewUrl)} 원본`}
                onError={() => markAttachmentFailed(selectedAttachmentUrl)}
              />
            </figure>
          </div>
        )}
      </article>
    </dialog>
  );
}
