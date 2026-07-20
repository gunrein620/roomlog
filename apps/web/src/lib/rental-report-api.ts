import type { RentalReport, RentalReportPeriodMonths } from "@roomlog/types";
import { serverFetch } from "./server-api";

/** 관리 홈 임대 현황 리포트. 수익은 청구액이 아닌 실제 수납액을 사용한다. */
export function getManagerRentalReport(periodMonths: RentalReportPeriodMonths): Promise<RentalReport> {
  return serverFetch(`/manager/rental-report?months=${periodMonths}`);
}
