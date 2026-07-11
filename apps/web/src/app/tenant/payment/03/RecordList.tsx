"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  BillStatus,
  TenantPaymentHistoryEvent,
  TenantPaymentHistoryRecord,
} from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import styles from "./payment-history.module.css";

const STATUS_LABEL: Record<BillStatus, string> = {
  draft: "작성 중",
  sent: "납부 예정",
  confirming: "확인 중",
  partially_paid: "일부 납부",
  paid: "완납",
  overdue: "연체",
  corrected: "정정됨",
  canceled: "취소됨",
};

const EVENT_LABEL: Record<TenantPaymentHistoryEvent["type"], string> = {
  toss: "Toss 결제",
  deposit: "계좌 입금",
  report: "납부 신고",
  bill_due: "납부 기한",
};

const EVENT_STATUS_LABEL: Record<TenantPaymentHistoryEvent["status"], string> = {
  confirmed: "확정",
  confirming: "확인 중",
  due: "미납",
};

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId: string): string {
  return `${route}?id=${encodeURIComponent(billId)}`;
}

function activityDateLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function paymentSummary(record: TenantPaymentHistoryRecord): string {
  const remaining = Math.max(0, record.totalAmount - record.paidAmount);
  if (record.paidAmount <= 0) return `${won(remaining)} 미납`;
  if (remaining === 0) return `${won(record.paidAmount)} 납부`;
  return `${won(record.paidAmount)} 납부 · ${won(remaining)} 남음`;
}

export function RecordList({ records }: { records: TenantPaymentHistoryRecord[] }) {
  const [openReceiptKey, setOpenReceiptKey] = useState<string | null>(null);

  if (records.length === 0) {
    return <p className={styles.emptyState}>이 기간에는 납부 기록이 없어요</p>;
  }

  return (
    <section className={styles.historyList} aria-label="기간 내 납부 기록">
      {records.map((record) => (
        <Card key={record.billId} className={styles.recordCard}>
          <div className={styles.recordHeader}>
            <div>
              <h2 className={styles.recordMonth}>{record.billingMonth} 청구</h2>
              <p className={styles.recordActivity}>
                최근 활동{" "}
                <time dateTime={record.activityDate}>{activityDateLabel(record.activityDate)}</time>
              </p>
            </div>
            <Badge emphasis={record.status === "paid"}>{STATUS_LABEL[record.status]}</Badge>
          </div>

          <div className={styles.recordTotals}>
            <div>
              <div className={styles.totalLabel}>청구 합계</div>
              <div className={styles.totalAmount}>{won(record.totalAmount)}</div>
            </div>
            <div className={styles.paymentSummary}>{paymentSummary(record)}</div>
          </div>

          <ul className={styles.eventList} aria-label={`${record.billingMonth} 활동 내역`}>
            {record.payments.map((event) => {
              const receiptKey = `${record.billId}:${event.id}`;
              const receiptOpen = openReceiptKey === receiptKey;
              const receiptId = `receipt-${receiptKey.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;

              return (
                <li key={event.id} className={styles.eventItem}>
                  <div className={styles.eventTopline}>
                    <span className={styles.eventName}>{EVENT_LABEL[event.type]}</span>
                    <span className={styles.eventStatus}>{EVENT_STATUS_LABEL[event.status]}</span>
                  </div>
                  <div className={styles.eventAmount}>{won(event.amount)}</div>
                  <div className={styles.eventDate}>
                    활동일{" "}
                    <time dateTime={event.activityDate}>{activityDateLabel(event.activityDate)}</time>
                  </div>

                  {event.receiptAvailable && (
                    <>
                      <div className={styles.eventActions}>
                        <button
                          type="button"
                          className={styles.receiptButton}
                          aria-expanded={receiptOpen}
                          aria-controls={receiptId}
                          onClick={() => setOpenReceiptKey(receiptOpen ? null : receiptKey)}
                        >
                          {receiptOpen ? "영수증 닫기" : "영수증 · 납부확인서"}
                        </button>
                      </div>
                      {receiptOpen && (
                        <p id={receiptId} className={styles.receiptNotice} role="status">
                          PDF 다운로드 준비 중이에요. 확정된 거래 정보는 그대로 유지됩니다.
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <Link
            href={withBillId(PAYMENT_ROUTES["T-PAY-01"], record.billId)}
            className={styles.detailLink}
          >
            납부 상세
          </Link>
        </Card>
      ))}
    </section>
  );
}
