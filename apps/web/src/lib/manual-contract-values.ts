const MISSING_MANUAL_VALUE = "관리자 수동값 없음";

export function parseOptionalSafeNonNegativeInteger(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new TypeError("금액과 납부일 입력은 문자열이어야 합니다.");
  }

  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+$/u.test(normalized)) {
    throw new RangeError("숫자 입력은 0 이상의 안전한 정수여야 합니다.");
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError("숫자 입력은 0 이상의 안전한 정수여야 합니다.");
  }
  return parsed;
}

export function editableManualTextValue(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized === MISSING_MANUAL_VALUE ? "" : normalized;
}
