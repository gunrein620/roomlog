/**
 * 관리 홈의 임대 현황 리포트(M-HOME-02) 집계 계약.
 * 수익은 청구액이 아니라 실제 수납 완료 금액(paidAmount)이며, 값이 없는 비율 지표는
 * 0으로 추정하지 않고 null로 내려보낸다.
 */
export type RentalReportPeriodMonths = 6 | 12;

export interface RentalReportPoint {
  /** YYYY-MM */
  month: string;
  /** 취소·정정 청구를 제외한 해당 청구월의 실제 수납액 합계(원). */
  collectedAmount: number;
  /** 확정 또는 정정된 수리비 지출 합계(원). */
  repairCostAmount: number;
  /** 해당 월 말일 기준 유효 계약 호실 비율. 관리 호실이 없으면 null. */
  occupancyRate: number | null;
  /** 해당 월 접수 민원 중 같은 달 완료된 비율. 접수 민원이 없으면 null. */
  ticketResolutionRate: number | null;
}

export interface RentalReport {
  periodMonths: RentalReportPeriodMonths;
  points: RentalReportPoint[];
}
