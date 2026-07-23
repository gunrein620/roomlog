// 메시징 도메인 — 1:1 스레드와 공지 broadcast를 서버 권한/원칙 게이트로 강제한다.
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { id, now } from "../roomlog-support";
import type {
  AddMessagingThreadMessageInput,
  CreateAnnouncementDraftInput,
  CreateMessagingThreadInput,
  CreateTenantMessagingThreadInput,
  MessagingAnnouncement,
  MessagingAnnouncementDelivery,
  MessagingAnnouncementDraft,
  MessagingAnnouncementReadState,
  MessagingAnnouncementResult,
  MessagingAnnouncementScope,
  MessagingMessage,
  MessagingMessageSender,
  ManagerMessagingRecipient,
  MessagingThread,
  MessagingThreadContext,
  Room,
  StartManagerConversationInput,
  TenantLandlordConversation,
  UpdateAnnouncementDraftInput,
  UserAccount
} from "../roomlog.types";
import type { Store } from "../roomlog.service";
import { resolveManagerTarget } from "./manager-target-resolver";
import { ANNOUNCEMENT_LANGUAGES, announcementSourceHash } from "./roomlog-announcement-support";

type InitialThreadMessage = NonNullable<CreateMessagingThreadInput["initialMessage"]>;

export class RoomlogMessagingDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => Room,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void,
    private readonly canManagerAccessRoom: (managerId: string, roomId: string) => boolean,
    private readonly displayUnitId: (room: Room) => string,
    private readonly timeOf: (iso?: string) => number
  ) {}

  createTenantMessagingThread(
    tenantId: string,
    input: CreateTenantMessagingThreadInput
  ): MessagingThread {
    const room = this.requireTenantRoom(tenantId, input.roomId);

    if (!room.landlordId) {
      throw new BadRequestException("연결된 관리인이 없어 메시지 스레드를 시작할 수 없습니다.");
    }

    const body = input.body?.trim() ?? "";
    const isGeneralLandlordThread = (input.context ?? "general") === "general" && !input.contextRef?.trim();

    const existing =
      isGeneralLandlordThread
        ? this.findTenantGeneralThread(tenantId, room.id)
        : undefined;
    if (existing) {
      if (body) {
        this.addThreadMessageInternal(existing, tenantId, {
          sender: "tenant",
          body,
          kind: input.kind ?? "text",
          attachmentUrls: input.attachmentUrls
        });
        this.persistStore();
      }
      return this.presentThread(existing, true);
    }

    // 새 스레드는 첫 메시지(본문 또는 첨부)가 있어야 만든다 —
    // 문의창을 열기만 해도 관리인 소통 허브에 빈 대화가 생기는 것을 서버에서 막는다.
    if (!body && !input.attachmentUrls?.length) {
      throw new BadRequestException("메시지 내용을 입력해주세요.");
    }

    const createdAt = now();
    const thread: MessagingThread = {
      id: id("mth"),
      roomId: room.id,
      unitId: this.displayUnitId(room),
      tenantId,
      context: input.context ?? "general",
      contextRef: input.contextRef?.trim() || undefined,
      contextLabel: input.contextLabel?.trim() || "일반 문의",
      lastMessage: body || "대화가 시작되었습니다.",
      unreadCount: 0,
      managerUnreadCount: 0,
      pendingRequest: false,
      archivedNotice: true,
      createdAt,
      updatedAt: createdAt
    };

    this.store.messagingThreads.push(thread);
    if (body) {
      this.addThreadMessageInternal(thread, tenantId, {
        sender: "tenant",
        body,
        kind: input.kind ?? "text",
        attachmentUrls: input.attachmentUrls
      });
    }
    this.persistStore();

    return this.presentThread(thread, true);
  }

  getTenantLandlordConversation(tenantId: string, roomId?: string): TenantLandlordConversation {
    const room = this.requireTenantRoom(tenantId, roomId);
    if (!room.landlordId) {
      throw new BadRequestException("연결된 관리인이 없어 대화를 시작할 수 없습니다.");
    }

    const landlord = this.store.users.find((user) => user.id === room.landlordId);
    if (!landlord) {
      throw new NotFoundException("연결된 관리인을 찾을 수 없습니다.");
    }

    return {
      threadId: this.findTenantGeneralThread(tenantId, room.id)?.id,
      roomId: room.id,
      buildingName: room.buildingName,
      unitId: this.displayUnitId(room),
      landlordName: landlord.name
    };
  }

  createMessagingThread(managerId: string, input: CreateMessagingThreadInput): MessagingThread {
    this.assertManagerCanAccessRoom(managerId, input.roomId);
    const room = this.findRoom(input.roomId);

    if (this.store.tenantRooms[input.tenantId] !== input.roomId) {
      throw new ForbiddenException("해당 세대 임차인에게만 메시지 스레드를 만들 수 있습니다.");
    }

    const createdAt = now();
    if (input.initialMessage?.sender === "manager") {
      this.assertNoPaymentDunning(input.context, input.initialMessage.body);
    }

    const thread: MessagingThread = {
      id: id("mth"),
      roomId: room.id,
      unitId: this.displayUnitId(room),
      tenantId: input.tenantId,
      context: input.context,
      contextRef: input.contextRef?.trim() || undefined,
      contextLabel: input.contextLabel?.trim() || undefined,
      lastMessage: input.initialMessage?.body.trim() || "대화가 시작되었습니다.",
      unreadCount: input.initialMessage?.sender === "manager" ? 1 : 0,
      managerUnreadCount: 0,
      pendingRequest: input.initialMessage?.kind === "photo_request",
      archivedNotice: true,
      createdAt,
      updatedAt: createdAt
    };

    this.store.messagingThreads.push(thread);

    if (input.initialMessage) {
      this.addThreadMessageInternal(thread, this.senderUserIdFor(thread, input.initialMessage.sender), input.initialMessage);
    }

    this.persistStore();

    return this.presentManagerThread(managerId, thread);
  }

  listTenantMessagingThreads(tenantId: string): MessagingThread[] {
    this.requireTenantRoom(tenantId);

    return this.store.messagingThreads
      .filter((thread) => thread.tenantId === tenantId)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt))
      .map((thread) => this.presentThread(thread));
  }

  getTenantMessagingThread(tenantId: string, threadId: string): MessagingThread {
    const thread = this.store.messagingThreads.find(
      (item) => item.id === threadId && item.tenantId === tenantId
    );

    if (!thread) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    return this.presentThread(thread, true);
  }

  markTenantMessagingThreadRead(tenantId: string, threadId: string): MessagingThread {
    const thread = this.store.messagingThreads.find(
      (item) => item.id === threadId && item.tenantId === tenantId
    );

    if (!thread) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    thread.unreadCount = 0;
    this.persistStore();

    return this.presentThread(thread, true);
  }

  addTenantMessagingThreadMessage(
    tenantId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ): MessagingThread {
    const thread = this.store.messagingThreads.find(
      (item) => item.id === threadId && item.tenantId === tenantId
    );

    if (!thread) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    this.addThreadMessageInternal(thread, tenantId, {
      sender: "tenant",
      body: input.body ?? "",
      kind: input.kind,
      attachmentUrls: input.attachmentUrls
    });
    this.persistStore();

    return this.presentThread(thread, true);
  }

  deleteTenantMessagingThread(tenantId: string, threadId: string) {
    const thread = this.store.messagingThreads.find(
      (item) => item.id === threadId && item.tenantId === tenantId
    );

    if (!thread) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    return this.deleteMessagingThread(thread.id);
  }

  listManagerMessagingThreads(managerId: string, context?: MessagingThreadContext): MessagingThread[] {
    const accessibleThreads = this.store.messagingThreads
      .filter((thread) => this.canManagerAccessRoom(managerId, thread.roomId))
      .filter((thread) => !context || thread.context === context)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt));

    return this.uniqueConversationThreads(accessibleThreads)
      .map((thread) => this.presentManagerThread(managerId, thread));
  }

  listManagerMessagingRecipients(managerId: string): ManagerMessagingRecipient[] {
    return Object.entries(this.store.tenantRooms)
      .flatMap(([tenantId, roomId]) => {
        if (!this.canManagerAccessRoom(managerId, roomId)) {
          return [];
        }

        const room = this.findRoom(roomId);
        const tenant = this.store.users.find((user) => user.id === tenantId);
        if (!tenant) {
          return [];
        }

        const existingGeneralThreadId = this.findTenantGeneralThread(tenantId, roomId)?.id;

        return [{
          roomId,
          buildingName: room.buildingName,
          unitId: this.displayUnitId(room),
          tenantId,
          tenantName: tenant.name,
          existingGeneralThreadId
        }];
      })
      .sort((left, right) =>
        `${left.buildingName}\u0000${left.unitId}\u0000${left.tenantName}`.localeCompare(
          `${right.buildingName}\u0000${right.unitId}\u0000${right.tenantName}`,
          "ko"
        )
      );
  }

  startManagerConversation(
    managerId: string,
    input: StartManagerConversationInput
  ): MessagingThread {
    this.assertManagerCanAccessRoom(managerId, input.roomId);

    if (this.store.tenantRooms[input.tenantId] !== input.roomId) {
      throw new ForbiddenException("해당 세대 임차인과만 대화를 시작할 수 있습니다.");
    }

    const existing = this.findTenantGeneralThread(input.tenantId, input.roomId);
    if (existing) {
      return this.presentManagerThread(managerId, existing);
    }

    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException("첫 메시지를 입력해주세요.");
    }

    return this.createMessagingThread(managerId, {
      roomId: input.roomId,
      tenantId: input.tenantId,
      context: "general",
      contextLabel: "일반 문의",
      initialMessage: {
        sender: "manager",
        body
      }
    });
  }

  getManagerMessagingThread(managerId: string, threadId: string): MessagingThread {
    const thread = this.findManagerThread(managerId, threadId);

    return this.presentManagerThread(managerId, thread, true);
  }

  markManagerMessagingThreadRead(managerId: string, threadId: string): MessagingThread {
    const thread = this.findManagerThread(managerId, threadId);
    thread.managerUnreadCount = 0;
    this.persistStore();

    return this.presentManagerThread(managerId, thread, true);
  }

  addManagerMessagingThreadMessage(
    managerId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ): MessagingThread {
    const thread = this.findManagerThread(managerId, threadId);

    this.assertNoPaymentDunning(thread.context, input.body ?? "");
    this.addThreadMessageInternal(thread, managerId, {
      sender: "manager",
      body: input.body ?? "",
      kind: input.kind,
      attachmentUrls: input.attachmentUrls
    });
    this.persistStore();

    return this.presentManagerThread(managerId, thread, true);
  }

  deleteManagerMessagingThread(managerId: string, threadId: string) {
    const thread = this.findManagerThread(managerId, threadId);

    return this.deleteMessagingThread(thread.id);
  }

  createManagerAnnouncementDraft(
    managerId: string,
    input: CreateAnnouncementDraftInput
  ): MessagingAnnouncementDraft {
    this.assertAnnouncementContent(input.title, input.body, input.targetLabel);
    const targetRooms = this.targetRoomsFor(managerId, input);
    const createdAt = now();
    const draft: MessagingAnnouncementDraft = {
      id: id("mad"),
      category: input.category,
      scope: input.scope,
      targetLabel: input.targetLabel.trim(),
      targetRoomIds: targetRooms.map((room) => room.id),
      title: input.title.trim(),
      body: input.body.trim(),
      translations: input.translations ?? [],
      confirmRequired: input.category === "urgent",
      status: "draft",
      createdByManagerId: managerId,
      createdAt,
      updatedAt: createdAt
    };

    this.store.messagingAnnouncementDrafts.push(draft);
    this.persistStore();

    return this.presentDraft(draft);
  }

  listManagerAnnouncementDrafts(managerId: string): MessagingAnnouncementDraft[] {
    return this.store.messagingAnnouncementDrafts
      .filter((draft) => draft.createdByManagerId === managerId)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt))
      .map((draft) => this.presentDraft(draft));
  }

  getManagerAnnouncementDraft(managerId: string, draftId: string): MessagingAnnouncementDraft {
    return this.presentDraft(this.findManagerDraft(managerId, draftId));
  }

  updateManagerAnnouncementDraft(
    managerId: string,
    draftId: string,
    input: UpdateAnnouncementDraftInput
  ): MessagingAnnouncementDraft {
    const draft = this.findManagerDraft(managerId, draftId);

    if (draft.status === "sent") {
      throw new BadRequestException("발송된 공지는 수정할 수 없습니다.");
    }

    this.assertAnnouncementContent(input.title, input.body, input.targetLabel);
    const targetRooms = this.targetRoomsFor(managerId, input);
    const sourceChanged =
      draft.title.trim() !== input.title.trim() || draft.body.trim() !== input.body.trim();
    const updatedSourceHash = announcementSourceHash(input.title, input.body);
    draft.category = input.category;
    draft.scope = input.scope;
    draft.targetLabel = input.targetLabel.trim();
    draft.targetRoomIds = targetRooms.map((room) => room.id);
    draft.title = input.title.trim();
    draft.body = input.body.trim();
    draft.translations = input.translations.map((translation) => ({
      ...translation,
      reviewed:
        sourceChanged && translation.sourceHash !== updatedSourceHash
          ? false
          : translation.reviewed
    }));
    draft.confirmRequired = input.category === "urgent";
    draft.updatedAt = now();
    this.persistStore();

    return this.presentDraft(draft);
  }

  listManagerAnnouncementRecipients(managerId: string, draftId: string) {
    const draft = this.findManagerDraft(managerId, draftId);

    return this.recipientsForDraft(draft).map(({ room, tenant }) => ({
      unitId: this.displayUnitId(room),
      tenantName: tenant.name,
      preferredLang: this.preferredLangFor(tenant)
    }));
  }

  // AI 비서의 자연어 공지 대상("전체", 건물명, "건물명 302호")을 실제 호실 스코프로 해석한다.
  // 애매하거나 못 찾으면 BadRequest로 이유를 돌려줘, 에이전트가 사용자에게 되묻게 한다.
  resolveManagerAnnouncementAudience(
    managerId: string,
    target?: string,
    followupText?: string
  ): {
    scope: MessagingAnnouncementScope;
    targetLabel: string;
    targetRoomIds: string[];
    recipientCount: number;
  } {
    const managedRooms = this.store.rooms.filter((room) => room.landlordId === managerId);

    if (managedRooms.length === 0) {
      throw new ForbiddenException("관리 중인 호실이 없습니다.");
    }

    const normalized = (target ?? "").trim();
    const wantsAll = !normalized || /^(전체|전부|모두|모든\s*세대|전\s*세대|all)$/i.test(normalized);
    const recipientRoomIds = new Set(
      this.recipientsForDraft({
        targetRoomIds: managedRooms.map((room) => room.id)
      } as MessagingAnnouncementDraft).map(({ room }) => room.id)
    );
    const recipientRooms = managedRooms.filter((room) => recipientRoomIds.has(room.id));
    const resolvableRooms = recipientRooms.length > 0 ? recipientRooms : managedRooms;

    let scope: MessagingAnnouncementScope;
    let targetLabel: string;
    let rooms: Room[];

    if (wantsAll) {
      scope = "all";
      targetLabel = "전체";
      rooms = managedRooms;
    } else {
      const roomNoMatch = normalized.match(/(\d+)\s*호/);

      if (roomNoMatch) {
        const resolution = resolveManagerTarget(
          normalized,
          resolvableRooms.map((room) => ({
            id: room.id,
            buildingName: room.buildingName,
            unitId: this.displayUnitId(room)
          })),
          followupText
        );

        if (resolution.status === "not_found") {
          throw new BadRequestException(
            `'${normalized}' 대상 호실을 찾지 못했습니다. 건물명과 호수를 다시 확인해 주세요.`
          );
        }
        if (resolution.status === "ambiguous") {
          const choices = resolution.candidates
            .map((candidate) => `${candidate.buildingName} ${candidate.unitId}호`)
            .join(", ");
          throw new BadRequestException(
            `${roomNoMatch[1]}호 후보가 여러 곳입니다(${choices}). 건물명을 함께 알려주세요.`
          );
        }

        rooms = resolvableRooms.filter((room) => room.id === resolution.candidate.id);
        scope = "unit";
        targetLabel = `${rooms[0].buildingName} ${this.displayUnitId(rooms[0])}호`;
      } else {
        const buildingNames = [...new Set(resolvableRooms.map((room) => room.buildingName))];
        const resolution = resolveManagerTarget(
          normalized,
          buildingNames.map((buildingName) => ({
            id: buildingName,
            buildingName,
            unitId: ""
          })),
          followupText
        );

        if (resolution.status === "not_found") {
          throw new BadRequestException(
            `'${normalized}' 대상을 찾지 못했습니다. 전체, 건물명, 또는 '건물명 302호' 형식으로 알려주세요.`
          );
        }
        if (resolution.status === "ambiguous") {
          throw new BadRequestException(
            `'${normalized}'에 해당하는 건물이 여러 곳입니다(${resolution.candidates
              .map((candidate) => candidate.buildingName)
              .join(", ")}). 하나를 지정해 주세요.`
          );
        }

        scope = "building";
        targetLabel = resolution.candidate.buildingName;
        rooms = resolvableRooms.filter((room) => room.buildingName === targetLabel);
      }
    }

    const targetRoomIds = rooms.map((room) => room.id);
    const recipientCount = this.recipientsForDraft({
      targetRoomIds
    } as MessagingAnnouncementDraft).length;

    return { scope, targetLabel, targetRoomIds, recipientCount };
  }

  // AI 비서 확정 경로 — 초안 생성과 발송을 한 번에 처리한다. 긴급(urgent) 카테고리는
  // 번역 검수 게이트가 있어 화면 전용이므로, 에이전트 공지는 생활(life)로 고정한다.
  sendManagerAgentAnnouncement(
    managerId: string,
    input: {
      scope: MessagingAnnouncementScope;
      targetLabel: string;
      targetRoomIds: string[];
      title: string;
      body: string;
    }
  ): MessagingAnnouncementResult {
    const draft = this.createManagerAnnouncementDraft(managerId, {
      category: "life",
      scope: input.scope,
      targetLabel: input.targetLabel,
      targetRoomIds: input.targetRoomIds,
      title: input.title,
      body: input.body
    });

    return this.sendManagerAnnouncementDraft(managerId, draft.id);
  }

  sendManagerAnnouncementDraft(managerId: string, draftId: string): MessagingAnnouncementResult {
    const draft = this.findManagerDraft(managerId, draftId);

    if (draft.status === "sent") {
      throw new BadRequestException("이미 발송된 공지입니다.");
    }

    this.assertManagerCanAccessDraftRooms(managerId, draft);
    this.assertUrgentTranslationsReviewed(draft);
    const recipients = this.recipientsForDraft(draft);

    if (recipients.length === 0) {
      throw new BadRequestException("공지 수신 세대가 없습니다.");
    }

    const manager = this.findUser(managerId);
    const sentAt = now();
    const announcement: MessagingAnnouncement = {
      id: id("mann"),
      draftId: draft.id,
      category: draft.category,
      scope: draft.scope,
      targetLabel: draft.targetLabel,
      title: draft.title,
      body: draft.body,
      sender: manager.name,
      senderId: manager.id,
      sentAt,
      confirmRequired: draft.confirmRequired,
      safetyCta: draft.category === "urgent" ? "안전 확인" : undefined
    };

    this.store.messagingAnnouncements.push(announcement);
    this.store.messagingAnnouncementDeliveries.push(
      ...recipients.map(({ room, tenant }) => ({
        id: id("mdl"),
        announcementId: announcement.id,
        tenantId: tenant.id,
        roomId: room.id,
        unitId: this.displayUnitId(room),
        tenantName: tenant.name,
        preferredLang: this.preferredLangFor(tenant),
        state: "unread" as MessagingAnnouncementReadState
      }))
    );
    draft.status = "sent";
    draft.updatedAt = sentAt;
    this.persistStore();

    return this.buildAnnouncementResult(announcement);
  }

  listTenantMessagingAnnouncements(tenantId: string, roomId?: string): MessagingAnnouncement[] {
    const selectedRoomId = roomId?.trim();
    if (selectedRoomId) {
      this.requireTenantRoom(tenantId, selectedRoomId);
    }

    return this.store.messagingAnnouncementDeliveries
      .filter(
        (delivery) =>
          delivery.tenantId === tenantId &&
          (!selectedRoomId || delivery.roomId === selectedRoomId)
      )
      .sort((a, b) => {
        const aAnnouncement = this.findAnnouncement(a.announcementId);
        const bAnnouncement = this.findAnnouncement(b.announcementId);

        return this.timeOf(bAnnouncement.sentAt) - this.timeOf(aAnnouncement.sentAt);
      })
      .map((delivery) => this.presentTenantAnnouncement(delivery));
  }

  getTenantMessagingAnnouncement(tenantId: string, announcementId: string): MessagingAnnouncement {
    return this.presentTenantAnnouncement(this.findTenantDelivery(tenantId, announcementId));
  }

  markTenantMessagingAnnouncementRead(
    tenantId: string,
    announcementId: string
  ): MessagingAnnouncement {
    const delivery = this.findTenantDelivery(tenantId, announcementId);

    if (delivery.state === "unread") {
      delivery.state = "read";
      delivery.readAt = now();
      this.persistStore();
    }

    return this.presentTenantAnnouncement(delivery);
  }

  confirmTenantMessagingAnnouncement(
    tenantId: string,
    announcementId: string
  ): MessagingAnnouncement {
    const delivery = this.findTenantDelivery(tenantId, announcementId);
    const announcement = this.findAnnouncement(announcementId);

    if (!announcement.confirmRequired) {
      this.markTenantMessagingAnnouncementRead(tenantId, announcementId);
      return this.presentTenantAnnouncement(delivery);
    }

    const confirmedAt = now();
    delivery.state = "confirmed";
    delivery.readAt = delivery.readAt ?? confirmedAt;
    delivery.confirmedAt = confirmedAt;
    this.persistStore();

    return this.presentTenantAnnouncement(delivery);
  }

  listManagerAnnouncementResults(managerId: string): MessagingAnnouncementResult[] {
    return this.store.messagingAnnouncements
      .filter((announcement) => announcement.senderId === managerId)
      .sort((a, b) => this.timeOf(b.sentAt) - this.timeOf(a.sentAt))
      .map((announcement) => this.buildAnnouncementResult(announcement));
  }

  getManagerAnnouncementResult(
    managerId: string,
    announcementId: string
  ): MessagingAnnouncementResult {
    const announcement = this.store.messagingAnnouncements.find(
      (item) => item.id === announcementId && item.senderId === managerId
    );

    if (!announcement) {
      throw new NotFoundException("공지 결과를 찾을 수 없습니다.");
    }

    return this.buildAnnouncementResult(announcement);
  }

  private addThreadMessageInternal(
    thread: MessagingThread,
    senderUserId: string,
    input: InitialThreadMessage | (AddMessagingThreadMessageInput & { sender: MessagingMessageSender })
  ) {
    const body = input.body?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!body && attachmentUrls.length === 0) {
      throw new BadRequestException("메시지 내용 또는 첨부가 필요합니다.");
    }

    const createdAt = now();
    const message: MessagingMessage = {
      id: id("msg"),
      threadId: thread.id,
      senderUserId,
      sender: input.sender,
      kind: input.kind ?? "text",
      body: body || "사진을 첨부했습니다.",
      attachmentUrls,
      createdAt
    };

    this.store.messagingMessages.push(message);
    thread.lastMessage = message.body;
    thread.updatedAt = createdAt;

    if (message.sender === "manager") {
      thread.unreadCount += 1;
    } else {
      thread.managerUnreadCount += 1;
    }

    if (message.kind === "photo_request") {
      thread.pendingRequest = true;
    }

    if (message.kind === "photo_response" && message.sender === "tenant") {
      thread.pendingRequest = false;
    }

    return message;
  }

  private deleteMessagingThread(threadId: string) {
    const threadIndex = this.store.messagingThreads.findIndex((thread) => thread.id === threadId);

    if (threadIndex < 0) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    this.store.messagingThreads.splice(threadIndex, 1);

    for (let index = this.store.messagingMessages.length - 1; index >= 0; index -= 1) {
      if (this.store.messagingMessages[index].threadId === threadId) {
        this.store.messagingMessages.splice(index, 1);
      }
    }

    this.persistStore();

    return { threadId, deleted: true as const };
  }

  private findManagerThread(managerId: string, threadId: string) {
    const thread = this.store.messagingThreads.find((item) => item.id === threadId);

    if (!thread || !this.canManagerAccessRoom(managerId, thread.roomId)) {
      throw new NotFoundException("메시지 스레드를 찾을 수 없습니다.");
    }

    return thread;
  }

  private presentThread(thread: MessagingThread, includeMessages = false): MessagingThread {
    const threadMessages = this.store.messagingMessages
      .filter((message) => message.threadId === thread.id)
      .sort((a, b) => this.timeOf(a.createdAt) - this.timeOf(b.createdAt));

    const room = this.findRoom(thread.roomId);

    return {
      ...thread,
      buildingName: room.buildingName,
      unitId: this.displayUnitId(room),
      // 목록 응답에는 messages가 빠지므로, "마지막 발신자"만 별도로 실어
      // 관리인 미응답(마지막 발신자=세입자) 판정을 목록만으로 가능하게 한다.
      lastMessageSender: threadMessages.at(-1)?.sender,
      messages: includeMessages
        ? threadMessages.map((message) => ({ ...message, attachmentUrls: [...message.attachmentUrls] }))
        : undefined
    };
  }

  private presentManagerThread(
    managerId: string,
    thread: MessagingThread,
    includeMessages = false
  ): MessagingThread {
    const presented = this.presentThread(thread, includeMessages);
    const ticketId = thread.context === "defect" ? thread.contextRef?.trim() : undefined;
    if (!ticketId) {
      return presented;
    }

    const linkedTicket = this.store.tickets.find(
      (ticket) => ticket.id === ticketId && ticket.roomId === thread.roomId
    );
    if (!linkedTicket) {
      return presented;
    }

    const isManagerTicketUnread = !this.store.managerTicketReads?.some(
      (read) => read.managerId === managerId && read.ticketId === linkedTicket.id
    );

    return { ...presented, isManagerTicketUnread };
  }

  private senderUserIdFor(thread: MessagingThread, sender: MessagingMessageSender) {
    if (sender === "tenant") {
      return thread.tenantId;
    }

    return this.findRoom(thread.roomId).landlordId ?? "";
  }

  private requireTenantRoom(tenantId: string, selectedRoomId?: string) {
    const roomId = selectedRoomId?.trim() || this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("임차인 호실을 찾을 수 없습니다.");
    }

    const canAccess =
      this.store.tenantRooms[tenantId] === roomId ||
      this.store.contracts.some((contract) => contract.tenantId === tenantId && contract.roomId === roomId);

    if (!canAccess) {
      throw new ForbiddenException("해당 호실 임차인만 대화를 시작할 수 있습니다.");
    }

    return this.findRoom(roomId);
  }

  private findTenantGeneralThread(tenantId: string, roomId: string) {
    return this.store.messagingThreads
      .filter(
        (thread) =>
          thread.tenantId === tenantId &&
          thread.roomId === roomId &&
          thread.context === "general" &&
          !thread.contextRef
      )
      .sort((left, right) => this.timeOf(right.updatedAt) - this.timeOf(left.updatedAt))[0];
  }

  private uniqueConversationThreads(threads: MessagingThread[]) {
    const seenGeneralThreads = new Set<string>();

    return threads.filter((thread) => {
      const key = this.generalConversationKey(thread);
      if (!key) {
        return true;
      }

      if (seenGeneralThreads.has(key)) {
        return false;
      }

      seenGeneralThreads.add(key);
      return true;
    });
  }

  private generalConversationKey(
    thread: Pick<MessagingThread, "roomId" | "tenantId" | "context" | "contextRef">
  ) {
    if (thread.context !== "general" || thread.contextRef?.trim()) {
      return "";
    }

    return `${thread.roomId}\u0000${thread.tenantId}`;
  }

  private assertNoPaymentDunning(context: MessagingThreadContext, body: string) {
    if (context !== "payment") {
      return;
    }

    if (/(독촉|납부|미납|연체|입금|청구|pay|overdue|deposit)/i.test(body)) {
      throw new BadRequestException(
        "납부 맥락 1:1 메시지에서는 독촉·청구 문구를 보낼 수 없습니다. 납부 채널에서 처리해주세요."
      );
    }
  }

  private assertAnnouncementContent(title: string, body: string, targetLabel: string) {
    if (!title?.trim() || !body?.trim()) {
      throw new BadRequestException("공지 제목과 내용을 입력해주세요.");
    }

    if (!targetLabel?.trim()) {
      throw new BadRequestException("공지 대상을 입력해주세요.");
    }

    if (/(미납|연체|독촉|체납)/.test(`${title} ${body} ${targetLabel}`)) {
      throw new BadRequestException("공지 채널에서는 미납 세대 독촉을 보낼 수 없습니다.");
    }
  }

  private targetRoomsFor(managerId: string, input: CreateAnnouncementDraftInput) {
    const managedRooms = this.store.rooms.filter((room) => room.landlordId === managerId);

    if (managedRooms.length === 0) {
      throw new ForbiddenException("관리 중인 호실이 없습니다.");
    }

    const requestedRoomIds = input.targetRoomIds;

    if (input.scope === "all") {
      if (requestedRoomIds === undefined) {
        return managedRooms;
      }

      const requested = new Set(requestedRoomIds);
      const managed = new Set(managedRooms.map((room) => room.id));
      if (requested.size !== managed.size || [...requested].some((roomId) => !managed.has(roomId))) {
        throw new BadRequestException("전체 공지는 관리 중인 전체 호실을 대상으로 선택해야 합니다.");
      }

      return managedRooms;
    }

    if (input.scope === "unit") {
      const targetRoomIds = requestedRoomIds ?? [];

      if (targetRoomIds.length === 0) {
        throw new BadRequestException("호실 공지는 대상 호실이 필요합니다.");
      }

      return targetRoomIds.map((roomId) => {
        this.assertManagerCanAccessRoom(managerId, roomId);
        return this.findRoom(roomId);
      });
    }

    if (requestedRoomIds !== undefined && requestedRoomIds.length === 0) {
      throw new BadRequestException("건물 공지는 대상 호실이 필요합니다.");
    }

    if (requestedRoomIds?.length) {
      return requestedRoomIds.map((roomId) => {
        this.assertManagerCanAccessRoom(managerId, roomId);
        return this.findRoom(roomId);
      });
    }

    return managedRooms;
  }

  private assertUrgentTranslationsReviewed(draft: MessagingAnnouncementDraft) {
    if (draft.category !== "urgent" || draft.translations.length === 0) {
      return;
    }

    const currentSourceHash = announcementSourceHash(draft.title, draft.body);
    for (const required of ANNOUNCEMENT_LANGUAGES) {
      const matches = draft.translations.filter((translation) => translation.lang === required.lang);
      if (matches.length !== 1) {
        throw new BadRequestException(`긴급 공지는 ${required.label} 번역이 정확히 하나 필요합니다.`);
      }

      const translation = matches[0];
      if (!translation.title.trim() || !translation.body.trim()) {
        throw new BadRequestException(`긴급 공지 ${required.label} 번역 내용을 입력해주세요.`);
      }
      if (translation.sourceHash !== currentSourceHash) {
        throw new BadRequestException(`긴급 공지 ${required.label} 번역이 현재 원문과 다릅니다.`);
      }
      if (!translation.reviewed) {
        throw new BadRequestException(`긴급 공지 ${required.label} 번역 검수를 완료해주세요.`);
      }
    }
  }

  private findManagerDraft(managerId: string, draftId: string) {
    const draft = this.store.messagingAnnouncementDrafts.find(
      (item) => item.id === draftId && item.createdByManagerId === managerId
    );

    if (!draft) {
      throw new NotFoundException("공지 초안을 찾을 수 없습니다.");
    }

    return draft;
  }

  private assertManagerCanAccessDraftRooms(managerId: string, draft: MessagingAnnouncementDraft) {
    for (const roomId of draft.targetRoomIds) {
      this.assertManagerCanAccessRoom(managerId, roomId);
    }
  }

  private recipientsForDraft(draft: MessagingAnnouncementDraft) {
    const targetRoomIds = new Set(draft.targetRoomIds);
    const recipients = new Map<string, { tenant: UserAccount; room: Room }>();

    for (const [tenantId, roomId] of Object.entries(this.store.tenantRooms)) {
      if (!targetRoomIds.has(roomId)) continue;

      recipients.set(`${tenantId}:${roomId}`, {
        tenant: this.findUser(tenantId),
        room: this.findRoom(roomId)
      });
    }

    for (const contract of this.store.contracts) {
      if (!contract.tenantId) continue;
      if (contract.lifecycle === "expired") continue;
      if (!targetRoomIds.has(contract.roomId)) continue;

      recipients.set(`${contract.tenantId}:${contract.roomId}`, {
        tenant: this.findUser(contract.tenantId),
        room: this.findRoom(contract.roomId)
      });
    }

    return [...recipients.values()];
  }

  private findTenantDelivery(tenantId: string, announcementId: string) {
    const delivery = this.store.messagingAnnouncementDeliveries.find(
      (item) => item.tenantId === tenantId && item.announcementId === announcementId
    );

    if (!delivery) {
      throw new NotFoundException("공지 수신 내역을 찾을 수 없습니다.");
    }

    return delivery;
  }

  private presentTenantAnnouncement(delivery: MessagingAnnouncementDelivery): MessagingAnnouncement {
    const announcement = this.findAnnouncement(delivery.announcementId);
    const draft = announcement.draftId
      ? this.store.messagingAnnouncementDrafts.find((item) => item.id === announcement.draftId)
      : undefined;
    const translation = draft?.translations.find(
      (item) => item.lang === delivery.preferredLang && item.reviewed
    );

    return {
      ...announcement,
      title: translation?.title ?? announcement.title,
      body: translation?.body ?? announcement.body,
      originalBody: translation ? announcement.body : announcement.originalBody,
      state: delivery.state
    };
  }

  private findAnnouncement(announcementId: string) {
    const announcement = this.store.messagingAnnouncements.find((item) => item.id === announcementId);

    if (!announcement) {
      throw new NotFoundException("공지 내역을 찾을 수 없습니다.");
    }

    return announcement;
  }

  private buildAnnouncementResult(announcement: MessagingAnnouncement): MessagingAnnouncementResult {
    const deliveries = this.store.messagingAnnouncementDeliveries
      .filter((delivery) => delivery.announcementId === announcement.id)
      .sort((a, b) => a.unitId.localeCompare(b.unitId, "ko-KR"));
    const failed = deliveries.filter((delivery) => delivery.failed).length;
    const read = deliveries.filter(
      (delivery) => delivery.state === "read" || delivery.state === "confirmed"
    ).length;
    const confirmed = deliveries.filter((delivery) => delivery.state === "confirmed").length;

    return {
      announcementId: announcement.id,
      category: announcement.category,
      scope: announcement.scope,
      title: announcement.title,
      sentAt: announcement.sentAt,
      version: 1,
      confirmRequired: announcement.confirmRequired,
      counts: {
        total: deliveries.length,
        read,
        confirmed,
        unconfirmed: deliveries.length - confirmed,
        failed
      },
      deliveries: deliveries.map((delivery) => ({
        unitId: delivery.unitId,
        tenantName: delivery.tenantName,
        state: delivery.state,
        readAt: delivery.readAt,
        confirmedAt: delivery.confirmedAt,
        failed: delivery.failed
      }))
    };
  }

  private presentDraft(draft: MessagingAnnouncementDraft): MessagingAnnouncementDraft {
    return {
      ...draft,
      targetRoomIds: [...draft.targetRoomIds],
      translations: draft.translations.map((translation) => ({ ...translation }))
    };
  }

  private preferredLangFor(_tenant: UserAccount) {
    return "ko";
  }

  private findUser(userId: string) {
    const user = this.store.users.find((item) => item.id === userId);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return user;
  }
}
