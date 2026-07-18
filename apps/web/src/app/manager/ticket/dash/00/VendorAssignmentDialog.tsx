"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { ManagerVendorView } from "@roomlog/types";
import { INITIAL_MANAGER_MUTATION_STATE } from "../../../_components/manager-mutation-state";
import { assignVendorFromDashboardAction } from "./vendor-assignment-actions";
import styles from "./VendorAssignmentDialog.module.css";

type VendorAssignmentDialogProps = {
  ticketId: string;
  currentVendorName?: string;
  vendors: readonly ManagerVendorView[];
  disabled?: boolean;
};

export function VendorAssignmentDialog({
  ticketId,
  currentVendorName,
  vendors,
  disabled = false,
}: VendorAssignmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    assignVendorFromDashboardAction,
    INITIAL_MANAGER_MUTATION_STATE,
  );
  const matchedVendors = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return vendors.filter((vendor) => vendor.status === "ACTIVE" && (
      !keyword
      || vendor.catalog.businessName.toLocaleLowerCase("ko").includes(keyword)
      || vendor.catalog.phone.toLocaleLowerCase("ko").includes(keyword)
    ));
  }, [query, vendors]);

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    setQuery("");
    router.refresh();
  }, [router, state.status]);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-label={`${currentVendorName ?? "미선정"} 업체 검색`}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Search aria-hidden="true" className={styles.searchIcon} />
        <span>{currentVendorName ?? "미선정"}</span>
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
          if (!pending && event.currentTarget === event.target) dialogRef.current?.close();
        }}
      >
        <form className={styles.panel} action={formAction} aria-busy={pending}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <header className={styles.header}>
            <span className={styles.eyebrow}>내 업체</span>
            <h2 id={titleId}>등록된 업체 검색</h2>
            <p id={descriptionId}>업체 등록에서 추가한 내 업체 중 하나를 선택해 배정합니다.</p>
          </header>
          <fieldset className={styles.fields} disabled={pending}>
            <label className={styles.searchField}>
              업체명 또는 전화번호
              <input
                className={styles.searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="업체명 또는 전화번호 검색"
                autoFocus
              />
            </label>
            <div className={styles.results} aria-live="polite">
              {matchedVendors.map((vendor) => (
                <button
                  key={vendor.vendorId}
                  className={styles.vendor}
                  type="submit"
                  name="vendorId"
                  value={vendor.vendorId}
                >
                  <strong>{vendor.catalog.businessName}</strong>
                  <span>{vendor.catalog.phone}</span>
                </button>
              ))}
              {matchedVendors.length === 0 ? (
                <p className={styles.empty}>검색 조건에 맞는 등록 업체가 없습니다.</p>
              ) : null}
            </div>
          </fieldset>
          {state.status === "error" ? <p className={styles.error} role="alert">{state.message}</p> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
            >
              취소
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
