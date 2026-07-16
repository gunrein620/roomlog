"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { ManagerBillingScope } from "@roomlog/types";
import { buildBillingScopeHref, shiftBillingMonth } from "@/lib/billing-manager-workspace";
import styles from "./billing-workspace.module.css";

interface BillingWorkspaceHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  basePath: string;
  scope: ManagerBillingScope;
  month?: string;
  asOf?: string;
  actionHref?: string;
  actionLabel?: string;
}

export function BillingWorkspaceHeader({
  eyebrow,
  title,
  description,
  basePath,
  scope,
  month,
  asOf,
  actionHref,
  actionLabel,
}: BillingWorkspaceHeaderProps) {
  const router = useRouter();

  function navigate(next: { building?: string; month?: string }) {
    router.push(buildBillingScopeHref(basePath, next));
  }

  function selectedBuilding(value: string) {
    navigate({ building: value || undefined, month });
  }

  function selectedMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) return;
    navigate({ building: scope.selectedBuilding, month: value });
  }

  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.pageTitle}>{title}</h2>
        <p className={styles.pageDescription}>{description}</p>
      </div>

      <div className={styles.headerControls}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="billing-building">
            건물
          </label>
          <div className={styles.scopeControls}>
            <Building2 aria-hidden="true" size={16} />
            <select
              id="billing-building"
              className={styles.select}
              value={scope.selectedBuilding ?? ""}
              onChange={(event) => selectedBuilding(event.target.value)}
            >
              <option value="">전체 건물</option>
              {scope.buildings.map((building) => (
                <option key={building.buildingName} value={building.buildingName}>
                  {building.buildingName} · {building.roomCount}호실
                </option>
              ))}
            </select>
          </div>
        </div>

        {month ? (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="billing-month">
              청구 월
            </label>
            <div className={styles.monthControl}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="이전 달"
                title="이전 달"
                onClick={() => selectedMonth(shiftBillingMonth(month, -1))}
              >
                <ChevronLeft aria-hidden="true" size={16} />
              </button>
              <input
                id="billing-month"
                type="month"
                className={styles.monthInput}
                value={month}
                onChange={(event) => selectedMonth(event.target.value)}
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label="다음 달"
                title="다음 달"
                onClick={() => selectedMonth(shiftBillingMonth(month, 1))}
              >
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        ) : asOf ? (
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>기준일</span>
            <div className={`${styles.monthControl} ${styles.asOfControl}`}>
              <CalendarDays aria-hidden="true" size={16} />
              <span className={styles.smallPill}>{asOf}</span>
            </div>
          </div>
        ) : null}

        {actionHref && actionLabel ? (
          <Link className={styles.primaryLink} href={actionHref}>
            <Plus aria-hidden="true" size={16} />
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
