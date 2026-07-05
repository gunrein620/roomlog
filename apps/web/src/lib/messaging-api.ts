import type { Announcement, CreateTenantMessagingThreadInput, Thread } from "@roomlog/types";
import { DEMO_ANNOUNCEMENTS, DEMO_THREAD_ID, DEMO_THREADS } from "./demo-messaging";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (임차인 커뮤니케이션 T-MSG 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
const DEMO_ANNOUNCEMENT_ID = DEMO_ANNOUNCEMENTS[0].id;

export const tenantMessagingPaths = {
  threads: () => "/tenant/messaging/threads",
  thread: (id: string) => `/tenant/messaging/threads/${encodeURIComponent(id)}`,
  deleteThread: (id: string) => `/tenant/messaging/threads/${encodeURIComponent(id)}`,
  threadMessages: (id: string) => `/tenant/messaging/threads/${encodeURIComponent(id)}/messages`,
  announcements: () => "/tenant/messaging/announcements",
  announcement: (id: string) => `/tenant/messaging/announcements/${encodeURIComponent(id)}`,
  readAnnouncement: (id: string) =>
    `/tenant/messaging/announcements/${encodeURIComponent(id)}/read`,
  confirmAnnouncement: (id: string) =>
    `/tenant/messaging/announcements/${encodeURIComponent(id)}/confirm`,
};

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[messaging/api] ${label} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

export function listThreads(): Promise<Thread[]> {
  return tryFetch(tenantMessagingPaths.threads(), DEMO_THREADS, "임차인 메시지 목록 조회");
}

export function getThread(id: string): Promise<Thread> {
  return serverFetch<Thread>(tenantMessagingPaths.thread(id));
}

export function createTenantThread(input: CreateTenantMessagingThreadInput): Promise<Thread> {
  return serverFetch<Thread>(tenantMessagingPaths.threads(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function addTenantThreadMessage(
  id: string,
  input: { body?: string; kind?: "text" | "photo_request" | "photo_response"; attachmentUrls?: string[] },
): Promise<Thread> {
  return serverFetch<Thread>(tenantMessagingPaths.threadMessages(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTenantThread(id: string): Promise<{ threadId: string; deleted: true }> {
  return serverFetch(tenantMessagingPaths.deleteThread(id), {
    method: "DELETE",
  });
}

export function listAnnouncements(): Promise<Announcement[]> {
  return tryFetch(
    tenantMessagingPaths.announcements(),
    DEMO_ANNOUNCEMENTS,
    "임차인 공지 목록 조회",
  );
}

export function getAnnouncement(id: string = DEMO_ANNOUNCEMENT_ID): Promise<Announcement> {
  const fallback =
    DEMO_ANNOUNCEMENTS.find((announcement) => announcement.id === id) ?? DEMO_ANNOUNCEMENTS[0];
  return tryFetch(tenantMessagingPaths.announcement(id), fallback, "임차인 공지 상세 조회");
}

export function markAnnouncementRead(id: string): Promise<Announcement> {
  return serverFetch<Announcement>(tenantMessagingPaths.readAnnouncement(id), {
    method: "POST",
  });
}

export function confirmAnnouncement(id: string): Promise<Announcement> {
  return serverFetch<Announcement>(tenantMessagingPaths.confirmAnnouncement(id), {
    method: "POST",
  });
}

export { DEMO_ANNOUNCEMENT_ID, DEMO_THREAD_ID };
