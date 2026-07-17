"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
  TenantVendorWorkflowView,
  VendorJobPaymentView,
} from "@roomlog/types";
import { getTenantVendorWorkflow } from "@/lib/tenant-vendor-workflow-api";
import { repairPaymentRecovery } from "@/lib/repair-payment-recovery";
import {
  TOSS_PAYMENTS_SDK_URL,
  createTossWidgets,
  isTossPaymentsReady,
  requestTossPayment,
  tossPaymentMode,
  type TossPaymentMode,
  type TossWidgets,
} from "@/lib/toss-payments";
import {
  RepairPaymentLifecycle,
  type RepairPaymentLifecycleResult,
} from "@/lib/repair-payment-lifecycle";
import styles from "./TenantRepairPaymentCheckout.module.css";

const PAYMENT_METHOD_SELECTOR = "#roomlog-tenant-repair-payment-method";
const AGREEMENT_SELECTOR = "#roomlog-tenant-repair-payment-agreement";
const SUCCESS_PATH = "/tenant/repair-payment/success";
const FAIL_PATH = "/tenant/repair-payment/fail";
const SDK_ERROR = "Toss 결제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
const CLEANUP_ERROR = "준비된 주문 상태를 확인하지 못했습니다. 결제를 다시 누르지 말고 내역을 확인해 주세요.";

type TenantRepairPaymentCheckoutProps = {
  paymentRequestId: string;
  complaintId: string;
  callbackMarker?: string;
};

type PaymentMethod = "TOSS" | "DIRECT";

async function tenantRepairPaymentBrowserFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const rawMessage = payload && typeof payload === "object" && "message" in payload
      ? (payload as { message?: unknown }).message
      : undefined;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item): item is string => typeof item === "string").join(", ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "수리비 결제 요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return payload as T;
}

