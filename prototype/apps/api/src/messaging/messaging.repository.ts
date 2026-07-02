import { Injectable } from "@nestjs/common";
import type {
  Announcement,
  AnnouncementDelivery,
  AnnouncementDraft,
  AnnouncementRecipient,
  AnnouncementResult,
  Message,
  Thread,
} from "@roomlog/types";

export abstract class MessagingRepository {
  abstract listThreads(unitId?: string): Thread[];
  abstract getThread(id: string): Thread | undefined;
  abstract appendMessage(threadId: string, message: Message): Thread | undefined;
  abstract listAnnouncements(): Announcement[];
  abstract getAnnouncement(id: string): Announcement | undefined;
  abstract listAnnouncementDrafts(): AnnouncementDraft[];
  abstract getAnnouncementDraft(id: string): AnnouncementDraft | undefined;
  abstract saveAnnouncementDraft(
    draft: Partial<AnnouncementDraft>,
  ): AnnouncementDraft;
  abstract listAnnouncementRecipients(id: string): AnnouncementRecipient[];
  abstract markAnnouncementSent(id: string, sentAt: string): AnnouncementResult;
  abstract listAnnouncementResults(): AnnouncementResult[];
  abstract getAnnouncementResult(id: string): AnnouncementResult | undefined;
  abstract resendAnnouncementResult(id: string): AnnouncementResult | undefined;
}

const DEMO_MESSAGES: Message[] = [
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
  {
    id: "m_3",
    threadId: "th_0002",
    sender: "tenant",
    kind: "text",
    body: "분리수거 요일이 어떻게 되나요?",
    createdAt: "2026-06-28T14:00:00+09:00",
  },
];

const DEMO_THREADS: Thread[] = [
  {
    id: "th_0001",
    unitId: "302",
    tenantId: "tn_302",
    context: "defect",
    contextRef: "tk_0001",
    contextLabel: "하자 · 에어컨 물샘",
    lastMessage: "추가 사진 한 장만 더 부탁드려요.",
    unreadCount: 1,
    pendingRequest: true,
    archivedNotice: true,
    updatedAt: "2026-06-30T10:20:00+09:00",
    messages: DEMO_MESSAGES.filter((message) => message.threadId === "th_0001"),
  },
  {
    id: "th_0002",
    unitId: "302",
    tenantId: "tn_302",
    context: "general",
    contextLabel: "일반 문의",
    lastMessage: "분리수거 요일이 어떻게 되나요?",
    unreadCount: 0,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-06-28T14:00:00+09:00",
    messages: DEMO_MESSAGES.filter((message) => message.threadId === "th_0002"),
  },
  {
    id: "th_0003",
    unitId: "A-101",
    tenantId: "tn_a101",
    context: "announcement",
    contextRef: "an_l1",
    contextLabel: "공지 문의 · 계단 청소",
    lastMessage: "청소 시간에 복도 짐을 치워두면 될까요?",
    unreadCount: 2,
    pendingRequest: false,
    archivedNotice: true,
    updatedAt: "2026-06-29T10:30:00+09:00",
    messages: [
      {
        id: "m_4",
        threadId: "th_0003",
        sender: "tenant",
        kind: "text",
        body: "청소 시간에 복도 짐을 치워두면 될까요?",
        createdAt: "2026-06-29T10:30:00+09:00",
      },
    ],
  },
];

const DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "an_u1",
    category: "urgent",
    scope: "building",
    title: "[긴급] 오늘 14~16시 단수 안내",
    body: "노후 배관 교체로 오늘 14:00~16:00 단수됩니다. 미리 물을 받아두세요.",
    originalBody:
      "Water supply will be suspended today 14:00–16:00 for pipe replacement.",
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

