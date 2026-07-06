import Link from "next/link";
import type { Bill, BillStatus, PaymentBadge } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { listBills } from "@/lib/payment-api";

// T-PAY-00 · 이번 달 청구/납부 홈 (center)
// 이번 달 낼 돈·상태를 한눈에 + 납부 단일 primary(→02). 점진 공개: 상세·기록·관리비·연체는 보조.
// 원칙: 조건 배너는 우선순위 1개만(연체>일부납부>확인중, stacking 금지). 입금 확인 응답은 별개 슬롯.

// 청구 상태머신 → 임차인 배지 매핑(D1). 연체 존엄: 관리인 단계 라벨은 비노출.
const STATUS_TO_BADGE: Record<BillStatus, PaymentBadge> = {
  draft: "none",
  sent: "due",
  confirming: "confirming",
  partially_paid: "partial",
  paid: "paid",
  overdue: "overdue",
  corrected: "none",
  canceled: "none",
};

const BADGE_LABEL: Record<PaymentBadge, string> = {
  none: "확인 중",
  due: "납부예정",
  confirming: "확인 중",
  partial: "일부 납부",
  paid: "완료",
  overdue: "연체",
};

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function ddayOf(dueIso: string): number {
  const due = new Date(dueIso);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / 86_400_000);
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

