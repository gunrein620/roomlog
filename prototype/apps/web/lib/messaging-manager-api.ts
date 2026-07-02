import type {
  AnnouncementDelivery,
  AnnouncementDraft,
  AnnouncementRecipient,
  AnnouncementResult,
  Thread,
} from "@roomlog/types";

// 룸로그 API 클라이언트 (관리인 커뮤니케이션 M-MSG 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const now = "2026-07-02T10:00:00+09:00";

export const DEMO_MANAGER_DRAFTS: AnnouncementDraft[] = [
  {
    id: "draft_urgent_water",
    category: "urgent",
    scope: "building",
    targetLabel: "A동 전체 42세대",
    title: "[긴급] 오늘 14~16시 단수 안내",
    body: "노후 배관 교체로 오늘 14:00~16:00 단수됩니다. 미리 물을 받아두세요.",
    translations: [
      {
        lang: "en",
        langLabel: "English",
        title: "[Urgent] Water outage today 14:00-16:00",
        body: "Water supply will be suspended today from 14:00 to 16:00 for pipe replacement. Please prepare water in advance.",
        reviewed: true,
      },
      {
        lang: "zh",
        langLabel: "中文",
        title: "[紧急] 今日14:00-16:00停水通知",
        body: "因更换老化管道，今日14:00至16:00将停水。请提前储水。",
        reviewed: true,
      },
      {
        lang: "vi",
        langLabel: "Tiếng Việt",
        title: "[Khẩn cấp] Ngừng cấp nước hôm nay 14:00-16:00",
        body: "Nước sẽ tạm ngừng hôm nay từ 14:00 đến 16:00 để thay ống cũ. Vui lòng chuẩn bị nước trước.",
        reviewed: true,
      },
    ],
    confirmRequired: true,
    status: "draft",
    updatedAt: now,
  },
  {
    id: "draft_life_cleaning",
    category: "life",
    scope: "all",
    targetLabel: "전체 118세대",
    title: "공용 계단 청소 안내",
    body: "매주 화요일 오전 공용 계단 청소가 진행됩니다. 복도 적치물을 정리해 주세요.",
    confirmRequired: false,
    status: "draft",
    updatedAt: "2026-07-01T15:30:00+09:00",
  },
];

export const DEMO_MANAGER_RECIPIENTS: AnnouncementRecipient[] = [
  { unitId: "201", tenantName: "김민지", preferredLang: "ko" },
  { unitId: "302", tenantName: "Alex Kim", preferredLang: "en" },
  { unitId: "405", tenantName: "Linh Tran", preferredLang: "vi" },
  { unitId: "501", tenantName: "王伟", preferredLang: "zh" },
];

const deliveries: AnnouncementDelivery[] = [
  {
    unitId: "201",
    tenantName: "김민지",
    state: "confirmed",
    readAt: "2026-07-01T09:10:00+09:00",
    confirmedAt: "2026-07-01T09:12:00+09:00",
  },
  { unitId: "302", tenantName: "Alex Kim", state: "read", readAt: "2026-07-01T09:30:00+09:00" },
  { unitId: "405", tenantName: "Linh Tran", state: "unread" },
  { unitId: "501", tenantName: "王伟", state: "unread", failed: true },
];

export const DEMO_MANAGER_RESULTS: AnnouncementResult[] = [
  {
    announcementId: "an_urgent_water",
    category: "urgent",
    scope: "building",
    title: "[긴급] 오늘 14~16시 단수 안내",
    sentAt: "2026-07-01T09:00:00+09:00",
    version: 1,
    confirmRequired: true,
    counts: { total: 4, read: 2, confirmed: 1, unconfirmed: 3, failed: 1 },
    deliveries,
  },
  {
    announcementId: "an_life_cleaning",
    category: "life",
    scope: "all",
    title: "공용 계단 청소 안내",
    sentAt: "2026-06-29T08:00:00+09:00",
    version: 1,
    confirmRequired: false,
    counts: { total: 118, read: 91, confirmed: 0, unconfirmed: 27, failed: 0 },
    deliveries: [
      { unitId: "101", tenantName: "박서준", state: "read", readAt: "2026-06-29T08:20:00+09:00" },
      { unitId: "202", tenantName: "이하나", state: "unread" },
    ],
  },
];

