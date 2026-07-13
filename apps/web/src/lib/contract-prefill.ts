import type { ManagerContractDetail } from "./contract-manager-api";

export type ContractManualValueInput = {
  deposit?: string;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  account?: string;
  startDate?: string;
  endDate?: string;
};

export function storedContractPrefillInput(detail: ManagerContractDetail): ContractManualValueInput {
  const contract = detail.row.contract;
  const input: ContractManualValueInput = {};

  if (termNeedsPrefill(detail)) {
    if (contract.startDate) input.startDate = contract.startDate;
    if (contract.endDate) input.endDate = contract.endDate;
  }

  if (needsStoredPrefill(detail, "월세") && contract.monthlyRent !== undefined) {
    input.monthlyRent = contract.monthlyRent;
  }

  if (needsStoredPrefill(detail, "관리비") && contract.maintenanceFee !== undefined) {
    input.maintenanceFee = contract.maintenanceFee;
  }

  if (needsStoredPrefill(detail, "납부일") && contract.paymentDay !== undefined) {
    input.paymentDay = contract.paymentDay;
  }

  const storedDeposit = manualInputValue(detail.manualValues.deposit);
  if (needsStoredPrefill(detail, "보증금") && storedDeposit) {
    input.deposit = storedDeposit;
  }

  const storedAccount = manualInputValue(detail.manualValues.account);
  if (needsStoredPrefill(detail, "임대인 계좌") && storedAccount) {
    input.account = storedAccount;
  }

  return input;
}

export function hasContractPrefillInput(input: ContractManualValueInput) {
  return Boolean(
    input.deposit ||
      input.account ||
      input.startDate ||
      input.endDate ||
      input.monthlyRent !== undefined ||
      input.maintenanceFee !== undefined ||
      input.paymentDay !== undefined,
  );
}

function needsStoredPrefill(detail: ManagerContractDetail, label: string) {
  const item = extractionItem(detail, label);
  return isMockOnlyExtractionItem(item) || isMissingDisplayValue(item?.value);
}

function termNeedsPrefill(detail: ManagerContractDetail) {
  const item = extractionItem(detail, "계약 기간");
  const value = item?.value?.trim() ?? "";
  if (isMockOnlyExtractionItem(item)) return true;
  return !value || value.includes("미확인") || value === "원문 확인 필요";
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
