"use client";

import { useEffect, useId, useRef } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_MANAGER_MUTATION_STATE } from "../../_components/manager-mutation-state";
import { archiveVendorAction } from "../actions";
import styles from "./ManagerVendorArchiveControl.module.css";

export function ManagerVendorArchiveControl({
  vendorId,
  vendorName,
  disabled = false,
}: {
  vendorId: string;
  vendorName: string;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    archiveVendorAction,
    INITIAL_MANAGER_MUTATION_STATE,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.status]);

  return (
    <>
      <button
        className={styles.archiveButton}
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        해제
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <form className={styles.panel} action={formAction}>
          <input type="hidden" name="vendorId" value={vendorId} />
          <div className={styles.copy}>
            <span className={styles.eyebrow}>내 업체 해제</span>
            <h2 id={titleId}>{vendorName} 연결을 해제할까요?</h2>
            <p>
              기존 작업·결제 이력은 유지되며 신규 작업 배정 후보에서만 제외됩니다.
              필요하면 업체 찾기에서 다시 등록할 수 있습니다.
            </p>
          </div>
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
            <button className={styles.confirmButton} type="submit" disabled={pending}>
              {pending ? "해제 중" : "내 업체에서 해제"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