export const DEMO_MANAGER_THREADS: Thread[] = [
  {
    id: "th_mgr_302",
    unitId: "302",
    tenantId: "tn_302",
    context: "defect",
    contextRef: "tk_0001",
    contextLabel: "하자 · 에어컨 물샘",
    lastMessage: "천장에서 물이 떨어져요. 오늘 확인 가능할까요?",
    unreadCount: 2,
    pendingRequest: true,
    archivedNotice: true,
    updatedAt: "2026-07-02T09:20:00+09:00",
    messages: [
      {
        id: "m_mgr_1",
        threadId: "th_mgr_302",
        sender: "tenant",
        kind: "text",
        body: "천장에서 물이 떨어져요. 오늘 확인 가능할까요?",
        createdAt: "2026-07-02T09:02:00+09:00",
      },
      {
        id: "m_mgr_2",
        threadId: "th_mgr_302",
        sender: "manager",
        kind: "photo_request",
        body: "누수 위치와 배수구 쪽 사진을 한 장씩 부탁드립니다.",
        createdAt: "2026-07-02T09:20:00+09:00",
      },
    ],
  },
  {
    id: "th_mgr_405",
    unitId: "405",
    tenantId: "tn_405",
    context: "payment",
    contextRef: "bill_405_202607",
    contextLabel: "청구 문의 · 관리비",
    lastMessage: "이번 달 관리비 항목 중 수도요금 산정 기준을 알고 싶어요.",
    unreadCount: 1,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-07-02T08:10:00+09:00",
    messages: [
      {
        id: "m_mgr_3",
        threadId: "th_mgr_405",
        sender: "tenant",
        kind: "text",
        body: "이번 달 관리비 항목 중 수도요금 산정 기준을 알고 싶어요.",
        createdAt: "2026-07-02T08:10:00+09:00",
      },
    ],
  },
  {
    id: "th_mgr_201",
    unitId: "201",
    tenantId: "tn_201",
    context: "announcement",
    contextRef: "an_urgent_water",
    contextLabel: "공지 문의 · 단수",
    lastMessage: "아이 하원 시간과 겹치는데 엘리베이터 이용은 괜찮나요?",
    unreadCount: 0,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-07-01T12:40:00+09:00",
    messages: [
      {
        id: "m_mgr_4",
        threadId: "th_mgr_201",
        sender: "tenant",
        kind: "text",
        body: "아이 하원 시간과 겹치는데 엘리베이터 이용은 괜찮나요?",
        createdAt: "2026-07-01T12:40:00+09:00",
      },
      {
        id: "m_mgr_5",
        threadId: "th_mgr_201",
        sender: "manager",
        kind: "text",
        body: "엘리베이터는 정상 운행합니다. 단수 시간에 물 사용만 어렵습니다.",
        createdAt: "2026-07-01T12:48:00+09:00",
      },
    ],
  },
];

export const DEMO_MANAGER_DRAFT_ID = DEMO_MANAGER_DRAFTS[0].id;
export const DEMO_MANAGER_RESULT_ID = DEMO_MANAGER_RESULTS[0].announcementId;
export const DEMO_MANAGER_THREAD_ID = DEMO_MANAGER_THREADS[0].id;

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function listManagerThreads(unitId?: string): Promise<Thread[]> {
  const fallback = unitId
    ? DEMO_MANAGER_THREADS.filter((thread) => thread.unitId === unitId || thread.id === unitId)
    : DEMO_MANAGER_THREADS;
  const query = unitId ? `?unitId=${encodeURIComponent(unitId)}` : "";
  return tryFetch(`/threads${query}`, fallback.length > 0 ? fallback : DEMO_MANAGER_THREADS);
}

export async function getManagerThread(id: string = DEMO_MANAGER_THREAD_ID): Promise<Thread> {
  const fallback =
    DEMO_MANAGER_THREADS.find((thread) => thread.id === id || thread.unitId === id) ??
    DEMO_MANAGER_THREADS[0];
  const threads = await listManagerThreads(id);
  return threads.find((thread) => thread.id === id || thread.unitId === id) ?? fallback;
}

export function listAnnouncementDrafts(): Promise<AnnouncementDraft[]> {
  return tryFetch("/announcement-drafts", DEMO_MANAGER_DRAFTS);
}

export function getAnnouncementDraft(id: string = DEMO_MANAGER_DRAFT_ID): Promise<AnnouncementDraft> {
  const fallback = DEMO_MANAGER_DRAFTS.find((draft) => draft.id === id) ?? DEMO_MANAGER_DRAFTS[0];
  return tryFetch(`/announcement-drafts/${id}`, fallback);
}

export function listAnnouncementRecipients(
  id: string = DEMO_MANAGER_DRAFT_ID,
): Promise<AnnouncementRecipient[]> {
  return tryFetch(`/announcement-drafts/${id}/recipients`, DEMO_MANAGER_RECIPIENTS);
}

export function listAnnouncementResults(): Promise<AnnouncementResult[]> {
  return tryFetch("/announcement-results", DEMO_MANAGER_RESULTS);
}

export function getAnnouncementResult(
  id: string = DEMO_MANAGER_RESULT_ID,
): Promise<AnnouncementResult> {
  const fallback =
    DEMO_MANAGER_RESULTS.find((result) => result.announcementId === id) ?? DEMO_MANAGER_RESULTS[0];
  return tryFetch(`/announcement-results/${id}`, fallback);
}
