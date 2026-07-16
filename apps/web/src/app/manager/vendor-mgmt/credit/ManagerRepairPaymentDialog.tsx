"use client";

import type { FormEvent } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Script from "next/script";
import { X } from "lucide-react";
import type {
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
} from "@roomlog/types";
import {
  TOSS_PAYMENTS_SDK_URL,
  createTossWidgets,
  isTossPaymentsReady,
  requestManagerCardPayment,
  tossPaymentMode,
  type TossPaymentMode,
  type TossWidgets,
} from "@/lib/toss-payments";
import {
  ManagerRepairPaymentLifecycle,
  type ManagerRepairPaymentLifecycleResult,
} from "./manager-repair-payment-lifecycle";
import styles from "./ManagerRepairPaymentDialog.module.css";

const PAYMENT_METHOD_SELECTOR = "#roomlog-manager-repair-payment-method";
const AGREEMENT_SELECTOR = "#roomlog-manager-repair-payment-agreement";
const SUCCESS_PATH = "/manager/repair-payment/success";
const FAIL_PATH = "/manager/repair-payment/fail";
const SDK_ERROR =
  "Toss 결제 SDK를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
const CLEANUP_ERROR =
  "준비된 결제 주문을 취소하지 못했습니다. 결제 내역을 확인한 뒤 취소를 다시 시도해 주세요.";

export type ManagerRepairPaymentTarget = {
  paymentRequestId: string;
  retryOrderId?: string;
  vendorName: string;
  jobLabel: string;
  amount: number;
};

export type ManagerRepairPaymentDialogHandle = {
  open(target: ManagerRepairPaymentTarget): void;
};

export type ManagerRepairPaymentDialogProps = {
  onResultMessage?: (message: string) => void;
  onWorkspaceRefresh?: () => void;
};

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function browserRepairPaymentFetch<T>(
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
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new Error(
      message || `수리비 결제 요청을 처리하지 못했습니다 (HTTP ${response.status}).`,
    );
  }

  return body as T;
}

async function cancelReadyOrder(checkout: RepairPaymentCheckout): Promise<void> {
  if (checkout.order.status !== "READY") return;
  const orderPath = `/api/manager/repair-payment-orders/${encodeURIComponent(checkout.order.orderId)}`;
  try {
    await browserRepairPaymentFetch<RepairPaymentOrderPublicView>(
      `${orderPath}/cancel`,
      { method: "POST", body: JSON.stringify({}) },
    );
  } catch (cancelError) {
    const storedOrder = await browserRepairPaymentFetch<RepairPaymentOrderPublicView>(orderPath);
    if (storedOrder.status === "CANCELLED") return;
    throw cancelError;
  }
}

export const ManagerRepairPaymentDialog = forwardRef<
  ManagerRepairPaymentDialogHandle,
  ManagerRepairPaymentDialogProps
