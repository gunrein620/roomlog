"use client";

import type { FormEvent } from "react";
import { useId, useState } from "react";
import type { GaraVendorCreditPublicView } from "@roomlog/types";
import { createGaraVendorPayoutRequest } from "@/lib/gara-credit-api";
import styles from "./GaraPayoutWorkspace.module.css";

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

function GaraPayoutRow({ vendor }: { vendor: GaraVendorCreditPublicView }) {
  const formId = useId();
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountNumber = vendor.settlementAccountNumber?.trim();

  async function sendPayoutRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setFeedback(null);
    const amount = parsePositiveSafeInteger(amountText);
    if (amount === null) {
      setError("요청 금액은 1원 이상의 정수로 입력해 주세요.");
      return;
    }
    if (!accountNumber) {
      setError("정산 계좌가 등록된 업체만 지급 요청을 보낼 수 있습니다.");
      return;
    }

    setBusy(true);
    try {
      await createGaraVendorPayoutRequest({
        managerVendorId: vendor.id,
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      setAmountText("");
      setFeedback("관리자 크레딧 결제의 업체 지급 요청으로 발송했습니다.");
    } catch (requestError) {
      setError(errorMessage(requestError, "지급 요청을 발송하지 못했습니다."));
    } finally {
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
        <form id={formId} className={styles.requestForm} onSubmit={sendPayoutRequest}>
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
          {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </form>
      </td>
      <td>
        <button
          className={styles.sendButton}
          type="submit"
          form={formId}
          disabled={busy || !accountNumber}
        >
          {busy ? "발송 중…" : "발송"}
        </button>
        {!accountNumber ? <span className={styles.hint}>계좌번호 필요</span> : null}
      </td>
    </tr>
  );
}

export function GaraPayoutWorkspace({ vendors }: { vendors: GaraVendorCreditPublicView[] }) {
  return (
    <section className={styles.workspace}>
      <p className={styles.feedback}>
        발송된 요청은 연결된 관리자의 크레딧 결제 화면에서 확인·지급합니다.
      </p>
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
              <th scope="col">발송</th>
            </tr>
          </thead>
          <tbody>{vendors.map((vendor) => <GaraPayoutRow key={vendor.id} vendor={vendor} />)}</tbody>
        </table>
        {vendors.length === 0 ? <p className={styles.empty}>등록된 업체가 없습니다.</p> : null}
      </div>
    </section>
  );
}
