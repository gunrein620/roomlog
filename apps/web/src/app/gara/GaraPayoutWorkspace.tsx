"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagerVendorView } from "@roomlog/types";
import {
  createGaraPayoutAction,
  INITIAL_GARA_PAYOUT_MUTATION_STATE,
} from "./actions";
import styles from "./GaraPayoutWorkspace.module.css";

function won(value: number) {
  return value.toLocaleString("ko-KR") + "원";
}

function GaraPayoutRow({
  vendor,
  balance,
  demo,
  onBalanceChanged,
}: {
  vendor: ManagerVendorView;
  balance: number;
  demo: boolean;
  onBalanceChanged: (nextBalance: number) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef(globalThis.crypto.randomUUID());
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createGaraPayoutAction,
    INITIAL_GARA_PAYOUT_MUTATION_STATE,
  );
  const accountNumber = vendor.settlementAccountNumber?.trim();
  const disabled = demo || !accountNumber;

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    idempotencyKeyRef.current = globalThis.crypto.randomUUID();
    onBalanceChanged(state.balance);
    router.refresh();
  }, [onBalanceChanged, router, state]);

  return (
    <tr>
      <td>{vendor.catalog.businessName}</td>
      <td>{vendor.catalog.phone}</td>
      <td>{accountNumber ?? "계좌번호 미등록"}</td>
      <td className={styles.balance}>{won(balance)}</td>
      <td>
        <form ref={formRef} className={styles.requestForm} action={formAction}>
          <input type="hidden" name="managerVendorId" value={vendor.id} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKeyRef.current} />
          <input
            aria-label={vendor.catalog.businessName + " 요청 금액"}
            className={styles.amountInput}
            name="amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            placeholder="금액 입력"
            disabled={disabled || pending}
            required
          />
          {state.status === "error" ? <p className={styles.error} role="alert">{state.message}</p> : null}
          {state.status === "success" ? <p className={styles.success} role="status">{state.message}</p> : null}
        </form>
      </td>
      <td>
        <button
          className={styles.sendButton}
          type="button"
          disabled={disabled || pending}
          onClick={() => formRef.current?.requestSubmit()}
        >
          {pending ? "요청 중…" : "발송"}
        </button>
        {!accountNumber && <span className={styles.hint}>계좌번호 필요</span>}
      </td>
    </tr>
  );
}

export function GaraPayoutWorkspace({
  vendors,
  initialBalance,
  demo,
}: {
  vendors: ManagerVendorView[];
  initialBalance: number;
  demo: boolean;
}) {
  const [balance, setBalance] = useState(initialBalance);

  return (
    <section className={styles.workspace}>
      <div className={styles.summary}>
        <div>
          <span>관리자 크레딧 잔액</span>
          <strong>{won(balance)}</strong>
        </div>
        <p>발송하면 실제 계좌이체는 하지 않고, 크레딧 차감과 지급 요청 생성만 기록합니다.</p>
      </div>
      {demo && <p className={styles.notice}>API 연결 전 데모 데이터입니다. 발송은 실제 등록 업체에서만 가능합니다.</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">업체명</th>
              <th scope="col">전화번호</th>
              <th scope="col">계좌번호</th>
              <th scope="col">잔액</th>
              <th scope="col">요청 금액</th>
              <th scope="col">발송</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <GaraPayoutRow
                key={vendor.id}
                vendor={vendor}
                balance={balance}
                demo={demo}
                onBalanceChanged={setBalance}
              />
            ))}
          </tbody>
        </table>
        {vendors.length === 0 && <p className={styles.empty}>등록된 업체가 없습니다. 먼저 업체를 등록해 주세요.</p>}
      </div>
    </section>
  );
}
