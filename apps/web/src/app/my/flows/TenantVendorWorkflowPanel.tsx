"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TenantVendorWorkflowView,
  VendorEstimateLineItemCategory,
} from "@roomlog/types";
import {
  confirmTenantVendorVisit,
  decideTenantVendorCompletion,
  getTenantVendorWorkflow,
  reviewTenantVendorEstimate,
} from "@/lib/tenant-vendor-workflow-api";

type TenantVendorWorkflowPanelProps = {
  complaintId: string;
};

type NoteMode = "estimate" | "completion" | null;

const LINE_ITEM_LABEL: Record<VendorEstimateLineItemCategory, string> = {
  VISIT: "출장비",
  LABOR: "작업비",
  MATERIAL: "자재비",
  LEGACY_TOTAL: "수리비",
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "업체 확인 중",
  ESTIMATE_SUBMITTED: "견적 확인 필요",
  ESTIMATE_APPROVED: "견적 승인 완료",
  SCHEDULED: "방문 예정",
  IN_PROGRESS: "수리 진행 중",
  COMPLETION_REPORTED: "완료 확인 필요",
  COMPLETED: "수리 완료",
  CANCELLED: "요청 취소",
};

function formatKrw(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatDateTime(value?: string) {
  if (!value) return "일정 확인 중";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "일정 확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function workflowErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "협력업체 진행 정보를 처리하지 못했습니다.";
}

export function TenantVendorWorkflowPanel({
  complaintId,
}: TenantVendorWorkflowPanelProps) {
  const [workflow, setWorkflow] = useState<TenantVendorWorkflowView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [noteMode, setNoteMode] = useState<NoteMode>(null);
  const [note, setNote] = useState("");

  const loadWorkflow = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setWorkflow(await getTenantVendorWorkflow(complaintId));
    } catch (loadError) {
      setError(workflowErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setWorkflow(null);
    setError("");
    setNoteMode(null);
    setNote("");
    void getTenantVendorWorkflow(complaintId)
      .then((result) => {
        if (active) setWorkflow(result);
      })
      .catch((loadError) => {
        if (active) setError(workflowErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [complaintId]);

  const updateWorkflow = async (
    action: string,
    request: () => Promise<TenantVendorWorkflowView>,
  ) => {
    if (busyAction) return;
    setBusyAction(action);
    setError("");
    try {
      setWorkflow(await request());
      setNoteMode(null);
      setNote("");
    } catch (requestError) {
      setError(workflowErrorMessage(requestError));
    } finally {
      setBusyAction(null);
    }
  };

  if (isLoading) {
    return (
      <section className="tenant-vendor-workflow" aria-live="polite">
        <strong>협력업체 진행 상황을 확인하고 있어요</strong>
      </section>
    );
  }

  if (!workflow) {
    return error ? (
      <section className="tenant-vendor-workflow tenant-vendor-workflow-error" role="alert">
        <strong>협력업체 진행 정보를 불러오지 못했어요</strong>
        <p>{error}</p>
        <button type="button" className="tenant-vendor-secondary" onClick={() => void loadWorkflow()}>
          다시 확인
        </button>
      </section>
    ) : null;
  }

  const estimate = workflow.latestEstimate;
  const completion = workflow.latestCompletion;
  const payment = workflow.paymentRequest;
  const canReviewFixedEstimate = estimate?.responseType === "FIXED_ESTIMATE"
    && estimate.status === "SUBMITTED";
  const canConfirmVisit = estimate?.responseType === "VISIT_REQUIRED"
    && estimate.status === "SUBMITTED"
    && Boolean(estimate.visitAvailableAt);
  const canReviewCompletion = Boolean(completion && !completion.review)
    && workflow.status === "COMPLETION_REPORTED";
  const isDirectPaymentPending = payment?.status === "PENDING_APPROVAL"
    && payment.lastAttemptMode === "DIRECT";
  const canPayRepairCost = Boolean(
    payment
    && payment.status === "PENDING_APPROVAL"
    && !isDirectPaymentPending,
  );
  const isRepairCostPaid = payment?.status === "TOSS_PAID"
    || payment?.status === "DIRECT_PAID";

  return (
    <section className="tenant-vendor-workflow" aria-label="협력업체 수리 진행">
      <div className="tenant-vendor-workflow-head">
        <div>
          <span>협력업체 수리</span>
          <strong>{workflow.vendor.businessName}</strong>
        </div>
        <span className="tenant-vendor-workflow-status">
          {STATUS_LABEL[workflow.status] ?? "진행 중"}
        </span>
      </div>

      {estimate ? (
        <article className="tenant-vendor-workflow-step">
          <div className="tenant-vendor-workflow-step-head">
            <div>
              <span>1</span>
              <strong>{estimate.responseType === "VISIT_REQUIRED" ? "방문 일정 확인" : "견적 승인"}</strong>
            </div>
            {estimate.status === "APPROVED" || estimate.status === "VISIT_SCHEDULED" ? (
              <small>확인 완료</small>
            ) : null}
          </div>

          {estimate.workDescription ? <p>{estimate.workDescription}</p> : null}

          {estimate.responseType === "FIXED_ESTIMATE" ? (
            <>
              <dl className="tenant-vendor-estimate-lines">
                {estimate.lineItems.map((item) => (
                  <div key={item.id}>
                    <dt>
                      <span>{LINE_ITEM_LABEL[item.category]}</span>
                      {item.description}
                    </dt>
                    <dd>{formatKrw(item.lineAmount)}</dd>
                  </div>
                ))}
                <div className="tenant-vendor-estimate-total">
                  <dt>총 견적</dt>
                  <dd>{formatKrw(estimate.totalAmount ?? 0)}</dd>
                </div>
              </dl>
              {canReviewFixedEstimate ? (
                <div className="tenant-vendor-workflow-actions">
                  <button
                    type="button"
                    className="tenant-vendor-secondary"
                    disabled={Boolean(busyAction)}
                    onClick={() => setNoteMode("estimate")}
                  >
                    수정 요청
                  </button>
                  <button
                    type="button"
                    className="tenant-vendor-primary"
                    disabled={Boolean(busyAction)}
                    onClick={() => void updateWorkflow(
                      "estimate-approve",
                      () => reviewTenantVendorEstimate(workflow.repairId, estimate.id, { action: "APPROVE" }),
                    )}
                  >
                    {busyAction === "estimate-approve" ? "승인 중..." : "견적 승인"}
                  </button>
                </div>
              ) : null}
            </>
          ) : estimate.responseType === "VISIT_REQUIRED" ? (
            <div className="tenant-vendor-visit-row">
              <div>
                <span>업체 제안 일정</span>
                <strong>{formatDateTime(estimate.visitAvailableAt)}</strong>
              </div>
              {canConfirmVisit ? (
                <button
                  type="button"
                  className="tenant-vendor-primary"
                  disabled={Boolean(busyAction)}
                  onClick={() => void updateWorkflow(
                    "visit-confirm",
                    () => confirmTenantVendorVisit(
                      workflow.repairId,
                      estimate.id,
                      { scheduledAt: estimate.visitAvailableAt! },
                    ),
                  )}
                >
                  {busyAction === "visit-confirm" ? "확인 중..." : "이 일정으로 확인"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="tenant-vendor-workflow-note">
              {estimate.declineReason ?? "업체가 요청을 진행하기 어렵다고 답변했습니다."}
            </p>
          )}

          {noteMode === "estimate" ? (
            <div className="tenant-vendor-workflow-note-form">
              <label>
                수정이 필요한 내용을 적어주세요
                <textarea
                  value={note}
                  maxLength={1000}
                  placeholder="예: 자재 종류와 금액을 구체적으로 알려주세요."
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div>
                <button type="button" className="tenant-vendor-text-button" onClick={() => setNoteMode(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="tenant-vendor-secondary"
                  disabled={!note.trim() || Boolean(busyAction)}
                  onClick={() => void updateWorkflow(
                    "estimate-revision",
                    () => reviewTenantVendorEstimate(workflow.repairId, estimate.id, {
                      action: "REQUEST_REVISION",
                      note,
                    }),
                  )}
                >
                  수정 요청 보내기
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ) : (
        <article className="tenant-vendor-workflow-step tenant-vendor-workflow-waiting">
          <strong>업체가 요청 내용을 확인하고 있어요</strong>
          <p>견적이나 방문 일정이 도착하면 이 화면에서 직접 확인할 수 있습니다.</p>
        </article>
      )}

      {completion ? (
        <article className="tenant-vendor-workflow-step">
          <div className="tenant-vendor-workflow-step-head">
            <div>
              <span>2</span>
              <strong>수리 완료 확인</strong>
            </div>
            {completion.review ? <small>확인 완료</small> : null}
          </div>
          <p>{completion.workSummary}</p>
          <small className="tenant-vendor-completed-at">
            작업 완료 {formatDateTime(completion.completedAt)}
          </small>
          {completion.attachmentUrls?.length ? (
            <div className="tenant-vendor-completion-photos" aria-label="수리 완료 사진">
              {completion.attachmentUrls.map((url, index) => (
                <img key={url} src={url} alt={`수리 완료 사진 ${index + 1}`} />
              ))}
            </div>
          ) : null}
          {completion.review?.decision === "REJECTED" ? (
            <p className="tenant-vendor-workflow-note">
              재작업 요청 완료{completion.review.note ? ` · ${completion.review.note}` : ""}
            </p>
          ) : null}
          {canReviewCompletion ? (
            <div className="tenant-vendor-workflow-actions">
              <button
                type="button"
                className="tenant-vendor-secondary"
                disabled={Boolean(busyAction)}
                onClick={() => setNoteMode("completion")}
              >
                재작업 요청
              </button>
              <button
                type="button"
                className="tenant-vendor-primary"
                disabled={Boolean(busyAction)}
                onClick={() => void updateWorkflow(
                  "completion-approve",
                  () => decideTenantVendorCompletion(workflow.repairId, { decision: "APPROVED" }),
                )}
              >
                {busyAction === "completion-approve" ? "확인 중..." : "수리 완료 확인"}
              </button>
            </div>
          ) : null}
          {noteMode === "completion" ? (
            <div className="tenant-vendor-workflow-note-form">
              <label>
                다시 확인이 필요한 내용을 적어주세요
                <textarea
                  value={note}
                  maxLength={1000}
                  placeholder="예: 누수가 계속되어 배관 연결부 재확인이 필요합니다."
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div>
                <button type="button" className="tenant-vendor-text-button" onClick={() => setNoteMode(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="tenant-vendor-secondary"
                  disabled={!note.trim() || Boolean(busyAction)}
                  onClick={() => void updateWorkflow(
                    "completion-reject",
                    () => decideTenantVendorCompletion(workflow.repairId, {
                      decision: "REJECTED",
                      note,
                    }),
                  )}
                >
                  재작업 요청 보내기
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {payment ? (
        <article className="tenant-vendor-payment-ready">
          <div>
            <span>3</span>
            <div>
              <strong>
                {payment.status === "DIRECT_PAID"
                  ? "직접결제 완료"
                  : payment.status === "TOSS_PAID"
                    ? "Toss 결제 완료"
                    : isDirectPaymentPending
                      ? "직접결제 확인 대기"
                      : "결제 준비 완료"}
              </strong>
              <p>완료 확인 금액 {formatKrw(payment.amount)}</p>
              {payment.processedAt ? <p>처리 시각 {formatDateTime(payment.processedAt)}</p> : null}
            </div>
          </div>
          {canPayRepairCost ? (
            <a
              className="tenant-vendor-primary tenant-vendor-payment-link"
              href={`/tenant/repair-payment/${encodeURIComponent(payment.id)}?complaintId=${encodeURIComponent(complaintId)}`}
            >
              결제하기
            </a>
          ) : isDirectPaymentPending ? (
            <span className="tenant-vendor-payment-complete">업체 확인 대기</span>
          ) : isRepairCostPaid ? (
            <span className="tenant-vendor-payment-complete">결제 완료</span>
          ) : (
            <small>현재 상태를 확인한 뒤 결제를 진행할 수 있습니다.</small>
          )}
        </article>
      ) : null}

      {error ? <p className="tenant-vendor-inline-error" role="alert">{error}</p> : null}
    </section>
  );
}
