"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  paymentHistoryPresetRange,
  type TenantPaymentHistory,
} from "@roomlog/types";
import { ReceiptText, X } from "lucide-react";
import {
  toTenantPaymentHistory,
  type TeamTenantPaymentHistory,
} from "@/lib/payment-mapping";
import {
  confirmedPaymentLogs,
  type ConfirmedPaymentLog,
} from "./tenant-confirmed-payment-history";

type LoadState =
  | { status: "loading"; logs: [] }
  | { status: "ready"; logs: ConfirmedPaymentLog[] }
  | { status: "error"; logs: [] };

type PaymentHistoryRange = {
  from: string;
  to: string;
};

async function requestHistory(range: PaymentHistoryRange): Promise<Response> {
  const params = new URLSearchParams(range);
  return fetch(`/api/tenant/bills/history?${params.toString()}`, {
    cache: "no-store",
  });
}

async function responseHistory(response: Response): Promise<TenantPaymentHistory> {
  const payload = (await response.json()) as TeamTenantPaymentHistory;
  return toTenantPaymentHistory(payload);
}

function sameRange(left: PaymentHistoryRange, right: PaymentHistoryRange): boolean {
  return left.from === right.from && left.to === right.to;
}

function paymentActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function TenantPaymentHistoryModal({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<LoadState>({
    status: "loading",
    logs: [],
  });

  const load = useCallback(async () => {
    setState({ status: "loading", logs: [] });

    try {
      const requested = paymentHistoryPresetRange(6);
      let response = await requestHistory(requested);
      let history: TenantPaymentHistory;

      if (response.status === 400) {
        const probeRange = { from: requested.to, to: requested.to };
        const probeResponse = await requestHistory(probeRange);
        if (!probeResponse.ok) throw new Error("납부 내역 범위 확인 실패");

        const probeHistory = await responseHistory(probeResponse);
        const boundedRange = {
          from:
            requested.from < probeHistory.bounds.min
              ? probeHistory.bounds.min
              : requested.from,
          to:
            requested.to > probeHistory.bounds.max
              ? probeHistory.bounds.max
              : requested.to,
        };

        if (sameRange(boundedRange, probeRange)) {
          history = probeHistory;
        } else {
          response = await requestHistory(boundedRange);
          if (!response.ok) throw new Error("납부 내역 조회 실패");
          history = await responseHistory(response);
        }
      } else {
        if (!response.ok) throw new Error("납부 내역 조회 실패");
        history = await responseHistory(response);
      }

      setState({
        status: "ready",
        logs: confirmedPaymentLogs(history),
      });
    } catch {
      setState({ status: "error", logs: [] });
    }
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
    void load();
  }, [load]);

  useEffect(() => {
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeFromKeyboard);
    return () => window.removeEventListener("keydown", closeFromKeyboard);
  }, [onClose]);

  const modal = (
    <div
      className="tenant-payment-history-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        id="tenant-payment-history-dialog"
        className="tenant-payment-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tenant-payment-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tenant-payment-history-head">
          <div>
            <span>최근 6개월</span>
            <h2 id="tenant-payment-history-title">납부 내역</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="납부 내역 닫기"
          >
            <X size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>

        <div className="tenant-payment-history-body">
          {state.status === "loading" ? (
            <p role="status">납부 내역을 불러오고 있습니다.</p>
          ) : state.status === "error" ? (
            <div role="alert">
              <p>납부 내역을 불러오지 못했습니다.</p>
              <button
                className="tenant-payment-history-retry"
                type="button"
                onClick={() => void load()}
              >
                다시 시도
              </button>
            </div>
          ) : state.logs.length === 0 ? (
            <p>확정된 납부 내역이 없습니다.</p>
          ) : (
            <ul className="tenant-payment-history-list">
              {state.logs.map((log) => (
                <li key={log.id}>
                  <span
                    className="tenant-payment-history-icon"
                    aria-hidden="true"
                  >
                    <ReceiptText />
                  </span>
                  <div>
                    <strong>{log.billingMonth} 청구</strong>
                    <small>
                      {log.methodLabel} ·{" "}
                      <time dateTime={log.activityDate}>
                        {paymentActivityDate(log.activityDate)}
                      </time>
                    </small>
                  </div>
                  <b>{log.amount.toLocaleString("ko-KR")}원</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
