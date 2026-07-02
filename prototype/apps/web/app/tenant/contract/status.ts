import type {
  Contract,
  ContractLifecycle,
  ContractReview,
  DeletionState,
} from "@roomlog/types";

// 계약 상태 다차원(생애주기 × 검토 × 보관) → 임차인 배지.
// 스펙 (D-table): 세 차원은 동시 성립하되, 임차인 배지는 우선순위 1개만 노출.
// 정직 표기: '확정'은 관리자 경유(review=confirmed)에만. 그 전은 '검토 전 참고본'.

export const LIFECYCLE_LABEL: Record<ContractLifecycle, string> = {
  unregistered: "계약서 미등록",
  analyzing: "분석 중",
  active: "계약 유효",
  expiring_soon: "만료 예정",
  expired: "만료",
};

export const REVIEW_LABEL: Record<ContractReview, string> = {
  pending: "검토 전 참고본",
  info_requested: "보완 요청",
  confirmed: "확정됨",
};

export const DELETION_LABEL: Record<DeletionState, string> = {
  none: "",
  requested: "삭제 처리 중",
  completed: "삭제 완료",
  limited: "제한 보관",
  denied: "삭제 불가",
};

/** 우선순위 배지 1개: 보관(삭제) > 검토 > 생애주기. 확정 전이면 '검토 전 참고본' 강조. */
export function priorityBadge(contract: Contract): { label: string; emphasis: boolean } {
  if (contract.deletion !== "none") {
    return { label: DELETION_LABEL[contract.deletion], emphasis: true };
  }
  if (contract.review === "info_requested") {
    return { label: REVIEW_LABEL.info_requested, emphasis: true };
  }
  if (contract.review === "pending" && contract.lifecycle !== "unregistered") {
    return { label: REVIEW_LABEL.pending, emphasis: true };
  }
  if (contract.lifecycle === "expiring_soon" || contract.lifecycle === "expired") {
    return { label: LIFECYCLE_LABEL[contract.lifecycle], emphasis: true };
  }
  if (contract.review === "confirmed") {
    return { label: REVIEW_LABEL.confirmed, emphasis: false };
  }
  return { label: LIFECYCLE_LABEL[contract.lifecycle], emphasis: false };
}

/** 만료 D-day 계산 (오늘 기준 남은 일수). endDate 없으면 undefined. */
export function daysUntil(endDate?: string): number | undefined {
  if (!endDate) return undefined;
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

/** 원 단위 → "65만원" 같은 생활어. undefined면 '미확인'. */
export function won(amount?: number): string {
  if (amount == null) return "미확인";
  if (amount >= 10000) {
    const man = amount / 10000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만원`;
  }
  return `${amount.toLocaleString()}원`;
}
