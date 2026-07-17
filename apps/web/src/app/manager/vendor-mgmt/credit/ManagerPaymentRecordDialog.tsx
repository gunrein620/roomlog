"use client";

import type { FormEvent, MouseEvent } from "react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  reverseCreditPaymentAction,
  settleCreditPaymentAction,
  voidDirectPaymentAction,
} from "./actions";
import styles from "./ManagerRepairPaymentDialog.module.css";

export type ManagerPaymentRecordTarget = {
  kind: "EXTERNAL_TRANSFER" | "CREDIT_CORRECTION" | "DIRECT_CORRECTION";
  paymentRequestId: string;
  vendorName: string;
  roomLabel?: string;
  workLabel?: string;
  amount: number;
};

export type ManagerPaymentRecordDialogHandle = {
  open(target: ManagerPaymentRecordTarget): void;
};

type Props = {
  onCompleted(message: string): void;
};

function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function evidence(transactionReference: string, memo: string) {
  const parts = [
    transactionReference.trim() ? `거래번호: ${transactionReference.trim()}` : "",
    memo.trim() ? `메모: ${memo.trim()}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "관리자 확인 기록";
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "지급 기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export const ManagerPaymentRecordDialog = forwardRef<
  ManagerPaymentRecordDialogHandle,
  Props
>(function ManagerPaymentRecordDialog({ onCompleted }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<ManagerPaymentRecordTarget | null>(null);
  const [paidAt, setPaidAt] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [memo, setMemo] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open(nextTarget) {
      setTarget(nextTarget);
      setPaidAt(localDateTime());
      setTransactionReference("");
      setMemo("");
      setReason("");
      setAcknowledged(false);
      setError(null);
      dialogRef.current?.showModal();
    },
  }), []);

  const recording = target?.kind === "EXTERNAL_TRANSFER";

  function close() {
    if (busy) return;
    dialogRef.current?.close();
    setTarget(null);
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || busy) return;
    if (!acknowledged) {
      setError(recording
        ? "이미 외부에서 지급했다는 확인이 필요합니다."
        : "내부 지급 기록 정정에 대한 확인이 필요합니다.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (recording) {
        const paidAtDate = new Date(paidAt);
        if (!paidAt || !Number.isFinite(paidAtDate.getTime())) {
          throw new Error("지급일시를 확인해 주세요.");
        }
        const reference = evidence(transactionReference, memo);
        if (reference.length > 120) {
          throw new Error("거래번호와 메모는 합계 120자 이하여야 합니다.");
        }
        await settleCreditPaymentAction(target.paymentRequestId, {
          mode: "DIRECT",
          idempotencyKey: crypto.randomUUID(),
          paidAt: paidAtDate.toISOString(),
          reference,
        });
        onCompleted("직접 계좌이체 내역을 기록했습니다.");
      } else {
        const note = reason.trim();
        if (!note) throw new Error("정정 사유를 입력해 주세요.");
        const input = { note, idempotencyKey: crypto.randomUUID() };
        if (target.kind === "CREDIT_CORRECTION") {
          await reverseCreditPaymentAction(target.paymentRequestId, input);
        } else {
          await voidDirectPaymentAction(target.paymentRequestId, input);
        }
        onCompleted("내부 지급·비용 기록을 정정했습니다. 실제 송금이나 환불은 변경되지 않았습니다.");
      }
      dialogRef.current?.close();
      setTarget(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manager-payment-record-title"
      onClick={closeOnBackdrop}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else setTarget(null);
      }}
    >
      {target ? (
        <form className={styles.panel} onSubmit={submit}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>업체 수리비 지급</p>
              <h2 id="manager-payment-record-title">
                {recording ? "직접 계좌이체 내역 등록" : "지급 기록 정정"}
              </h2>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="닫기"
              disabled={busy}
              onClick={close}
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div className={styles.summary}>
            <div><span>업체</span><strong>{target.vendorName}</strong></div>
            <div><span>호실</span><strong>{target.roomLabel ?? "호실 정보 확인 필요"}</strong></div>
            <div><span>작업</span><strong>{target.workLabel ?? "수리 작업 정보 확인 필요"}</strong></div>
            <div><span>서버 저장 금액</span><strong>{won(target.amount)}</strong></div>
          </div>

          {recording ? (
            <>
              <p className={styles.notice}>
                외부에서 이미 지급한 사실을 비용·지급 이력에 기록합니다. 집우집주가 실제 송금이나 환불을 수행하지 않습니다.
              </p>
              <div className={styles.formFields}>
                <label className={styles.formField}>
                  지급일시
                  <input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} disabled={busy} required />
                </label>
                <label className={styles.formField}>
                  거래번호(선택)
                  <input value={transactionReference} maxLength={120} onChange={(event) => setTransactionReference(event.target.value)} disabled={busy} />
                </label>
                <label className={styles.formField}>
                  메모(선택)
                  <input value={memo} maxLength={120} onChange={(event) => setMemo(event.target.value)} disabled={busy} />
                </label>
              </div>
            </>
          ) : (
            <>
              <div className={styles.warning}>
                <strong>지급 자체를 취소하거나 환불하는 기능이 아닙니다.</strong>
                <span>실제 계좌이체는 취소되거나 환불되지 않습니다.</span>
                <span>집우집주 내부의 지급·비용 기록만 정정됩니다.</span>
                <span>실제 환불을 받았다면 별도 정산이 필요합니다.</span>
              </div>
              <label className={styles.formField}>
                정정 사유
                <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} required maxLength={300} />
              </label>
            </>
          )}

          <label className={styles.confirmation}>
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} />
            <span>{recording ? "이미 외부에서 지급했습니다" : "위 내용을 확인했고 내부 기록 정정을 진행합니다"}</span>
          </label>
          {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={close} disabled={busy}>닫기</button>
            <button type="submit" className={styles.payButton} disabled={busy || !acknowledged}>
              {busy ? "처리 중…" : recording ? "내역 등록" : "지급 기록 정정"}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
});