const DEMO_DRAFTS: AnnouncementDraft[] = [
  {
    id: "ad_urgent_1",
    category: "urgent",
    scope: "building",
    targetLabel: "A동",
    title: "[긴급] A동 승강기 점검",
    body: "오늘 18:00부터 19:00까지 A동 승강기 긴급 점검이 진행됩니다.",
    translations: [
      {
        lang: "en",
        langLabel: "English",
        title: "[Urgent] Elevator inspection in Building A",
        body: "Emergency elevator inspection runs from 18:00 to 19:00 today.",
        reviewed: true,
      },
      {
        lang: "vi",
        langLabel: "Tiếng Việt",
        title: "[Khẩn cấp] Kiểm tra thang máy tòa A",
        body: "Thang máy tòa A sẽ được kiểm tra khẩn cấp từ 18:00 đến 19:00 hôm nay.",
        reviewed: false,
      },
    ],
    confirmRequired: true,
    status: "draft",
    updatedAt: "2026-07-02T08:30:00+09:00",
  },
  {
    id: "ad_life_1",
    category: "life",
    scope: "all",
    targetLabel: "전체",
    title: "7월 공용부 방역 안내",
    body: "7월 5일 오전 공용부 방역이 진행됩니다.",
    confirmRequired: false,
    status: "draft",
    updatedAt: "2026-07-01T17:00:00+09:00",
  },
  {
    id: "ad_sent_1",
    category: "urgent",
    scope: "unit",
    targetLabel: "302",
    title: "[긴급] 302호 누수 확인 요청",
    body: "302호 누수 점검을 위해 확인 버튼을 눌러주세요.",
    translations: [
      {
        lang: "en",
        langLabel: "English",
        title: "[Urgent] Water leak check for Unit 302",
        body: "Please confirm the water leak inspection request for Unit 302.",
        reviewed: true,
      },
    ],
    confirmRequired: true,
    status: "sent",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
];

const DEMO_RECIPIENTS: AnnouncementRecipient[] = [
  { unitId: "302", tenantName: "김민지", preferredLang: "ko" },
  { unitId: "A-101", tenantName: "Alex Kim", preferredLang: "en" },
  { unitId: "A-203", tenantName: "Nguyen Linh", preferredLang: "vi" },
  { unitId: "B-501", tenantName: "박준호", preferredLang: "ko" },
];

const DEMO_RESULTS: AnnouncementResult[] = [
  {
    announcementId: "ad_sent_1",
    category: "urgent",
    scope: "unit",
    title: "[긴급] 302호 누수 확인 요청",
    sentAt: "2026-07-01T09:00:00+09:00",
    version: 1,
    confirmRequired: true,
    counts: {
      total: 1,
      read: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
    },
    deliveries: [
      {
        unitId: "302",
        tenantName: "김민지",
        state: "read",
        readAt: "2026-07-01T09:20:00+09:00",
      },
    ],
  },
  {
    announcementId: "an_l1",
    category: "life",
    scope: "all",
    title: "계단 청소 안내 (매주 화요일)",
    sentAt: "2026-06-29T08:00:00+09:00",
    version: 1,
    confirmRequired: false,
    counts: {
      total: 4,
      read: 3,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
    },
    deliveries: [
      {
        unitId: "302",
        tenantName: "김민지",
        state: "read",
        readAt: "2026-06-29T08:30:00+09:00",
      },
      {
        unitId: "A-101",
        tenantName: "Alex Kim",
        state: "read",
        readAt: "2026-06-29T09:00:00+09:00",
      },
      {
        unitId: "A-203",
        tenantName: "Nguyen Linh",
        state: "read",
        readAt: "2026-06-29T11:00:00+09:00",
      },
      {
        unitId: "B-501",
        tenantName: "박준호",
        state: "unread",
      },
    ],
  },
];

@Injectable()
export class InMemoryMessagingRepository implements MessagingRepository {
  private readonly threads = new Map<string, Thread>();
  private readonly announcements = new Map<string, Announcement>();
  private readonly announcementDrafts = new Map<string, AnnouncementDraft>();
  private readonly announcementResults = new Map<string, AnnouncementResult>();

  constructor() {
    for (const thread of DEMO_THREADS) {
      this.threads.set(thread.id, thread);
    }

    for (const announcement of DEMO_ANNOUNCEMENTS) {
      this.announcements.set(announcement.id, announcement);
    }

    for (const draft of DEMO_DRAFTS) {
      this.announcementDrafts.set(draft.id, draft);
    }

    for (const result of DEMO_RESULTS) {
      this.announcementResults.set(result.announcementId, result);
    }
  }

  listThreads(unitId?: string): Thread[] {
    return Array.from(this.threads.values())
      .filter((thread) => !unitId || thread.unitId === unitId)
      .map(({ messages, ...thread }) => thread);
  }

  getThread(id: string): Thread | undefined {
    return this.threads.get(id);
  }

  appendMessage(threadId: string, message: Message): Thread | undefined {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return undefined;
    }

    const messages = [...(thread.messages ?? []), message];
    const updatedThread: Thread = {
      ...thread,
      lastMessage: message.body,
      pendingRequest: message.kind === "photo_request" ? true : thread.pendingRequest,
      updatedAt: message.createdAt,
      messages,
    };
    this.threads.set(threadId, updatedThread);
    return updatedThread;
  }

  listAnnouncements(): Announcement[] {
    return Array.from(this.announcements.values());
  }

  getAnnouncement(id: string): Announcement | undefined {
    return this.announcements.get(id);
  }

  listAnnouncementDrafts(): AnnouncementDraft[] {
    return Array.from(this.announcementDrafts.values());
  }

  getAnnouncementDraft(id: string): AnnouncementDraft | undefined {
    return this.announcementDrafts.get(id);
  }

  saveAnnouncementDraft(draft: Partial<AnnouncementDraft>): AnnouncementDraft {
    const now = new Date().toISOString();
    const id = draft.id ?? `ad_${Date.now()}`;
    const existing = this.announcementDrafts.get(id);
    const category = draft.category ?? existing?.category ?? "life";
    const saved: AnnouncementDraft = {
      id,
      category,
      scope: draft.scope ?? existing?.scope ?? "all",
      targetLabel: draft.targetLabel ?? existing?.targetLabel ?? "전체",
      title: draft.title ?? existing?.title ?? "",
      body: draft.body ?? existing?.body ?? "",
      translations: draft.translations ?? existing?.translations,
      confirmRequired: category === "urgent",
      status: draft.status ?? existing?.status ?? "draft",
      updatedAt: now,
    };
    this.announcementDrafts.set(id, saved);
    return saved;
  }

  listAnnouncementRecipients(id: string): AnnouncementRecipient[] {
    const draft = this.announcementDrafts.get(id);
    if (!draft) {
      return [];
    }

    if (draft.scope === "all") {
      return DEMO_RECIPIENTS;
    }

    if (draft.scope === "building") {
      return DEMO_RECIPIENTS.filter((recipient) =>
        recipient.unitId.startsWith(draft.targetLabel.replace("동", "-")),
      );
    }

    return DEMO_RECIPIENTS.filter(
      (recipient) => recipient.unitId === draft.targetLabel,
    );
  }

  markAnnouncementSent(id: string, sentAt: string): AnnouncementResult {
    const draft = this.announcementDrafts.get(id);
    if (!draft) {
      throw new Error(`Announcement draft not found: ${id}`);
    }

    const sentDraft: AnnouncementDraft = {
      ...draft,
      status: "sent",
      updatedAt: sentAt,
    };
    const recipients = this.listAnnouncementRecipients(id);
    const result: AnnouncementResult = {
      announcementId: id,
      category: sentDraft.category,
      scope: sentDraft.scope,
      title: sentDraft.title,
      sentAt,
      version: 1,
      confirmRequired: sentDraft.confirmRequired,
      counts: this.countDeliveries(
        recipients.map((recipient) => this.toUnreadDelivery(recipient)),
      ),
      deliveries: recipients.map((recipient) => this.toUnreadDelivery(recipient)),
    };

    this.announcementDrafts.set(id, sentDraft);
    this.announcementResults.set(id, result);
    return result;
  }

  listAnnouncementResults(): AnnouncementResult[] {
    return Array.from(this.announcementResults.values());
  }

  getAnnouncementResult(id: string): AnnouncementResult | undefined {
    return this.announcementResults.get(id);
  }

  resendAnnouncementResult(id: string): AnnouncementResult | undefined {
    const result = this.announcementResults.get(id);
    if (!result) {
      return undefined;
    }

    const previousDeliveries = new Map(
      result.deliveries.map((delivery) => [delivery.unitId, delivery]),
    );
    const deliveries = this.listAnnouncementRecipients(id).map((recipient) => {
      const previous = previousDeliveries.get(recipient.unitId);
      return previous?.state === "confirmed"
        ? previous
        : this.toUnreadDelivery(recipient);
    });
    const nextResult: AnnouncementResult = {
      ...result,
      version: result.version + 1,
      counts: this.countDeliveries(deliveries),
      deliveries,
    };
    this.announcementResults.set(id, nextResult);
    return nextResult;
  }

  private toUnreadDelivery(
    recipient: AnnouncementRecipient,
  ): AnnouncementDelivery {
    return {
      unitId: recipient.unitId,
      tenantName: recipient.tenantName,
      state: "unread",
    };
  }

  private countDeliveries(
    deliveries: AnnouncementDelivery[],
  ): AnnouncementResult["counts"] {
    return {
      total: deliveries.length,
      read: deliveries.filter((delivery) => delivery.state !== "unread").length,
      confirmed: deliveries.filter((delivery) => delivery.state === "confirmed")
        .length,
      unconfirmed: deliveries.filter(
        (delivery) => delivery.state !== "confirmed",
      ).length,
      failed: deliveries.filter((delivery) => delivery.failed).length,
    };
  }
}
