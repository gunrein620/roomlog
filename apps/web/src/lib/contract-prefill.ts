import type { ManagerContractDetail } from "./contract-manager-api";

export type ContractManualValueInput = {
  deposit?: string;
};

export function storedContractPrefillInput(detail: ManagerContractDetail): ContractManualValueInput {
  const input: ContractManualValueInput = {};

  const storedDeposit = manualInputValue(detail.manualValues.deposit);
  if (needsStoredPrefill(detail, "보증금") && storedDeposit) {
    input.deposit = storedDeposit;
  }

  return input;
}

export function hasContractPrefillInput(input: ContractManualValueInput) {
  return Boolean(input.deposit);
}

function needsStoredPrefill(detail: ManagerContractDetail, label: string) {
  const item = extractionItem(detail, label);
  return isMockOnlyExtractionItem(item) || isMissingDisplayValue(item?.value);
}

function extractionItem(detail: ManagerContractDetail, label: string) {
  return detail.extraction.items.find((item) => item.label === label);
}

function manualInputValue(value?: string) {
  const trimmed = value?.trim() ?? "";
  return /^관리자 수동값 없음$|^미등록$|^없음$/u.test(trimmed) ? "" : trimmed;
}

function isMissingDisplayValue(value?: string) {
  const normalized = value?.trim();
  return !normalized || normalized === "미확인" || normalized === "없음" || normalized === "원문 확인 필요";
}

function isMockOnlyExtractionItem(item?: ManagerContractDetail["extraction"]["items"][number]) {
  const evidence = item?.evidence ?? "";
  if (/관리자 수동 입력|OCR 미확인으로 기존 DB 계약값 유지/i.test(evidence)) return false;
  return /mock OCR|OCR 미확인으로 기존 DB 계약값 유지|실제 OCR 실패\/미설정/i.test(evidence);
}
