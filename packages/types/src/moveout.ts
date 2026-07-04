// 퇴실(T-OUT) 도메인 공유 모델 — 임차인 퇴실 준비·기록 리포트·예상 정산·이의
// 근거: roomlog_screens_moveout.md 세트 A(임차인). 수렴 슬라이스 — 하자·납부·계약서를 누적 종합(신규 입력은 체크리스트만).
// 원칙(스펙 핵심 긴장):
//   · 참고용 증빙, 확정 아님 — 예상 반환액은 단일 숫자 금지 → 범위(min/max)로만 표기.
//   · 존엄 — 훼손 추정은 '확정'이 아닌 '가능성'(WearVerdict)만, 비적대(노후/마모 vs 훼손) + 이의 인접.
//   · 게이트 함정 차단 — 이의는 양방향 상태머신 + 무응답 SLA·에스컬레이션 출구.
//   · D15 캐스케이드 — 종료일·차감 후보는 계약서 확정값에서. 미확정 호실은 안내로 차단.
//   · 입주전 사진 공백 ≠ 책임 추정.

/** 퇴실/정산 검토 상태 — 관리인 진행 ↔ 임차인 표시(D-table). '확정' 아닌 '검토 완료(예상안)'. */
export type SettlementStatus =
  | "estimate" // 예상 정산안 작성(참고)
  | "reviewing" // 검토 중
  | "review_done" // 검토 완료(예상안) — 차감 확정 아님
  | "re_review"; // 확정 후 새 이의 → 재검토(종착 아님)

/** '내 기록' 타임라인 원천 — 수렴 종합의 출처 */
export type MoveoutRecordSource =
  | "movein_photo" // 입주 전 사진(1급 근거, 있으면)
  | "defect" // 하자 신고
  | "repair" // 수리 이력
  | "payment" // 납부 이력
  | "chat" // 채팅
  | "contract"; // 계약서(원상복구·청소 조항)

/** 훼손 추정 판정 — 확정 금지, 비적대 프레임. 하자 ResponsibilityVerdict와 동형. */
export type WearVerdict =
  | "aging_likely" // 노후/마모 가능성(임차인 책임 아님 지향)
  | "damage_possible" // 훼손 가능성 — '확인 필요'
  | "unclear"; // 판단 어려움

/** 차감 후보 종류 — 원천별 */
export type DeductionKind =
  | "unpaid" // 미납(← 납부)
  | "repair" // 수리비 후보(← 하자·수리)
  | "restoration" // 원상복구(← 계약서)
  | "cleaning"; // 청소비(← 계약서)

/** 체크리스트 항목 상태 — 정직한 체크가 불리하게 쓰이지 않게 노후/마모 구분 */
export type ChecklistCondition =
  | "normal" // 이상 없음
  | "aging" // 노후/마모(자연 소모 — 임차인 책임 아님)
  | "damage_check"; // 훼손 확인 필요(관리인 triage 대상)

/** 이의 상태머신 — 양방향 enum. 무응답에도 막히지 않게 SLA 동반. */
export type DisputeStatus =
  | "received" // 접수
  | "reviewing" // 검토 중
  | "answered" // 관리자 응답
  | "confirmed" // 임차인 확인
  | "re_disputed" // 재이의
  | "resolved"; // 해소

/** 퇴실 준비 홈 요약(T-OUT-00) — D-day·예상 정산 요약·준비 진행. 미확정 캐스케이드 차단. */
export interface MoveoutSummary {
  id: string;
  unitId: string; // 호실
  contractConfirmed: boolean; // 계약 확정 여부 — false면 D-day·정산 미확정 안내(D15)
  leaseEndDate?: string; // 계약 종료일 ISO (← T-DOC 확정값, 확정 시)
  daysRemaining?: number; // 종료 D-day (확정 시)
  depositAmount?: number; // 보증금(참고)
  estimatedRefundMin?: number; // 예상 반환액 범위 하한 — 단일 숫자 금지
  estimatedRefundMax?: number; // 예상 반환액 범위 상한
  settlementStatus: SettlementStatus; // 정산 검토 상태(임차인 표시)
  prepProgress: number; // 준비 진행 0~1
  settlementId?: string;
  createdAt: string;
  updatedAt: string;
}

/** '내 기록' 타임라인 항목(T-OUT-01) — 중립·안심 톤 먼저, 훼손 추정은 보조·비적대. */
export interface MoveoutRecordItem {
  id: string;
  summaryId: string;
  source: MoveoutRecordSource;
  title: string;
  description: string;
  occurredAt?: string; // ISO
  wearVerdict?: WearVerdict; // 있으면 '확인이 필요할 수 있는 항목' 보조 표기 + 이의 인접
  wearNote?: string; // 비적대 설명(노후/마모일 수도, 확인 필요)
  moveinComparisonAvailable: boolean; // 입주전 사진 비교 가능 여부(공백 ≠ 책임)
}