export default async function Page() {
  const bills = await listBills();
  // 청구월 내림차순 → 이번 달(center)이 맨 위.
  const sorted = [...bills].sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
  const current = sorted[0];
  const recentDone = sorted.find((b) => b.id !== current?.id && b.status === "paid");
  const unit = current?.unitId ?? "내 호실";

  return (
    <>
      {/* Header: 호실·이번 달 + 알림 벨 */}
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {current ? `${unit}호` : unit} · 이번 달
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            룸로그 · 납부
          </div>
        </div>
        <span
          aria-label="알림"
          style={{
            width: 38,
            height: 38,
            border: "1.5px solid var(--outline-variant)",
            borderRadius: 10,
            background: "var(--surface-container-lowest)",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          🔔
        </span>
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {current ? (
          <>
            {/* ①②③ 총액 + 상태 배지 + 기한 D-day + 합계 1줄 */}
            <BillSummary bill={current} />

            {/* ④ 조건 배너 — 우선순위 1개만 (연체>일부>확인중) */}
            <ConditionBanner bill={current} />

            {/* ⑤ 입금 확인 응답 배너 — 위 우선순위와 별개 슬롯 */}
            {current.depositConfirmationRequested && (
              <div
                style={{
                  border: "1.5px solid var(--primary)",
                  borderRadius: 10,
                  padding: 12,
                  background: "var(--surface-container-high)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>입금 확인 응답 요청</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                  관리자가 입금 확인을 요청했어요 · 입금자명·이체일·금액을 알려주세요.
                </div>
              </div>
            )}

            {/* 최근 완료(보조) */}
            {recentDone && (
              <section>
                <div style={labelStyle}>최근 완료</div>
                <Card
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
                    {recentDone.billingMonth} 청구
                  </span>
                  <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>완료</span>
                </Card>
              </section>
            )}
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              textAlign: "center",
              padding: "40px 16px",
              border: "1.5px dashed var(--outline-variant)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--on-surface-variant)" }}>
              이번 달 청구가 없어요
            </div>
          </div>
        )}
      </div>

      {/* Footer: 납부하기 FAB + 보조 묶음 메뉴 */}
      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {current ? (
          <Link
            href={withBillId(PAYMENT_ROUTES["T-PAY-02"], current.id)}
            style={{
              display: "flex",
              width: "100%",
              boxSizing: "border-box",
              height: "var(--touch-target)",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "var(--primary)",
              color: "var(--on-primary)",
              borderRadius: "var(--radius-btn)",
              fontSize: "var(--fs-body)",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            납부하기
          </Link>
        ) : (
          <span
            aria-disabled="true"
            style={{
              display: "flex",
              width: "100%",
              boxSizing: "border-box",
              height: "var(--touch-target)",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed var(--outline-variant)",
              background: "var(--surface-container)",
              color: "var(--on-surface-variant)",
              borderRadius: "var(--radius-btn)",
              fontSize: "var(--fs-body)",
              fontWeight: 700,
            }}
          >
            납부할 청구가 없어요
          </span>
        )}

        <nav style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {current ? (
            <SecondaryLink
              href={withBillId(PAYMENT_ROUTES["T-PAY-01"], current.id)}
              label="청구 상세"
            />
          ) : (
            <SecondaryDisabled label="청구 상세" />
          )}
          <SecondaryLink href={PAYMENT_ROUTES["T-PAY-03"]} label="납부 기록" />
          {current?.maintenanceFeeId ? (
            <SecondaryLink
              href={withBillId(PAYMENT_ROUTES["T-PAY-04"], current.id)}
              label="관리비 내역"
            />
          ) : (
            <SecondaryDisabled label="관리비 내역" />
          )}
          {current ? (
            <SecondaryLink
              href={withBillId(PAYMENT_ROUTES["T-PAY-05"], current.id)}
              label="연체 안내"
            />
          ) : (
            <SecondaryDisabled label="연체 안내" />
          )}
        </nav>
      </footer>
    </>
  );
}

function BillSummary({ bill }: { bill: Bill }) {
  const badge = STATUS_TO_BADGE[bill.status];
  const dday = ddayOf(bill.dueDate);
  const remaining = bill.totalAmount - bill.paidAmount;
  return (
    <section>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
        {/* ① 총액 + 납부 상태 배지 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
            {bill.billingMonth} 청구 총액
          </div>
          <Badge emphasis>{BADGE_LABEL[badge]}</Badge>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{won(bill.totalAmount)}</div>

        {/* ② 기한 D-day */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px dashed var(--border)",
            paddingTop: 10,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>납부 기한</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {bill.dueDate.slice(0, 10)}
            <span style={{ marginLeft: 8, color: "var(--primary)" }}>
              {dday >= 0 ? `D-${dday}` : `D+${-dday}`}
            </span>
          </span>
        </div>

        {/* ③ 합계 1줄 (일부 납부 시 잔액) */}
        {bill.paidAmount > 0 && remaining > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--on-surface-variant)" }}>남은 금액</span>
            <span style={{ fontWeight: 700 }}>{won(remaining)}</span>
          </div>
        )}
      </Card>
    </section>
  );
}

// 조건 배너 — 동시 발생 시 상위 1개만(연체 > 일부 납부 > 확인 중). stacking 금지.
function ConditionBanner({ bill }: { bill: Bill }) {
  let tone: "overdue" | "partial" | "confirming" | null = null;
  if (bill.status === "overdue") tone = "overdue";
  else if (bill.status === "partially_paid") tone = "partial";
  else if (bill.status === "confirming") tone = "confirming";

  if (!tone) return null;

  const COPY: Record<NonNullable<typeof tone>, { title: string; body: string }> = {
    overdue: {
      title: "납부 기한이 지났어요",
      body: "지금 납부하거나 분할·사정 상담을 받을 수 있어요.",
    },
    partial: {
      title: "일부만 납부되었어요",
      body: `남은 금액 ${won(bill.totalAmount - bill.paidAmount)}을 마저 납부해 주세요.`,
    },
    confirming: {
      title: "입금 확인 중이에요",
      body: "관리자가 입금을 확인하고 있어요. 보통 24시간 이내에 반영돼요.",
    },
  };
  const { title, body } = COPY[tone];

  return (
    <div
      style={{
        border: "1.5px solid var(--primary)",
        borderRadius: 10,
        padding: 12,
        background: "var(--surface-container-high)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>{body}</div>
    </div>
  );
}

function SecondaryLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 44,
        border: "1px solid var(--outline-variant)",
        borderRadius: "var(--radius-btn)",
        background: "var(--surface-container-lowest)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--on-surface)",
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}

// 관리자 미입력 시 관리비 진입 비활성(E2).
function SecondaryDisabled({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 44,
        border: "1px dashed var(--outline-variant)",
        borderRadius: "var(--radius-btn)",
        background: "var(--surface-container)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--on-surface-variant)",
        cursor: "not-allowed",
      }}
    >
      {label} · 준비 중
    </span>
  );
}
