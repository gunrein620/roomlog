import Link from "next/link";
import { notFound } from "next/navigation";
import type { Bill, BillStatus, TenantBillingOverview } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import {
  DEMO_BILL_ID,
  getBill,
  getTenantBillingOverview,
  tenantBillSummaryForId,
} from "@/lib/payment-api";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { ApiError } from "@/lib/server-api";
import styles from "../tenant-payment-pages.module.css";

const STATUS_LABEL: Record<BillStatus, string> = {
  draft: "작성 중",
  sent: "납부예정",
  confirming: "확인 중",
  partially_paid: "일부 납부",
  paid: "완료",
  overdue: "연체",
  corrected: "정정됨",
  canceled: "취소됨",
};

function won(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId: string): string {
  return `${route}?id=${encodeURIComponent(billId)}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  let bill: Bill;
  let overview: TenantBillingOverview;

  try {
    [bill, overview] = await Promise.all([getBill(id), getTenantBillingOverview()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const requestedBillId = id?.trim();
  const summaryBillId =
    requestedBillId && requestedBillId !== DEMO_BILL_ID ? requestedBillId : bill.id;
  const summary = tenantBillSummaryForId(overview, summaryBillId);
  const remainingAmount = summary?.remainingAmount ?? Math.max(0, bill.totalAmount - bill.paidAmount);
  const canPay = summary?.canPay === true;

  return (
    <>
      <header className={styles.pageHeader}>
        <Link className={styles.backLink} href={PAYMENT_ROUTES["T-PAY-00"]}>
          ‹ 뒤로
        </Link>
        <h1 className={styles.pageTitle}>{bill.billingMonth} 청구 상세</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <main className={`${styles.pageBody} ${styles.detailBody}`}>
        <section aria-labelledby="bill-status-title">
          <h2 id="bill-status-title" className={styles.sectionLabel}>
            청구 상태
          </h2>
          <Card className={styles.detailCard}>
            <Badge emphasis>{STATUS_LABEL[bill.status]}</Badge>
            {bill.correctionHistory?.length ? (
              <ul className={styles.correctionHistory}>
                {bill.correctionHistory.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        </section>

        <section aria-labelledby="bill-items-title">
          <h2 id="bill-items-title" className={styles.sectionLabel}>
            청구 항목
          </h2>
          <Card className={styles.detailCard}>
            <div className={styles.itemList}>
              {bill.items.map((item) => (
                <div className={styles.itemRow} key={`${item.kind}-${item.label}`}>
                  <span>{item.label}</span>
                  <strong>{won(item.amount)}</strong>
                </div>
              ))}
              <div className={`${styles.itemRow} ${styles.itemTotal}`}>
                <span>합계</span>
                <strong>{won(bill.totalAmount)}</strong>
              </div>
              {remainingAmount < bill.totalAmount ? (
                <div className={styles.itemRow}>
                  <span>남은 금액</span>
                  <strong>{won(remainingAmount)}</strong>
                </div>
              ) : null}
            </div>
          </Card>
        </section>

        <section aria-labelledby="payment-information-title">
          <h2 id="payment-information-title" className={styles.sectionLabel}>
            납부 정보
          </h2>
          <Card className={styles.detailCard}>
            <Row label="입금 계좌" value={`${bill.account.bankName} ${bill.account.accountNumber}`} />
            <Row label="예금주" value={bill.account.accountHolder} />
            <Row label="납부 기한" value={bill.dueDate.slice(0, 10)} />
          </Card>
        </section>

        <p className={styles.languageHint}>🌐 다른 언어로 보기</p>
      </main>

      <footer className={styles.pageFooter}>
        {bill.status === "paid" ? (
          <Link className={styles.primaryAction} href={PAYMENT_ROUTES["T-PAY-03"]}>
            납부 기록
          </Link>
        ) : canPay ? (
          <Link
            className={styles.primaryAction}
            href={withBillId(PAYMENT_ROUTES["T-PAY-02"], bill.id)}
          >
            납부하기
          </Link>
        ) : (
          <button
            className={styles.primaryDisabled}
            type="button"
            disabled
            aria-disabled="true"
          >
            {bill.status === "confirming"
              ? "납부 확인 중"
              : remainingAmount <= 0
                ? "납부할 잔액이 없어요"
                : "납부 준비 중"}
          </button>
        )}
      </footer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
