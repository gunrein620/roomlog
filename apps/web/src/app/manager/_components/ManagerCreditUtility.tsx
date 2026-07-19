"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { CreditCard, Plus, X } from "lucide-react";
import type {
  ManagerCreditAccountPublicView,
  ManagerCreditTopupOrderPublicView,
  ManagerCreditTopupCheckout,
} from "@roomlog/types";
import { DEMO_MANAGER_CREDIT_ACCOUNT } from "@/lib/demo-vendor-credit";
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
  MANAGER_CREDIT_BALANCE_CHANGED_EVENT,
  OPEN_MANAGER_CREDIT_TOPUP_EVENT,
} from "@/lib/vendor-credit-events";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { launchTossPaymentOutsideDialog } from "./manager-credit-payment-dialog-transition";
import styles from "./ManagerCreditUtility.module.css";

const CREDIT_WORKSPACE_PATH = "/manager/vendor-mgmt/credit";
const QUICK_TOPUP_AMOUNTS = [100_000, 300_000, 500_000, 1_000_000] as const;
const PAYMENT_METHOD_SELECTOR = "#roomlog-manager-credit-payment-method";
const AGREEMENT_SELECTOR = "#roomlog-manager-credit-agreement";

class BrowserCreditApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "BrowserCreditApiError";
  }
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isConnectivityError(error: unknown): boolean {
  return (
    error instanceof BrowserCreditApiError
    && error.code === "UPSTREAM_UNAVAILABLE"
  ) || (
    error instanceof TypeError
    && /fetch failed|failed to fetch|networkerror|load failed/i.test(error.message)
  );
}

function parsePositiveSafeInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