>(function ManagerRepairPaymentDialog(
  { onResultMessage, onWorkspaceRefresh },
  ref,
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const lifecycleRef = useRef<ManagerRepairPaymentLifecycle | null>(null);
  const lifecycle = lifecycleRef.current
    ?? (lifecycleRef.current = new ManagerRepairPaymentLifecycle(cancelReadyOrder));
  const [lifecycleSnapshot, setLifecycleSnapshot] = useState(
    () => lifecycle.getSnapshot(),
  );
  const [paymentTarget, setPaymentTarget] = useState<ManagerRepairPaymentTarget | null>(null);
  const [paymentMode, setPaymentMode] = useState<TossPaymentMode | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [renderingWidget, setRenderingWidget] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { checkout, busy, sdkFailed, cleanupUncertain, canPay } = lifecycleSnapshot;

  const reportError = useCallback((message: string) => {
    setErrorMessage(message);
    onResultMessage?.(message);
  }, [onResultMessage]);

  const clearPreparedUi = useCallback(() => {
    widgetsRef.current = null;
    setPaymentMode(null);
    setRenderingWidget(false);
    setWidgetReady(false);
  }, []);

  const errorForResult = useCallback((
    result: ManagerRepairPaymentLifecycleResult<unknown>,
    fallback: string,
  ): string => {
    const original = messageFromError(result.error, fallback);
    return result.cleanupUncertain ? `${original} ${CLEANUP_ERROR}` : original;
  }, []);

  useEffect(() => lifecycle.subscribe(setLifecycleSnapshot), [lifecycle]);

  useEffect(() => {
    const ready = isTossPaymentsReady();
    setSdkReady(ready);
    if (ready) lifecycle.markSdkLoaded();
  }, [lifecycle]);

  useEffect(() => {
    if (!checkout) clearPreparedUi();
  }, [checkout, clearPreparedUi]);

  useImperativeHandle(ref, () => ({
    open(target: ManagerRepairPaymentTarget) {
      if (dialogRef.current?.open || !lifecycle.beginSession()) return;
      clearPreparedUi();
      setPaymentTarget(target);
      setErrorMessage(lifecycle.getSnapshot().sdkFailed ? SDK_ERROR : null);
      dialogRef.current?.showModal();
    },
  }), [clearPreparedUi, lifecycle]);

  useEffect(() => {
    if (!checkout || paymentMode !== "widget") return;
    if (!sdkReady && !isTossPaymentsReady()) return;
    if (!lifecycle.getSnapshot().canPay) return;

    let cancelled = false;
    const frame = window.requestAnimationFrame(async () => {
      setRenderingWidget(true);
      setWidgetReady(false);
      widgetsRef.current = null;
      let renderedWidgets: TossWidgets | null = null;

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

      if (!cancelled) {
        const current = lifecycle.getSnapshot();
        if (
          result.status === "COMPLETED"
          && renderedWidgets
          && current.canPay
          && current.checkout?.order.orderId === checkout.order.orderId
        ) {
          widgetsRef.current = renderedWidgets;
          setWidgetReady(true);
        } else {
          widgetsRef.current = null;
          setWidgetReady(false);
          if (result.status === "FAILED") {
            reportError(errorForResult(result, "결제위젯을 불러오지 못했습니다."));
            if (!current.checkout) onWorkspaceRefresh?.();
          }
        }
        setRenderingWidget(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [checkout, errorForResult, lifecycle, onWorkspaceRefresh, paymentMode, reportError, sdkReady]);

  async function closeDialog(): Promise<void> {
    const hadPendingOrder = Boolean(
      lifecycle.getSnapshot().checkout || lifecycle.getSnapshot().busy,
    );
    setErrorMessage(null);
    const result = await lifecycle.requestCleanup();

    if (result.status === "FAILED" || lifecycle.getSnapshot().cleanupUncertain) {
      reportError(CLEANUP_ERROR);
      return;
    }
    if (result.status === "BLOCKED") return;

    clearPreparedUi();
    setPaymentTarget(null);
    dialogRef.current?.close();
    if (hadPendingOrder) onWorkspaceRefresh?.();
  }

  async function requestCheckoutPayment(
    checkout: RepairPaymentCheckout,
    widgets?: TossWidgets,
  ): Promise<ManagerRepairPaymentLifecycleResult> {
    return lifecycle.requestPayment(() => requestManagerCardPayment({
      clientKey: checkout.clientKey,
      customerKey: checkout.customerKey,
      orderId: checkout.order.orderId,
      amount: checkout.order.amount,
      orderName: checkout.orderName,
      successUrl: `${window.location.origin}${SUCCESS_PATH}`,
      failUrl: `${window.location.origin}${FAIL_PATH}`,
      widgets,
    }));
  }

  async function handlePaymentResult(
    result: ManagerRepairPaymentLifecycleResult,
  ): Promise<void> {
    if (result.status === "FAILED") {
      reportError(errorForResult(result, "Toss 결제를 요청하지 못했습니다."));
      if (!lifecycle.getSnapshot().checkout) onWorkspaceRefresh?.();
      return;
    }
    if (result.status === "BLOCKED" && lifecycle.getSnapshot().cleanupUncertain) {
      reportError(CLEANUP_ERROR);
    }
  }

  async function requestPreparedWidgetPayment(): Promise<void> {
    const currentCheckout = lifecycle.getSnapshot().checkout;
    const widgets = widgetsRef.current;
    if (!currentCheckout || paymentMode !== "widget" || !widgets || !widgetReady) {
      reportError("결제수단과 약관을 모두 불러온 뒤 다시 시도해 주세요.");
      return;
    }
    if (!lifecycle.getSnapshot().canPay) {
      if (lifecycle.getSnapshot().cleanupUncertain) reportError(CLEANUP_ERROR);
      return;
    }

    setErrorMessage(null);
    await handlePaymentResult(await requestCheckoutPayment(currentCheckout, widgets));
  }

  async function beginCheckout(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!paymentTarget) return;

    if (lifecycle.getSnapshot().checkout) {
      await requestPreparedWidgetPayment();
      return;
    }
    if (lifecycle.getSnapshot().sdkFailed) {
      reportError(SDK_ERROR);
      return;
    }

    setErrorMessage(null);
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const checkoutPath = paymentTarget.retryOrderId
      ? `/api/manager/repair-payment-orders/${encodeURIComponent(paymentTarget.retryOrderId)}/retry`
      : `/api/manager/vendor-payment-requests/${encodeURIComponent(paymentTarget.paymentRequestId)}/toss-orders`;
    const result = await lifecycle.beginCheckout(() =>
      browserRepairPaymentFetch<RepairPaymentCheckout>(
        checkoutPath,
        {
          method: "POST",
          body: JSON.stringify({ creationKey: crypto.randomUUID(), returnPath }),
        },
      ));

    if (result.status === "BLOCKED") return;
    if (result.status === "FAILED") {
      const fallback = lifecycle.getSnapshot().sdkFailed
        ? SDK_ERROR
        : "수리비 결제를 시작하지 못했습니다.";
      reportError(errorForResult(result, fallback));
      return;
    }
    if (result.status === "CLEANED" || !result.value) {
      if (lifecycle.getSnapshot().sdkFailed) reportError(SDK_ERROR);
      onWorkspaceRefresh?.();
      return;
    }

    const mode = tossPaymentMode(result.value.clientKey);
    setPaymentMode(mode);
    if (mode === "payment-window") {
      await handlePaymentResult(await requestCheckoutPayment(result.value));
    }
  }

  async function handleSdkLoadError(): Promise<void> {
    setSdkReady(false);
    const result = await lifecycle.markSdkFailed();
    reportError(result.cleanupUncertain ? `${SDK_ERROR} ${CLEANUP_ERROR}` : SDK_ERROR);
    if (result.status === "CLEANED") onWorkspaceRefresh?.();
  }

  const displayAmount = checkout?.order.amount ?? paymentTarget?.amount ?? 0;
  const paymentDisabled = busy
    || sdkFailed
    || cleanupUncertain
    || (Boolean(checkout) && !canPay)
    || (paymentMode === "widget" && !widgetReady);

  return (
    <>
      <Script
        src={TOSS_PAYMENTS_SDK_URL}
        strategy="afterInteractive"
        onLoad={() => {
          setSdkReady(true);
          lifecycle.markSdkLoaded();
        }}
        onError={() => void handleSdkLoadError()}
      />
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-repair-payment-title"
        onCancel={(event) => {
          event.preventDefault();
          void closeDialog();
        }}
      >
        <form className={styles.panel} onSubmit={beginCheckout}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>업체비 결제</p>
              <h2 id="manager-repair-payment-title">집우집주 수리비 결제</h2>
            </div>
            <button
              className={styles.closeButton}
              type="button"
              aria-label={cleanupUncertain ? "결제 주문 취소 다시 시도" : "수리비 결제 닫기"}
              onClick={() => void closeDialog()}
              disabled={busy}
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <section className={styles.summary} aria-label="결제 대상">
            <div>
              <span>업체</span>
              <strong>{paymentTarget?.vendorName ?? "업체 정보 확인 필요"}</strong>
            </div>
            <div>
              <span>수리 항목</span>
              <strong>{paymentTarget?.jobLabel ?? "수리 작업 정보 확인 필요"}</strong>
            </div>
          </section>

          <section className={styles.amount} aria-label="결제 금액">
            <span>결제 금액</span>
            <strong>{won(displayAmount)}</strong>
            <small>
              {checkout
                ? "서버에 저장된 승인 금액으로 결제합니다."
                : "결제 준비 후 서버의 승인 금액을 다시 확인합니다."}
            </small>
          </section>

          {checkout && paymentMode === "widget" ? (
            <section className={styles.widgetSection} aria-label="Toss 결제수단 및 약관">
              <div className={styles.widgetContent}>
                <div id="roomlog-manager-repair-payment-method" />
                <div id="roomlog-manager-repair-payment-agreement" />
              </div>
              {renderingWidget ? (
                <p className={styles.widgetStatus} role="status">
                  결제수단을 불러오는 중입니다.
                </p>
              ) : null}
            </section>
          ) : null}

          {cleanupUncertain ? (
            <p className={styles.errorMessage} role="alert">
              결제 주문 정리가 확인되지 않아 결제를 잠갔습니다. 취소를 다시 눌러 주문 정리를 확인해 주세요.
            </p>
          ) : errorMessage ? (
            <p className={styles.errorMessage} role="alert">{errorMessage}</p>
          ) : null}

          <footer className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => void closeDialog()}
              disabled={busy}
            >
              {cleanupUncertain ? "주문 취소 다시 시도" : "취소"}
            </button>
            <button
              type="submit"
              className={styles.payButton}
              disabled={paymentDisabled}
            >
              {busy ? "처리 중" : "Toss로 결제"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
});

ManagerRepairPaymentDialog.displayName = "ManagerRepairPaymentDialog";
