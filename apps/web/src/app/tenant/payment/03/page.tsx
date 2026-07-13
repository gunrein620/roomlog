import Link from "next/link";
import {
  paymentHistoryPresetRange,
  type TenantPaymentHistory,
  type TenantPaymentPeriodPreset,
} from "@roomlog/types";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { getTenantPaymentHistory } from "@/lib/payment-api";
import { ApiError } from "@/lib/server-api";
import { PaymentPeriodFilter } from "./PaymentPeriodFilter";
import { RecordList } from "./RecordList";
import styles from "./payment-history.module.css";

type PaymentHistorySearchParams = Promise<{
  preset?: string;
  from?: string;
  to?: string;
}>;

function sameRange(
  left: TenantPaymentHistory["range"],
  right: TenantPaymentHistory["range"],
) {
  return left.from === right.from && left.to === right.to;
}

// T-PAY-03 · 납부/청구 기록
// URL이 조회 기간의 단일 진실이며 서버가 실제 활동일 기준 기록을 반환한다.
export default async function Page({
  searchParams,
}: {
  searchParams: PaymentHistorySearchParams;
}) {
  const params = await searchParams;
  const requestedPreset = params.preset ?? "1";
  const preset: TenantPaymentPeriodPreset =
    requestedPreset === "3" || requestedPreset === "6" ? Number(requestedPreset) as 3 | 6 : 1;
  const isCustomRange = Boolean(params.from && params.to);
  let history: TenantPaymentHistory;

  if (params.from && params.to) {
    // Complete hand-written ranges go straight to the API so its 400 remains authoritative.
    history = await getTenantPaymentHistory({
      from: params.from,
      to: params.to,
    });
  } else {
    const requested = paymentHistoryPresetRange(preset);

    try {
      history = await getTenantPaymentHistory(requested);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 400) throw error;

      const probeRange = { from: requested.to, to: requested.to };
      const probe = await getTenantPaymentHistory(probeRange);
      const clampedRange = {
        from: requested.from < probe.bounds.min ? probe.bounds.min : requested.from,
        to: requested.to > probe.bounds.max ? probe.bounds.max : requested.to,
      };

      history = sameRange(clampedRange, probeRange)
        ? probe
        : await getTenantPaymentHistory(clampedRange);
    }
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <Link href={PAYMENT_ROUTES["T-PAY-00"]} className={styles.backLink}>
          ‹ 뒤로
        </Link>
        <h1 className={styles.pageTitle}>납부 기록</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <main className={styles.pageBody}>
        <PaymentPeriodFilter
          bounds={history.bounds}
          range={history.range}
          selectedPreset={isCustomRange ? null : preset}
        />
        <RecordList records={history.records} />
      </main>
    </>
  );
}
