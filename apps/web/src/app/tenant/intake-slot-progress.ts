export type TenantIntakeSlotStatus = "COLLECTED" | "NEEDS_INFO" | "OPTIONAL";

export type TenantIntakeSlot = {
  key: string;
  label: string;
  status: TenantIntakeSlotStatus;
  value?: string;
  evidence: string;
  action?: string;
};

export function intakeSlotStatusLabel(status: TenantIntakeSlotStatus) {
  if (status === "COLLECTED") {
    return "확인됨";
  }

  if (status === "NEEDS_INFO") {
    return "확인 필요";
  }

  return "선택";
}

export function intakeSlotProgress(slots: TenantIntakeSlot[]) {
  const collected = slots.filter((slot) => slot.status === "COLLECTED").length;
  const open = slots.filter((slot) => slot.status === "NEEDS_INFO").length;
  const total = slots.length;
  const percent = total ? Math.round((collected / total) * 100) : 0;

  return {
    collected,
    open,
    total,
    percent,
    label: open
      ? `${collected}/${total} 확인됨 · ${open}개 추가 확인 필요`
      : `${collected}/${total} 확인됨 · 접수 가능`
  };
}
