export type ContractConfirmationField =
  | "startDate"
  | "endDate"
  | "monthlyRent"
  | "maintenanceFee"
  | "paymentDay";

export type ContractConfirmationIssue = {
  field: ContractConfirmationField;
  label: string;
  message: string;
};

type ContractConfirmationCandidate = {
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
};

const FIELD_LABELS: Record<ContractConfirmationField, string> = {
  startDate: "계약 시작일",
  endDate: "계약 종료일",
  monthlyRent: "월세",
  maintenanceFee: "관리비",
  paymentDay: "납부일",
};

export function contractConfirmationIssues(
  contract: ContractConfirmationCandidate,
  todayKey = todayInSeoulKey(),
): ContractConfirmationIssue[] {
  const issues: ContractConfirmationIssue[] = [];
  const startDate = validDateKey(contract.startDate);
  const endDate = validDateKey(contract.endDate);

  if (!contract.startDate) {
    issues.push(issue("startDate", "계약 시작일을 입력해 주세요."));
  } else if (!startDate) {
    issues.push(issue("startDate", "계약 시작일을 올바른 날짜로 입력해 주세요."));
  }

  if (!contract.endDate) {
    issues.push(issue("endDate", "계약 종료일을 입력해 주세요."));
  } else if (!endDate) {
    issues.push(issue("endDate", "계약 종료일을 올바른 날짜로 입력해 주세요."));
  } else if (startDate && endDate < startDate) {
    issues.push(issue("endDate", "계약 종료일은 시작일보다 빠를 수 없습니다."));
  } else if (endDate < todayKey) {
    issues.push(issue("endDate", "이미 종료된 계약입니다. 계약 종료일을 확인해 주세요."));
  }

  const rentValid = validNonNegativeAmount(contract.monthlyRent);
  const maintenanceFeeValid = validNonNegativeAmount(contract.maintenanceFee);

  if (contract.monthlyRent === undefined) {
    issues.push(issue("monthlyRent", "월세를 입력해 주세요. 월세가 없으면 0원을 입력하세요."));
  } else if (!rentValid) {
    issues.push(issue("monthlyRent", "월세는 0 이상의 원 단위 정수로 입력해 주세요."));
  }

  if (contract.maintenanceFee === undefined) {
    issues.push(issue("maintenanceFee", "관리비를 입력해 주세요. 관리비가 없으면 0원을 입력하세요."));
  } else if (!maintenanceFeeValid) {
    issues.push(issue("maintenanceFee", "관리비는 0 이상의 원 단위 정수로 입력해 주세요."));
  }

  if (rentValid && maintenanceFeeValid) {
    const totalAmount = contract.monthlyRent! + contract.maintenanceFee!;

    if (!Number.isSafeInteger(totalAmount)) {
      issues.push(issue("monthlyRent", "월세와 관리비 합계가 너무 큽니다. 금액을 확인해 주세요."));
    } else if (totalAmount > 0) {
      if (contract.paymentDay === undefined) {
        issues.push(issue("paymentDay", "납부일을 입력해 주세요."));
      } else if (!Number.isInteger(contract.paymentDay) || contract.paymentDay < 1 || contract.paymentDay > 31) {
        issues.push(issue("paymentDay", "납부일은 1일부터 31일 사이로 입력해 주세요."));
      }
    }
  }

  return issues;
}

export function confirmationFieldsFromMessage(message: string): ContractConfirmationField[] {
  const fields: ContractConfirmationField[] = [];

  if (/계약 시작일|시작일/u.test(message)) fields.push("startDate");
  if (/계약 종료일|종료일|종료된 계약/u.test(message)) fields.push("endDate");
  if (/월세/u.test(message)) fields.push("monthlyRent");
  if (/관리비/u.test(message)) fields.push("maintenanceFee");
  if (/납부일/u.test(message)) fields.push("paymentDay");

  return [...new Set(fields)];
}

export function parseConfirmationFields(value?: string): ContractConfirmationField[] {
  if (!value) return [];

  const fields = value
    .split(",")
    .filter((field): field is ContractConfirmationField =>
      Object.prototype.hasOwnProperty.call(FIELD_LABELS, field),
    );

  return [...new Set(fields)];
}

export function confirmationFieldLabel(field: ContractConfirmationField) {
  return FIELD_LABELS[field];
}

function issue(field: ContractConfirmationField, message: string): ContractConfirmationIssue {
  return { field, label: FIELD_LABELS[field], message };
}

function validNonNegativeAmount(value?: number): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function validDateKey(value?: string) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function todayInSeoulKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}
