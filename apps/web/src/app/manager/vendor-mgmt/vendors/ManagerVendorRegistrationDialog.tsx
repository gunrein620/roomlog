"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_MANAGER_MUTATION_STATE } from "../../_components/manager-mutation-state";
import { createManualVendorAction } from "../actions";
import styles from "./ManagerVendorRegistrationDialog.module.css";

export function ManagerVendorRegistrationDialog({ disabled = false }: { disabled?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createManualVendorAction,
    INITIAL_MANAGER_MUTATION_STATE,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.status]);

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        업체 등록
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (!pending && event.currentTarget === event.target) {
            dialogRef.current?.close();
          }
        }}
      >
        <form ref={formRef} className={styles.panel} action={formAction} aria-busy={pending}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>협력업체 직접 등록</span>
            <h2 id={titleId}>업체 등록</h2>
            <p id={descriptionId}>
              이 업체 정보는 현재 로그인한 관리인의 내 업체 목록에만 저장됩니다.
            </p>
          </div>

          <fieldset className={styles.fields} disabled={pending}>
            <label className={styles.field}>
              업체명
              <input
                className={styles.input}
                name="businessName"
                type="text"
                required
                maxLength={100}
                autoComplete="organization"
                autoFocus
                placeholder="예: 새봄 설비"
              />
            </label>
            <label className={styles.field}>
              전화번호
              <input
                className={styles.input}
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="예: 010-1234-5678"
              />
            </label>
            <label className={styles.field}>
              계좌번호
              <input
                className={styles.input}
                name="accountNumber"
                type="text"
                required
                inputMode="numeric"
                maxLength={40}
                pattern="[0-9 -]+"
                autoComplete="off"
                placeholder="숫자와 하이픈으로 입력"
              />
            </label>
          </fieldset>

          {state.status === "error" ? (
            <p className={styles.error} role="alert">{state.message}</p>
          ) : null}

          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              type="button"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              취소
            </button>
            <button className={styles.submitButton} type="submit" disabled={pending}>
              {pending ? "등록 중…" : "등록"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
