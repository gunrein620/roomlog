"use client";

import { useState } from "react";
import Link from "next/link";
import type { Bill, PaymentReport } from "@roomlog/types";
import { Button, Card, Input } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";

// T-PAY-02 · 납부 신고 폼
// 자기신고는 실제 입금 확정이 아니며, 서버 액션을 통해 확인 중 큐로만 유입된다.

type ReportActionInput = {
  amount: number;
  depositorName?: string;
};

const sectionLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 7,
} as const;

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

export function PaymentReportForm({
  bill,
  reportAction,
}: {
  bill: Bill;
  reportAction: (dto: ReportActionInput) => Promise<PaymentReport>;
}) {
  const [amount, setAmount] = useState(String(Math.max(bill.totalAmount - bill.paidAmount, 0)));
  const [depositorName, setDepositorName] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [etaHours, setEtaHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const account = bill.account;

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submitReport = async () => {
    if (submitting) return;

    setSubmitting(true);
    const normalizedDepositorName = depositorName.trim();
    const report = await reportAction({
      amount: Number(amount) || 0,
      ...(normalizedDepositorName ? { depositorName: normalizedDepositorName } : {}),
    });
    setEtaHours(report.etaHours);
    setSubmitted(true);
    setSubmitting(false);
  };

  // 신고 후 인-스크린: 접수·확인 중·ETA → 홈으로.
  if (submitted) {
    return (
      <>
        <header
          style={{
            flex: "none",
            padding: 14,
            borderBottom: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>납부 신고 접수</div>
        </header>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              border: "1.5px solid var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>납부 신고가 접수됐어요</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
            신고 금액 <b>{won(Number(amount) || 0)}</b> · 확인 중
            <br />
            관리자가 입금을 확인하면 상태가 <b>완료</b>로 바뀌어요.
            <br />
            보통 <b>{etaHours}시간 이내</b>에 반영돼요.
          </div>
          <Card
            style={{
              fontSize: 12,
              color: "var(--on-surface-variant)",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            확인 전까지는 수금 집계·미납 판정에서 제외돼요. 낸 사람이 독촉받지 않도록 보호해요.
          </Card>
        </div>
        <footer
          style={{ flex: "none", padding: "12px 14px", borderTop: "1px solid var(--border)" }}
        >
          <Link
            href={PAYMENT_ROUTES["T-PAY-00"]}
            style={{ textDecoration: "none", display: "block" }}
          >
            <Button fullWidth>홈으로</Button>
          </Link>
        </footer>
      </>
    );
  }

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={withBillId(PAYMENT_ROUTES["T-PAY-01"], bill.id)}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>납부 신고 · {won(bill.totalAmount)}</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* ① 금액 / 일부 입력 */}
        <section>
          <div style={sectionLabel}>납부 금액</div>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="납부 금액 입력"
          />
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 6 }}>
            일부 납부도 신고할 수 있어요. 전액: {won(bill.totalAmount)}
          </div>
        </section>

        {/* ② 계좌·예금주 복사 · ③ 이체 안내 */}
        <section>
          <div style={sectionLabel}>입금 계좌</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "var(--on-surface-variant)" }}>{account.bankName}</span>
              <span style={{ fontWeight: 700 }}>{account.accountNumber}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--on-surface-variant)" }}>예금주</span>
              <span style={{ fontWeight: 600 }}>{account.accountHolder}</span>
            </div>
            <Button variant="secondary" fullWidth onClick={copyAccount} style={{ height: 44 }}>
              {copied ? "복사됐어요 ✓" : "계좌번호 복사"}
            </Button>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              위 계좌로 직접 이체한 뒤 아래 <b>납부 신고</b>를 눌러 주세요. 자동 계좌연동은 준비
              중이에요.
            </div>
          </Card>
        </section>

        {/* ⑤ 입금자명이 본인과 다르면 기입 */}
        <section>
          <div style={sectionLabel}>입금자명 (선택)</div>
          <Input
            value={depositorName}
            onChange={(e) => setDepositorName(e.target.value)}
            placeholder="본인 명의와 다르면 입금자명 입력"
          />
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 6 }}>
            부모님 등 다른 명의로 이체했다면 입금자명을 알려 주세요. 매칭이 빨라져요.
          </div>
        </section>
      </div>

      <footer style={{ flex: "none", padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
        <Button fullWidth onClick={submitReport} disabled={submitting}>
          {submitting ? "신고 접수 중" : "납부 신고"}
        </Button>
      </footer>
    </>
  );
}
