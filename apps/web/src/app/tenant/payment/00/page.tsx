import Link from "next/link";
import {
  billingDateInSeoul,
  type Bill,
  type BillStatus,
  type PaymentBadge,
  type TenantBillSummary,
} from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { getTenantBillingOverview } from "@/lib/payment-api";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import styles from "../tenant-payment-pages.module.css";

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

function won(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function ddayOf(dueIso: string): number {
  const difference = new Date(dueIso).getTime() - Date.now();
  return Math.ceil(difference / 86_400_000);
}

function withBillId(route: string, billId: string): string {
  return `${route}?id=${encodeURIComponent(billId)}`;
}

function upcomingStatusLabel(summary: TenantBillSummary): string {
  if (summary.bill.status === "paid" || summary.remainingAmount <= 0) return "납부 완료";
  if (summary.bill.status === "confirming") return "납부 확인 중";
  if (summary.canPay) return "미리 납부 가능";
  return "예정";
}

function upcomingPaymentDate(dueDate: string, paymentClosed: boolean): string {
  const [, monthValue, dayValue] = billingDateInSeoul(dueDate).split("-");
  const month = Number(monthValue);
  const day = Number(dayValue);
  return paymentClosed
    ? `${month}월 ${day}일 납부 기한`
    : `${month}월 ${day}일까지 납부`;
}

function upcomingSupportingLabel(summary: TenantBillSummary): string {
  const paymentClosed =
    summary.bill.status === "paid" ||
    summary.remainingAmount <= 0 ||
    summary.bill.status === "confirming";

  return upcomingPaymentDate(summary.bill.dueDate, paymentClosed);
}

export default async function Page() {
  const { current, previousUnpaid, upcoming } = await getTenantBillingOverview();
  const unit = current?.bill.unitId ?? upcoming?.bill.unitId ?? previousUnpaid[0]?.bill.unitId;

  return (
    <>
      <header className={styles.overviewHeader}>
        <div>
          <div className={styles.overviewTitle}>{unit ? `${unit}호` : "내 호실"} · 이번 달</div>
          <div className={styles.brand}>집우집주 · 납부</div>
        </div>
      </header>

      <main className={styles.overviewBody}>
        {current ? (
          <>
            <BillSummary summary={current} />
            <ConditionBanner bill={current.bill} />
            {current.bill.depositConfirmationRequested ? (
              <div className={styles.conditionBanner}>
                <strong>입금 확인 응답 요청</strong>
                <span>관리자가 입금 확인을 요청했어요 · 입금자명·이체일·금액을 알려주세요.</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.emptyState}>
            <strong>이번 달 청구가 없어요</strong>
            <span>다음 결제 예정 청구는 아래에서 따로 확인할 수 있어요.</span>
          </div>
        )}

        {previousUnpaid.length > 0 ? (
          <section className={styles.previousSection} aria-labelledby="previous-unpaid-title">
            <div id="previous-unpaid-title" className={styles.sectionLabel}>
              이전 미납 {previousUnpaid.length}건
            </div>
            <div className={styles.previousList}>
              {previousUnpaid.map((summary) => (
                <Card key={summary.bill.id} className={styles.previousCard}>
                  <div>
                    <strong>{summary.bill.billingMonth} 청구</strong>
                    <span>남은 금액 {won(summary.remainingAmount)}</span>
                  </div>
                  <Link
                    className={styles.inlineDetailLink}
                    href={withBillId(PAYMENT_ROUTES["T-PAY-01"], summary.bill.id)}
                  >
                    청구 상세
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {upcoming ? <UpcomingBill summary={upcoming} /> : null}
      </main>

      <footer className={styles.overviewFooter}>
        <CurrentPrimaryAction current={current} />
        <nav className={styles.secondaryActions} aria-label="납부 메뉴">
          {current ? (
            <Link
              className={styles.secondaryLink}
              href={withBillId(PAYMENT_ROUTES["T-PAY-01"], current.bill.id)}
            >
              청구 상세
            </Link>
          ) : (
            <span className={styles.secondaryDisabled} aria-disabled="true">
              청구 상세
            </span>
          )}
          <Link className={styles.secondaryLink} href={PAYMENT_ROUTES["T-PAY-03"]}>
            납부 기록
          </Link>
        </nav>
      </footer>
    </>
  );
}

function CurrentPrimaryAction({ current }: { current: TenantBillSummary | null }) {
  const paymentBlockedByStatus =
    current?.bill.status === "paid" || current?.bill.status === "confirming";

  if (current && !paymentBlockedByStatus && current.canPay && current.remainingAmount > 0) {
    return (
      <Link
        className={styles.primaryAction}
        href={withBillId(PAYMENT_ROUTES["T-PAY-02"], current.bill.id)}
      >
        납부하기
      </Link>
    );
  }

  let label = "납부할 청구가 없어요";
  if (current?.bill.status === "paid") label = "납부 완료";
  else if (current?.bill.status === "confirming") label = "납부 확인 중";
  else if (current && current.remainingAmount <= 0) label = "납부할 잔액이 없어요";
  else if (current) label = "납부 준비 중";

  return (
    <button
      className={styles.primaryDisabled}
      type="button"
      disabled
      aria-disabled="true"
    >
      {label}
    </button>
  );
}

function BillSummary({ summary }: { summary: TenantBillSummary }) {
  const { bill, remainingAmount } = summary;
  const badge = STATUS_TO_BADGE[bill.status];
  const dday = ddayOf(bill.dueDate);

  return (
    <section className={styles.currentSection} aria-labelledby="current-bill-title">
      <Card className={styles.summaryCard}>
        <div className={styles.summaryTopline}>
          <span id="current-bill-title">{bill.billingMonth} 청구 총액</span>
          <Badge emphasis>{BADGE_LABEL[badge]}</Badge>
        </div>
        <strong className={styles.summaryAmount}>{won(bill.totalAmount)}</strong>
        <div className={styles.summaryRow}>
          <span>납부 기한</span>
          <strong>
            {bill.dueDate.slice(0, 10)}
            <em>{dday >= 0 ? `D-${dday}` : `D+${-dday}`}</em>
          </strong>
        </div>
        {remainingAmount < bill.totalAmount ? (
          <div className={styles.summaryRow}>
            <span>남은 금액</span>
            <strong>{won(remainingAmount)}</strong>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function UpcomingBill({ summary }: { summary: TenantBillSummary }) {
  const { bill } = summary;

  return (
    <section className={styles.upcomingSection} aria-labelledby="upcoming-bill-title">
      <div id="upcoming-bill-title" className={styles.sectionLabel}>
        다음 결제 예정
      </div>
      <Card className={styles.upcomingCard}>
        <div className={styles.summaryTopline}>
          <div>
            <strong>{bill.billingMonth} 청구</strong>
            <span>{upcomingSupportingLabel(summary)}</span>
          </div>
          <Badge emphasis>{upcomingStatusLabel(summary)}</Badge>
        </div>
        <strong className={styles.upcomingAmount}>{won(summary.remainingAmount)}</strong>
        <Link
          className={styles.inlineDetailLink}
          href={withBillId(PAYMENT_ROUTES["T-PAY-01"], bill.id)}
        >
          청구 상세
        </Link>
      </Card>
    </section>
  );
}

function ConditionBanner({ bill }: { bill: Bill }) {
  let copy: { title: string; body: string } | null = null;

  if (bill.status === "overdue") {
    copy = {
      title: "납부 기한이 지났어요",
      body: "지금 납부하거나 분할·사정 상담을 받을 수 있어요.",
    };
  } else if (bill.status === "partially_paid") {
    copy = {
      title: "일부만 납부되었어요",
      body: `남은 금액 ${won(bill.totalAmount - bill.paidAmount)}을 마저 납부해 주세요.`,
    };
  } else if (bill.status === "confirming") {
    copy = {
      title: "입금 확인 중이에요",
      body: "관리자가 입금을 확인하고 있어요. 보통 24시간 이내에 반영돼요.",
    };
  }

  if (!copy) return null;

  return (
    <div className={styles.conditionBanner}>
      <strong>{copy.title}</strong>
      <span>{copy.body}</span>
    </div>
  );
}
