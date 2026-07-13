import Link from "next/link";
import { Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import styles from "../tenant-payment-pages.module.css";

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    billId?: string;
    code?: string;
    message?: string;
  }>;
}) {
  const { billId, code, message } = await searchParams;

  return (
    <>
      <header className={styles.pageHeader}>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <h1 className={styles.pageTitle}>결제 실패</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>
      <main className={`${styles.pageBody} ${styles.resultBody}`}>
        <div className={`${styles.resultIcon} ${styles.resultErrorIcon}`}>!</div>
        <h2 className={styles.resultTitle}>결제가 완료되지 않았어요</h2>
        <p className={styles.resultMessage}>
          {message || "결제 인증이 취소되었거나 실패했습니다."}
          {code ? (
            <>
              <br />
              오류 코드 {code}
            </>
          ) : null}
        </p>
        <Card className={styles.resultNotice}>
          실패한 결제는 관리자 수납 현황에 반영하지 않습니다.
        </Card>
      </main>
      <footer className={styles.pageFooter}>
        <Link
          className={styles.primaryAction}
          href={withBillId(PAYMENT_ROUTES["T-PAY-02"], billId)}
        >
          납부 화면으로
        </Link>
      </footer>
    </>
  );
}
