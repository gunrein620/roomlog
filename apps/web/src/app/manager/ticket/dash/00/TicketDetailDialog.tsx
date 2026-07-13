"use client";

// 민원 상세 모달 — 대시보드에서 접수 건을 누르면 페이지 이동 없이 내용을 바로 보여준다.
// 행에 이미 실려 온 티켓+수리 데이터를 그대로 사용(추가 조회 없음), 깊은 작업은 상세 페이지 링크로 이어간다.
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
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

export function TicketDetailDialog({
  row,
  onClose,
}: {
  row: DefectDashboardRow | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (row && !dialog.open) dialog.showModal();
    if (!row && dialog.open) dialog.close();
  }, [row]);

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (!isDialogBackdropPoint(event, event.currentTarget.getBoundingClientRect())) return;
    onClose();
  }

  if (!row) return null;
  const { ticket, repair } = row;

  return (
    <dialog
      ref={dialogRef}
      className="manager-ticket-dialog"
      aria-labelledby="manager-ticket-dialog-title"
      onClick={closeOnBackdrop}
      onClose={onClose}
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

        <footer className="manager-ticket-dialog__actions">
          <Link href={ticketDashHref("01", ticket.id)}>상세·정보입력</Link>
          <Link href={ticketDashHref("04", ticket.id)}>업체 선정·견적</Link>
          <Link href={ticketDashHref("05", ticket.id)}>결제·비용 승인</Link>
        </footer>
      </article>
    </dialog>
  );
}
