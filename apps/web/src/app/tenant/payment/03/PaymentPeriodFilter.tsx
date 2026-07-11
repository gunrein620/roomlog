"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  paymentHistoryInclusiveDays,
  type TenantPaymentHistory,
  type TenantPaymentPeriodPreset,
} from "@roomlog/types";
import styles from "./payment-history.module.css";

const PRESETS: ReadonlyArray<{ value: TenantPaymentPeriodPreset; label: string }> = [
  { value: 1, label: "1개월" },
  { value: 3, label: "3개월" },
  { value: 6, label: "6개월" },
];

type PaymentPeriodFilterProps = {
  bounds: TenantPaymentHistory["bounds"];
  range: TenantPaymentHistory["range"];
  selectedPreset: TenantPaymentPeriodPreset | null;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PaymentPeriodFilter({
  bounds,
  range,
  selectedPreset,
}: PaymentPeriodFilterProps) {
  const router = useRouter();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState("");
  const customButtonRef = useRef<HTMLButtonElement>(null);
  const rangePanelRef = useRef<HTMLDivElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const panelId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!rangeOpen) return;
    fromInputRef.current?.focus();
  }, [rangeOpen]);

  function closeRange() {
    setRangeOpen(false);
    setError("");
    requestAnimationFrame(() => customButtonRef.current?.focus());
  }

  function selectPreset(value: TenantPaymentPeriodPreset) {
    setRangeOpen(false);
    setError("");
    router.replace(`/tenant/payment/03?preset=${value}`);
  }

  function toggleRange() {
    if (rangeOpen) {
      closeRange();
      return;
    }
    setFrom(range.from);
    setTo(range.to);
    setError("");
    setRangeOpen(true);
  }

  function rangeIsTooLong() {
    try {
      return paymentHistoryInclusiveDays(from, to) > bounds.maxDays;
    } catch {
      return true;
    }
  }

  function applyRange() {
    if (
      !from ||
      !to ||
      from < bounds.min ||
      to > bounds.max ||
      from > to ||
      rangeIsTooLong()
    ) {
      setError(
        `조회 기간은 ${bounds.min}부터 ${bounds.max}까지 선택해 주세요. 한 번에 최대 ${bounds.maxDays}일까지 조회할 수 있어요.`,
      );
      return;
    }

    setError("");
    setRangeOpen(false);
    const params = new URLSearchParams({ from, to });
    router.replace(`/tenant/payment/03?${params.toString()}`);
  }

  function handleOverlayClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) closeRange();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRange();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(
      rangePanelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const descriptionIds = error ? `${hintId} ${errorId}` : hintId;

  return (
    <section className={styles.filterShell} aria-label="납부 기록 조회 기간">
      <div className={styles.filterBar}>
        {PRESETS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={styles.periodButton}
            aria-pressed={selectedPreset === value}
            onClick={() => selectPreset(value)}
          >
            {label}
          </button>
        ))}
        <button
          ref={customButtonRef}
          type="button"
          className={styles.periodButton}
          aria-pressed={selectedPreset === null}
          aria-expanded={rangeOpen}
          aria-controls={panelId}
          onClick={toggleRange}
        >
          기간 선택
        </button>
      </div>

      <p className={styles.rangeSummary} aria-live="polite">
        조회 기간 <strong>{range.from}</strong> ~ <strong>{range.to}</strong>
      </p>

      {rangeOpen && (
        <div className={styles.rangeOverlay} onMouseDown={handleOverlayClick}>
          <div
            ref={rangePanelRef}
            id={panelId}
            className={styles.rangePanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionIds}
            onKeyDown={handleDialogKeyDown}
          >
            <div className={styles.rangeHeader}>
              <div>
                <h2 id={titleId} className={styles.rangeTitle}>기간 선택</h2>
                <p id={hintId} className={styles.rangeHint}>
                  계약 시작일 {bounds.min}부터 오늘 {bounds.max}까지, 최대 {bounds.maxDays}일
                </p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeRange}>
                <span aria-hidden="true">×</span>
                <span className={styles.visuallyHidden}>기간 선택 닫기</span>
              </button>
            </div>

            <div className={styles.dateFields}>
              <label className={styles.dateField}>
                <span>시작일</span>
                <input
                  ref={fromInputRef}
                  type="date"
                  value={from}
                  min={bounds.min}
                  max={bounds.max}
                  aria-describedby={descriptionIds}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setError("");
                  }}
                />
              </label>
              <label className={styles.dateField}>
                <span>종료일</span>
                <input
                  type="date"
                  value={to}
                  min={bounds.min}
                  max={bounds.max}
                  aria-describedby={descriptionIds}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setError("");
                  }}
                />
              </label>
            </div>

            {error && (
              <p id={errorId} className={styles.rangeError} role="alert">
                {error}
              </p>
            )}

            <button type="button" className={styles.applyButton} onClick={applyRange}>
              이 기간 조회
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
