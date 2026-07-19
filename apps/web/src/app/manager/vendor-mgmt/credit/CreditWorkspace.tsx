"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AutoPayPolicyMode,
  CreditLedgerEntryType,
  RepairPaymentOrderPublicView,
  RepairPaymentOrderStatus,
  VendorPaymentRequestStatus,
} from "@roomlog/types";
import {
  notifyManagerCreditBalanceChanged,
} from "@/lib/vendor-credit-events";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { repairPaymentRecovery } from "@/lib/repair-payment-recovery";
import {
  cancelCreditPaymentAction,
  loadMoreCreditHistoryAction,
  refreshCreditWorkspaceAction,
  settleGaraPayoutAction,
  settleCreditPaymentAction,
  updateCreditPolicyAction,
} from "./actions";
import styles from "./CreditWorkspace.module.css";
import type {
  CreditWorkspaceView,
  CreditWorkspaceViewResult,
} from "./view-model";
import {
  ManagerRepairPaymentDialog,
  type ManagerRepairPaymentDialogHandle,
} from "./ManagerRepairPaymentDialog";
import {
  ManagerPaymentRecordDialog,
  type ManagerPaymentRecordDialogHandle,
} from "./ManagerPaymentRecordDialog";
import { CreditFeedbackSequence } from "./credit-feedback-sequence";

type Feedback = { kind: "success" | "error" | "info"; title?: string; text: string };

const paymentStatusLabel: Record<VendorPaymentRequestStatus, string> = {
  WAITING_COMPLETION: "완료 검토 대기",
  PENDING_APPROVAL: "지급 승인 대기",
  AUTO_PAID: "자동 크레딧 지급 완료",
  MANUAL_CREDIT_PAID: "크레딧 지급 완료",
  DIRECT_PAID: "직접 계좌이체 기록 완료",
  TOSS_PAID: "Toss 결제 완료",
  INSUFFICIENT_CREDIT: "크레딧 잔액 부족",
  CANCELLED: "지급 요청 취소",
  REVERSED: "크레딧 지급 기록 정정",
  DIRECT_PAYMENT_VOIDED: "직접 계좌이체 기록 정정",
};

const repairPaymentMessage: Record<RepairPaymentOrderStatus, string> = {
  READY: "결제가 완료되지 않았습니다. 다시 결제할 수 있습니다.",
  CONFIRMING: "결제 확인 중입니다. 잠시 후 상태를 다시 확인해 주세요.",
  RECONCILIATION_REQUIRED: "결제 확인 중입니다. 상태 확인이 필요합니다.",
  APPROVED: "Toss 업체비 결제가 완료됐습니다.",
  FAILED: "결제가 완료되지 않았습니다. 결제수단을 확인해 주세요.",
  CANCELLED: "결제 주문이 취소됐습니다.",
};

const repairPaymentStatusSummary: Record<RepairPaymentOrderStatus, string> = {
  READY: "결제 미완료",
  CONFIRMING: "결제 확인 중",
  RECONCILIATION_REQUIRED: "결제 확인 중",
  APPROVED: "결제 완료",
  FAILED: "결제 미완료",
  CANCELLED: "결제 취소",
};