async function browserCreditFetch<T>(
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
    throw new BrowserCreditApiError(
      response.status,
      message || `크레딧 요청을 처리하지 못했습니다 (HTTP ${response.status}).`,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }
  return body as T;
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

function callbackMessage(order: ManagerCreditTopupOrderPublicView): string | null {
  switch (order.status) {
    case "APPROVED":
      return "크레딧 충전이 완료됐습니다.";
    case "CONFIRMING":
    case "RECONCILIATION_REQUIRED":
      return "결제 승인은 확인 중입니다. 크레딧 내역에서 다시 확인해 주세요.";
    case "CANCELLED":
      return "크레딧 충전이 취소됐습니다.";
    case "FAILED":
      return "크레딧 충전을 완료하지 못했습니다. 내역을 확인해 주세요.";
    default:
      return null;
  }
}

export function ManagerCreditUtility() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasAuthoritativeAccount = useRef(false);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const [account, setAccount] = useState<ManagerCreditAccountPublicView | null>(null);
  const [source, setSource] = useState<"API" | "DEMO" | null>(null);
  const [amountText, setAmountText] = useState(String(300_000));
  const [submitting, setSubmitting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [checkout, setCheckout] = useState<ManagerCreditTopupCheckout | null>(null);
  const [paymentMode, setPaymentMode] = useState<TossPaymentMode | null>(null);
  const [renderingWidget, setRenderingWidget] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [errorMessageText, setErrorMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const amount = useMemo(() => parsePositiveSafeInteger(amountText), [amountText]);
  const projectedBalance = account && amount !== null
    ? account.balance + amount
    : null;

  const resetPreparedCheckout = useCallback(() => {
    widgetsRef.current = null;
    setCheckout(null);
    setPaymentMode(null);
    setRenderingWidget(false);
    setWidgetReady(false);
  }, []);

  const cancelTopupOrder = useCallback(async (orderId: string) => {
    await browserCreditFetch<ManagerCreditTopupOrderPublicView>(
      `/api/manager/credits/topup-orders/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST" },
    );
  }, []);

  const loadAccount = useCallback(async () => {
    setLoadError(null);
    setSource(null);
    try {
      const nextAccount = await browserCreditFetch<ManagerCreditAccountPublicView>(
        "/api/manager/credits/account",
      );
      setAccount(nextAccount);
      setSource("API");
      hasAuthoritativeAccount.current = true;
    } catch (error) {
      if (isConnectivityError(error) && !hasAuthoritativeAccount.current) {
        setAccount(DEMO_MANAGER_CREDIT_ACCOUNT);
        setSource("DEMO");
        return;
      }
      setSource(null);
      setLoadError(
        `잔액이 최신 정보가 아닐 수 있습니다. ${errorMessage(
          error,
          "크레딧 잔액을 다시 확인해 주세요.",
        )}`,
      );
    }
  }, []);

  useEffect(() => {
    setSdkReady(isTossPaymentsReady());
  }, []);

  useEffect(() => {
    if (!checkout || paymentMode !== "widget") return;
    if (!sdkReady && !isTossPaymentsReady()) return;

    let cancelled = false;
    const frame = window.requestAnimationFrame(async () => {
      setRenderingWidget(true);
      setWidgetReady(false);
      widgetsRef.current = null;

      try {
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

        if (!cancelled) {
          widgetsRef.current = widgets;
          setWidgetReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          const message = errorMessage(error, "결제위젯을 불러오지 못했습니다.");
          await cancelTopupOrder(checkout.order.orderId).catch(() => undefined);
          if (!cancelled) {
            resetPreparedCheckout();
            setErrorMessage(message);
          }
        }
      } finally {
        if (!cancelled) setRenderingWidget(false);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [cancelTopupOrder, checkout, paymentMode, resetPreparedCheckout, sdkReady]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const marker = params.get("creditTopup");
    const orderId = params.get("creditTopupOrderId")?.trim();
    void (async () => {
      await loadAccount();
      if (!marker || !orderId) return;
      try {
        const order = await browserCreditFetch<ManagerCreditTopupOrderPublicView>(
          `/api/manager/credits/topup-orders/${encodeURIComponent(orderId)}`,
        );
        setStatusMessage(callbackMessage(order));
      } catch {
        setStatusMessage("크레딧 충전 결과를 확인하지 못했습니다. 내역에서 다시 확인해 주세요.");
      }
    })();
    if (marker) removeCallbackMarkers();
  }, [loadAccount]);

  useEffect(() => {
    const openFromWorkspace = () => openDialog();
    const refreshFromWorkspace = (event?: unknown) => {
      const balance = event instanceof CustomEvent
        && typeof event.detail?.balance === "number"
        && Number.isSafeInteger(event.detail.balance)
        && event.detail.balance >= 0
        ? event.detail.balance
        : undefined;
      if (balance !== undefined) {
        setAccount((current) => current ? { ...current, balance } : current);
      }
      void loadAccount();
    };
    const socket = getRealtimeSocket();
    window.addEventListener(OPEN_MANAGER_CREDIT_TOPUP_EVENT, openFromWorkspace);
    window.addEventListener(
      MANAGER_CREDIT_BALANCE_CHANGED_EVENT,
      refreshFromWorkspace,
    );
    socket.on("manager:credit-updated", refreshFromWorkspace);
    socket.on("connect", refreshFromWorkspace);
    return () => {
      window.removeEventListener(OPEN_MANAGER_CREDIT_TOPUP_EVENT, openFromWorkspace);
      window.removeEventListener(
        MANAGER_CREDIT_BALANCE_CHANGED_EVENT,
        refreshFromWorkspace,
      );
      socket.off("manager:credit-updated", refreshFromWorkspace);
      socket.off("connect", refreshFromWorkspace);
    };
  }, [loadAccount]);

  function openDialog() {
    if (dialogRef.current?.open) return;
    resetPreparedCheckout();
    setErrorMessage(null);
    dialogRef.current?.showModal();
  }

  async function discardPreparedCheckout(closeAfter: boolean): Promise<boolean> {
    if (submitting) return false;
    const orderId = checkout?.order.orderId;
    if (!orderId) {
      resetPreparedCheckout();
      if (closeAfter) dialogRef.current?.close();
      return true;
    }

    setSubmitting(true);
    try {
      await cancelTopupOrder(orderId);
      resetPreparedCheckout();
      if (closeAfter) dialogRef.current?.close();
      return true;
    } catch (error) {
      setErrorMessage(errorMessage(error, "준비된 충전 주문을 취소하지 못했습니다."));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function closeDialog() {
    if (submitting) return;
    setErrorMessage(null);
    await discardPreparedCheckout(true);
  }

  async function requestPreparedWidgetPayment(): Promise<void> {
    const currentCheckout = checkout;
    const widgets = widgetsRef.current;
    if (!currentCheckout || paymentMode !== "widget" || !widgets || !widgetReady) {
      setErrorMessage("결제수단과 약관을 모두 불러온 뒤 다시 시도해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await launchTossPaymentOutsideDialog(
        () => requestManagerCardPayment({
          clientKey: currentCheckout.clientKey,
          customerKey: currentCheckout.customerKey,
          orderId: currentCheckout.order.orderId,
          amount: currentCheckout.order.amount,
          orderName: currentCheckout.orderName,
          successUrl: `${window.location.origin}/manager/credit-topup/success`,
          failUrl: `${window.location.origin}/manager/credit-topup/fail`,
          widgets,
        }),
        () => dialogRef.current?.close(),
      );
    } catch (error) {
      const message = errorMessage(error, "크레딧 결제를 요청하지 못했습니다.");
      const cleanupFailed = await cancelTopupOrder(currentCheckout.order.orderId)
        .then(() => false)
        .catch(() => true);
      resetPreparedCheckout();
      setErrorMessage(
        cleanupFailed
          ? `${message} 준비 주문도 취소하지 못해 크레딧 내역을 확인해 주세요.`
          : message,
      );
      setSubmitting(false);
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    }
  }

  async function beginCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (checkout) {
      await requestPreparedWidgetPayment();
      return;
    }
    if (source !== "API") {
      setErrorMessage("실제 API 연결을 확인한 뒤 충전을 진행해 주세요.");
      return;
    }
    const topupAmount = parsePositiveSafeInteger(amountText);
    if (topupAmount === null) {
      setErrorMessage("충전 금액은 1원 이상의 정수로 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    const creationKey = crypto.randomUUID();
    let createdCheckout: ManagerCreditTopupCheckout | null = null;

    try {
      const returnPath = window.location.pathname + window.location.search;
      createdCheckout = await browserCreditFetch<ManagerCreditTopupCheckout>(
        "/api/manager/credits/topup-orders",
        {
          method: "POST",
          body: JSON.stringify({ amount: topupAmount, creationKey, returnPath }),
        },
      );
      const mode = tossPaymentMode(createdCheckout.clientKey);
      if (mode === "widget") {
        setCheckout(createdCheckout);
        setPaymentMode(mode);
        setSubmitting(false);
        return;
      }

      const directCheckout = createdCheckout;
      await launchTossPaymentOutsideDialog(
        () => requestManagerCardPayment({
          clientKey: directCheckout.clientKey,
          customerKey: directCheckout.customerKey,
          orderId: directCheckout.order.orderId,
          amount: directCheckout.order.amount,
          orderName: directCheckout.orderName,
          successUrl: `${window.location.origin}/manager/credit-topup/success`,
          failUrl: `${window.location.origin}/manager/credit-topup/fail`,
        }),
        () => dialogRef.current?.close(),
      );
    } catch (error) {
      const message = errorMessage(error, "크레딧 충전을 시작하지 못했습니다.");
      const cleanupFailed = createdCheckout
        ? await cancelTopupOrder(createdCheckout.order.orderId)
          .then(() => false)
          .catch(() => true)
        : false;
      setErrorMessage(
        cleanupFailed
          ? `${message} 준비 주문도 취소하지 못해 크레딧 내역을 확인해 주세요.`
          : message,
      );
      setSubmitting(false);
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    }
  }

  async function handleSdkLoadError(): Promise<void> {
    setSdkReady(false);
    const orderId = checkout?.order.orderId;
    if (orderId) {
      await cancelTopupOrder(orderId).catch(() => undefined);
      resetPreparedCheckout();
    }
    setErrorMessage("Toss 결제 SDK를 불러오지 못했습니다.");
    setSubmitting(false);
  }

  return (
    <>
      <Script
        src={TOSS_PAYMENTS_SDK_URL}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onError={() => void handleSdkLoadError()}
      />
      <div className={styles.utility}>
        {statusMessage ? <span className={styles.statusMessage} role="status">{statusMessage}</span> : null}
        {loadError ? <span className={styles.staleWarning} role="alert">{loadError}</span> : null}
        <Link className={styles.balanceLink} href={CREDIT_WORKSPACE_PATH}>
          <CreditCard aria-hidden="true" />
          <span className={styles.balanceCopy}>
            <span>크레딧</span>
            <strong>
              {account ? won(account.balance) : loadError ? "잔액 확인 실패" : "불러오는 중"}
            </strong>
          </span>
          {source === "DEMO" ? <span className={styles.demoBadge}>데모</span> : null}
        </Link>
        <button className={styles.openButton} type="button" onClick={openDialog} disabled={source !== "API"}>
          <Plus aria-hidden="true" />
          충전
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-credit-topup-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!submitting) void closeDialog();
        }}
      >
        <form className={styles.dialogPanel} onSubmit={beginCheckout}>
          <div className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>크레딧·결제</p>
              <h2 id="manager-credit-topup-title">크레딧 충전</h2>
            </div>
            <button
              className={styles.closeButton}
              type="button"
              aria-label="크레딧 충전 닫기"
              onClick={() => void closeDialog()}
              disabled={submitting}
            >
              <X aria-hidden="true" />
            </button>
          </div>

          <div className={styles.balanceSummary}>
            <div>
              <span>현재 잔액</span>
              <strong>{account ? won(account.balance) : "확인 중"}</strong>
            </div>
            <div>
              <span>충전 후 예상 잔액</span>
              <strong>{projectedBalance === null ? "-" : won(projectedBalance)}</strong>
            </div>
          </div>

          {!checkout ? (
            <fieldset className={styles.amountFieldset}>
              <legend>충전 금액</legend>
              <div className={styles.quickAmounts}>
                {QUICK_TOPUP_AMOUNTS.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    type="button"
                    aria-pressed={amount === quickAmount}
                    onClick={() => setAmountText(String(quickAmount))}
                    disabled={submitting}
                  >
                    {won(quickAmount)}
                  </button>
                ))}
              </div>
              <label className={styles.directAmount}>
                직접 입력
                <span>
                  <input
                    value={amountText}
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="1"
                    onChange={(event) => setAmountText(event.target.value)}
                    disabled={submitting}
                  />
                  원
                </span>
              </label>
            </fieldset>
          ) : (
            <section className={styles.preparedCheckout} aria-label="준비된 충전 금액">
              <div>
                <span>결제할 크레딧</span>
                <strong>{won(checkout.order.amount)}</strong>
              </div>
              <button
                type="button"
                onClick={() => void discardPreparedCheckout(false)}
                disabled={submitting}
              >
                금액 다시 선택
              </button>
            </section>
          )}

          {checkout && paymentMode === "widget" ? (
            <section className={styles.widgetSection} aria-label="Toss 결제수단 및 약관">
              <div
                className={styles.widgetRegion}
                id="roomlog-manager-credit-payment-method"
              />
              <div
                className={styles.widgetRegion}
                id="roomlog-manager-credit-agreement"
              />
              {renderingWidget ? (
                <p className={styles.widgetStatus} role="status">결제수단을 불러오는 중입니다.</p>
              ) : null}
            </section>
          ) : null}

          {source === "DEMO" ? (
            <p className={styles.demoNotice}>API 연결이 없어 잔액만 데모로 표시 중입니다. 충전 요청은 실제 API 연결이 필요합니다.</p>
          ) : null}
          {errorMessageText ? <p className={styles.errorMessage} role="alert">{errorMessageText}</p> : null}

          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => void closeDialog()}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={
                submitting
                || source !== "API"
                || (paymentMode === "widget" && !widgetReady)
              }
            >
              {submitting
                ? checkout ? "결제 요청 중" : "결제 준비 중"
                : checkout
                  ? `${won(checkout.order.amount)} 결제하기`
                  : "결제수단 불러오기"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
