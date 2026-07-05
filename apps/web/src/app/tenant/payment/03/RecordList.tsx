"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";

// T-PAY-03 기록 리스트 — 기간(1·3·6개월) 필터는 인-스크린(클라이언트). 항목 → 01, 영수증 → 인-스크린.

export type RecordRow = {
  billId: string;
  billingMonth: string; // YYYY-MM
  totalAmount: number;
  statusLabel: string;
  paid: boolean; // 완료 건만 영수증/납부확인서
};

const PERIODS = [1, 3, 6] as const;
type Period = (typeof PERIODS)[number];

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

// billingMonth(YYYY-MM)가 기준월로부터 N개월 이내인지.
function withinMonths(month: string, n: number): boolean {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  const monthsAgo = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return monthsAgo >= 0 && monthsAgo < n;
}

export function RecordList({ records }: { records: RecordRow[] }) {
  const [period, setPeriod] = useState<Period>(6);
  const [receiptOpen, setReceiptOpen] = useState<string | null>(null);

  const visible = records.filter((r) => withinMonths(r.billingMonth, period));

  return (
    <>
      {/* 기간 선택 (인-스크린) */}
      <div style={{ display: "flex", gap: 8 }}>
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            style={{
              flex: 1,
              height: 40,
              border:
                period === p ? "1.5px solid var(--primary)" : "1px solid var(--outline-variant)",
              borderRadius: "var(--radius-full)",
              background: "var(--surface-container-lowest)",
              fontSize: 13,
              fontWeight: 600,
              color: period === p ? "var(--on-surface)" : "var(--on-surface-variant)",
              cursor: "pointer",
            }}
          >
            최근 {p}개월
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            padding: "40px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--on-surface-variant)",
            border: "1.5px dashed var(--outline-variant)",
            borderRadius: "var(--radius-md)",
          }}
        >
          이 기간에는 기록이 없어요
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((r) => (
            <Card key={r.billId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href={withBillId(PAYMENT_ROUTES["T-PAY-01"], r.billId)}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.billingMonth} 청구</div>
                    <div
                      style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 2 }}
                    >
                      {won(r.totalAmount)}
                    </div>
                  </div>
                  <Badge emphasis={r.paid}>{r.statusLabel}</Badge>
                </div>
              </Link>

              {r.paid && (
                <button
                  type="button"
                  onClick={() => setReceiptOpen(receiptOpen === r.billId ? null : r.billId)}
                  style={{
                    height: 40,
                    border: "1px solid var(--outline-variant)",
                    borderRadius: "var(--radius-btn)",
                    background: "var(--surface-container-lowest)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--on-surface-variant)",
                    cursor: "pointer",
                  }}
                >
                  {receiptOpen === r.billId ? "닫기" : "영수증 · 납부확인서"}
                </button>
              )}

              {receiptOpen === r.billId && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--on-surface-variant)",
                    border: "1px dashed var(--outline-variant)",
                    borderRadius: 8,
                    padding: 10,
                    lineHeight: 1.6,
                  }}
                >
                  {r.billingMonth} 납부확인서 · 발급 준비됨
                  <br />
                  PDF 다운로드는 준비 중이에요.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
