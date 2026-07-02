import type { Announcement, Thread } from "@roomlog/types";
import { DEMO_ANNOUNCEMENTS, DEMO_THREAD_ID, DEMO_THREADS } from "./demo-messaging";

// 룸로그 API 클라이언트 (임차인 커뮤니케이션 T-MSG 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const DEMO_ANNOUNCEMENT_ID = DEMO_ANNOUNCEMENTS[0].id;

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function listThreads(): Promise<Thread[]> {
  return tryFetch("/threads", DEMO_THREADS);
}

export function getThread(id: string = DEMO_THREAD_ID): Promise<Thread> {
  const fallback = DEMO_THREADS.find((thread) => thread.id === id) ?? DEMO_THREADS[0];
  return tryFetch(`/threads/${id}`, fallback);
}

export function listAnnouncements(): Promise<Announcement[]> {
  return tryFetch("/announcements", DEMO_ANNOUNCEMENTS);
}

export function getAnnouncement(id: string = DEMO_ANNOUNCEMENT_ID): Promise<Announcement> {
  const fallback =
    DEMO_ANNOUNCEMENTS.find((announcement) => announcement.id === id) ?? DEMO_ANNOUNCEMENTS[0];
  return tryFetch(`/announcements/${id}`, fallback);
}

export { DEMO_ANNOUNCEMENT_ID, DEMO_THREAD_ID };
