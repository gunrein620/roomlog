// 입주기록(T-IN) 공유 도메인 모델 (임차인 폰 단일 · BE·FE 공용 단일 소스)
// 근거: roomlog_screens_movein.md v2 — 입주 전 방 상태 체크리스트 + 항목별 사진 아카이빙.
// 원칙(D27): 증거는 시점에 묶인다(capture_stage) · 원본 불변(EXIF/해시) · 공백 ≠ 책임 추정 ·
//            가이드는 '재현' 아닌 '광각+근접 페어' · 진행률 분모 숨김(누적 카운터).

/** 시점 등급(D27 D-table1) — 늦은 사진의 면책 오용 차단(정직 강등) */
export type CaptureStage =
  | "before_movein" // 입주 전 (계약~입주일 전) — 1급
  | "movein_window" // 입주 직후 잠금 윈도우 (입주 +24~72h) — 1급
  | "after_reference"; // 입주 후 (윈도우 이후) — 참고(1급 아님)

/** 근거 등급 — capture_stage에서 파생. 1급 vs 참고 */
export type EvidenceGrade = "primary" | "reference";

/** 사진 역할 — 재현이 아닌 식별용 페어(광각 1 + 근접 1) */
export type PhotoRole = "wide" | "closeup";

/** 항목 출처 3티어(D15 D-table2) — 미확인은 비차단 표준 fallback */
export type ItemSourceTier =
  | "contract_option" // 1 확정: M-DOC-03 option_inventory
  | "contract_option_manual" // 2 수동: M-DOC-03 수동 입력
  | "standard_fallback"; // 3 미확인: 표준 항목(fallback_item_id·계약 확정 후 reconcile)

/** 공유 범위(실시간 뱃지) — 존엄·프라이버시. 불안 진화 */
export type ShareScope =
  | "private" // 본인만
  | "defect_submitted" // 하자에 제출됨
  | "moveout_submitted"; // 퇴실에 제출됨

/**
 * 저장 사진 — 저장 키 계약(codex P0)의 원자 단위. 원본 불변.
 * 하자(T-DEF)·퇴실(T-OUT)과 space_id·item_id·location_anchor_id로 정렬.
 */
export interface MoveinPhoto {
  id: string; // photo_id
  itemId: string; // item_id
  role: PhotoRole; // photo_role (광각·근접)
  captureStage: CaptureStage; // 시점 등급
  capturedAt: string; // EXIF 촬영 시각 (ISO)
  serverReceivedAt: string; // 서버 수신 시각 (ISO) — 시점 검증
  fileHash: string; // 파일 해시 (원본 불변 무결성)
  edited: boolean; // 편집 여부 감사
  locationAnchorId?: string; // location_anchor_id
  viewpointId?: string; // viewpoint_id (정밀 측정 강제 금지)
  url?: string; // 데모 썸네일 placeholder
}

/** 확인 항목(체크리스트 정의) — 표준 코드화(아이콘+다국어), 계약 원문은 부가 표기 */
export interface ChecklistItem {
  id: string; // item_id (표준 코드)
  spaceId: string; // space_id
  spaceLabel: string; // 공간 표시명 (거실·주방 등)
  label: string; // 표준 대표 라벨 (기본 ko)
  labelI18n?: Record<string, string>; // 다국어 라벨 (외국인)
  icon: string; // 아이콘 (emoji/코드)
  sourceTier: ItemSourceTier; // 출처 배지
  contractLabel?: string; // 계약 원문 옵션명 (부가 표기)
  fallbackItemId?: string; // 미확인 fallback 매핑 (reconcile 대상)
  isCore: boolean; // 핵심 항목(고가·누수 잦은 곳) — 먼저 노출
  coreReason?: string; // "왜 핵심?" 1줄 (고가/누수)
  recommended?: boolean; // 권장(접힘) 그룹
}

/** 항목별 기록 — 사진 페어 + 메모 + 공유 상태(T-IN-03 갤러리·T-IN-04 상세) */
export interface ItemRecord {
  itemId: string; // item_id
  photos: MoveinPhoto[]; // 광각·근접 페어
  memo?: string; // 메모(선택)
  shareScope: ShareScope; // 공유 실시간 뱃지
  shareDetail?: string; // "하자 1건 제출됨" 등 부가 표기
  capturedAt?: string; // 최근 촬영일 (그룹·정렬)
  evidenceGrade?: EvidenceGrade; // 대표 근거 등급(가장 강한 stage 기준)
}

/**
 * 입주 기록(리스 단위 루트) — 잠금 윈도우 + 누적 카운터(분모 숨김) + checklist_version 고정.
 * 저장 키 계약: lease_id / unit_id.
 */
export interface MoveinRecord {
  leaseId: string; // lease_id (식별 키)
  unitId: string; // unit_id (호실)
  checklistVersion: string; // 항목 세트 변경에도 진행률 안 흔들림
  moveinDate: string; // 입주일 (ISO)
  lockWindowStartAt: string; // 잠금 윈도우 시작 (입주일)
  lockWindowEndAt: string; // 잠금 윈도우 종료 (입주 +72h)
  capturedCount: number; // 누적 카운터 (증가만·분모 숨김·긍정 프레임)
}

/** 촬영 저장 입력(T-IN-02) — 사진 페어 저장. capture_stage는 서버가 자동 판정 */
export interface AddPhotoDto {
  role: PhotoRole;
  memo?: string;
  locationAnchorId?: string;
  viewpointId?: string;
  capturedAt?: string; // EXIF 촬영 시각(없으면 서버 수신 시각)
}
