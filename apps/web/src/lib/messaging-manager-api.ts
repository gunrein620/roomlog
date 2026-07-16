import type {
  AnnouncementDelivery,
  AnnouncementDraft,
  AnnouncementDraftInput,
  AnnouncementRecipient,
  AnnouncementResult,
  AnnouncementTranslationRequest,
  AnnouncementTranslationResponse,
  ManagerMessagingRecipient,
  StartManagerConversationInput,
  UpdateAnnouncementDraftInput,
  Thread,
  ThreadContext,
} from "@roomlog/types";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (관리인 커뮤니케이션 M-MSG 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.

const now = "2026-07-02T10:00:00+09:00";

export const DEMO_MANAGER_DRAFTS: AnnouncementDraft[] = [
  {
    id: "draft_urgent_water",
    category: "urgent",
    scope: "building",
    targetLabel: "A동 전체 42세대",
    targetRoomIds: ["room-301", "room-302", "room-303"],
    title: "[긴급] 오늘 14~16시 단수 안내",
    body: "노후 배관 교체로 오늘 14:00~16:00 단수됩니다. 미리 물을 받아두세요.",
    translations: [
      {
        lang: "en",
        langLabel: "English",
        title: "[Urgent] Water outage today 14:00-16:00",
        body: "Water supply will be suspended today from 14:00 to 16:00 for pipe replacement. Please prepare water in advance.",
        reviewed: true,
        sourceHash: "demo-urgent-water-v1",
      },
      {
        lang: "zh",
        langLabel: "中文",
        title: "[紧急] 今日14:00-16:00停水通知",
        body: "因更换老化管道，今日14:00至16:00将停水。请提前储水。",
        reviewed: true,
        sourceHash: "demo-urgent-water-v1",
      },
      {
        lang: "vi",
        langLabel: "Tiếng Việt",
        title: "[Khẩn cấp] Ngừng cấp nước hôm nay 14:00-16:00",
        body: "Nước sẽ tạm ngừng hôm nay từ 14:00 đến 16:00 để thay ống cũ. Vui lòng chuẩn bị nước trước.",
        reviewed: true,
        sourceHash: "demo-urgent-water-v1",
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
    targetRoomIds: ["room-301", "room-302", "room-303"],
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

export const DEMO_MANAGER_DRAFT_ID = DEMO_MANAGER_DRAFTS[0].id;
export const DEMO_MANAGER_RESULT_ID = DEMO_MANAGER_RESULTS[0].announcementId;

export const managerMessagingPaths = {
  threads: (context?: ThreadContext) =>
    context
      ? `/manager/messaging/threads?context=${encodeURIComponent(context)}`
      : "/manager/messaging/threads",
  thread: (id: string) => `/manager/messaging/threads/${encodeURIComponent(id)}`,
  deleteThread: (id: string) => `/manager/messaging/threads/${encodeURIComponent(id)}`,
  threadMessages: (id: string) => `/manager/messaging/threads/${encodeURIComponent(id)}/messages`,
  readThread: (id: string) => `/manager/messaging/threads/${encodeURIComponent(id)}/read`,
  recipients: () => "/manager/messaging/recipients",
  conversations: () => "/manager/messaging/conversations",
  announcementDrafts: () => "/manager/messaging/announcement-drafts",
  announcementDraft: (id: string) =>
    `/manager/messaging/announcement-drafts/${encodeURIComponent(id)}`,
  announcementTranslations: () => "/manager/messaging/announcement-translations",
  announcementRecipients: (id: string) =>
    `/manager/messaging/announcement-drafts/${encodeURIComponent(id)}/recipients`,
  sendAnnouncementDraft: (id: string) =>
    `/manager/messaging/announcement-drafts/${encodeURIComponent(id)}/send`,
  announcementResults: () => "/manager/messaging/announcement-results",
  announcementResult: (id: string) =>
    `/manager/messaging/announcement-results/${encodeURIComponent(id)}`,
};

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[messaging/manager-api] ${label} 실패 → 폴백 사용`, error);
    return fallback;
  }
}

export function listManagerThreads(context?: ThreadContext): Promise<Thread[]> {
  return tryFetch(
    managerMessagingPaths.threads(context),
    [],
    "관리인 메시지 목록 조회",
  );
}

export function listManagerMessagingRecipients(): Promise<ManagerMessagingRecipient[]> {
  return serverFetch(managerMessagingPaths.recipients());
}

export function startManagerConversation(input: StartManagerConversationInput): Promise<Thread> {
  return serverFetch<Thread>(managerMessagingPaths.conversations(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getManagerThread(id: string): Promise<Thread> {
  return serverFetch<Thread>(managerMessagingPaths.thread(id));
}

export function markManagerThreadRead(id: string): Promise<Thread> {
  return serverFetch<Thread>(managerMessagingPaths.readThread(id), { method: "POST" });
}

export function addManagerThreadMessage(
  id: string,
  input: { body?: string; kind?: "text" | "photo_request" | "photo_response"; attachmentUrls?: string[] },
): Promise<Thread> {
  return serverFetch<Thread>(managerMessagingPaths.threadMessages(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteManagerThread(id: string): Promise<{ threadId: string; deleted: true }> {
  return serverFetch(managerMessagingPaths.deleteThread(id), {
    method: "DELETE",
  });
}

export function listAnnouncementDrafts(): Promise<AnnouncementDraft[]> {
  return tryFetch(
    managerMessagingPaths.announcementDrafts(),
    DEMO_MANAGER_DRAFTS,
    "공지 초안 목록 조회",
  );
}

export function createAnnouncementDraft(input: AnnouncementDraftInput): Promise<AnnouncementDraft> {
  return serverFetch<AnnouncementDraft>(managerMessagingPaths.announcementDrafts(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAnnouncementDraft(
  id: string,
  input: UpdateAnnouncementDraftInput,
): Promise<AnnouncementDraft> {
  return serverFetch<AnnouncementDraft>(managerMessagingPaths.announcementDraft(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function translateAnnouncement(
  input: AnnouncementTranslationRequest,
): Promise<AnnouncementTranslationResponse> {
  return serverFetch<AnnouncementTranslationResponse>(managerMessagingPaths.announcementTranslations(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAnnouncementDraft(id: string = DEMO_MANAGER_DRAFT_ID): Promise<AnnouncementDraft> {
  const fallback = DEMO_MANAGER_DRAFTS.find((draft) => draft.id === id) ?? DEMO_MANAGER_DRAFTS[0];
  return tryFetch(managerMessagingPaths.announcementDraft(id), fallback, "공지 초안 상세 조회");
}

export function listAnnouncementRecipients(
  id: string = DEMO_MANAGER_DRAFT_ID,
): Promise<AnnouncementRecipient[]> {
  return tryFetch(
    managerMessagingPaths.announcementRecipients(id),
    DEMO_MANAGER_RECIPIENTS,
    "공지 수신자 조회",
  );
}

export function sendAnnouncementDraft(id: string): Promise<AnnouncementResult> {
  return serverFetch<AnnouncementResult>(managerMessagingPaths.sendAnnouncementDraft(id), {
    method: "POST",
  });
}

export function listAnnouncementResults(): Promise<AnnouncementResult[]> {
  return tryFetch(
    managerMessagingPaths.announcementResults(),
    DEMO_MANAGER_RESULTS,
    "공지 결과 목록 조회",
  );
}

export function getAnnouncementResult(
  id: string = DEMO_MANAGER_RESULT_ID,
): Promise<AnnouncementResult> {
  const fallback =
    DEMO_MANAGER_RESULTS.find((result) => result.announcementId === id) ?? DEMO_MANAGER_RESULTS[0];
  return tryFetch(managerMessagingPaths.announcementResult(id), fallback, "공지 결과 상세 조회");
}
