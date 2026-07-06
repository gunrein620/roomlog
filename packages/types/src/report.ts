// 관리인 리포트 도메인 공유 모델 (관리인 리포트 표면 M-RPT · web·api 공용)
// 근거: roomlog_screens_report.md — 기간 서술형 종합 리포트 생성·열람·임대인 보고 + 질의 챗봇.
// 원칙:
//  - D24 리포트 1차 용도=임대인 보고. 챗봇 답=조회·초안 제안까지(발송 아님) — 실제 발송은
//    M-BILL-05/M-MSG-00에서 원본 행 대조 후. '틀린 확신' 발송 차단.
//  - D25 생성형 신뢰=검증 가능성. 출처 배지 섹션당 1개·고지 리포트당 1회·드릴다운=원천 데이터 행·
//    기준시점 명시(경고 도배 금지).
//  - 기준시점: 리포트=생성 시점 스냅샷(snapshotAt). 챗봇 금액성 질의=실시간 M-BILL 산식,
//    비금전 질의(분류·요약)=저장 결과 우선.
//  - KPI 산식 범위 정직: 납부 수치(수납률·미납)=M-BILL 단일 산식. 그 외(공실·민원·수리비·비용)는
//    각 원천(호실=#2·민원=M-DASH·비용=M-COST) — 'M-BILL이 전부 덮는다'는 거짓 금지.

/** 리포트 기간 (M-RPT-01) — 주/월/분기 서술형 종합. */
export type ReportPeriod = "week" | "month" | "quarter";

/** 보고 상태 (M-RPT-00 목록) — 초안 / 임대인 전달됨. */
export type ReportStatus = "draft" | "delivered";

/**
 * 출처 종류 (D25 검증가능성) — 섹션·KPI·챗봇 답이 딛고 선 원천 세트.
 * KPI 산식 범위 정직의 근거: billing만이 납부 단일 산식이고 나머지는 각 원천.
 */
export type ReportSourceKind =
  | "billing" // 납부·연체 — M-BILL 단일 산식 (수납률·미납·실수납)
  | "complaint" // 민원·처리율 — M-DASH
  | "cost" // 지출·수리비 — M-COST
  | "unit" // 호실 원장·공실 — M-OUT·M-DOC (#2)
  | "metric" // 실시간 지표 — M-HOME
  | "contract" // 계약 — M-DOC
  | "moveout" // 퇴실 — M-OUT
  | "messaging"; // 공지·스레드 — M-MSG

/**
 * 담당 스코프 (#17 서버 강제) — 조회·목록·드릴다운·내보내기가 담당 건물로 제한된다(문구 아님).
 * unitIds 미지정이면 건물 전체.
 */
export interface ReportScope {
  buildingId: string;
  buildingName: string;
  unitIds?: string[];
}

/**
 * 보고 수신자 = 임대인 (D24). 룸로그 계정(account) 또는 외부 전달(external) 구분 —
 * 임대인 계정/권한은 별도 슬라이스 후보(스펙 미결).
 */
export interface ReportRecipient {
  id: string;
  name: string;
  role: "landlord";
  delivery: "account" | "external";
}

/**
 * 출처 배지 + 근거 체인 (D25) — 섹션당 1개. 드릴다운은 요약 화면이 아니라 원천 데이터 행으로.
 */
export interface ReportSource {
  kind: ReportSourceKind;
  label: string; // 배지 표기 (예: "M-BILL 연체 원장")
  /** 원천 행 드릴다운 대상 화면 ID (예: "M-BILL-04", "M-DASH-00", "M-COST-03", "M-OUT-01", "M-HOME-02"). */
  drilldownScreenId: string;
  basis: string; // 근거 한 줄 (예: "6월 청구 12건 중 미납 3건 원장")
}

/**
 * 리포트 KPI — 산식 범위 정직(D25). formulaSource로 어느 원천 산식인지 명시:
 * 납부(billing)만 M-BILL 단일 산식, 나머지는 각 원천.
 */
export interface ReportKpi {
  label: string;
  value: string; // 표시 문자열 (예: "92%", "3세대", "757,400원")
  unit?: string;
  formulaSource: ReportSourceKind;
}

/**
 * 서술형 리포트 섹션 (M-RPT-02) — 9섹션은 접힘/탭 점진 공개. 펼칠 때만 노출.
 * 배지 도배 방지(D25): 섹션당 출처 1개 + 요약 핵심 수치만.
 */
export interface ReportSection {
  key: string;
  title: string;
  summary: string; // 요약 핵심 수치 (배지 도배 대신 이것만)
  source: ReportSource; // 섹션당 1개 (D25)
  kpis?: ReportKpi[];
}

/**
 * 다음 조치 (M-RPT-02 체크리스트) — 독촉/공지. payload로 대상세대·청구건·기간을 pre-fill해
 * M-BILL-05/M-MSG-00으로 넘기되, 실제 발송은 거기서 원본 대조 후(D24 · D20 단일 책임).
 */
