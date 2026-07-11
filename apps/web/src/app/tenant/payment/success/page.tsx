import Link from "next/link";
import { Card } from "@roomlog/ui";
import { confirmBillPayment } from "@/lib/payment-api";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import styles from "../tenant-payment-pages.module.css";

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    billId?: string;
    paymentKey?: string;
    orderId?: string;
    amount?: string;
  }>;
}) {
  const { billId, paymentKey, orderId, amount } = await searchParams;
  const paymentAmount = Number(amount);
  let paidAmount = paymentAmount;
  let errorMessage: string | null = null;

  if (!billId || !paymentKey || !orderId || !Number.isFinite(paymentAmount)) {
    errorMessage = "결제 승인에 필요한 정보가 부족합니다.";
  } else {
    try {
      const bill = await confirmBillPayment(billId, {
        paymentKey,
        orderId,
        amount: paymentAmount,
      });
      paidAmount = bill.paidAmount;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "결제 승인 처리에 실패했습니다.";
    }
  }

  const ok = errorMessage === null;

  return (
    <>
      <header className={styles.pageHeader}>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <h1 className={styles.pageTitle}>{ok ? "결제 완료" : "결제 확인 필요"}</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>
      <main className={`${styles.pageBody} ${styles.resultBody}`}>
        <div className={`${styles.resultIcon} ${ok ? "" : styles.resultErrorIcon}`}>
          {ok ? "✓" : "!"}
        </div>
        <h2 className={styles.resultTitle}>
          {ok ? "Toss 결제가 승인됐어요" : "결제 승인을 확인해 주세요"}
        </h2>
        <p className={styles.resultMessage}>
          {ok ? (
            <>
              승인 금액 <b>{won(paymentAmount)}</b>
              <br />
              확정 수납액 <b>{won(paidAmount)}</b>으로 반영했어요.
            </>
          ) : (
            errorMessage
          )}
        </p>
        <Card className={styles.resultNotice}>
          {ok
            ? "관리자 수금 현황에서 월세·관리비 항목별 수납상태가 갱신됩니다."
            : "Toss 인증은 끝났지만 서버 승인 또는 수납 반영이 실패했습니다. 같은 결제건을 다시 확인하세요."}
        </Card>
      </main>
      <footer className={styles.pageFooter}>
        <Link
          className={styles.primaryAction}
          href={withBillId(ok ? PAYMENT_ROUTES["T-PAY-00"] : PAYMENT_ROUTES["T-PAY-02"], billId)}
        >
          {ok ? "홈으로" : "납부 화면으로"}
        </Link>
      </footer>
    </>
  );
}
