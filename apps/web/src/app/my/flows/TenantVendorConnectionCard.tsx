"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { TenantPartnerVendorCandidate } from "@roomlog/types";
import {
  confirmTenantVendorConnection,
  prepareTenantVendorConnection,
  searchTenantPartnerVendors,
  shouldRefreshTenantVendorSelection,
} from "@/lib/tenant-vendor-connection-api";
import {
  initialTenantVendorConnectionState,
  tenantVendorConnectionReducer,
  tenantVendorTradeLabel,
} from "./tenant-vendor-connection";

type TenantVendorConnectionCardProps = {
  complaintId: string;
  onRequested?: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "협력업체 정보를 확인하지 못했습니다.";
}

export function TenantVendorConnectionCard({
  complaintId,
  onRequested,
}: TenantVendorConnectionCardProps) {
  const [state, dispatch] = useReducer(
    tenantVendorConnectionReducer,
    undefined,
    initialTenantVendorConnectionState,
  );
  const [requestNote, setRequestNote] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  const searchCandidates = useCallback(async () => {
    dispatch({ type: "SEARCH_STARTED" });
    try {
      const result = await searchTenantPartnerVendors(complaintId);
      dispatch({ type: "SEARCH_SUCCEEDED", result });
    } catch (error) {
      dispatch({ type: "FAILED", message: errorMessage(error) });
    }
  }, [complaintId]);

  useEffect(() => {
    void searchCandidates();
  }, [searchCandidates]);

  const prepareCandidate = async (candidate: TenantPartnerVendorCandidate) => {
    dispatch({ type: "PREVIEW_STARTED" });
    try {
      const preview = await prepareTenantVendorConnection(complaintId, {
        vendorId: candidate.vendorId,
      });
      setRequestNote("");
      idempotencyKey.current = null;
      dispatch({ type: "PREVIEW_SUCCEEDED", preview });
    } catch (error) {
      if (shouldRefreshTenantVendorSelection(error)) {
        idempotencyKey.current = null;
        await searchCandidates();
        return;
      }
      dispatch({ type: "FAILED", message: errorMessage(error) });
    }
  };

  const confirmRequest = async () => {
    if (state.step !== "preview") return;
    const previewId = state.preview.previewId;
    if (!idempotencyKey.current) {
      idempotencyKey.current = globalThis.crypto.randomUUID();
    }
    dispatch({ type: "CONFIRM_STARTED" });
    try {
      const result = await confirmTenantVendorConnection(complaintId, {
        previewId,
        idempotencyKey: idempotencyKey.current,
        ...(requestNote.trim() ? { requestNote } : {}),
      });
      dispatch({ type: "CONFIRM_SUCCEEDED", result });
      onRequested?.();
    } catch (error) {
      if (shouldRefreshTenantVendorSelection(error)) {
        idempotencyKey.current = null;
        await searchCandidates();
        return;
      }
      dispatch({ type: "FAILED", message: errorMessage(error) });
    }
  };

  if (state.step === "idle" || state.step === "searching") {
    return (
      <section className="tenant-vendor-card" aria-live="polite">
        <strong>협력업체를 찾고 있어요</strong>
        <p>접수한 하자와 서비스 지역에 맞는 업체를 확인합니다.</p>
      </section>
    );
  }

  if (state.step === "error") {
    return (
      <section className="tenant-vendor-card tenant-vendor-error" role="alert">
        <strong>협력업체를 불러오지 못했어요</strong>
        <p>{state.message}</p>
        <button type="button" className="tenant-vendor-secondary" onClick={() => void searchCandidates()}>
          다시 확인
        </button>
      </section>
    );
  }

  if (state.step === "requested") {
    return (
      <section className="tenant-vendor-card tenant-vendor-success" role="status">
        <span className="tenant-vendor-status">요청 접수</span>
        <strong>협력업체에 수리 요청이 접수되었습니다</strong>
        <p>{state.result.request.vendor.businessName}에서 요청 내용을 확인합니다.</p>
      </section>
    );
  }

  if (state.step === "preview" || state.step === "confirming") {
    const isConfirming = state.step === "confirming";
    return (
      <section className="tenant-vendor-card" aria-label="협력업체 수리 요청 확인">
        <div className="tenant-vendor-card-head">
          <div>
            <span className="tenant-vendor-status">요청 전 확인</span>
            <strong>{state.preview.vendor.businessName}</strong>
          </div>
          <button
            type="button"
            className="tenant-vendor-text-button"
            disabled={isConfirming}
            onClick={() => dispatch({ type: "BACK_TO_CANDIDATES" })}
          >
            업체 다시 선택
          </button>
        </div>
        <div className="tenant-vendor-preview-grid">
          {state.preview.sharedInfo.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <label className="tenant-vendor-note">
          <span className="tenant-vendor-note-label">
            업체에 남길 메모
            <span>선택</span>
          </span>
          <textarea
            value={requestNote}
            maxLength={1000}
            disabled={isConfirming}
            placeholder="예: 평일 저녁 방문을 희망합니다."
            onChange={(event) => setRequestNote(event.target.value)}
          />
        </label>
        <p className="tenant-vendor-notice">
          확인하면 협력업체 작업함에 수리 요청이 접수됩니다. 견적 승인과 결제는 이후 단계에서 진행합니다.
        </p>
        {state.step === "preview" && state.error ? (
          <p className="tenant-vendor-inline-error" role="alert">{state.error}</p>
        ) : null}
        <button
          type="button"
          className="tenant-vendor-primary"
          disabled={isConfirming}
          onClick={() => void confirmRequest()}
        >
          {isConfirming ? "요청 접수 중..." : "확인하고 수리 요청"}
        </button>
      </section>
    );
  }

  const isPreparing = state.step === "preparing";
  const vendors = state.search.vendors;
  return (
    <section className="tenant-vendor-card" aria-label="협력업체 후보">
      <div className="tenant-vendor-card-head">
        <div>
          <span className="tenant-vendor-status">협력업체</span>
          <strong>{state.search.complaint.category} 수리 업체</strong>
        </div>
        <span className="tenant-vendor-count">{vendors.length}곳</span>
      </div>
      {vendors.length > 0 ? (
        <div className="tenant-vendor-list">
          {vendors.map((candidate, index) => (
            <article key={`${candidate.businessName}-${index}`}>
              <div>
                <strong>{candidate.businessName}</strong>
                <span>
                  {candidate.trades.map(tenantVendorTradeLabel).join(" · ")}
                  {candidate.serviceAreas.length > 0 ? ` · ${candidate.serviceAreas.join(", ")}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="tenant-vendor-secondary"
                disabled={isPreparing}
                onClick={() => void prepareCandidate(candidate)}
              >
                {isPreparing ? "확인 중" : "요청 내용 보기"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="tenant-vendor-empty">
          현재 조건에 맞는 협력업체가 없습니다. 접수 내역은 그대로 유지됩니다.
        </p>
      )}
      {state.step === "candidates" && state.error ? (
        <p className="tenant-vendor-inline-error" role="alert">{state.error}</p>
      ) : null}
    </section>
  );
}
