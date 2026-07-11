export type BriefingInput = {
  managerName: string;
  homeCount: number;                 // 관리 중인 집(계약 체결 기준) 수
  depositRatePct: number | null;     // 이번 달 입금률(%). 청구 데이터를 못 가져오면 null (위조 금지)
  overdueCount: number;              // 연체 청구 건수
  urgentTicketCount: number;         // 긴급 하자 건수
  openTicketCount: number;           // 진행 중 하자 전체 건수
  expiringContractCount: number;     // 30일 내 만료 계약 수
  unansweredThreadCount: number;     // 마지막 메시지가 세입자인(관리인 미응답) 메시징 스레드 수
};
