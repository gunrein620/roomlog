import type { Thread, Announcement } from "@roomlog/types";

// 메시징 슬라이스 데모 시드 — api(인메모리 리포)와 동일 값. 프론트 폴백으로도 쓰인다.

export const DEMO_THREADS: Thread[] = [
  {
    id: "th_0001",
    unitId: "302",
    tenantId: "tn_302",
    context: "defect",
    contextRef: "tk_0001",
    contextLabel: "하자 · 에어컨 물샘",
    lastMessage: "추가 사진 한 장만 더 부탁드려요.",
    unreadCount: 1,
    managerUnreadCount: 0,
    pendingRequest: true,
    archivedNotice: true,
    updatedAt: "2026-06-30T10:20:00+09:00",
    messages: [
      {
        id: "m_1",
        threadId: "th_0001",
        sender: "manager",
        kind: "text",
        body: "접수했습니다. 검토 후 안내드릴게요.",
        createdAt: "2026-06-30T09:10:00+09:00",
      },
      {
        id: "m_2",
        threadId: "th_0001",
        sender: "manager",
        kind: "photo_request",
        body: "배수구 쪽 사진 한 장만 더 부탁드려요.",
        createdAt: "2026-06-30T10:20:00+09:00",
      },
    ],
  },
  {
    id: "th_0002",
    unitId: "302",
    tenantId: "tn_302",
    context: "general",
    contextLabel: "일반 문의",
    lastMessage: "분리수거 요일이 어떻게 되나요?",
    unreadCount: 0,
    managerUnreadCount: 1,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-06-28T14:00:00+09:00",
    messages: [
      {
        id: "m_3",
        threadId: "th_0002",
        sender: "tenant",
        kind: "text",
        body: "분리수거 요일이 어떻게 되나요?",
        createdAt: "2026-06-28T14:00:00+09:00",
      },
    ],
  },
];

export const DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "an_u1",
    category: "urgent",
    scope: "building",
    title: "[긴급] 오늘 14~16시 단수 안내",
    body: "노후 배관 교체로 오늘 14:00~16:00 단수됩니다. 미리 물을 받아두세요.",
    originalBody: "Water supply will be suspended today 14:00–16:00 for pipe replacement.",
    sender: "관리사무소",
    sentAt: "2026-07-01T09:00:00+09:00",
    confirmRequired: true,
    state: "unread",
    safetyCta: "단수 대비 안내 보기",
  },
  {
    id: "an_l1",
    category: "life",
    scope: "all",
    title: "계단 청소 안내 (매주 화요일)",
    body: "매주 화요일 오전 공용 계단 청소가 진행됩니다.",
    sender: "관리사무소",
    sentAt: "2026-06-29T08:00:00+09:00",
    confirmRequired: false,
    state: "read",
  },
];

export const DEMO_THREAD_ID = DEMO_THREADS[0].id;
