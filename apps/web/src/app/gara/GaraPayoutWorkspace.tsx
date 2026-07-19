"use client";

import type { FormEvent } from "react";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import type {
  GaraVendorCreditCheckout,
  GaraVendorCreditPublicView,
} from "@roomlog/types";
import {
  cancelGaraVendorCreditCheckout,
  createGaraVendorCreditCheckout,
} from "@/lib/gara-credit-api";
import {
  isTossPaymentsReady,
  requestManagerCardPayment,
  TOSS_PAYMENTS_SDK_URL,
} from "@/lib/toss-payments";
import styles from "./GaraPayoutWorkspace.module.css";

type CallbackMarker =
  | "approved"
  | "reconciliation_required"
  | "cancelled"
  | "failed";

function won(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function parsePositiveSafeInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function callbackMessage(marker: CallbackMarker): string {
  switch (marker) {
    case "approved":
      return "크레딧 충전과 업체 지급 요청이 완료됐습니다.";
    case "reconciliation_required":
      return "결제 승인을 확인 중입니다. 잠시 후 업체 잔액을 다시 확인해 주세요.";
    case "cancelled":
      return "결제가 취소됐습니다.";
    case "failed":
      return "결제를 완료하지 못했습니다. 업체 잔액을 확인해 주세요.";
  }
}

function readCallbackMarker(): CallbackMarker | null {
  const marker = new URLSearchParams(window.location.search).get("creditTopup");
  return marker === "approved"
    || marker === "reconciliation_required"
    || marker === "cancelled"
    || marker === "failed"
    ? marker
    : null;
}

function removeCallbackMarkers(): void {
  const current = new URL(window.location.href);
  current.searchParams.delete("creditTopup");
  current.searchParams.delete("creditTopupOrderId");
  window.history.replaceState(
    window.history.state,
    "",
    `${current.pathname}${current.search}${current.hash}`,
  );
}

function GaraPayoutRow({ vendor }: { vendor: GaraVendorCreditPublicView }) {
  const formId = useId();
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountNumber = vendor.settlementAccountNumber?.trim();

  async function beginCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    const amount = parsePositiveSafeInteger(amountText);
    if (amount === null) {
      setError("요청 금액은 1원 이상의 정수로 입력해 주세요.");
      return;
    }
    if (!accountNumber) {
      setError("정산 계좌가 등록된 업체만 지급할 수 있습니다.");
      return;
    }
    if (!isTossPaymentsReady()) {
      setError("Toss 결제 SDK를 불러온 뒤 다시 시도해 주세요.");
      return;
    }

    setBusy(true);
    let createdCheckout: GaraVendorCreditCheckout | null = null;
    try {
      createdCheckout = await createGaraVendorCreditCheckout({
        managerVendorId: vendor.id,
        amount,
        creationKey: crypto.randomUUID(),
      });
      await requestManagerCardPayment({
        ...createdCheckout,
        orderId: createdCheckout.order.orderId,
        amount: createdCheckout.order.amount,
        successUrl: `${window.location.origin}/gara/payment/success`,
        failUrl: `${window.location.origin}/gara/payment/fail`,
      });
    } catch (checkoutError) {
      const message = errorMessage(
        checkoutError,
        "크레딧 결제를 시작하지 못했습니다.",
      );
      const cleanupFailed = createdCheckout
        ? await cancelGaraVendorCreditCheckout(createdCheckout.order.orderId)
          .then(() => false)
          .catch(() => true)
        : false;
      setError(
        cleanupFailed
          ? `${message} 준비된 주문도 취소하지 못해 잠시 후 잔액을 다시 확인해 주세요.`
          : message,
      );
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{vendor.businessName}</td>
      <td>{vendor.phone}</td>
      <td>
        <span className={styles.accountLabel}>
          <strong>{vendor.linkedAccount.name}</strong>
          <span>{vendor.linkedAccount.email}</span>
        </span>
      </td>
      <td>{accountNumber ?? "계좌번호 미등록"}</td>
      <td className={styles.balance}>{won(vendor.cumulativeCredit)}</td>
      <td>
        <form id={formId} className={styles.requestForm} onSubmit={beginCheckout}>
          <input
            aria-label={`${vendor.businessName} 요청 금액`}
            className={styles.amountInput}
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            placeholder="금액 입력"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            disabled={busy || !accountNumber}
            required
          />
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </td>
      <td>
        <button
          className={styles.sendButton}
          type="submit"
          form={formId}
          disabled={busy || !accountNumber}
        >
          {busy ? "결제 요청 중…" : "결제"}
        </button>
        {!accountNumber ? <span className={styles.hint}>계좌번호 필요</span> : null}
      </td>
    </tr>
  );
}

export function GaraPayoutWorkspace({
  vendors,
}: {
  vendors: GaraVendorCreditPublicView[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const marker = readCallbackMarker();
    if (!marker) return;
    setFeedback(callbackMessage(marker));
    removeCallbackMarkers();
    router.refresh();
  }, [router]);

  return (
    <>
      <Script src={TOSS_PAYMENTS_SDK_URL} strategy="afterInteractive" />
      <section className={styles.workspace}>
        {feedback ? (
          <p className={styles.feedback} role="status">
            {feedback}
          </p>
        ) : null}
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th scope="col">업체명</th>
                <th scope="col">전화번호</th>
                <th scope="col">연결 계정</th>
                <th scope="col">계좌번호</th>
                <th scope="col">잔액</th>
                <th scope="col">요청 금액</th>
                <th scope="col">결제</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <GaraPayoutRow key={vendor.id} vendor={vendor} />
              ))}
            </tbody>
          </table>
          {vendors.length === 0 ? (
            <p className={styles.empty}>등록된 업체가 없습니다.</p>
          ) : null}
        </div>
      </section>
    </>
  );
}