const ledgerTypeLabel: Record<CreditLedgerEntryType, string> = {
  OPENING_BALANCE: "시작 잔액",
  TOPUP: "크레딧 충전",
  AUTO_DEBIT: "자동 업체 지급",
  MANUAL_DEBIT: "수동 업체 지급",
  REVERSAL: "크레딧 지급 기록 정정",
};

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function signedWon(amount: number): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("ko-KR")}원`;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function messageFromError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function parsePositiveSafeInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function ledgerReferenceLabel(referenceType: string): string {
  switch (referenceType) {
    case "DEMO_SEED":
    case "DEMO_OPENING":
      return "시작 잔액 등록";
    case "CREDIT_TOPUP_ORDER":
      return "크레딧 충전";
    case "VENDOR_PAYMENT_REQUEST":
      return "업체 수리비 지급";
    default:
      return "관련 거래";
  }
}

function userFacingFailure(reason: string): string {
  if (reason === "INSUFFICIENT_CREDIT") return "크레딧 잔액이 부족합니다.";
  if (/^[A-Z0-9_]+$/.test(reason)) return "결제 상태를 다시 확인해 주세요.";
  return reason;
}

async function getManagerRepairPaymentOrderFromBrowser(
  orderId: string,
): Promise<RepairPaymentOrderPublicView> {
  const response = await fetch(
    `/api/manager/repair-payment-orders/${encodeURIComponent(orderId)}`,
    { cache: "no-store", headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`수리비 결제 결과를 불러오지 못했습니다 (HTTP ${response.status}).`);
  }
  const order = await response.json() as RepairPaymentOrderPublicView;
  if (!Object.prototype.hasOwnProperty.call(repairPaymentMessage, order.status)) {
    throw new Error("알 수 없는 수리비 결제 상태입니다.");
  }
  return order;
}

async function mutateManagerRepairPaymentOrderFromBrowser(
  orderId: string,
  action: "cancel" | "reconcile",
): Promise<RepairPaymentOrderPublicView> {
  const response = await fetch(
    `/api/manager/repair-payment-orders/${encodeURIComponent(orderId)}/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(
      message || `수리비 결제 주문을 처리하지 못했습니다 (HTTP ${response.status}).`,
    );
  }
  return body as RepairPaymentOrderPublicView;
}

function isCorrectionStatus(status: VendorPaymentRequestStatus): boolean {
  return status === "PENDING_APPROVAL"
    || status === "INSUFFICIENT_CREDIT"
    || status === "AUTO_PAID"
    || status === "MANUAL_CREDIT_PAID"
    || status === "DIRECT_PAID";
}

function paymentStatusTone(status: VendorPaymentRequestStatus): string {
  if (
    status === "AUTO_PAID"
    || status === "MANUAL_CREDIT_PAID"
    || status === "DIRECT_PAID"
    || status === "TOSS_PAID"
  ) {
    return styles.statusPositive;
  }
  if (status === "INSUFFICIENT_CREDIT") return styles.statusNegative;
  if (status === "PENDING_APPROVAL" || status === "WAITING_COMPLETION") return styles.statusWarning;
  return styles.statusNeutral;
}

function confirmPaymentAction(
  request: CreditWorkspaceView["paymentRequests"][number],
  mode: string,
): boolean {
  const vendor = request.vendorName ?? "업체 정보 확인 필요";
  const job = [request.roomLabel, request.repairTitle]
    .filter(Boolean)
    .join(" · ") || "수리 작업 정보 확인 필요";
  return window.confirm([
    `업체: ${vendor}`,
    `작업: ${job}`,
    `금액: ${won(request.amount)}`,
    `처리: ${mode}`,
    "",
    "이 내용으로 처리할까요?",
  ].join("\n"));
}