/** 퇴실 체크리스트 항목(T-OUT-02) — 호실 옵션 인벤토리 기반. 유일한 입력 화면. */
export interface MoveoutChecklistItem {
  id: string;
  summaryId: string;
  label: string; // 옵션명 (← 호실 옵션 인벤토리 M-DOC-03)
  present: boolean; // 존재 여부
  condition: ChecklistCondition; // 정상/노후·마모/훼손 확인
  note?: string;
  attachmentUrls?: string[]; // 사진 증빙 URL(업로드 슬라이스 연결 전까지는 URL 계약)
}

/** 차감 후보(T-OUT-03) — 각 항목 예상 범위·확인 필요·근거(관리인과 동일 열람). */
export interface DeductionCandidate {
  id: string;
  kind: DeductionKind;
  label: string;
  estimatedMin: number; // 예상 범위 하한(원)
  estimatedMax: number; // 예상 범위 상한(원)
  needsConfirmation: boolean; // '확인 필요' 표기
  evidenceNote: string; // 근거 보기(임차인·관리인 동일 근거)
  source: MoveoutRecordSource; // 원천
}

/** 예상 정산 안내(T-OUT-03) — 참고 전용, 예상 반환액 = 범위. 돈 확정 액션 없음. */
export interface SettlementEstimate {
  id: string;
  summaryId: string;
  depositAmount: number; // 보증금(참고)
  deductions: DeductionCandidate[];
  refundMin: number; // 예상 반환액 범위 하한 — 단일 숫자 금지
  refundMax: number; // 예상 반환액 범위 상한
  status: SettlementStatus;
  disclaimer: string; // 의무 문구(참고자료이며 최종 정산은 관리자 확인 후 확정)
  createdAt: string;
}

/** 이의 상태 이력 1건 — 양방향 enum 전이 기록 */
export interface DisputeEvent {
  status: DisputeStatus;
  at: string; // ISO
  note?: string;
}

