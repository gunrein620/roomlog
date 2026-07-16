"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { CircleAlert, FileCheck2 } from "lucide-react";
import type {
  ManagerBillCreationData,
  ManagerBillCreationUnavailableReason,
} from "@roomlog/types";
import { buildBillingScopeHref } from "@/lib/billing-manager-workspace";
import { createBillsAction, type CreateBillsActionState } from "./new/actions";
import styles from "./billing-workspace.module.css";

const initialState: CreateBillsActionState = {};

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

const unavailableReasonLabel: Record<ManagerBillCreationUnavailableReason, string> = {
  NO_CONTRACT: "연결된 계약 없음",
  CONTRACT_NOT_ACTIVE: "활성 계약 아님",
  CONTRACT_NOT_CONFIRMED: "관리자 확정 필요",
  CONTRACT_VALUES_NOT_CONFIRMED: "계약 금액 확정 필요",
  MONTHLY_RENT_MISSING: "월세 미등록",
  MAINTENANCE_FEE_MISSING: "관리비 미등록",
  BILL_AMOUNT_INVALID: "청구 금액 확인 필요",
  PAYMENT_DAY_MISSING: "납부일 미등록",
  PAYMENT_DAY_INVALID: "납부일 확인 필요",
};

export function ManagerBillCreateForm({ data }: { data: ManagerBillCreationData }) {
  const router = useRouter();
  const initialBuilding = data.scope.selectedBuilding ?? data.scope.buildings[0]?.buildingName ?? "";
  const buildingName = initialBuilding;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(createBillsAction, initialState);
  const options = useMemo(
    () => data.options.filter((option) => option.buildingName === buildingName),
    [buildingName, data.options],
  );
  const unavailableOptions = useMemo(
    () => data.unavailableOptions.filter((option) => option.buildingName === buildingName),
    [buildingName, data.unavailableOptions],
  );
  const selectable = data.readOnly
    ? []
    : options.filter((option) => !option.duplicateBillId);
  const selectedCount = selectable.filter((option) => selected.has(option.roomId)).length;
  const selectedTotal = selectable
    .filter((option) => selected.has(option.roomId))
    .reduce((sum, option) => sum + option.monthlyRent + option.maintenanceFee, 0);

  function changeBuilding(value: string) {
    setSelected(new Set());
    router.push(
      buildBillingScopeHref("/manager/billing/new", {
        building: value,
        month: data.billingMonth,
      }),
    );
  }

  function toggleRoom(roomId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedCount === selectable.length && selectable.length > 0) setSelected(new Set());
    else setSelected(new Set(selectable.map((option) => option.roomId)));
  }

  return (
    <form action={formAction} className={styles.workspace}>
      <input type="hidden" name="billingMonth" value={data.billingMonth} />

      {state.error ? (
        <div className={styles.errorNotice} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          {state.error}
        </div>
      ) : null}

      {data.readOnly ? (
        <div className={styles.errorNotice} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          청구 API에 연결되지 않아 조회용 예시만 표시하고 있습니다. 연결을 확인한 뒤 다시 시도해주세요.
        </div>
      ) : null}

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>1. 청구 범위</p>
            <h2 className={styles.formSectionTitle}>건물과 청구월</h2>
          </div>
          <span className={styles.smallPill}>초안만 저장</span>
        </div>
        <div className={styles.accountGrid}>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>청구 대상 건물</span>
            <select name="buildingName" className={styles.select} value={buildingName} onChange={(event) => changeBuilding(event.target.value)} required>
              {data.scope.buildings.map((building) => (
                <option key={building.buildingName} value={building.buildingName}>{building.buildingName} · {building.roomCount}호실</option>
              ))}
            </select>
          </label>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>청구월</span>
            <div className={`${styles.input} ${styles.readOnlyInput}`}>{data.billingMonth}</div>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>생성 가능한 계약</span>
            <div className={`${styles.input} ${styles.readOnlyInput}`}>{selectable.length}개 호실</div>
          </div>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formSectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>2. 수납 계좌</p>
            <h2 className={styles.formSectionTitle}>임차인에게 표시할 계좌</h2>
          </div>
          <span className={styles.muted}>최근 청구서 계좌를 불러왔습니다.</span>
        </div>
        <div className={styles.accountGrid}>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>은행</span>
            <input className={styles.input} name="bankName" defaultValue={data.account.bankName} required />
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>계좌번호</span>
            <input className={styles.input} name="accountNumber" defaultValue={data.account.accountNumber} required />
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>예금주</span>
            <input className={styles.input} name="accountHolder" defaultValue={data.account.accountHolder} required />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeadingBlock}>
            <p className={styles.sectionEyebrow}>3. 계약별 청구 항목</p>
            <h2 className={styles.sectionTitle}>월세·관리비와 납부기한 검토</h2>
          </div>
          <div className={styles.selectionMeta}>
            <span className={styles.smallPill}>{selectedCount}호실 선택</span>
            <strong>{won(selectedTotal)}</strong>
          </div>
        </div>

        {options.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.optionTable}>
              <thead>
                <tr>
                  <th>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      aria-label="생성 가능한 호실 전체 선택"
                      checked={selectable.length > 0 && selectedCount === selectable.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>호실</th>
                  <th>임차인</th>
                  <th>월세</th>
                  <th>관리비</th>
                  <th>납부기한</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {options.map((option) => {
                  const disabled = data.readOnly || Boolean(option.duplicateBillId);
                  return (
                    <tr key={option.roomId} className={disabled ? styles.disabledRow : undefined}>
                      <td>
                        <input
                          className={styles.checkbox}
                          type="checkbox"
                          name="selectedRoomId"
                          value={option.roomId}
                          checked={!disabled && selected.has(option.roomId)}
                          disabled={disabled}
                          onChange={() => toggleRoom(option.roomId)}
                          aria-label={`${option.unitId}호 청구 선택`}
                        />
                        <input type="hidden" name={`contractId:${option.roomId}`} value={option.contractId} />
                      </td>
                      <td>{option.unitId}호</td>
                      <td>{option.tenantName}</td>
                      <td><input className={styles.moneyInput} type="number" min="0" step="1" name={`monthlyRent:${option.roomId}`} defaultValue={option.monthlyRent} disabled={disabled} required={!disabled && selected.has(option.roomId)} /></td>
                      <td><input className={styles.moneyInput} type="number" min="0" step="1" name={`maintenanceFee:${option.roomId}`} defaultValue={option.maintenanceFee} disabled={disabled} required={!disabled && selected.has(option.roomId)} /></td>
                      <td><input className={styles.dateInput} type="date" name={`dueDate:${option.roomId}`} defaultValue={option.dueDate} disabled={disabled} required={!disabled && selected.has(option.roomId)} /></td>
                      <td>
                        {data.readOnly ? (
                          <span className={styles.statusPill} data-state="unavailable">조회 전용</span>
                        ) : disabled ? (
                          <span className={styles.statusPill} data-state="draft">이미 생성됨</span>
                        ) : (
                          <span className={styles.smallPill}>생성 가능</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            {unavailableOptions.length
              ? "현재 청구서를 생성할 수 있는 계약이 없습니다. 아래에서 호실별 확인 사항을 볼 수 있습니다."
              : "이 건물에는 등록된 호실이 없습니다."}
          </div>
        )}

        {unavailableOptions.length ? (
          <details className={styles.unavailableDetails}>
            <summary>
              <span>생성 전 확인이 필요한 호실</span>
              <strong>{unavailableOptions.length}개 · 사유 보기</strong>
            </summary>
            <div className={styles.tableScroll}>
              <table className={`${styles.optionTable} ${styles.unavailableTable}`}>
                <thead>
                  <tr>
                    <th>호실</th>
                    <th>임차인</th>
                    <th>확인 사항</th>
                  </tr>
                </thead>
                <tbody>
                  {unavailableOptions.map((option) => (
                    <tr key={`unavailable-${option.roomId}`}>
                      <td>{option.unitId}호</td>
                      <td>{option.tenantName}</td>
                      <td>
                        <div className={styles.unavailableReasonCell}>
                          <span className={styles.statusPill} data-state="unavailable">확인 필요</span>
                          <span className={styles.optionReason}>
                            {option.reasons.length
                              ? option.reasons.map((reason) => unavailableReasonLabel[reason]).join(" · ")
                              : "계약 정보를 확인해주세요."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </section>

      <div className={styles.infoNotice}>
        <FileCheck2 aria-hidden="true" size={18} />
        납부기한은 계약의 매월 납부일을 기준으로 자동 입력되며 청구월 안에서 수정할 수 있습니다. 저장한 초안은 임차인에게 자동 발송되지 않습니다.
      </div>

      <div className={styles.formActions}>
        <button className={styles.submitButton} type="submit" disabled={pending || selectedCount === 0}>
          {pending ? "초안 저장 중…" : `${selectedCount}건 청구 초안 저장`}
        </button>
      </div>
    </form>
  );
}