async function cancelReadyOrder(checkout: RepairPaymentCheckout): Promise<void> {
  if (checkout.order.status !== "READY") return;
  const orderPath = `/api/tenant/repair-payment-orders/${encodeURIComponent(checkout.order.orderId)}`;
  try {
    await tenantRepairPaymentBrowserFetch<RepairPaymentOrderPublicView>(
      `${orderPath}/cancel`,
      { method: "POST", body: JSON.stringify({}) },
    );
  } catch (cancelError) {
    const stored = await tenantRepairPaymentBrowserFetch<RepairPaymentOrderPublicView>(orderPath);
    if (stored.status === "CANCELLED") return;
    throw cancelError;
  }
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function callbackMessage(marker?: string): string {
  if (marker === "approved") return "결제 완료";
  if (marker === "reconciliation_required") return "결제 확인 중";
  if (marker === "cancelled" || marker === "failed") return "결제 미완료";
  return "";
}

export function TenantRepairPaymentCheckout({
  paymentRequestId,
  complaintId,
  callbackMarker,
}: TenantRepairPaymentCheckoutProps) {
  const lifecycleRef = useRef<RepairPaymentLifecycle | null>(null);
  const lifecycle = lifecycleRef.current
    ?? (lifecycleRef.current = new RepairPaymentLifecycle(cancelReadyOrder));
  const widgetsRef = useRef<TossWidgets | null>(null);
  const [snapshot, setSnapshot] = useState(() => lifecycle.getSnapshot());
  const [workflow, setWorkflow] = useState<TenantVendorWorkflowView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [paymentMode, setPaymentMode] = useState<TossPaymentMode | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => callbackMessage(callbackMarker));
  const [recovering, setRecovering] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("TOSS");

  const { checkout, busy, cleanupUncertain, sdkFailed, canPay } = snapshot;
  const payment = workflow?.paymentRequest;
  const latestRepairPaymentOrder = workflow?.latestRepairPaymentOrder;
  const recovery = repairPaymentRecovery(latestRepairPaymentOrder?.status);
  const ownsPaymentRequest = Boolean(payment && payment.id === paymentRequestId);
  const isDirectPending = payment?.id === paymentRequestId
    && payment.status === "PENDING_APPROVAL"
    && payment.lastAttemptMode === "DIRECT";
  const canStartPayment = Boolean(
    payment
    && payment.id === paymentRequestId
    && payment.status === "PENDING_APPROVAL"
    && !isDirectPending
    && (!latestRepairPaymentOrder
      || latestRepairPaymentOrder.status === "CANCELLED"
      || recovery?.canRetry),
  );
  const isPaid = payment?.id === paymentRequestId
    && (payment.status === "TOSS_PAID"
      || payment.status === "DIRECT_PAID"
      || latestRepairPaymentOrder?.status === "APPROVED");
  const isDirectPaid = payment?.id === paymentRequestId
    && payment.status === "DIRECT_PAID";
  const returnHref = complaintId
    ? `/living?complaintId=${encodeURIComponent(complaintId)}`
    : "/living";

  const loadWorkflow = useCallback(async () => {
    if (!complaintId) {
      setWorkflow(null);
      setError("연결된 하자 접수 정보를 확인하지 못했습니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setWorkflow(await getTenantVendorWorkflow(complaintId));
    } catch (loadError) {
      setWorkflow(null);
      setError(messageFromError(loadError, "결제 정보를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    lifecycle.beginSession();
    const unsubscribe = lifecycle.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      void lifecycle.requestCleanup();
    };
  }, [lifecycle]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  useEffect(() => {
    const ready = isTossPaymentsReady();
    setSdkReady(ready);
    if (ready) lifecycle.markSdkLoaded();
  }, [lifecycle]);

  useEffect(() => {
    if (!checkout) {
      widgetsRef.current = null;
      setPaymentMode(null);
      setWidgetReady(false);
    }
  }, [checkout]);

  useEffect(() => {
    if (
      !checkout
      || paymentMode !== "widget"
      || !sdkReady
      || !lifecycle.getSnapshot().canPay
    ) return;
    let active = true;
    let renderedWidgets: TossWidgets | null = null;

    const frame = window.requestAnimationFrame(async () => {
      setWidgetReady(false);
      const result = await lifecycle.renderCheckout(async () => {
        const widgets = createTossWidgets(checkout.clientKey, checkout.customerKey);
        await widgets.setAmount({ currency: "KRW", value: checkout.order.amount });
        await Promise.all([
          widgets.renderPaymentMethods({
            selector: PAYMENT_METHOD_SELECTOR,
            variantKey: "DEFAULT",
          }),
          widgets.renderAgreement({
            selector: AGREEMENT_SELECTOR,
            variantKey: "AGREEMENT",
          }),
        ]);
        renderedWidgets = widgets;
      });

      if (!active) return;
      if (result.status === "COMPLETED" && renderedWidgets && lifecycle.getSnapshot().canPay) {
        widgetsRef.current = renderedWidgets;
        setWidgetReady(true);
      } else if (result.status === "FAILED") {
        setError(messageFromError(result.error, "결제수단을 불러오지 못했습니다."));
      }
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [checkout, lifecycle, paymentMode, sdkReady]);

  const paymentResultError = (
    result: RepairPaymentLifecycleResult<unknown>,
    fallback: string,
  ) => result.cleanupUncertain
    ? `${messageFromError(result.error, fallback)} ${CLEANUP_ERROR}`
    : messageFromError(result.error, fallback);

  async function requestPreparedPayment(
    prepared: RepairPaymentCheckout,
    widgets?: TossWidgets,
  ): Promise<void> {
    const result = await lifecycle.requestPayment(() => requestTossPayment({
      clientKey: prepared.clientKey,
      customerKey: prepared.customerKey,
      orderId: prepared.order.orderId,
      amount: prepared.order.amount,
      orderName: prepared.orderName,
      successUrl: `${window.location.origin}${SUCCESS_PATH}`,
      failUrl: `${window.location.origin}${FAIL_PATH}`,
      customerName: "집우집주 세입자",
      widgets,
    }));
    if (result.status === "FAILED") {
      setError(paymentResultError(result, "결제를 요청하지 못했습니다."));
    }
  }

  async function beginPayment(): Promise<void> {
    if (!canStartPayment || !payment || busy) return;
    if (!sdkReady || sdkFailed) {
      setError(SDK_ERROR);
      return;
    }
    setError("");
    setNotice("");

    if (checkout && paymentMode === "widget") {
      if (!widgetReady || !widgetsRef.current) {
        setError("결제수단과 약관을 모두 불러온 뒤 다시 시도해 주세요.");
        return;
      }
      await requestPreparedPayment(checkout, widgetsRef.current);
      return;
    }

    const returnPath = `${window.location.pathname}?complaintId=${encodeURIComponent(complaintId)}`;
    const checkoutPath = latestRepairPaymentOrder && recovery?.canRetry
      ? `/api/tenant/repair-payment-orders/${encodeURIComponent(latestRepairPaymentOrder.orderId)}/retry`
      : `/api/tenant/vendor-payment-requests/${encodeURIComponent(payment.id)}/toss-orders`;
    const result = await lifecycle.beginCheckout(() =>
      tenantRepairPaymentBrowserFetch<RepairPaymentCheckout>(
        checkoutPath,
        {
          method: "POST",
          body: JSON.stringify({
            creationKey: crypto.randomUUID(),
            returnPath,
          }),
        },
      ));

    if (result.status === "FAILED") {
      setError(paymentResultError(result, "수리비 결제를 시작하지 못했습니다."));
      return;
    }
    if (result.status !== "COMPLETED" || !result.value) return;

    const mode = tossPaymentMode(result.value.clientKey);
    setPaymentMode(mode);
    if (mode === "payment-window") await requestPreparedPayment(result.value);
  }

  async function requestDirectPayment(): Promise<void> {
    if (!canStartPayment || !payment || busy || recovering) return;
    setRecovering(true);
    setError("");
    setNotice("");
    try {
      const updated = await tenantRepairPaymentBrowserFetch<VendorJobPaymentView>(
        `/api/tenant/vendor-payment-requests/${encodeURIComponent(payment.id)}/direct-payment`,
        {
          method: "POST",
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      );
      setWorkflow((current) => current
        ? { ...current, paymentRequest: updated }
        : current);
      setNotice("업체 확인 대기");
    } catch (directError) {
      setError(messageFromError(directError, "직접결제 요청을 처리하지 못했습니다."));
    } finally {
      setRecovering(false);
    }
  }

  async function cancelPreparedOrder(): Promise<void> {
    setError("");
    const result = await lifecycle.requestCleanup();
    if (result.status === "FAILED" || lifecycle.getSnapshot().cleanupUncertain) {
      setError(CLEANUP_ERROR);
      return;
    }
    setNotice("주문 취소");
    await loadWorkflow();
  }

  async function updateStoredOrder(action: "cancel" | "reconcile"): Promise<void> {
    if (!latestRepairPaymentOrder || recovering || busy) return;
    setRecovering(true);
    setError("");
    try {
      const updated = await tenantRepairPaymentBrowserFetch<RepairPaymentOrderPublicView>(
        `/api/tenant/repair-payment-orders/${encodeURIComponent(latestRepairPaymentOrder.orderId)}/${action}`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setNotice(
        action === "cancel"
          ? "주문 취소"
          : repairPaymentRecovery(updated.status)?.label ?? "결제 상태 확인",
      );
      await loadWorkflow();
    } catch (updateError) {
      setError(messageFromError(updateError, "결제 주문을 처리하지 못했습니다."));
    } finally {
      setRecovering(false);
    }
  }

  async function handleSdkFailure(): Promise<void> {
    setSdkReady(false);
    const result = await lifecycle.markSdkFailed();
    setError(result.cleanupUncertain ? `${SDK_ERROR} ${CLEANUP_ERROR}` : SDK_ERROR);
  }

  const amount = checkout?.order.amount ?? payment?.amount ?? 0;
  const actionDisabled = !canStartPayment
    || busy
    || recovering
    || cleanupUncertain
    || (selectedMethod === "TOSS" && (
      sdkFailed
      || (Boolean(checkout) && !canPay)
      || (paymentMode === "widget" && !widgetReady)
    ));

  return (
    <div className={styles.screen}>
      <Script
        src={TOSS_PAYMENTS_SDK_URL}
        strategy="afterInteractive"
        onLoad={() => {
          setSdkReady(true);
          lifecycle.markSdkLoaded();
        }}
        onError={() => void handleSdkFailure()}
      />

      <header className={styles.header}>
        <a href={returnHref} aria-label="수리 상세로 돌아가기">←</a>
        <div>
          <span>협력업체 수리</span>
          <h1>수리비 결제</h1>
        </div>
      </header>

      <main className={styles.content}>
        {loading ? (
          <section className={styles.state} aria-live="polite">
            <strong>결제 정보를 확인하고 있어요</strong>
          </section>
        ) : !ownsPaymentRequest || !payment ? (
          <section className={styles.state} role="alert">
            <strong>결제 요청을 확인하지 못했습니다</strong>
            <p>{error || "수리 상세에서 결제 요청을 다시 확인해 주세요."}</p>
          </section>
        ) : (
          <>
            <section className={styles.summary} aria-label="수리비 결제 정보">
              <div>
                <span>업체</span>
                <strong>{workflow.vendor.businessName}</strong>
              </div>
              <div>
                <span>수리 항목</span>
                <strong>{workflow.latestCompletion?.workSummary ?? "완료된 수리"}</strong>
              </div>
              <div className={styles.amount}>
                <span>결제 금액</span>
                <strong>{won(amount)}</strong>
              </div>
            </section>

            {(notice || isPaid || isDirectPending) ? (
              <p className={styles.notice} role="status">
                {isDirectPaid
                  ? "직접결제 완료"
                  : isPaid
                    ? "결제 완료"
                    : isDirectPending
                      ? "업체 확인 대기"
                      : notice}
              </p>
            ) : null}

            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            {latestRepairPaymentOrder
              && recovery
              && latestRepairPaymentOrder.status !== "CANCELLED"
              && !isDirectPending
              && !checkout ? (
              <section className={styles.recoveryState} aria-label="결제 주문 상태">
                <strong>{recovery.label}</strong>
                <p>
                  {recovery.canReconcile
                    ? "결제 승인 결과를 다시 확인해 주세요. 확인 전에는 새 결제를 시작하지 않습니다."
                    : recovery.canRetry
                      ? "기존 주문을 새 주문으로 교체해 다시 결제하거나 주문을 취소할 수 있습니다."
                      : "수리비 결제가 완료됐습니다."}
                </p>
              </section>
            ) : null}

            {checkout && paymentMode === "widget" ? (
              <section className={styles.widgetRegion} aria-label="Toss 결제수단 선택">
                <div id="roomlog-tenant-repair-payment-method" />
                <div id="roomlog-tenant-repair-payment-agreement" />
              </section>
            ) : null}

            {canStartPayment && !checkout ? (
              <section className={styles.methodSelector} aria-label="결제 방법">
                <strong>결제 방법</strong>
                <div className={styles.methodOptions}>
                  <button
                    type="button"
                    className={styles.methodButton}
                    aria-pressed={selectedMethod === "TOSS"}
                    onClick={() => {
                      setSelectedMethod("TOSS");
                      setError("");
                    }}
                  >
                    Toss 결제
                  </button>
                  <button
                    type="button"
                    className={styles.methodButton}
                    aria-pressed={selectedMethod === "DIRECT"}
                    onClick={() => {
                      setSelectedMethod("DIRECT");
                      setError("");
                    }}
                  >
                    직접결제
                  </button>
                </div>
                <p>
                  직접결제는 업체가 실제 수령을 확인하면 결제 이력에 완료로 기록됩니다.
                </p>
              </section>
            ) : null}

            {isDirectPending ? (
              <section className={styles.state}>
                <strong>업체가 수령 여부를 확인하고 있어요</strong>
                <p>확인 전까지 금액과 요청 내역은 그대로 유지됩니다.</p>
              </section>
            ) : null}

            {!canStartPayment && !isPaid && !isDirectPending && !recovery?.canReconcile ? (
              <section className={styles.state}>
                <strong>지금은 결제할 수 없습니다</strong>
                <p>수리 상세에서 결제 요청 상태를 확인해 주세요.</p>
              </section>
            ) : null}
          </>
        )}
      </main>

      <footer className={styles.footer}>
        {checkout ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => void cancelPreparedOrder()}
          >
            주문 취소
          </button>
        ) : recovery?.canCancel ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy || recovering}
            onClick={() => void updateStoredOrder("cancel")}
          >
            주문 취소
          </button>
        ) : (
          <a className={styles.secondaryButton} href={returnHref}>수리 상세</a>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={(recovery?.canReconcile ? busy || recovering : actionDisabled)
            || isPaid
            || isDirectPending}
          onClick={() => {
            if (recovery?.canReconcile && !checkout) {
              void updateStoredOrder("reconcile");
              return;
            }
            if (selectedMethod === "DIRECT" && !checkout) {
              void requestDirectPayment();
              return;
            }
            void beginPayment();
          }}
        >
          {isDirectPaid
            ? "직접결제 완료"
            : isPaid
              ? "결제 완료"
              : isDirectPending
                ? "업체 확인 대기"
            : busy || recovering
              ? "결제 준비 중"
              : checkout && paymentMode === "widget"
                ? "Toss로 결제"
                : recovery?.canReconcile
                  ? "상태 다시 확인"
                  : recovery?.canRetry
                    ? "다시 결제"
                    : selectedMethod === "DIRECT"
                      ? "직접결제 요청"
                      : "Toss로 결제"}
        </button>
      </footer>
    </div>
  );
}