export function CreditWorkspace({ initialResult }: { initialResult: CreditWorkspaceViewResult }) {
  const [workspaceResult, setWorkspaceResult] = useState(initialResult);
  const [policyMode, setPolicyMode] = useState<AutoPayPolicyMode>(initialResult.data.policy.mode);
  const [limitText, setLimitText] = useState(
    initialResult.data.policy.perRequestLimit
      ? String(initialResult.data.policy.perRequestLimit)
      : "150000",
  );
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const refreshSequence = useRef(0);
  const feedbackSequenceRef = useRef<CreditFeedbackSequence | null>(null);
  const feedbackSequence = feedbackSequenceRef.current
    ?? (feedbackSequenceRef.current = new CreditFeedbackSequence());
  const repairPaymentResultHandled = useRef(false);
  const repairPaymentDialogRef = useRef<ManagerRepairPaymentDialogHandle>(null);
  const paymentRecordDialogRef = useRef<ManagerPaymentRecordDialogHandle>(null);
  const workspace = workspaceResult.data;
  const demoReadOnly = workspaceResult.source === "DEMO";
  const payoutRequestCount = workspace.paymentRequests.length + workspace.garaPayoutRequests.length;

  const publishFeedback = useCallback((next: Feedback | null) => {
    feedbackSequence.publishNow(() => setFeedback(next));
  }, [feedbackSequence]);

  const refreshWorkspace = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const refreshed = await refreshCreditWorkspaceAction();
    if (sequence === refreshSequence.current) setWorkspaceResult(refreshed);
  }, []);

  const handleRepairPaymentDialogMessage = useCallback((message: string) => {
    publishFeedback({ kind: "error", text: message });
  }, [publishFeedback]);

  const handleRepairPaymentWorkspaceRefresh = useCallback(() => {
    const feedbackToken = feedbackSequence.begin();
    void refreshWorkspace().catch(() => {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({
          kind: "error",
          text: "처리는 완료됐지만 최신 내역을 불러오지 못했습니다. 현재 화면의 기존 데이터는 유지됩니다. 새로고침해 주세요.",
        });
      });
    });
  }, [feedbackSequence, refreshWorkspace]);

  const handlePaymentRecordCompleted = useCallback((message: string) => {
    notifyManagerCreditBalanceChanged();
    const feedbackToken = feedbackSequence.begin();
    void refreshWorkspace().then(() => {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({ kind: "success", text: message });
      });
    }).catch(() => {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({
          kind: "error",
          text: "처리는 완료됐지만 최신 내역을 불러오지 못했습니다. 새로고침해 주세요.",
        });
      });
    });
  }, [feedbackSequence, refreshWorkspace]);

  useEffect(() => {
    setPolicyMode(workspace.policy.mode);
    if (workspace.policy.perRequestLimit) {
      setLimitText(String(workspace.policy.perRequestLimit));
    }
  }, [workspace.policy.mode, workspace.policy.perRequestLimit]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const refreshGaraPayouts = () => {
      void refreshWorkspace().catch(() => undefined);
    };
    socket.on("gara:payout-updated", refreshGaraPayouts);
    socket.on("manager:credit-updated", refreshWorkspace);
    return () => {
      socket.off("gara:payout-updated", refreshGaraPayouts);
      socket.off("manager:credit-updated", refreshWorkspace);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (repairPaymentResultHandled.current) return;
    const currentUrl = new URL(window.location.href);
    const marker = currentUrl.searchParams.get("repairPayment");
    const orderId = currentUrl.searchParams.get("repairPaymentOrderId");
    if (!marker || !orderId) return;

    repairPaymentResultHandled.current = true;
    currentUrl.searchParams.delete("repairPayment");
    currentUrl.searchParams.delete("repairPaymentOrderId");
    window.history.replaceState(
      window.history.state,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );

    const feedbackToken = feedbackSequence.begin();
    void (async () => {
      try {
        const order = await getManagerRepairPaymentOrderFromBrowser(orderId);
        try {
          await refreshWorkspace();
        } catch {
          // The stored order remains authoritative even if the workspace refresh is unavailable.
        }
        const kind: Feedback["kind"] = order.status === "APPROVED"
          ? "success"
          : order.status === "CONFIRMING" || order.status === "RECONCILIATION_REQUIRED"
            ? "info"
            : "error";
        feedbackSequence.publish(feedbackToken, () => {
          setFeedback({
            kind,
            title: repairPaymentStatusSummary[order.status],
            text: repairPaymentMessage[order.status],
          });
        });
      } catch {
        feedbackSequence.publish(feedbackToken, () => {
          setFeedback({
            kind: "error",
            text: "결제 결과를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.",
          });
        });
      }
    })();
  }, [feedbackSequence, refreshWorkspace]);

  const ledgerEntries = useMemo(
    () => [...workspace.ledgerEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [workspace.ledgerEntries],
  );
  function markBusy(key: string, busy: boolean) {
    setBusyKeys((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function loadMoreHistory(
    kind: "ledger" | "payment",
    cursor: string,
  ) {
    const key = `history:${kind}`;
    if (busyKeys.has(key) || demoReadOnly) return;
    const feedbackToken = feedbackSequence.begin();
    markBusy(key, true);
    feedbackSequence.publish(feedbackToken, () => setFeedback(null));
    try {
      const nextResult = await loadMoreCreditHistoryAction(kind, cursor);
      setWorkspaceResult((current) => {
        const data: CreditWorkspaceView = {
          ...current.data,
          ledgerEntries: kind === "ledger"
            ? [...current.data.ledgerEntries, ...nextResult.data.ledgerEntries]
            : current.data.ledgerEntries,
          paymentRequests: kind === "payment"
            ? [...current.data.paymentRequests, ...nextResult.data.paymentRequests]
            : current.data.paymentRequests,
        };
        if (kind === "ledger") {
          if (nextResult.data.nextLedgerCursor) data.nextLedgerCursor = nextResult.data.nextLedgerCursor;
          else delete data.nextLedgerCursor;
        }
        if (kind === "payment") {
          if (nextResult.data.nextPaymentCursor) data.nextPaymentCursor = nextResult.data.nextPaymentCursor;
          else delete data.nextPaymentCursor;
        }
        return { source: nextResult.source, data };
      });
    } catch (error) {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({ kind: "error", text: messageFromError(error) });
      });
    } finally {
      markBusy(key, false);
    }
  }

  async function runMutation(
    key: string,
    successMessage: string,
    mutation: () => Promise<unknown>,
  ) {
    if (demoReadOnly) {
      publishFeedback({ kind: "error", text: "데모 데이터에서는 저장·지급 작업을 실행할 수 없습니다." });
      return;
    }
    if (busyKeys.has(key)) return;
    const feedbackToken = feedbackSequence.begin();
    markBusy(key, true);
    feedbackSequence.publish(feedbackToken, () => setFeedback(null));
    try {
      await mutation();
    } catch (error) {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({ kind: "error", text: messageFromError(error) });
      });
      markBusy(key, false);
      return;
    }

    notifyManagerCreditBalanceChanged();
    try {
      await refreshWorkspace();
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({ kind: "success", text: successMessage });
      });
    } catch {
      feedbackSequence.publish(feedbackToken, () => {
        setFeedback({
          kind: "error",
          text: "처리는 완료됐지만 최신 내역을 불러오지 못했습니다. 현재 화면의 기존 데이터는 유지됩니다. 새로고침해 주세요.",
        });
      });
    } finally {
      markBusy(key, false);
    }
  }

  async function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (policyMode === "ALWAYS_REQUIRE_APPROVAL") {
      await runMutation("policy", "자동결제 정책을 저장했습니다.", () =>
        updateCreditPolicyAction({ mode: "ALWAYS_REQUIRE_APPROVAL" }));
      return;
    }
    const perRequestLimit = parsePositiveSafeInteger(limitText);
    if (perRequestLimit === null) {
      publishFeedback({ kind: "error", text: "자동 차감 한도는 1원 이상의 정수로 입력해 주세요." });
      return;
    }
    await runMutation("policy", "자동결제 정책을 저장했습니다.", () =>
      updateCreditPolicyAction({ mode: "AUTO_DEBIT_UNDER_LIMIT", perRequestLimit }));
  }

  function noteFor(request: CreditWorkspaceView["paymentRequests"][number]): string | null {
    const note = notes[request.id]?.trim();
    if (note) return note;
    publishFeedback({ kind: "error", text: "취소·정정 사유를 입력해 주세요." });
    return null;
  }

  function renderPaymentActions(
    request: CreditWorkspaceView["paymentRequests"][number],
    index: number,
  ) {
    const key = `payment:${request.id}`;
    const busy = busyKeys.has(key);
    const settlementPending = request.status === "PENDING_APPROVAL"
      || request.status === "INSUFFICIENT_CREDIT";
    const latestRepairOrder = request.latestRepairPaymentOrder;
    const recovery = repairPaymentRecovery(latestRepairOrder?.status);
    const paymentRecordTarget = {
      paymentRequestId: request.id,
      vendorName: request.vendorName ?? "업체 정보 확인 필요",
      roomLabel: request.roomLabel,
      workLabel: request.repairTitle,
      amount: request.amount,
    };

    if (request.status === "WAITING_COMPLETION") {
      return (
        <Link
          className={styles.secondaryButton}
          href={`/manager/ticket/dash/05?id=${encodeURIComponent(request.ticketId ?? "")}&repairId=${encodeURIComponent(request.repairId)}`}
        >
          완료 검토 화면으로
        </Link>
      );
    }

    if (!isCorrectionStatus(request.status)) return null;

    return (
      <div className={styles.requestControls}>
        {settlementPending ? (
          <label className={styles.noteField}>
            지급 요청 취소 사유
            <input
              value={notes[request.id] ?? ""}
              aria-label={`업체 지급 요청 ${index + 1} 취소 사유`}
              placeholder="예: 지급 방식 변경"
              onChange={(event) => setNotes((current) => ({
                ...current,
                [request.id]: event.target.value,
              }))}
              disabled={busy || demoReadOnly}
            />
          </label>
        ) : null}
        <div className={styles.requestActions}>
          {settlementPending ? (
            <div className={styles.paymentMethodGroup}>
              <span className={styles.paymentMethodLabel}>지급 방식</span>
              {latestRepairOrder && latestRepairOrder.status !== "CANCELLED" ? (
                <div className={styles.repairRecoveryPanel}>
                  <div className={styles.repairRecoverySummary}>
                    <strong>{recovery?.label}</strong>
                    <span>
                      {latestRepairOrder.status === "APPROVED"
                        ? "Toss 결제가 완료됐습니다."
                        : latestRepairOrder.status === "CONFIRMING"
                          || latestRepairOrder.status === "RECONCILIATION_REQUIRED"
                          ? "결제 결과를 확인한 뒤 다음 처리를 진행할 수 있습니다."
                          : "기존 주문을 정리하거나 새 주문으로 교체한 뒤 결제할 수 있습니다."}
                    </span>
                  </div>
                  <div className={styles.repairRecoveryActions}>
                    {recovery?.canRetry ? (
                      <button
                        type="button"
                        className={styles.tossPaymentButton}
                        disabled={busy || demoReadOnly}
                        onClick={() => {
                          publishFeedback(null);
                          repairPaymentDialogRef.current?.open({
                            paymentRequestId: request.id,
                            retryOrderId: latestRepairOrder.orderId,
                            vendorName: request.vendorName ?? "업체 정보 확인 필요",
                            jobLabel: [request.roomLabel, request.repairTitle]
                              .filter(Boolean)
                              .join(" · ") || "수리 작업 정보 확인 필요",
                            amount: request.amount,
                          });
                        }}
                      >
                        다시 결제
                      </button>
                    ) : null}
                    {recovery?.canCancel ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || demoReadOnly}
                        onClick={() => void runMutation(
                          `${key}:repair-order`,
                          "결제 주문을 취소했습니다.",
                          () => mutateManagerRepairPaymentOrderFromBrowser(
                            latestRepairOrder.orderId,
                            "cancel",
                          ),
                        )}
                      >
                        주문 취소
                      </button>
                    ) : null}
                    {recovery?.canReconcile ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busy || demoReadOnly}
                        onClick={() => void runMutation(
                          `${key}:repair-order`,
                          "결제 상태를 다시 확인했습니다.",
                          () => mutateManagerRepairPaymentOrderFromBrowser(
                            latestRepairOrder.orderId,
                            "reconcile",
                          ),
                        )}
                      >
                        상태 다시 확인
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
              <div className={styles.paymentChoices}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || demoReadOnly}
                  onClick={() => {
                    if (!confirmPaymentAction(request, "크레딧으로 지급")) return;
                    void runMutation(key, "크레딧으로 업체 지급을 완료했습니다.", () =>
                      settleCreditPaymentAction(request.id, {
                        mode: "MANUAL_CREDIT",
                        idempotencyKey: crypto.randomUUID(),
                      }));
                  }}
                >
                  크레딧으로 지급
                </button>
                <button
                  type="button"
                  className={styles.tossPaymentButton}
                  disabled={busy || demoReadOnly}
                  onClick={() => {
                    publishFeedback(null);
                    repairPaymentDialogRef.current?.open({
                      paymentRequestId: request.id,
                      vendorName: request.vendorName ?? "업체 정보 확인 필요",
                      jobLabel: [request.roomLabel, request.repairTitle]
                        .filter(Boolean)
                        .join(" · ") || "수리 작업 정보 확인 필요",
                      amount: request.amount,
                    });
                  }}
                >
                  Toss로 결제
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || demoReadOnly}
                  onClick={() => paymentRecordDialogRef.current?.open({
                    kind: "EXTERNAL_TRANSFER",
                    ...paymentRecordTarget,
                  })}
                >
                  직접 계좌이체 내역 등록
                </button>
              </div>
              )}
              {!latestRepairOrder || latestRepairOrder.status === "CANCELLED" ? (
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={busy || demoReadOnly}
                  onClick={() => {
                    const note = noteFor(request);
                    if (!note) return;
                    if (!confirmPaymentAction(request, "지급 요청 취소")) return;
                    void runMutation(key, "업체 지급 요청을 취소했습니다.", () =>
                      cancelCreditPaymentAction(request.id, {
                        note,
                        idempotencyKey: crypto.randomUUID(),
                      }));
                  }}
                >
                  지급 요청 취소
                </button>
              ) : null}
            </div>
          ) : null}
          {request.status === "AUTO_PAID"
          || request.status === "MANUAL_CREDIT_PAID"
          || request.status === "DIRECT_PAID" ? (
            <details className={styles.auxiliaryActions}>
              <summary>보조 작업</summary>
              <div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || demoReadOnly}
                  onClick={() => paymentRecordDialogRef.current?.open({
                    kind: request.status === "DIRECT_PAID"
                      ? "DIRECT_CORRECTION"
                      : "CREDIT_CORRECTION",
                    ...paymentRecordTarget,
                  })}
                >
                  지급 기록 정정
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      {feedback ? (
        <p
          className={feedback.kind === "error"
            ? styles.errorFeedback
            : feedback.kind === "success"
              ? styles.successFeedback
              : styles.infoFeedback}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.title ? <strong>{feedback.title}</strong> : null}
          {feedback.text}
        </p>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>자동결제 정책</h2>
            <p>업체 수리 완료를 승인한 뒤, 지급 요청을 매번 확인할지 일정 금액까지 자동 차감할지 정합니다.</p>
          </div>
        </div>
        <form className={styles.policyForm} onSubmit={submitPolicy}>
          <div className={styles.policyOptions} role="radiogroup" aria-label="자동결제 방식">
            <label className={styles.policyOption}>
              <input
                type="radio"
                name="autoPayPolicy"
                value="ALWAYS_REQUIRE_APPROVAL"
                checked={policyMode === "ALWAYS_REQUIRE_APPROVAL"}
                onChange={() => setPolicyMode("ALWAYS_REQUIRE_APPROVAL")}
                disabled={busyKeys.has("policy") || demoReadOnly}
              />
              <span className={styles.policyIndicator} aria-hidden="true" />
              <span>
                <strong>항상 승인 후 결제</strong>
                <small>모든 업체 지급 요청을 관리자가 확인한 뒤 처리합니다.</small>
              </span>
            </label>
            <label className={styles.policyOption}>
              <input
                type="radio"
                name="autoPayPolicy"
                value="AUTO_DEBIT_UNDER_LIMIT"
                checked={policyMode === "AUTO_DEBIT_UNDER_LIMIT"}
                onChange={() => setPolicyMode("AUTO_DEBIT_UNDER_LIMIT")}
                disabled={busyKeys.has("policy") || demoReadOnly}
              />
              <span className={styles.policyIndicator} aria-hidden="true" />
              <span>
                <strong>한도 이하 자동 차감</strong>
                <small>설정 금액 이하의 승인된 지급 요청만 크레딧에서 자동 차감합니다.</small>
              </span>
            </label>
          </div>
          <div className={styles.policySettings}>
            {policyMode === "AUTO_DEBIT_UNDER_LIMIT" ? (
              <label className={styles.limitField}>
                건당 자동 차감 한도
                <span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={limitText}
                    onChange={(event) => setLimitText(event.target.value)}
                    disabled={busyKeys.has("policy") || demoReadOnly}
                  />
                  원
                </span>
              </label>
            ) : (
              <p>모든 업체 지급 요청을 직접 확인한 뒤 결제합니다.</p>
            )}
          </div>
          <div className={styles.policyActions}>
            <span>최근 저장 {formatDate(workspace.policy.updatedAt)}</span>
            <button className={styles.primaryButton} type="submit" disabled={busyKeys.has("policy") || demoReadOnly}>
              {busyKeys.has("policy") ? "저장 중" : "정책 저장"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>업체 지급 요청</h2>
            <p>완료 검토와 승인 상태에 따라 허용된 지급·취소 작업만 표시합니다.</p>
          </div>
          <span className={styles.countBadge}>{payoutRequestCount}건</span>
        </div>
        {payoutRequestCount > 0 ? (
          <div className={styles.paymentList} tabIndex={0} aria-label="업체 지급 요청 목록">
            {workspace.garaPayoutRequests.map((request) => {
              const pending = request.status === "PENDING_APPROVAL";
              const key = `gara-payout:${request.id}`;
              return (
                <article className={`${styles.paymentCard} ${styles.garaPayoutCard}`} key={request.id}>
                  <div className={styles.requestMain}>
                    <strong>{request.vendorName}</strong>
                  </div>
                  <div className={`${styles.requestMeta} ${styles.garaPayoutDates}`}>
                    <span>요청일 {formatDate(request.createdAt)}</span>
                    <span>지급일 {formatDate(request.processedAt)}</span>
                  </div>
                  <div className={styles.requestAmount}>
                    <strong>{won(request.amount)}</strong>
                    {pending ? (
                      <button
                        className={styles.primaryButton}
                        type="button"
                        disabled={busyKeys.has(key) || demoReadOnly}
                        onClick={() => void runMutation(key, "Gara 업체 지급을 완료했습니다.", () =>
                          settleGaraPayoutAction(request.id, crypto.randomUUID()))}
                      >
                        {busyKeys.has(key) ? "지급 중…" : "크레딧 지급"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {workspace.paymentRequests.map((request, index) => (
              <article className={styles.paymentCard} key={request.id}>
                <div className={styles.requestMain}>
                  <span className={styles.requestLabel}>
                    {request.vendorName ?? `업체 지급 요청 ${index + 1}`}
                  </span>
                  <strong>
                    {[request.roomLabel, request.repairTitle]
                      .filter(Boolean)
                      .join(" · ") || "수리 작업 정보 확인 필요"}
                  </strong>
                  <div className={styles.requestMeta}>
                    <span>요청일 {formatDate(request.createdAt)}</span>
                    {request.processedAt ? <span>처리일 {formatDate(request.processedAt)}</span> : null}
                    {request.failureReason ? <span>{userFacingFailure(request.failureReason)}</span> : null}
                  </div>
                </div>
                <div className={styles.requestAmount}>
                  <strong>{won(request.amount)}</strong>
                  <span className={paymentStatusTone(request.status)}>{paymentStatusLabel[request.status]}</span>
                  {request.latestRepairPaymentOrder ? (
                    <span className={styles.repairOrderStatus}>
                      Toss 주문 {repairPaymentRecovery(request.latestRepairPaymentOrder.status)?.label}
                    </span>
                  ) : null}
                </div>
                {renderPaymentActions(request, index)}
              </article>
            ))}
            {workspace.nextPaymentCursor ? (
              <button
                className={styles.loadMoreButton}
                type="button"
                disabled={busyKeys.has("history:payment")}
                onClick={() => void loadMoreHistory("payment", workspace.nextPaymentCursor!)}
              >
                {busyKeys.has("history:payment") ? "불러오는 중" : "이전 지급 요청 더 보기"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.emptyState}>아직 업체 지급 요청이 없습니다.</div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div><h2>크레딧 원장</h2><p>충전과 업체 지급으로 변한 잔액을 순서대로 확인합니다.</p></div>
        </div>
        <div className={styles.historyScroll} tabIndex={0} aria-label="크레딧 원장 내역">
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>일자</th><th>구분</th><th>관련 업무</th><th>변동</th><th>잔액</th></tr></thead>
              <tbody>
                {ledgerEntries.map((entry) => (
                  <tr key={entry.rowKey}>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>{ledgerTypeLabel[entry.type]}</td>
                    <td>{ledgerReferenceLabel(entry.referenceType)}</td>
                    <td className={entry.signedAmount >= 0 ? styles.amountPositive : styles.amountNegative}>{signedWon(entry.signedAmount)}</td>
                    <td>{won(entry.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workspace.nextLedgerCursor ? (
              <button
                className={styles.loadMoreButton}
                type="button"
                disabled={busyKeys.has("history:ledger")}
                onClick={() => void loadMoreHistory("ledger", workspace.nextLedgerCursor!)}
              >
                {busyKeys.has("history:ledger") ? "불러오는 중" : "이전 원장 더 보기"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <ManagerRepairPaymentDialog
        ref={repairPaymentDialogRef}
        onResultMessage={handleRepairPaymentDialogMessage}
        onWorkspaceRefresh={handleRepairPaymentWorkspaceRefresh}
      />
      <ManagerPaymentRecordDialog
        ref={paymentRecordDialogRef}
        onCompleted={handlePaymentRecordCompleted}
      />
    </div>
  );
}