export interface ReportNextAction {
  label: string;
  actionType: "dunning" | "notice"; // 독촉(M-BILL-05) / 공지(M-MSG-00)
  targetScreenId: string; // "M-BILL-05" | "M-MSG-00"
  payload: {
    unitIds?: string[]; // 대상 세대
    billIds?: string[]; // 청구건
    periodLabel?: string; // 기간
    note?: string;
  };
}

/**
 * 서술형 종합 리포트 (M-RPT-02) — 생성 시점 스냅샷. 핵심 요약 + 다음 조치 2블록 우선,
 * 9섹션 접힘. 상단 고지(disclaimer)는 리포트당 1회.
 */
export interface Report {
  id: string;
  period: ReportPeriod;
  periodLabel: string; // 예: "2026년 6월"
  periodStart: string; // ISO
  periodEnd: string; // ISO
  scope: ReportScope;
  status: ReportStatus;
  /** 기준시점 — 생성 시점 스냅샷(헤더 표기용). 스냅샷 미납액으로 잘못 독촉 방지. */
  snapshotAt: string; // ISO
  recipient?: ReportRecipient; // 보고 수신자(임대인)
  /** 상단 고지 1회 (D25) — 예: "AI 정리 스냅샷 — 원본 기준". */
  disclaimer: string;
  summary: string; // 핵심 요약 블록
  nextActions: ReportNextAction[]; // 다음 조치 블록(체크리스트)
  sections: ReportSection[]; // 9섹션(접힘)
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string; // status=delivered 시 임대인 전달 시각
}

/** 내보내기 형식 (M-RPT-03). link=임대인 링크 전달. */
export type ExportFormat = "pdf" | "excel" | "link";

/**
 * 감사 로그 (D7 · #17 660) — 외부 공유·전달·내보내기 행위 기록.
 */
export interface AuditLogEntry {
  action: string; // 예: "임대인 링크 전달", "PDF 내보내기"
  actor: string; // 수행자 (예: "관리인 김병주")
  at: string; // ISO
  detail?: string;
}

/**
 * 임대인 보고·내보내기 (M-RPT-03 마스킹 게이트) — 외부 공유 시 마스킹 강제(토글 제거).
 * masked=false는 재확인 게이트(D7)를 통과한 예외로만 허용.
 */
export interface ReportDelivery {
  reportId: string;
  format: ExportFormat;
  /** 외부 공유 시 강제 true. false면 "임차인 실명·계좌·연락처 그대로 포함" 재확인 게이트 통과분. */
  masked: boolean;
  recipient: ReportRecipient;
  auditLog: AuditLogEntry[];
}

/**
 * 챗봇 답변 기준시점 (D25) — 금액성=실시간 M-BILL 산식, 비금전(분류·요약)=저장 결과 우선.
 */
export type QueryReferenceBasis = "realtime_billing" | "stored_analysis";

/**
 * 챗봇 초안 제안 (M-RPT-04/05) — 발송 아님(D24). 대상·기간 pre-fill해 원천 세트로 넘김.
 */
export interface ChatDraftSuggestion {
  type: "dunning" | "notice";
  targetScreenId: string; // "M-BILL-05" | "M-MSG-00"
  payload: {
    unitIds?: string[];
    billIds?: string[];
    periodLabel?: string;
    note?: string;
  };
}

/**
 * 챗봇 답변 카드 (M-RPT-04/05). 해석 질의 재진술 + 다건물 disambiguation + 기준시점 +
 * 수치·출처 + 원천 행 드릴다운 + 데이터 없으면 '모름/권한 밖' 정직. 발송≠직접(초안만).
 */
export interface ChatAnswer {
  id: string;
  interpretedQuery: string; // 해석 질의 재진술 (오해 방지)
  /** 다건물 호실 disambiguation (예: "어느 건물 302호?"). 필요 없으면 undefined. */
  disambiguation?: string;
  basis: QueryReferenceBasis; // 금액성=실시간 / 비금전=저장
  answer: string; // 축약 답변 본문
  kpis?: ReportKpi[];
  sources: ReportSource[]; // 출처 + 원천 행 드릴다운
  /** 데이터 없음/권한 밖 정직 표기 — 있으면 answer 대신 '모름' 응답. */
  unknownReason?: string;
  /** 독촉/공지 초안 제안 (발송 아님 — D24). */
  draft?: ChatDraftSuggestion;
  createdAt: string;
}

/** 챗봇 대화 메시지 (M-RPT-04). assistant면 answer 동반. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: ChatAnswer;
}

/**
 * 자주 묻는 질문 (M-RPT-05 FAQ 버튼 1급) — 어르신 오인식 방지로 음성보다 우선(정직 강등).
 */
export interface FaqQuestion {
  id: string;
  label: string; // 버튼 표기 (예: "미납 호실")
  query: string; // 실제 질의 (챗봇 전송값)
}