/** 이의·정정 요청(T-OUT-04) — 상태머신 + 무응답 SLA·에스컬레이션 출구. */
export interface Dispute {
  id: string;
  summaryId: string;
  targetItemId?: string; // 대상 항목(리포트/정산에서 선택 진입)
  targetLabel: string;
  reason: string;
  attachmentUrls?: string[];
  status: DisputeStatus;
  slaDeadline: string; // 무응답 SLA 기준 ISO
  slaBreached: boolean; // SLA 초과 → 에스컬레이션 출구 노출
  managerResponse?: string; // 관리자 응답(양방향)
  history: DisputeEvent[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// 관리인 퇴실·정산 검토(M-OUT) — 세트 B. 임차인 세트와 동일 원천·근거(근거 대칭).
// 원칙: · '검토 완료'는 차감 확정 아님(격상 착시 차단).
//       · 훼손 추정 수정은 근거·통지·감사로그 게이트를 반드시 거친다.
//       · 검토 완료 게이트는 미해소 이의/확인필요 시 차단하되 SLA·알림 동반(동결 방지).
//       · 계약 미확정(D15) 호실은 예상정산 생성·검토완료 차단.
// ─────────────────────────────────────────────────────────────

/** 퇴실/정산 검토 대시보드 행(M-OUT-00) — 만료 예정 호실 triage 뷰. */
export interface MoveoutManagerRow {
  summaryId: string;
  unitId: string; // 호실
  tenantName: string; // 임차인
  contractConfirmed: boolean; // false면 검토 진입/검토완료 차단(D15)
  leaseEndDate?: string; // 종료일 ISO(확정 시)
  daysRemaining?: number; // D-day(확정 시)
  settlementStatus: SettlementStatus; // 검토 단계(리포트/정산/검토완료/재검토)
  openDisputeCount: number; // 미해소 이의 수
  slaBreached: boolean; // 이의·검토 SLA 초과 → 상단 정렬·강조
  expiringSoon: boolean; // 만료 임박(D-day 임계 이하)
}

/** 대시보드 상단 카운트(M-OUT-00 헤더) — 이의 대기·SLA 경과·만료 임박. */
export interface MoveoutDashboardSummary {
  expiringSoon: number; // 만료 임박 호실
  disputesWaiting: number; // 이의 대기(응답 필요)
  slaBreached: number; // SLA 초과 건
  reviewDone: number; // 검토 완료(예상안) 호실
}

/** 훼손 추정 triage 수정 액션(M-OUT-01) — 근거·통지·감사로그 게이트 필수. */
export type WearAdjustmentAction =
  | "keep" // 유지
  | "adjust" // 조정(판정 변경)
  | "reinforce"; // 근거 보강

/** 호실 기록 리포트 수정 감사로그 1건(M-OUT-01) — 근거·통지 동반 필수. */
export interface ReportAuditEntry {
  id: string;
  summaryId: string;
  recordItemId: string; // 대상 기록 항목
  action: WearAdjustmentAction;
  fromVerdict?: WearVerdict; // 조정 전 판정
  toVerdict?: WearVerdict; // 조정 후 판정
  evidenceNote: string; // 근거(필수) — 임차인 동일 열람
  tenantNotified: boolean; // 임차인 통지 여부(필수 게이트)
  managerName: string;
  at: string; // ISO
}

/** 훼손 추정 triage 수정 DTO(M-OUT-01) — 근거 없거나 미통지면 게이트 거부. */
export interface AdjustWearVerdictDto {
  recordItemId: string;
  action: WearAdjustmentAction;
  toVerdict?: WearVerdict; // action="adjust"일 때
  evidenceNote: string; // 필수
  notifyTenant: boolean; // 필수(true여야 통과)
}

/** 차감 후보 금액 조정 DTO(M-OUT-02) — 항목별 금액 조정·확인 필요 해소. */
export interface AdjustDeductionDto {
  deductionId: string;
  estimatedMin?: number; // 조정 하한
  estimatedMax?: number; // 조정 상한
  resolveConfirmation?: boolean; // '확인 필요' 해소
  note?: string;
}

/** 검토 완료 게이트 차단 사유(M-OUT-02) — 함정 방지 위해 SLA·출구 동반. */
export type ReviewGateBlockReason =
  | "contract_unconfirmed" // 계약 미확정(D15)
  | "unresolved_dispute" // 미해소 이의
  | "needs_confirmation" // 확인 필요 항목 잔존
  | "no_movein_evidence"; // 입주전 비교 근거 없음(임대인 입증책임)

/** 검토 완료 게이트 평가 결과(M-OUT-02) — 차단이어도 SLA 경과 시 진행 옵션 제공. */
export interface ReviewCompletionGate {
  canComplete: boolean; // 게이트 통과 여부
  blockingReasons: ReviewGateBlockReason[]; // 차단 사유(비어 있으면 통과)
  slaBreached: boolean; // SLA 초과 → 동결 방지 진행 옵션 노출
  overrideAvailable: boolean; // SLA 초과 시 알림 동반 진행 가능
  message: string; // 안내 문구(사유·출구)
}

/** 검토 완료/재검토 전이 DTO(M-OUT-02) — 게이트 점검·감사로그. */
export interface CompleteReviewDto {
  acknowledgeEvidence: boolean; // 근거 확인
  overrideSla?: boolean; // SLA 초과 시 알림 동반 강행
  overrideReason?: string; // SLA override 사유
}

/** 관리인 검토 정산안 뷰(M-OUT-02) — 예상 정산 + 게이트 + 이의 enum 표시. */
export interface ManagerSettlementReview {
  settlement: SettlementEstimate;
  gate: ReviewCompletionGate;
  disputes: Dispute[]; // 이의 enum 표시(접수/응답/확인/재이의/해소)
  moveinEvidenceAvailable: boolean; // 입주전 비교 근거 유무(공백 ≠ 책임)
}

/** 이의 응답 종류(M-OUT-03) — 양방향 상태머신. */
export type DisputeResponseKind =
  | "accept" // 인정
  | "adjust" // 조정
  | "explain"; // 사유 회신

/** 이의 반영 대상(M-OUT-03) — 리포트/정산 반영. */
export type DisputeReflectTarget = "report" | "settlement" | "none";

/** 이의 응답 DTO(M-OUT-03) — 응답 발송 → 임차인 확인/재이의(양방향 enum). */
export interface RespondDisputeDto {
  disputeId: string;
  kind: DisputeResponseKind;
  message: string; // 회신 본문
  reflect?: DisputeReflectTarget; // 리포트/정산 반영 여부
}

/** 임차인 이의 생성 DTO(T-OUT-04). */
export interface CreateMoveoutDisputeDto {
  targetItemId?: string;
  targetLabel: string;
  reason: string;
  attachmentUrls?: string[];
}

/** 임차인 퇴실 문의 DTO(T-OUT-03 → M-MSG thread). */
export interface CreateMoveoutInquiryDto {
  body: string;
  attachmentUrls?: string[];
}

/** 임차인 퇴실 체크리스트 저장 DTO(T-OUT-02). 전체 스냅샷으로 저장해 진행률을 재계산한다. */
export interface UpdateMoveoutChecklistItemDto {
  id?: string;
  label: string;
  present: boolean;
  condition: ChecklistCondition;
  note?: string;
  attachmentUrls?: string[];
}

export interface UpdateMoveoutChecklistDto {
  items: UpdateMoveoutChecklistItemDto[];
}

export type TenantMoveoutDisputeAction = "confirm" | "re_dispute" | "resolve";

export interface UpdateTenantMoveoutDisputeDto {
  disputeId: string;
  action: TenantMoveoutDisputeAction;
  reason?: string;
  attachmentUrls?: string[];
}

export interface EscalateMoveoutDisputeDto {
  disputeId: string;
  reason?: string;
}
