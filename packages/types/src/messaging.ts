// 메시징 도메인 공유 모델 (횡단 커뮤니케이션 — 채팅 1:1 양방향 + 공지 broadcast 일방)
// 근거: roomlog_screens_messaging.md. 원칙: 공지≠채팅 하드분리 · 미읽음 단일소스=T-MSG
// · 청구 맥락 1:1 독촉 금지(D20) · 긴급공지 다국어 안전(D21) · 읽음≠확인.

/** 스레드 맥락 종류 — 어느 세트에서 열렸나 (일반/공지 포함) */
export type ThreadContext =
  | "defect" // 하자/민원
  | "payment" // 청구/납부 (문의용 — 독촉 발신 금지)
  | "contract" // 계약
  | "moveout" // 퇴실
  | "announcement" // 공지 문의
  | "general"; // 일반 문의

export type MessageSender = "tenant" | "manager";

/** 메시지 종류 — 추가 사진/설명 요청·응답은 하자 기록에도 반영됨 */
export type MessageKind = "text" | "photo_request" | "photo_response";

export interface Message {
  id: string;
  threadId: string;
  sender: MessageSender;
  kind: MessageKind;
  body: string; // 선택 언어 1개 (원문은 originalBody 토글)
  originalBody?: string;
  createdAt: string;
}

export interface Thread {
  id: string;
  buildingName?: string;
  unitId: string;
  tenantId: string; // 권한 스코프: 임차인은 본인 tenant_id 스레드만
  context: ThreadContext;
  contextRef?: string; // 연결된 티켓/청구 id 등 (맥락 카드 source)
  contextLabel?: string; // 맥락 배지 표시용
  lastMessage: string;
  lastMessageSender?: MessageSender; // 목록 응답에도 포함 — 관리인 미응답(마지막 발신자=세입자) 판정용
  unreadCount: number; // 단일 미읽음 소스
  pendingRequest: boolean; // 추가 사진/설명 요청 대기
  archivedNotice: boolean; // "이 대화는 관리 기록에 보관돼요" 고지
  updatedAt: string;
  messages?: Message[]; // 상세 조회 시 포함
}

export interface CreateTenantMessagingThreadInput {
  context?: ThreadContext;
  contextRef?: string;
  contextLabel?: string;
  body: string;
  kind?: MessageKind;
  attachmentUrls?: string[];
}

/** 세입자의 입주 연결을 기준으로 계산한 임대인 일반 대화 진입 정보. */
export interface TenantLandlordConversation {
  threadId?: string;
  buildingName: string;
  unitId: string;
  landlordName: string;
}

/** 관리인이 실제 호실 연결을 기준으로 대화를 시작할 수 있는 임차인. */
export interface ManagerMessagingRecipient {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantId: string;
  tenantName: string;
  existingGeneralThreadId?: string;
}

/** 관리인이 계약 연결 임차인과 일반 대화를 시작하는 입력. */
export interface StartManagerConversationInput {
  roomId: string;
  tenantId: string;
  body: string;
}

/** 공지 카테고리 — 긴급만 확인 게이트 + 다국어 검수(D21) */
export type AnnouncementCategory = "urgent" | "life" | "event";
export type AnnouncementScope = "all" | "building" | "unit";
export type AnnouncementLanguage = "en" | "zh" | "vi";
/** 읽음 ≠ 확인 (긴급/법정만 확인 게이트, 일반은 읽음) */
export type AnnouncementReadState = "unread" | "read" | "confirmed";

export interface Announcement {
  id: string;
  category: AnnouncementCategory;
  scope: AnnouncementScope;
  title: string;
  body: string; // 선택 언어 1개
  originalBody?: string; // 원문 토글 (긴급=검수 번역)
  sender: string;
  sentAt: string;
  confirmRequired: boolean; // 긴급/법정만 true
  state: AnnouncementReadState;
  safetyCta?: string; // 긴급 안전 안내 CTA (선택)
}

// ─── 관리인 뷰 (M-MSG) ──────────────────────────────────────────────
// 임차인용 Announcement가 '발송된 tenant-safe 투영'이라면, 아래는 그 반대편:
// 작성 초안(M-MSG-01) · 발송 검토 명단(M-MSG-02) · 읽음/확인 집계(M-MSG-03).

/** 다국어 검수 번역 — 긴급 공지 안전(D21). 미검수 기계번역만으로 새는 것 차단. */
export interface AnnouncementTranslation {
  lang: AnnouncementLanguage;
  langLabel: string; // "English" | "中文" | "Tiếng Việt" ...
  title: string;
  body: string;
  reviewed: boolean; // 검수 완료 여부 (긴급은 전부 true여야 발송 게이트 통과)
  sourceHash: string; // 번역·검수 당시 한국어 원문 식별자
}

/**
 * 공지 초안 (M-MSG-01 작성 · M-MSG-02 검토 게이트).
 * 타깃: 전체/건물/호실만 — **미납세대 옵션 없음(D20)**. 연체 독촉은 M-BILL-05 단일 채널.
 */
export interface AnnouncementDraft {
  id: string;
  category: AnnouncementCategory;
  scope: AnnouncementScope;
  targetLabel: string; // 사람이 읽는 타깃 라벨 (예: "전체" · "A동" · "302호")
  targetRoomIds: string[]; // 실제 서버 권한 검증·수신자 산정에 사용하는 호실 ID
  title: string;
  body: string;
  translations?: AnnouncementTranslation[]; // 긴급=다국어 검수(D21)
  confirmRequired: boolean; // 카테고리에서 파생 (긴급/법정만 true)
  status: "draft" | "sent";
  updatedAt: string;
}

export interface AnnouncementDraftInput {
  category: AnnouncementCategory;
  scope: AnnouncementScope;
  targetLabel: string;
  targetRoomIds: string[];
  title: string;
  body: string;
  translations: AnnouncementTranslation[];
}

export type UpdateAnnouncementDraftInput = AnnouncementDraftInput;

export interface AnnouncementTranslationRequest {
  title: string;
  body: string;
  targetLang: AnnouncementLanguage;
}

export type AnnouncementTranslationResponse = AnnouncementTranslation;

/** 발송 검토 명단의 개별 수신 세대 (M-MSG-02). 대량 명단=데스크탑 본체(D17). */
export interface AnnouncementRecipient {
  unitId: string;
  tenantName: string; // 임차인 종속(표시용)
  preferredLang: string; // 푸시 수신자 선택 언어(D21) — 긴급은 이 언어로 발송
}

/** 개별 세대 수신 상태 — 읽음≠확인 (M-MSG-03). */
export interface AnnouncementDelivery {
  unitId: string;
  tenantName: string;
  state: AnnouncementReadState; // unread | read | confirmed
  readAt?: string; // 수동 수신 타임스탬프
  confirmedAt?: string; // 명시 확인 타임스탬프
  failed?: boolean; // 전송 실패
}

/**
 * 발송 결과·읽음/확인 집계 (M-MSG-03).
 * 읽음(read) = 수동 수신, 확인(confirmed) = 명시 확인. 미확인 재발송은 긴급 한정.
 */
export interface AnnouncementResult {
  announcementId: string;
  category: AnnouncementCategory;
  scope: AnnouncementScope;
  title: string;
  sentAt: string;
  version: number; // 재발송 버전 (재산정 → 게이트 재경유)
  confirmRequired: boolean;
  counts: {
    total: number;
    read: number;
    confirmed: number;
    unconfirmed: number;
    failed: number;
  };
  deliveries: AnnouncementDelivery[]; // 미확인 세대 필터·개별 안내(긴급 한정)
}
