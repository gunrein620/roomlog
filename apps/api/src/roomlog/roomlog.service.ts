import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { createFileStorageAdapter, FileStorageAdapter } from "./storage.service";
import {
  hasRequiredPasswordMix,
  hashPassword,
  id,
  isValidPhoneNumber,
  normalizePhoneNumber,
  now,
  tokenFor,
  tokenSecret,
  verifyPassword
} from "./roomlog-support";
import { RoomlogAuthDomain } from "./services/roomlog-auth.domain";
import { RoomlogFloorPlanDomain } from "./services/roomlog-floor-plan.domain";
import { RoomlogCostDomain } from "./services/roomlog-cost.domain";
import { RoomlogChecklistDomain } from "./services/roomlog-checklist.domain";
import { RoomlogContractDomain } from "./services/roomlog-contract.domain";
import { RoomlogVendorMgmtDomain } from "./services/roomlog-vendor-mgmt.domain";
import { RoomlogVendorRepairDomain } from "./services/roomlog-vendor-repair.domain";
import { RoomlogMessagingDomain } from "./services/roomlog-messaging.domain";
import { RoomlogMoveoutDomain } from "./services/roomlog-moveout.domain";
import {
  AddMessagingThreadMessageInput,
  AddTenantComplaintMessageInput,
  AddVendorRepairMessageInput,
  AiFeedback,
  AiFeedbackTarget,
  AiAnalysis,
  ApproveRepairEstimateInput,
  AssignVendorInput,
  Attachment,
  CallbotTicketContext,
  Complaint,
  ComplaintSourceChannel,
  ComplaintStatus,
  ConfirmTenantCompletionInput,
  Contract,
  ContractDocument,
  ContractExtraction,
  ContractInvite,
  ContractPrivacy,
  Cost,
  CostReviewQueueSummary,
  CostType,
  CreateAnnouncementDraftInput,
  DeletionState,
  CreateComplaintFromCallInput,
  CreateComplaintInput,
  CreateIntakeSessionInput,
  CreateMessagingThreadInput,
  CreateMoveoutDisputeInput,
  CreateMoveInChecklistItemInput,
  CreateTenantMoveoutInquiryInput,
  DisclosureSetting,
  DuplicateTicketCandidate,
  FinalizeIntakeInput,
  FloorPlanDraft,
  FloorPlanWall,
  IntakeDraft,
  IntakeMessage,
  IntakeSession,
  IntakeSlot,
  IntakeSlotKey,
  IntakeThreadSummary,
  MessagingAnnouncement,
  MessagingAnnouncementDelivery,
  MessagingAnnouncementDraft,
  MessagingAnnouncementResult,
  MessagingMessage,
  MessagingThread,
  MessagingThreadContext,
  ManagerAssistantQueryInput,
  ManagerAssistantQueryResult,
  ManagerAssistantTicketMatch,
  ManagerReplyDraftInput,
  ManagerReplyDraftResult,
  ManagerReplyIntent,
  ManagerTicketReplyInput,
  MoveInChecklistItem,
  MoveoutAdjustDeductionInput,
  MoveoutAdjustWearVerdictInput,
  MoveoutChecklistItem,
  MoveoutCompleteReviewInput,
  MoveoutDeductionCandidate,
  MoveoutDispute,
  MoveoutManagerSettlementReview,
  MoveoutRecordItem,
  MoveoutReportAuditEntry,
  MoveoutRespondDisputeInput,
  MoveoutSettlementEstimate,
  MoveoutSummary,
  PhotoAnalysis,
  PhotoComparisonStatus,
  RealtimeClientSecretInput,
  RealtimeClientSecretResult,
  RecordRealtimeTurnInput,
  RepeatIssueSummary,
  ReopenTenantComplaintInput,
  RepairRequest,
  RepairStatus,
  ReviewTenantAiFeedbackInput,
  ReportCompletionInput,
  Receipt,
  ReceiptOcr,
  Room,
  RoomTimelineEntry,
  SaveAttachmentInput,
  SaveFloorPlanDraftInput,
  ScheduleRepairInput,
  SendIntakeMessageInput,
  StatusHistory,
  SubmitTenantAiFeedbackInput,
  SubmitEstimateInput,
  Ticket,
  TicketMessage,
  TicketStatus,
  UserAccount,
  UserRole
} from "./roomlog.types";

export type SignupInput = {
  email: string;
  password: string;
  passwordConfirm?: string;
  name: string;
  phone?: string;
  role: UserRole;
  inviteToken?: string;
  buildingName?: string;
  roomNo?: string;
  address?: string;
  businessName?: string;
  serviceArea?: string;
};

export type CreateVendorInviteInput = {
  email?: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
};

export type CreateTenantInviteInput = {
  roomId: string;
  email?: string;
  tenantName: string;
  phone?: string;
  moveInDate?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type VendorMgmtTrade =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "appliance"
  | "locksmith"
  | "waterproofing"
  | "cleaning"
  | "general"
  | "other";

export type VendorMgmtListFilters = {
  q?: string;
  trade?: string;
  sort?: string;
};

export type ManagerContractOrigin = "tenant_upload" | "manager_upload" | "manual";

export type ManagerContractRow = {
  contract: Contract;
  tenantName: string;
  buildingName: string;
  origin: ManagerContractOrigin;
  statusLabel: string;
  slaOverdue: boolean;
  needsCheckCount: number;
  daysToExpire: number;
  mobileQuickConfirm: boolean;
};

export type ConfirmContractInput = {
  confirmNeedsCheck?: boolean;
  note?: string;
};


export type RoomlogServiceOptions = {
  storeFilePath?: string;
  uploadDir?: string;
  publicUploadBaseUrl?: string;
  storageAdapter?: FileStorageAdapter;
  seedDemoData?: boolean;
  initialStore?: Store;
  storeProjector?: StoreProjector;
};

export type AuthResult = {
  userId: string;
  role: UserRole;
  accessToken: string;
  name: string;
};

export type VendorSummary = {
  id: string;
  userId: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  activeJobs: number;
};

export type VendorInvite = {
  id: string;
  inviteToken: string;
  invitedByManagerId: string;
  email?: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  signupUrl: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

export type TenantInvite = {
  id: string;
  inviteToken: string;
  invitedByManagerId: string;
  roomId: string;
  email?: string;
  tenantName: string;
  phone?: string;
  moveInDate?: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  signupUrl: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

export type Store = {
  users: UserAccount[];
  rooms: Room[];
  tenantRooms: Record<string, string>;
  vendors: VendorSummary[];
  vendorInvites: VendorInvite[];
  tenantInvites: TenantInvite[];
  contracts: Contract[];
  contractDocuments: ContractDocument[];
  contractExtractions: ContractExtraction[];
  contractPrivacies: ContractPrivacy[];
  contractInvites: ContractInvite[];
  attachments: Attachment[];
  floorPlans: FloorPlanDraft[];
  moveInChecklist: MoveInChecklistItem[];
  aiFeedback: AiFeedback[];
  intakeSessions: IntakeSession[];
  complaints: Complaint[];
  analyses: Record<string, AiAnalysis>;
  tickets: Ticket[];
  repairs: RepairRequest[];
  costs: Cost[];
  receipts: Receipt[];
  receiptOcrs: ReceiptOcr[];
  messages: TicketMessage[];
  messagingThreads: MessagingThread[];
  messagingMessages: MessagingMessage[];
  messagingAnnouncementDrafts: MessagingAnnouncementDraft[];
  messagingAnnouncements: MessagingAnnouncement[];
  messagingAnnouncementDeliveries: MessagingAnnouncementDelivery[];
  moveouts: MoveoutSummary[];
  moveoutRecords: MoveoutRecordItem[];
  moveoutChecklist: MoveoutChecklistItem[];
  moveoutSettlements: MoveoutSettlementEstimate[];
  moveoutDeductions: MoveoutDeductionCandidate[];
  moveoutDisputes: MoveoutDispute[];
  moveoutReportAudits: MoveoutReportAuditEntry[];
  history: StatusHistory[];
};

export type StoreProjector = {
  load?(): Store | undefined | Promise<Store | undefined>;
  persist(store: Store): void | Promise<void>;
  disconnect?(): void | Promise<void>;
};

type GeneratedIntakeTurn = {
  assistantMessage: string;
  draft: IntakeDraft;
  source: "openai" | "fallback";
};

export const ROOMLOG_SERVICE_OPTIONS = "ROOMLOG_SERVICE_OPTIONS";

function priorityDueAt(priority: number) {
  const due = new Date();
  due.setDate(due.getDate() + (priority === 1 ? 1 : priority === 2 ? 2 : 7));
  return due.toISOString();
}

function priorityLabelForAnalysis(priority: number) {
  const labels: Record<number, string> = {
    1: "긴급",
    2: "우선",
    3: "일반",
    4: "문의"
  };

  return labels[priority] ?? "확인";
}

function complaintStatusFor(ticketStatus: TicketStatus): ComplaintStatus {
  const map: Record<TicketStatus, ComplaintStatus> = {
    RECEIVED: "SUBMITTED",
    REVIEWING: "REVIEWING",
    ADDITIONAL_INFO_REQUESTED: "ADDITIONAL_INFO_REQUESTED",
    VENDOR_ASSIGNMENT_PENDING: "REVIEWING",
    VENDOR_ASSIGNED: "VENDOR_ASSIGNED",
    ESTIMATE_REVIEW: "VENDOR_ASSIGNED",
    REPAIR_IN_PROGRESS: "REPAIR_IN_PROGRESS",
    COMPLETION_REPORTED: "REPAIR_IN_PROGRESS",
    COMPLETED: "COMPLETED",
    REOPENED: "REOPENED",
    CANCELLED: "REOPENED"
  };

  return map[ticketStatus];
}

function createDemoStore(): Store {
  const createdAt = now();
  const users: UserAccount[] = [
    {
      id: "tenant-demo",
      email: "tenant@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "김민수",
      phone: "010-1000-3001",
      role: "TENANT",
      status: "ACTIVE",
      createdAt
    },
    {
      id: "landlord-demo",
      email: "manager@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "박관리",
      phone: "010-2000-0001",
      role: "LANDLORD",
      status: "ACTIVE",
      createdAt
    },
    {
      id: "vendor-demo-user",
      email: "vendor@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "이수리",
      phone: "010-3000-0001",
      role: "VENDOR",
      status: "ACTIVE",
      createdAt
    }
  ];
  const contractCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const contractUpdatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString();

  return {
    users,
    rooms: [
      {
        id: "room-301",
        buildingName: "정글빌라",
        roomNo: "301호",
        address: "서울시 성동구 성수동",
        landlordId: "landlord-demo"
      }
    ],
    tenantRooms: {
      "tenant-demo": "room-301"
    },
    vendors: [
      {
        id: "vendor-demo",
        userId: "vendor-demo-user",
        businessName: "빠른누수 설비",
        contactPerson: "이수리",
        phone: "010-3000-0001",
        serviceArea: "성동구, 광진구",
        activeJobs: 0
      }
    ],
    vendorInvites: [],
    tenantInvites: [],
    contracts: [
      {
        id: "ct_0001",
        roomId: "room-301",
        tenantId: "tenant-demo",
        managerId: "landlord-demo",
        unitId: "301",
        landlordName: "박관리",
        lifecycle: "active",
        review: "pending",
        deletion: "none",
        valueSource: "unverified",
        monthlyRent: 650000,
        maintenanceFee: 70000,
        paymentDay: 25,
        startDate: "2026-03-01T00:00:00+09:00",
        endDate: "2028-02-29T00:00:00+09:00",
        createdAt: contractCreatedAt,
        updatedAt: contractUpdatedAt,
        extractionId: "cx_0001",
        documentId: "cdoc_0001"
      }
    ],
    contractDocuments: [
      {
        id: "cdoc_0001",
        contractId: "ct_0001",
        uploadedByUserId: "tenant-demo",
        origin: "tenant_upload",
        fileName: "contract-301.pdf",
        fileUrl: "/uploads/contract-301.pdf",
        uploadedAt: contractCreatedAt
      }
    ],
    contractExtractions: [
      {
        id: "cx_0001",
        contractId: "ct_0001",
        confirmed: false,
        highlights: [
          "월세 65만원 · 매월 25일 납부",
          "계약 기간 2026.03.01 ~ 2028.02.29 (2년)",
          "묵시적 자동연장 특약 있음 — 확인 필요"
        ],
        items: [
          { label: "보증금", value: "10,000,000원", group: "money", needsCheck: false, evidence: "제1조 보증금은 금 일천만원정(₩10,000,000)으로 한다." },
          { label: "월세", value: "650,000원", group: "money", needsCheck: false, evidence: "차임은 월 금 육십오만원정으로 하며" },
          { label: "관리비", value: "70,000원", group: "money", needsCheck: true, evidence: "관리비 별도(관리규약에 따름)" },
          { label: "납부일", value: "매월 25일", group: "money", needsCheck: false, evidence: "매월 25일까지 임대인 계좌로 납부한다." },
          { label: "임대인 계좌", value: "○○은행 ***-**-****21", group: "money", needsCheck: false, masked: true, evidence: "입금계좌: ○○은행 123-45-678921" },
          { label: "계약 기간", value: "2026.03.01 ~ 2028.02.29", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 3월 1일부터 24개월로 한다." },
          { label: "자동연장", value: "묵시적 갱신 특약", group: "term", needsCheck: true, evidence: "만료 1개월 전 통지 없을 시 동일 조건 자동연장" },
          { label: "상세 주소", value: "서울시 ○○구 ***로 **길 **", group: "term", needsCheck: false, masked: true, evidence: "목적물: 서울시 ○○구 △△로 12길 34, 301호" },
          { label: "원상복구", value: "퇴거 시 원상복구 의무", group: "responsibility", needsCheck: false, evidence: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다." },
          { label: "수선 책임", value: "소모품·경미한 수선 임차인 부담", group: "responsibility", needsCheck: true, evidence: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다." }
        ],
        helpNotes: [
          {
            clause: "묵시적 자동연장",
            plain: "만료 1개월 전에 아무도 연락하지 않으면 같은 조건으로 계약이 자동으로 연장돼요. 이사 계획이 있으면 미리 알려두면 좋아요.",
            source: "만료 1개월 전 통지 없을 시 동일 조건 자동연장"
          },
          {
            clause: "원상복구 의무",
            plain: "퇴거할 때 처음 상태로 되돌려 놓아야 해요. 입주 전 사진을 남겨두면 나중에 도움이 돼요.",
            source: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다."
          },
          {
            clause: "경미한 수선 부담",
            plain: "소모품 교체나 작은 수리는 임차인이 부담할 수 있어요. 큰 하자는 임대인 책임일 수 있으니 관리자에게 물어보세요.",
            source: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다."
          }
        ],
        createdAt: contractUpdatedAt
      }
    ],
    contractPrivacies: [
      {
        contractId: "ct_0001",
        maskingEnabled: true,
        retention: [
          { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" },
          { label: "임대인 계좌·연락처", reason: "정산 완료 시 즉시 파기", until: "정산 완료 시" },
          { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" }
        ],
        forwardingConsent: false,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      }
    ],
    contractInvites: [
      {
        id: "cinv_0001",
        contractId: "ct_0001",
        roomId: "room-301",
        inviteToken: "contract-demo-token",
        invitedByManagerId: "landlord-demo",
        tenantName: "김민수",
        phone: "010-1000-3001",
        state: "connected",
        signupUrl: "/tenant?inviteToken=contract-demo-token",
        audit: "2026-03-01 임차인 확인 완료",
        createdAt: "2026-03-01T10:00:00+09:00",
        acceptedAt: "2026-03-01T10:30:00+09:00",
        acceptedByUserId: "tenant-demo"
      }
    ],
    attachments: [],
    floorPlans: [],
    moveInChecklist: [],
    aiFeedback: [],
    intakeSessions: [],
    complaints: [],
    analyses: {},
    tickets: [],
    repairs: [],
    costs: [],
    receipts: [],
    receiptOcrs: [],
    messages: [],
    messagingThreads: [
      {
        id: "mth_demo_general",
        roomId: "room-301",
        unitId: "301",
        tenantId: "tenant-demo",
        context: "general",
        contextLabel: "생활 문의",
        lastMessage: "확인 후 오늘 안으로 답변드리겠습니다.",
        unreadCount: 1,
        pendingRequest: false,
        archivedNotice: true,
        createdAt,
        updatedAt: createdAt
      }
    ],
    messagingMessages: [
      {
        id: "msg_demo_general_1",
        threadId: "mth_demo_general",
        senderUserId: "tenant-demo",
        sender: "tenant",
        kind: "text",
        body: "공용 현관 등이 깜빡입니다.",
        attachmentUrls: [],
        createdAt
      },
      {
        id: "msg_demo_general_2",
        threadId: "mth_demo_general",
        senderUserId: "landlord-demo",
        sender: "manager",
        kind: "text",
        body: "확인 후 오늘 안으로 답변드리겠습니다.",
        attachmentUrls: [],
        createdAt
      }
    ],
    messagingAnnouncementDrafts: [
      {
        id: "mad_demo_urgent",
        category: "urgent",
        scope: "building",
        targetLabel: "정글빌라 전체",
        targetRoomIds: ["room-301"],
        title: "긴급 단수 안내",
        body: "오늘 18시부터 30분간 긴급 단수가 있습니다.",
        translations: [
          {
            lang: "en",
            langLabel: "English",
            title: "Emergency water outage",
            body: "There will be a 30-minute emergency water outage from 18:00 today.",
            reviewed: true
          }
        ],
        confirmRequired: true,
        status: "sent",
        createdByManagerId: "landlord-demo",
        createdAt,
        updatedAt: createdAt
      }
    ],
    messagingAnnouncements: [
      {
        id: "mann_demo_urgent",
        draftId: "mad_demo_urgent",
        category: "urgent",
        scope: "building",
        targetLabel: "정글빌라 전체",
        title: "긴급 단수 안내",
        body: "오늘 18시부터 30분간 긴급 단수가 있습니다.",
        sender: "박관리",
        senderId: "landlord-demo",
        sentAt: createdAt,
        confirmRequired: true,
        safetyCta: "안전 확인"
      }
    ],
    messagingAnnouncementDeliveries: [
      {
        id: "mdl_demo_urgent_tenant",
        announcementId: "mann_demo_urgent",
        tenantId: "tenant-demo",
        roomId: "room-301",
        unitId: "301",
        tenantName: "김민수",
        preferredLang: "ko",
        state: "unread"
      }
    ],
    moveouts: [],
    moveoutRecords: [],
    moveoutChecklist: [],
    moveoutSettlements: [],
    moveoutDeductions: [],
    moveoutDisputes: [],
    moveoutReportAudits: [],
    history: []
  };
}

function createEmptyStore(): Store {
  return {
    users: [],
    rooms: [],
    tenantRooms: {},
    vendors: [],
    vendorInvites: [],
    tenantInvites: [],
    contracts: [],
    contractDocuments: [],
    contractExtractions: [],
    contractPrivacies: [],
    contractInvites: [],
    attachments: [],
    floorPlans: [],
    moveInChecklist: [],
    aiFeedback: [],
    intakeSessions: [],
    complaints: [],
    analyses: {},
    tickets: [],
    repairs: [],
    costs: [],
    receipts: [],
    receiptOcrs: [],
    messages: [],
    messagingThreads: [],
    messagingMessages: [],
    messagingAnnouncementDrafts: [],
    messagingAnnouncements: [],
    messagingAnnouncementDeliveries: [],
    moveouts: [],
    moveoutRecords: [],
    moveoutChecklist: [],
    moveoutSettlements: [],
    moveoutDeductions: [],
    moveoutDisputes: [],
    moveoutReportAudits: [],
    history: []
  };
}

function envFlag(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function shouldSeedDemoData(option?: boolean) {
  if (option !== undefined) {
    return option;
  }

  const configured = envFlag(process.env.ROOMLOG_SEED_DEMO);
  if (configured !== undefined) {
    return configured;
  }

  return process.env.NODE_ENV !== "production";
}

@Injectable()
export class RoomlogService {
  private readonly store: Store;
  private readonly storeFilePath?: string;
  private readonly uploadDir: string;
  private readonly publicUploadBaseUrl: string;
  private readonly storageAdapter: FileStorageAdapter;
  private readonly seedDemoData: boolean;
  private readonly storeProjector?: StoreProjector;
  private pendingPersistence = Promise.resolve();
  private persistenceError: unknown;
  private readonly auth: RoomlogAuthDomain;
  private readonly floorPlan: RoomlogFloorPlanDomain;
  private readonly cost: RoomlogCostDomain;
  private readonly checklist: RoomlogChecklistDomain;
  private readonly contract: RoomlogContractDomain;
  private readonly vendorMgmt: RoomlogVendorMgmtDomain;
  private readonly vendorRepair: RoomlogVendorRepairDomain;
  private readonly messaging: RoomlogMessagingDomain;
  private readonly moveout: RoomlogMoveoutDomain;

  constructor(
    @Optional()
    @Inject(ROOMLOG_SERVICE_OPTIONS)
    options: RoomlogServiceOptions = {}
  ) {
    const configuredStoreFile = options.storeFilePath ?? process.env.ROOMLOG_STORE_FILE;
    this.storeFilePath = configuredStoreFile?.trim() || undefined;
    this.uploadDir = options.uploadDir ?? process.env.LOCAL_UPLOAD_DIR ?? "uploads";
    this.seedDemoData = shouldSeedDemoData(options.seedDemoData);
    this.storeProjector = options.storeProjector;
    this.publicUploadBaseUrl = (
      options.publicUploadBaseUrl ??
      process.env.PUBLIC_UPLOAD_BASE_URL ??
      "/api/files"
    ).replace(/\/$/, "");
    this.storageAdapter =
      options.storageAdapter ??
      createFileStorageAdapter(process.env, this.uploadDir, this.publicUploadBaseUrl);
    this.store = options.initialStore
      ? this.normalizeStoreSnapshot(JSON.parse(JSON.stringify(options.initialStore)) as Store)
      : this.loadStore();
    this.auth = new RoomlogAuthDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId)
    );
    this.floorPlan = new RoomlogFloorPlanDomain(
      this.store,
      this.storageAdapter,
      () => this.persistStore()
    );
    this.cost = new RoomlogCostDomain(
      this.store,
      (iso) => this.timeOf(iso),
      (ticketId) => this.findTicket(ticketId),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (ocr) => this.cloneReceiptOcr(ocr)
    );
    this.checklist = new RoomlogChecklistDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId)
    );
    this.contract = new RoomlogContractDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso),
      (startIso, endIso) => this.elapsedHours(startIso, endIso)
    );
    this.vendorMgmt = new RoomlogVendorMgmtDomain(
      this.store,
      () => this.persistStore(),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (ticketId) => this.findTicket(ticketId),
      (roomId) => this.findRoom(roomId),
      (complaintId) => this.findComplaint(complaintId),
      (iso) => this.timeOf(iso),
      (startIso, endIso) => this.elapsedHours(startIso, endIso),
      (values) => this.average(values),
      (values) => this.median(values)
    );
    this.vendorRepair = new RoomlogVendorRepairDomain(
      this.store,
      () => this.persistStore(),
      (ticketId) => this.findTicket(ticketId),
      (complaintId) => this.findComplaint(complaintId),
      (repairId) => this.findRepair(repairId),
      (ticketId, toStatus, changedByUserId, note) =>
        this.transitionTicket(ticketId, toStatus, changedByUserId, note),
      (ticketId, complaintId, senderUserId, senderRole, messageText, attachmentUrls) =>
        this.addMessageInternal(ticketId, complaintId, senderUserId, senderRole, messageText, attachmentUrls),
      (ticketId, changedByUserId, fromStatus, toStatus, note) =>
        this.pushHistory(ticketId, changedByUserId, fromStatus, toStatus, note),
      (repair, allowed, action) => this.assertRepairStatus(repair, allowed, action),
      (managerId, ticket) => this.assertManagerCanAccessTicket(managerId, ticket),
      (message) => this.presentTicketMessage(message)
    );
    this.messaging = new RoomlogMessagingDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso)
    );
    this.moveout = new RoomlogMoveoutDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso),
      (managerId, input) => this.messaging.createMessagingThread(managerId, input),
      (tenantId, threadId, input) =>
        this.messaging.addTenantMessagingThreadMessage(tenantId, threadId, input),
      (managerId, threadId, input) =>
        this.messaging.addManagerMessagingThreadMessage(managerId, threadId, input)
    );
  }

  async flushPersistence() {
    await this.pendingPersistence;

    if (this.persistenceError) {
      throw this.persistenceError;
    }
  }

  signup(input: SignupInput): AuthResult {
    return this.auth.signup(input);
  }

  login(input: LoginInput): AuthResult {
    return this.auth.login(input);
  }

  getUserFromToken(authorization?: string): UserAccount {
    return this.auth.getUserFromToken(authorization);
  }

  getMe(authorization?: string) {
    return this.auth.getMe(authorization);
  }

  getDemoState() {
    if (!this.seedDemoData) {
      throw new ForbiddenException("데모 상태 조회가 비활성화되어 있습니다.");
    }

    return {
      users: this.store.users.map(({ passwordHash, ...user }) => user),
      rooms: this.store.rooms,
      vendors: this.listVendors(),
      tenantInvites: this.store.tenantInvites,
      contracts: this.store.contracts,
      contractDocuments: this.store.contractDocuments,
      contractExtractions: this.store.contractExtractions,
      contractPrivacies: this.store.contractPrivacies,
      contractInvites: this.store.contractInvites,
      complaints: this.store.complaints,
      intakeSessions: this.store.intakeSessions,
      tickets: this.store.tickets,
      repairs: this.store.repairs,
      costs: this.store.costs,
      receipts: this.store.receipts,
      receiptOcrs: this.store.receiptOcrs,
      messages: this.store.messages,
      messagingThreads: this.store.messagingThreads,
      messagingMessages: this.store.messagingMessages,
      messagingAnnouncementDrafts: this.store.messagingAnnouncementDrafts,
      messagingAnnouncements: this.store.messagingAnnouncements,
      messagingAnnouncementDeliveries: this.store.messagingAnnouncementDeliveries,
      moveouts: this.store.moveouts,
      moveoutRecords: this.store.moveoutRecords,
      moveoutChecklist: this.store.moveoutChecklist,
      moveoutSettlements: this.store.moveoutSettlements,
      moveoutDeductions: this.store.moveoutDeductions,
      moveoutDisputes: this.store.moveoutDisputes,
      moveoutReportAudits: this.store.moveoutReportAudits
    };
  }

  getRuntimeConfig() {
    return {
      demoAuth: {
        enabled: this.seedDemoData
      }
    };
  }

  listTenantContracts(tenantId: string): Contract[] {
    return this.contract.listTenantContracts(tenantId);
  }

  getTenantContract(tenantId: string, contractId: string): Contract {
    return this.contract.getTenantContract(tenantId, contractId);
  }

  getTenantContractExtraction(tenantId: string, contractId: string): ContractExtraction {
    return this.contract.getTenantContractExtraction(tenantId, contractId);
  }

  getTenantContractPrivacy(tenantId: string, contractId: string): ContractPrivacy {
    return this.contract.getTenantContractPrivacy(tenantId, contractId);
  }

  requestTenantContractDeletion(tenantId: string, contractId: string): ContractPrivacy {
    return this.contract.requestTenantContractDeletion(tenantId, contractId);
  }

  getManagerContractDashboard(managerId: string) {
    return this.contract.getManagerContractDashboard(managerId);
  }

  getManagerContractDetail(managerId: string, contractId = "ct_0001") {
    return this.contract.getManagerContractDetail(managerId, contractId);
  }

  confirmManagerContractReview(
    managerId: string,
    contractId: string,
    input: ConfirmContractInput = {}
  ) {
    return this.contract.confirmManagerContractReview(managerId, contractId, input);
  }

  requestManagerContractInfo(managerId: string, contractId: string) {
    return this.contract.requestManagerContractInfo(managerId, contractId);
  }

  decideManagerContractDeletion(
    managerId: string,
    contractId: string,
    state: DeletionState,
    retentionNote?: string
  ) {
    return this.contract.decideManagerContractDeletion(managerId, contractId, state, retentionNote);
  }

  createComplaint(tenantId: string, input: CreateComplaintInput) {
    this.validateComplaintInput(input);

    const roomId = input.roomId ?? this.store.tenantRooms[tenantId] ?? "room-301";
    const analysis = this.analyzeComplaint(input);
    return this.createComplaintRecord(tenantId, roomId, "DIRECT_FORM", input, analysis, [
      {
        senderUserId: tenantId,
        senderRole: "TENANT",
        messageText: input.description
      }
    ]);
  }

  createIntakeSession(tenantId: string, input: CreateIntakeSessionInput = {}) {
    const roomId = input.roomId ?? this.store.tenantRooms[tenantId] ?? "room-301";
    const createdAt = now();
    const session: IntakeSession = {
      id: id("sess"),
      tenantId,
      roomId,
      sourceChannel: input.sourceChannel ?? "REALTIME_CHAT",
      status: "ACTIVE",
      draft: this.emptyDraft(),
      messages: [],
      createdAt,
      updatedAt: createdAt
    };
    const greeting = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      "안녕하세요. 어떤 문제인지 편하게 적어주세요. 위치, 언제부터 발생했는지, 현재 위험 여부, 방문 가능한 시간을 함께 알려주시면 접수 초안을 바로 정리할게요.",
      "CHAT"
    );

    session.messages.push(greeting);
    this.store.intakeSessions.unshift(session);
    this.persistStore();

    return { session: this.presentIntakeSession(session) };
  }

  listIntakeSessions(tenantId: string) {
    return this.store.intakeSessions
      .filter((session) => session.tenantId === tenantId)
      .map((session) => this.presentIntakeSession(session));
  }

  getIntakeSession(tenantId: string, sessionId: string) {
    return this.presentIntakeSession(this.findIntakeSession(tenantId, sessionId));
  }

  async sendIntakeMessage(tenantId: string, sessionId: string, input: SendIntakeMessageInput) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 종료된 상담입니다.");
    }

    const messageText = (input.messageText || input.transcriptText || "").trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("상담 메시지 또는 사진이 필요합니다.");
    }

    session.messages.push({
      ...this.createIntakeMessage(
        session.id,
        "TENANT",
        messageText || "사진을 첨부했습니다.",
        input.inputMode ?? "CHAT"
      ),
      transcriptText: input.transcriptText,
      attachmentUrls
    });

    const fallbackDraft = this.buildIntakeDraft(session);
    const generatedTurn = await this.generateIntakeTurn(session, fallbackDraft);
    session.draft = generatedTurn.draft;
    const assistantMessage = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      generatedTurn.assistantMessage,
      "CHAT"
    );
    session.messages.push(assistantMessage);
    session.updatedAt = now();
    this.persistStore();

    return { session: this.presentIntakeSession(session), assistantMessage };
  }

  async recordRealtimeTurn(
    tenantId: string,
    sessionId: string,
    input: RecordRealtimeTurnInput
  ) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 종료된 상담입니다.");
    }

    const userTranscript = input.userTranscript?.trim() ?? "";
    const assistantTranscript = input.assistantTranscript?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];
    const realtimeEventId = input.eventId?.trim();

    if (realtimeEventId) {
      const existingTurnMessages = session.messages.filter(
        (message) => message.realtimeEventId === realtimeEventId
      );

      if (existingTurnMessages.length > 0) {
        const assistantMessageText =
          existingTurnMessages.find((message) => message.sender === "AI_ASSISTANT")?.messageText ??
          session.messages.filter((message) => message.sender === "AI_ASSISTANT").at(-1)
            ?.messageText ??
          this.composeAssistantReply(session.draft, session);

        return {
          session: this.presentIntakeSession(session),
          turnSummary: this.presentRealtimeTurnSummary(session, assistantMessageText),
          recordedMessages: this.presentIntakeMessages(existingTurnMessages),
          deduplicated: true
        };
      }
    }

    if (!userTranscript && !assistantTranscript && attachmentUrls.length === 0) {
      throw new BadRequestException("Realtime 전사 내용이 필요합니다.");
    }

    const recordedMessages: IntakeMessage[] = [];

    if (userTranscript || attachmentUrls.length > 0) {
      const tenantMessage: IntakeMessage = {
        ...this.createIntakeMessage(
          session.id,
          "TENANT",
          userTranscript || "음성 입력을 보냈습니다.",
          "VOICE"
        ),
        transcriptText: userTranscript || undefined,
        realtimeEventId,
        attachmentUrls
      };
      session.messages.push(tenantMessage);
      recordedMessages.push(tenantMessage);
    }

    const fallbackDraft = this.buildIntakeDraft(session);
    const generatedTurn = await this.generateIntakeTurn(session, fallbackDraft);
    session.draft = generatedTurn.draft;

    const assistantMessageText = assistantTranscript || generatedTurn.assistantMessage;
    const assistantMessage = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      assistantMessageText,
      "VOICE"
    );
    assistantMessage.realtimeEventId = realtimeEventId;
    session.messages.push(assistantMessage);
    recordedMessages.push(assistantMessage);

    session.updatedAt = now();
    this.persistStore();

    return {
      session: this.presentIntakeSession(session),
      turnSummary: this.presentRealtimeTurnSummary(session, assistantMessageText),
      recordedMessages: this.presentIntakeMessages(recordedMessages),
      deduplicated: false
    };
  }

  private presentIntakeMessages(messages: IntakeMessage[]) {
    return messages.map((message) => ({
      ...message,
      attachmentUrls: [...message.attachmentUrls]
    }));
  }

  private presentRealtimeTurnSummary(session: IntakeSession, assistantMessageText: string) {
    const draft = session.draft;
    const intakeSlots = this.draftIntakeSlots(session);
    const slotCounts = this.intakeSlotCounts(intakeSlots);
    const requiresPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const needsVisit = draft.requiredInfo.some((item) => /방문|시간/.test(item));
    const statusParts = [
      !draft.readyToFinalize ? "추가 확인 필요" : "접수 초안 준비",
      requiresPhoto ? "사진 요청" : undefined,
      needsVisit ? "방문 가능 시간 확인" : undefined
    ].filter(Boolean);

    return {
      channelLabel: session.sourceChannel === "CALLBOT" ? "콜봇" : "음성 상담",
      statusLabel: statusParts.join(" · "),
      detailCategory: draft.detailCategory,
      priority: draft.priority,
      requiresPhoto,
      readyToFinalize: draft.readyToFinalize,
      intakeSlots: this.presentIntakeSlots(intakeSlots),
      collectedSlotCount: slotCounts.collectedSlotCount,
      openSlotCount: slotCounts.openSlotCount,
      nextQuestions: [...draft.nextQuestions],
      tenantGuidance: [...draft.tenantGuidance],
      spokenReply: assistantMessageText
    };
  }

  finalizeIntakeSession(tenantId: string, sessionId: string, input: FinalizeIntakeInput = {}) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 접수된 상담입니다.");
    }

    session.draft = session.draft.readyToFinalize ? session.draft : this.buildIntakeDraft(session);

    if (!session.draft.readyToFinalize) {
      throw new BadRequestException(
        `접수에 필요한 정보가 부족합니다: ${session.draft.requiredInfo.join(", ")}`
      );
    }

    const confirmedCategory = this.confirmedIntakeCategory(
      input.confirmedCategory,
      session.draft.category
    );
    const confirmedDetailCategory =
      input.confirmedDetailCategory?.trim() || session.draft.detailCategory;
    const confirmedPriority = this.confirmedIntakePriority(
      input.confirmedPriority,
      session.draft.priority
    );
    const confirmedResponsibilityHint = this.confirmedIntakeResponsibilityHint(
      input.confirmedResponsibilityHint,
      session.draft.responsibilityHint
    );
    const correctionReasons = this.intakeCorrectionReasons(session.draft, {
      category: confirmedCategory,
      detailCategory: confirmedDetailCategory,
      priority: confirmedPriority,
      responsibilityHint: confirmedResponsibilityHint
    });
    const description = input.confirmedSummary || session.draft.summary;
    const complaintInput: CreateComplaintInput = {
      title: input.confirmedTitle || session.draft.title,
      description,
      location: input.confirmedLocation || session.draft.location || "위치 확인 필요",
      roomId: session.roomId,
      occurredAt: input.occurredAt || session.draft.occurredAt,
      availableTimes: input.availableTimes || session.draft.availableTimes
    };
    const analysis: AiAnalysis = {
      summary: description,
      category: confirmedDetailCategory,
      detailCategory: confirmedDetailCategory,
      priority: confirmedPriority,
      responsibilityHint: confirmedResponsibilityHint,
      confidenceScore: session.draft.confidenceScore,
      reasons: [...correctionReasons, ...session.draft.reasons],
      recommendedAction: session.draft.recommendedAction,
      photoAnalysis: session.draft.photoAnalysis
    };

    if (input.duplicateResolution === "ATTACH_TO_EXISTING") {
      return this.attachIntakeSessionToExistingTicket(
        tenantId,
        session,
        input.existingTicketId,
        description
      );
    }

    const result = this.createComplaintRecord(
      tenantId,
      session.roomId,
      session.sourceChannel,
      complaintInput,
      analysis,
      session.messages.map((message) => ({
        senderUserId: message.sender === "TENANT" ? tenantId : "roomlog-ai",
        senderRole: message.sender,
        messageText: message.messageText,
        attachmentUrls: message.attachmentUrls
      }))
    );

    session.status = "FINALIZED";
    session.complaintId = result.complaint.id;
    session.ticketId = result.ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;
    this.persistStore();

    return result;
  }

  private confirmedIntakeCategory(
    value: FinalizeIntakeInput["confirmedCategory"],
    fallback: IntakeDraft["category"]
  ): IntakeDraft["category"] {
    if (value === undefined) {
      return fallback;
    }

    if (["하자", "소음", "설비", "납부", "계약", "공용공간", "기타"].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 민원 유형이 올바르지 않습니다.");
  }

  private confirmedIntakePriority(
    value: FinalizeIntakeInput["confirmedPriority"],
    fallback: IntakeDraft["priority"]
  ): IntakeDraft["priority"] {
    if (value === undefined) {
      return fallback;
    }

    if ([1, 2, 3, 4].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 긴급도가 올바르지 않습니다.");
  }

  private confirmedIntakeResponsibilityHint(
    value: FinalizeIntakeInput["confirmedResponsibilityHint"],
    fallback: IntakeDraft["responsibilityHint"]
  ): IntakeDraft["responsibilityHint"] {
    if (value === undefined) {
      return fallback;
    }

    if (["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 책임 가능성이 올바르지 않습니다.");
  }

  private intakeCorrectionReasons(
    draft: IntakeDraft,
    confirmed: Pick<IntakeDraft, "category" | "detailCategory" | "priority" | "responsibilityHint">
  ) {
    const changed =
      draft.category !== confirmed.category ||
      draft.detailCategory !== confirmed.detailCategory ||
      draft.priority !== confirmed.priority ||
      draft.responsibilityHint !== confirmed.responsibilityHint;

    return changed ? ["세입자가 접수 전 AI 초안을 정정했습니다."] : [];
  }

  private attachIntakeSessionToExistingTicket(
    tenantId: string,
    session: IntakeSession,
    existingTicketId: string | undefined,
    description: string
  ) {
    if (!existingTicketId) {
      throw new BadRequestException("기존 티켓에 연결하려면 티켓을 선택해주세요.");
    }

    const ticket = this.findTicket(existingTicketId);

    if (ticket.tenantId !== tenantId || ticket.roomId !== session.roomId) {
      throw new ForbiddenException("본인 호실의 기존 티켓에만 상담을 연결할 수 있습니다.");
    }

    if (["COMPLETED", "CANCELLED"].includes(ticket.status)) {
      throw new BadRequestException("완료 또는 취소된 티켓에는 상담을 연결할 수 없습니다.");
    }

    const complaint = this.findComplaint(ticket.complaintId);
    this.addMessageInternal(
      ticket.id,
      complaint.id,
      "roomlog-ai",
      "SYSTEM",
      "중복 가능성이 있어 기존 티켓에 상담 내용을 추가했습니다."
    );

    for (const message of session.messages) {
      this.addMessageInternal(
        ticket.id,
        complaint.id,
        message.sender === "TENANT" ? tenantId : message.sender === "SYSTEM" ? "roomlog-system" : "roomlog-ai",
        message.sender,
        message.messageText,
        message.attachmentUrls
      );
    }

    const attachmentUrls = Array.from(
      new Set(
        session.messages
          .filter((message) => message.sender === "TENANT")
          .flatMap((message) => message.attachmentUrls)
      )
    );
    this.refreshAnalysisFromTenantFollowup(ticket, {
      messageText: description,
      attachmentUrls
    });

    if (ticket.status === "ADDITIONAL_INFO_REQUESTED" || ticket.status === "REOPENED") {
      this.transitionTicket(ticket.id, "REVIEWING", tenantId, "중복 상담 내용이 기존 티켓에 추가됨");
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    session.status = "FINALIZED";
    session.complaintId = complaint.id;
    session.ticketId = ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;
    this.persistStore();

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id],
      attachedToExisting: true
    };
  }

  createComplaintFromCall(tenantId: string, input: CreateComplaintFromCallInput) {
    const callSessionId = input.callSessionId?.trim();

    if (!callSessionId) {
      throw new BadRequestException("콜봇 통화 세션 ID가 필요합니다.");
    }

    const session = this.findIntakeSession(tenantId, callSessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 접수된 콜봇 통화입니다.");
    }

    session.sourceChannel = "CALLBOT";

    if (input.roomId) {
      if (!this.store.rooms.some((room) => room.id === input.roomId)) {
        throw new NotFoundException("호실을 찾을 수 없습니다.");
      }
      session.roomId = input.roomId;
    }

    const transcriptText = input.transcriptText?.trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (transcriptText || attachmentUrls.length) {
      session.messages.push({
        ...this.createIntakeMessage(
          session.id,
          "TENANT",
          transcriptText || "콜봇 통화 중 사진이 수신되었습니다.",
          attachmentUrls.length ? "PHOTO" : "VOICE"
        ),
        transcriptText,
        attachmentUrls
      });
    }

    if (input.assistantSummary?.trim()) {
      session.messages.push(
        this.createIntakeMessage(session.id, "AI_ASSISTANT", input.assistantSummary.trim(), "VOICE")
      );
    }

    if (input.recordingUrl?.trim()) {
      session.messages.push(
        this.createIntakeMessage(
          session.id,
          "SYSTEM",
          `콜봇 통화 녹음: ${input.recordingUrl.trim()}`,
          "VOICE"
        )
      );
    }

    const hasTenantSignal = session.messages.some(
      (message) => message.sender === "TENANT" && (message.messageText.trim() || message.attachmentUrls.length)
    );

    if (!hasTenantSignal) {
      throw new BadRequestException("콜봇 통화 전사 또는 사진이 필요합니다.");
    }

    session.draft = this.buildIntakeDraft(session);

    const remainingRequiredInfo = session.draft.requiredInfo.filter(
      (item) => item !== "문제 부위 사진"
    );

    if (remainingRequiredInfo.length > 0) {
      throw new BadRequestException(
        `콜봇 접수에 필요한 정보가 부족합니다: ${remainingRequiredInfo.join(", ")}`
      );
    }

    const needPhoto = session.draft.photoRequested && !this.sessionHasPhoto(session);
    const description = session.draft.summary;
    const complaintInput: CreateComplaintInput = {
      title: session.draft.title,
      description,
      location: session.draft.location || this.store.rooms.find((room) => room.id === session.roomId)?.roomNo || "위치 확인 필요",
      roomId: session.roomId,
      occurredAt: session.draft.occurredAt,
      availableTimes: session.draft.availableTimes
    };
    const analysis: AiAnalysis = {
      summary: description,
      category: session.draft.detailCategory,
      detailCategory: session.draft.detailCategory,
      priority: session.draft.priority,
      responsibilityHint: session.draft.responsibilityHint,
      confidenceScore: session.draft.confidenceScore,
      reasons: session.draft.reasons,
      recommendedAction: needPhoto
        ? "콜봇 접수 후 사진 업로드 링크를 발송하고, 사진 수신 뒤 관리자 검토를 이어가세요."
        : session.draft.recommendedAction,
      photoAnalysis: session.draft.photoAnalysis
    };
    const created = this.createComplaintRecord(
      tenantId,
      session.roomId,
      "CALLBOT",
      complaintInput,
      analysis,
      session.messages.map((message) => ({
        senderUserId:
          message.sender === "TENANT"
            ? tenantId
            : message.sender === "SYSTEM"
              ? "roomlog-system"
              : "roomlog-ai",
        senderRole: message.sender,
        messageText: message.messageText,
        attachmentUrls: message.attachmentUrls
      }))
    );

    session.status = "FINALIZED";
    session.complaintId = created.complaint.id;
    session.ticketId = created.ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;

    const photoUploadUrl = needPhoto ? `/tenant/complaints/${created.complaint.id}` : undefined;

    if (needPhoto) {
      const ticket = this.transitionTicket(
        created.ticket.id,
        "ADDITIONAL_INFO_REQUESTED",
        "roomlog-callbot",
        "콜봇 접수 후 사진 업로드 요청"
      );
      this.addMessageInternal(
        ticket.id,
        ticket.complaintId,
        "roomlog-callbot",
        "SYSTEM",
        `사진 업로드 링크 발송 대기: ${photoUploadUrl}`
      );
    }

    this.persistStore();

    const complaint = this.findComplaint(created.complaint.id);
    const ticket = this.findTicket(created.ticket.id);

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id],
      channel: "콜봇",
      summary: complaint.description,
      needPhoto,
      status: needPhoto ? "사진 업로드 링크 발송 대기" : this.displayStatus(ticket.status),
      recordingUrl: input.recordingUrl,
      photoUploadUrl,
      session: this.presentIntakeSession(session)
    };
  }

  async createRealtimeClientSecret(
    tenantId: string,
    sessionId: string,
    input: RealtimeClientSecretInput = {}
  ): Promise<RealtimeClientSecretResult> {
    const session = this.findIntakeSession(tenantId, sessionId);
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
    const transcriptionModel =
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
    const voice = input.voice || process.env.OPENAI_REALTIME_VOICE || "marin";
    const instructions = this.buildRealtimeInstructions(session, input);

    if (!process.env.OPENAI_API_KEY) {
      return {
        mode: "not_configured",
        sessionId: session.id,
        model,
        voice,
        instructions,
        warning:
          "OPENAI_API_KEY가 설정되지 않아 실제 음성 Realtime 연결은 비활성화되었습니다. 서버 환경변수에 OPENAI_API_KEY를 설정하면 WebRTC용 client secret을 발급합니다."
      };
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": this.safetyIdentifier(tenantId, session.id)
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions,
          audio: {
            input: {
              transcription: {
                model: transcriptionModel,
                language: "ko"
              },
              turn_detection: {
                type: "server_vad",
                threshold: input.purpose === "CALLBOT_INTAKE" ? 0.5 : 0.55,
                prefix_padding_ms: 300,
                silence_duration_ms: input.purpose === "CALLBOT_INTAKE" ? 650 : 750,
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new BadGatewayException(
        `OpenAI Realtime client secret 발급 실패 (${response.status})${errorText ? `: ${errorText}` : ""}`
      );
    }

    const body = (await response.json()) as {
      value?: string;
      expires_at?: number;
      session?: {
        id?: string;
        model?: string;
        instructions?: string;
        audio?: {
          output?: {
            voice?: string;
          };
        };
      };
    };
    const expiresAt = body.expires_at
      ? new Date(body.expires_at * 1000).toISOString()
      : undefined;

    return {
      mode: "openai",
      sessionId: session.id,
      openaiSessionId: body.session?.id,
      model: body.session?.model ?? model,
      voice: body.session?.audio?.output?.voice ?? voice,
      instructions: body.session?.instructions ?? instructions,
      expiresAt,
      clientSecret: body.value
        ? {
            value: body.value,
            expiresAt
          }
        : undefined
    };
  }

  private createComplaintRecord(
    tenantId: string,
    roomId: string,
    sourceChannel: ComplaintSourceChannel,
    input: CreateComplaintInput,
    analysis: AiAnalysis,
    initialMessages: {
      senderUserId: string;
      senderRole: TicketMessage["senderRole"];
      messageText: string;
      attachmentUrls?: string[];
    }[]
  ) {
    const createdAt = now();
    const complaintId = id("cmp");
    const ticketId = id("tkt");
    const complaint: Complaint = {
      id: complaintId,
      tenantId,
      roomId,
      ticketId,
      sourceChannel,
      title: input.title,
      description: input.description,
      location: input.location,
      occurredAt: input.occurredAt,
      availableTimes: input.availableTimes,
      status: "SUBMITTED",
      createdAt,
      updatedAt: createdAt
    };
    const ticket: Ticket = {
      id: ticketId,
      complaintId,
      tenantId,
      roomId,
      sourceChannel,
      category: analysis.category,
      priority: analysis.priority,
      status: "RECEIVED",
      responsibilityHint: analysis.responsibilityHint,
      aiSummary: analysis.summary,
      dueAt: priorityDueAt(analysis.priority),
      createdAt,
      updatedAt: createdAt
    };

    this.store.complaints.unshift(complaint);
    this.store.tickets.unshift(ticket);
    this.store.analyses[ticket.id] = analysis;
    this.pushHistory(ticket.id, "system", undefined, "RECEIVED", "임차인 신고 접수");
    for (const message of initialMessages) {
      this.addMessageInternal(
        ticket.id,
        complaint.id,
        message.senderUserId,
        message.senderRole,
        message.messageText,
        message.attachmentUrls
      );
    }
    this.persistStore();

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis
    };
  }

  listTenantComplaints(tenantId: string) {
    return this.store.complaints
      .filter((complaint) => complaint.tenantId === tenantId)
      .map((complaint) => this.presentComplaint(complaint));
  }

  getComplaint(complaintId: string) {
    return this.store.complaints.find((complaint) => complaint.id === complaintId);
  }

  getComplaintDetail(tenantId: string, complaintId: string) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    return this.presentComplaint(complaint);
  }

  listTickets() {
    return this.store.tickets.map((ticket) => this.presentTicket(ticket));
  }

  listTicketsForManager(managerId: string) {
    return this.store.tickets
      .filter((ticket) => this.canManagerAccessRoom(managerId, ticket.roomId))
      .map((ticket) => this.presentTicket(ticket));
  }

  queryManagerAssistant(
    managerId: string,
    input: ManagerAssistantQueryInput
  ): ManagerAssistantQueryResult {
    const question = input.question?.trim();

    if (!question) {
      throw new BadRequestException("운영 질의 질문을 입력해주세요.");
    }

    const scopedTickets = this.store.tickets.filter((ticket) =>
      this.canManagerAccessRoom(managerId, ticket.roomId)
    );
    let matches = [...scopedTickets];
    const filters: string[] = [];
    const normalizedQuestion = question.replace(/\s+/g, " ");

    if (/콜봇/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.sourceChannel === "CALLBOT");
      filters.push("접수 채널: 콜봇");
    } else if (/음성/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.sourceChannel === "VOICE_CHAT");
      filters.push("접수 채널: 음성 챗봇");
    } else if (/챗봇|채팅|리얼타임|실시간/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) =>
        ["REALTIME_CHAT", "VOICE_CHAT"].includes(ticket.sourceChannel)
      );
      filters.push("접수 채널: 챗봇");
    }

    if (/미처리|처리 안|완료 안|아직|대기/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => !["COMPLETED", "CANCELLED"].includes(ticket.status));
      filters.push("상태: 미처리");
    }

    if (/긴급|1순위|P1|긴급도\s*1/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.priority === 1);
      filters.push("긴급도: 1순위");
    }

    if (/업체.*(안|미배정|없)|배정 안|아직 업체/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => !ticket.assignedVendorId);
      filters.push("업체 배정: 미배정");
    }

    if (/추가\s*정보|추가정보|추가\s*사진|추가\s*설명/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.status === "ADDITIONAL_INFO_REQUESTED");
      filters.push("상태: 추가정보 요청");
    }

    if (/사진/.test(normalizedQuestion) && /없|안|미첨부|필요|아직|대기/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => this.ticketNeedsPhotoForManagerAssistant(ticket));
      filters.push("사진: 미첨부 또는 추가 필요");
    }

    const roomMatch = normalizedQuestion.match(/(\d{3,4})\s*호/);
    if (roomMatch) {
      const roomNo = `${roomMatch[1]}호`;
      matches = matches.filter((ticket) => {
        const room = this.store.rooms.find((item) => item.id === ticket.roomId);

        return room?.roomNo.includes(roomNo) ?? false;
      });
      filters.push(`호실: ${roomNo}`);
    }

    if (/이번 주/.test(normalizedQuestion)) {
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      matches = matches.filter((ticket) => new Date(ticket.createdAt) >= startOfWeek);
      filters.push("기간: 이번 주");
    } else if (/이번 달/.test(normalizedQuestion)) {
      const startOfMonth = new Date();
      startOfMonth.setHours(0, 0, 0, 0);
      startOfMonth.setDate(1);
      matches = matches.filter((ticket) => new Date(ticket.createdAt) >= startOfMonth);
      filters.push("기간: 이번 달");
    }

    if (filters.length === 0) {
      matches = matches.filter((ticket) => !["COMPLETED", "CANCELLED"].includes(ticket.status));
      filters.push("상태: 미처리");
    }

    matches.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    const matchedTickets = matches.map((ticket) => this.presentManagerAssistantTicket(ticket));

    return {
      question,
      answer: this.composeManagerAssistantAnswer(question, filters, matchedTickets),
      scope: `관리자 접근 가능 티켓 ${scopedTickets.length}건 기준`,
      filters,
      matchedTickets,
      nextActions: this.managerAssistantNextActions(matchedTickets, filters),
      generatedAt: now()
    };
  }

  getTicket(ticketId: string) {
    return this.store.tickets.find((ticket) => ticket.id === ticketId);
  }

  getTicketDetail(ticketId: string) {
    const ticket = this.findTicket(ticketId);

    return this.presentTicket(ticket);
  }

  getTicketDetailForManager(managerId: string, ticketId: string) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    return this.presentTicket(ticket);
  }

  getTenantRoomTimeline(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("연결된 호실을 찾을 수 없습니다.");
    }

    return this.presentRoomTimeline(roomId, { tenantId });
  }

  getManagerRoomTimeline(managerId: string, roomId: string) {
    this.assertManagerCanAccessRoom(managerId, roomId);

    return this.presentRoomTimeline(roomId);
  }

  updateTicket(managerId: string, ticketId: string, input: Partial<Pick<Ticket, "category" | "priority" | "responsibilityHint" | "aiSummary">>) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    Object.assign(ticket, input, { updatedAt: now() });
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", "AI 분석 값을 검토했습니다.");
    this.persistStore();

    return this.presentTicket(ticket);
  }

  reviewTenantAiFeedback(
    managerId: string,
    ticketId: string,
    feedbackId: string,
    input: ReviewTenantAiFeedbackInput
  ) {
    let ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const feedback = this.store.aiFeedback.find(
      (item) => item.id === feedbackId && item.ticketId === ticket.id
    );

    if (!feedback) {
      throw new NotFoundException("AI 이의제기를 찾을 수 없습니다.");
    }

    const managerReviewNote = input.managerReviewNote?.trim() ?? "";

    if (!managerReviewNote) {
      throw new BadRequestException("관리자 검토 결과를 입력해주세요.");
    }

    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    const correctedParts: string[] = [];
    const correctedSummary = input.correctedSummary?.trim();
    const correctedCategory = input.correctedCategory?.trim();
    const correctedDetailCategory = input.correctedDetailCategory?.trim();

    if (correctedSummary) {
      analysis.summary = correctedSummary;
      ticket.aiSummary = correctedSummary;
      correctedParts.push(`요약: ${correctedSummary}`);
    }

    if (correctedCategory) {
      analysis.category = correctedCategory;
      ticket.category = correctedCategory;
      correctedParts.push(
        `유형: ${correctedCategory}${correctedDetailCategory ? ` / ${correctedDetailCategory}` : ""}`
      );
    }

    if (correctedDetailCategory) {
      analysis.detailCategory = correctedDetailCategory;
    }

    if (input.correctedPriority !== undefined) {
      const priority = input.correctedPriority;

      if (![1, 2, 3, 4].includes(priority)) {
        throw new BadRequestException("긴급도는 1부터 4 사이로 입력해주세요.");
      }

      analysis.priority = priority;
      ticket.priority = priority;
      ticket.dueAt = priorityDueAt(priority);
      correctedParts.push(`긴급도: P${priority} ${priorityLabelForAnalysis(priority)}`);
    }

    if (input.correctedResponsibilityHint !== undefined) {
      if (!this.isResponsibilityHint(input.correctedResponsibilityHint)) {
        throw new BadRequestException("책임 가능성 값이 올바르지 않습니다.");
      }

      analysis.responsibilityHint = input.correctedResponsibilityHint;
      ticket.responsibilityHint = input.correctedResponsibilityHint;
      correctedParts.push(`책임 가능성: ${input.correctedResponsibilityHint}`);
    }

    if (input.ticketStatus && input.ticketStatus !== ticket.status) {
      ticket = this.transitionTicket(
        ticket.id,
        input.ticketStatus,
        managerId,
        "AI 이의제기 검토 결과 상태 변경"
      );
    } else {
      const complaint = this.findComplaint(ticket.complaintId);
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    const reviewedAt = now();
    const reasons = new Set(analysis.reasons ?? []);
    reasons.add(`관리자가 ${feedback.targetLabel} 이의제기를 검토함`);
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction = `이의제기 검토 결과를 반영했습니다. ${managerReviewNote}`;
    feedback.status = "REVIEWED";
    feedback.managerReviewNote = managerReviewNote;
    feedback.correctedValue = correctedParts.length
      ? correctedParts.join(" · ")
      : `검토 의견: ${managerReviewNote}`;
    feedback.reviewedByUserId = managerId;
    feedback.reviewedAt = reviewedAt;
    feedback.updatedAt = reviewedAt;

    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      [
        `AI 이의제기 검토 결과: ${managerReviewNote}`,
        feedback.correctedValue ? `반영 내용: ${feedback.correctedValue}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    );
    this.persistStore();

    return this.presentTicket(ticket);
  }

  requestAdditionalInfo(managerId: string, ticketId: string, messageText: string) {
    this.assertManagerCanAccessTicket(managerId, this.findTicket(ticketId));
    const ticket = this.transitionTicket(
      ticketId,
      "ADDITIONAL_INFO_REQUESTED",
      managerId,
      "추가 정보 요청"
    );
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", messageText);
    this.persistStore();

    return this.presentTicket(ticket);
  }

  draftManagerTicketReply(
    managerId: string,
    ticketId: string,
    input: ManagerReplyDraftInput = {}
  ): ManagerReplyDraftResult {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);
    const analysis = this.store.analyses[ticket.id];
    const callbot = this.presentCallbotContext(ticket);
    const intent = input.intent ?? this.inferManagerReplyIntent(ticket);
    const subject = this.managerReplySubject(intent, ticket, complaint);
    const evidence = this.managerReplyEvidence(ticket, complaint, callbot);

    return {
      ticketId: ticket.id,
      complaintId: complaint.id,
      intent,
      subject,
      messageText: this.composeManagerReplyDraftMessage({
        intent,
        ticket,
        complaint,
        room,
        analysis,
        callbot,
        note: input.note?.trim()
      }),
      deliveryChannels: ["앱 알림", "티켓 채팅"],
      requiresTenantAction: ["REQUEST_PHOTO", "REQUEST_DETAILS", "SCHEDULE_VISIT"].includes(
        intent
      ),
      tenantActionLabel: this.managerReplyTenantActionLabel(intent),
      evidence,
      warnings: [
        "AI 초안은 참고용이며 관리자가 확인한 뒤 전송해야 합니다.",
        "책임 소재와 비용 부담은 확정하지 않고 가능성으로만 안내합니다."
      ],
      generatedAt: now()
    };
  }

  sendManagerTicketReply(
    managerId: string,
    ticketId: string,
    input: ManagerTicketReplyInput
  ) {
    let ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const messageText = input.messageText?.trim() ?? "";

    if (!messageText) {
      throw new BadRequestException("전송할 답변 내용이 필요합니다.");
    }

    if (input.action === "REQUEST_ADDITIONAL_INFO") {
      if (ticket.status !== "ADDITIONAL_INFO_REQUESTED") {
        ticket = this.transitionTicket(
          ticket.id,
          "ADDITIONAL_INFO_REQUESTED",
          managerId,
          "관리자 답변으로 추가 정보 요청"
        );
      }
    } else if (ticket.status === "RECEIVED") {
      ticket = this.transitionTicket(ticket.id, "REVIEWING", managerId, "관리자 답변 전송");
    } else {
      const complaint = this.findComplaint(ticket.complaintId);
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    const message = this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      messageText
    );
    this.persistStore();

    return {
      action: input.action ?? "SEND_REPLY",
      message: this.presentTicketMessage(message),
      ticket: this.presentTicket(ticket)
    };
  }

  assignVendor(managerId: string, ticketId: string, input: AssignVendorInput): RepairRequest {
    this.assertManagerCanAccessTicket(managerId, this.findTicket(ticketId));
    const vendor = this.store.vendors.find((item) => item.id === input.vendorId);

    if (!vendor) {
      throw new NotFoundException("협력업체를 찾을 수 없습니다.");
    }

    this.assertTicketStatus(
      ticketId,
      [
        "RECEIVED",
        "REVIEWING",
        "ADDITIONAL_INFO_REQUESTED",
        "VENDOR_ASSIGNMENT_PENDING",
        "REOPENED"
      ],
      "업체 배정"
    );
    const ticket = this.transitionTicket(ticketId, "VENDOR_ASSIGNED", managerId, "업체 배정");
    ticket.assignedVendorId = vendor.id;
    const createdAt = now();
    const repair: RepairRequest = {
      id: id("rep"),
      ticketId,
      vendorId: vendor.id,
      status: "REQUESTED",
      title: `${ticket.category} 처리 요청`,
      description: input.requestNote,
      completionPhotoUrls: [],
      createdAt,
      updatedAt: createdAt
    };

    this.store.repairs.unshift(repair);
    vendor.activeJobs += 1;
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", input.requestNote);
    this.persistStore();

    return repair;
  }

  listManagerCosts(managerId: string) {
    return this.cost.listManagerCosts(managerId);
  }

  getManagerCost(managerId: string, costId: string) {
    return this.cost.getManagerCost(managerId, costId);
  }

  getManagerCostReviewQueueSummary(managerId: string): CostReviewQueueSummary {
    return this.cost.getManagerCostReviewQueueSummary(managerId);
  }

  getManagerMonthlyCostSummary(managerId: string, month?: string) {
    return this.cost.getManagerMonthlyCostSummary(managerId, month);
  }

  listManagerReceipts(managerId: string) {
    return this.cost.listManagerReceipts(managerId);
  }

  getManagerReceiptOcr(managerId: string, ocrId: string) {
    return this.cost.getManagerReceiptOcr(managerId, ocrId);
  }

  getManagerDisclosureSetting(managerId: string, month?: string): DisclosureSetting {
    return this.cost.getManagerDisclosureSetting(managerId, month);
  }

  listVendors() {
    return this.vendorMgmt.listVendors();
  }

  listManagerVendorMgmtVendors(managerId: string, filters: VendorMgmtListFilters = {}) {
    return this.vendorMgmt.listManagerVendorMgmtVendors(managerId, filters);
  }

  getManagerVendorMgmtDetail(managerId: string, vendorId: string) {
    return this.vendorMgmt.getManagerVendorMgmtDetail(managerId, vendorId);
  }

  getManagerVendorMgmtPerf(managerId: string, vendorId: string) {
    return this.vendorMgmt.getManagerVendorMgmtPerf(managerId, vendorId);
  }

  listManagerVendorDuplicateCandidates(managerId: string) {
    return this.vendorMgmt.listManagerVendorDuplicateCandidates(managerId);
  }

  createVendorInvite(managerId: string, input: CreateVendorInviteInput) {
    return this.vendorMgmt.createVendorInvite(managerId, input);
  }

  listVendorInvites(managerId: string) {
    return this.vendorMgmt.listVendorInvites(managerId);
  }

  createTenantInvite(managerId: string, input: CreateTenantInviteInput) {
    return this.vendorMgmt.createTenantInvite(managerId, input);
  }

  listTenantInvites(managerId: string) {
    return this.vendorMgmt.listTenantInvites(managerId);
  }

  getSignupInvitePreview(role: UserRole, inviteToken: string) {
    return this.auth.getSignupInvitePreview(role, inviteToken);
  }

  listVendorRepairs(vendorUserOrProfileId: string) {
    return this.vendorRepair.listVendorRepairs(vendorUserOrProfileId);
  }

  getVendorRepair(vendorUserOrProfileId: string, repairId: string) {
    return this.vendorRepair.getVendorRepair(vendorUserOrProfileId, repairId);
  }

  submitEstimate(vendorUserOrProfileId: string, repairId: string, input: SubmitEstimateInput) {
    return this.vendorRepair.submitEstimate(vendorUserOrProfileId, repairId, input);
  }

  approveRepairEstimate(
    managerId: string,
    repairId: string,
    input: ApproveRepairEstimateInput
  ) {
    return this.vendorRepair.approveRepairEstimate(managerId, repairId, input);
  }

  scheduleRepair(vendorUserOrProfileId: string, repairId: string, input: ScheduleRepairInput) {
    return this.vendorRepair.scheduleRepair(vendorUserOrProfileId, repairId, input);
  }

  reportCompletion(vendorUserOrProfileId: string, repairId: string, input: ReportCompletionInput) {
    return this.vendorRepair.reportCompletion(vendorUserOrProfileId, repairId, input);
  }

  addVendorRepairMessage(
    vendorUserOrProfileId: string,
    repairId: string,
    input: AddVendorRepairMessageInput
  ) {
    return this.vendorRepair.addVendorRepairMessage(vendorUserOrProfileId, repairId, input);
  }

  approveCompletion(managerId: string, ticketId: string, note?: string) {
    this.assertManagerCanAccessTicket(managerId, this.findTicket(ticketId));
    this.assertTicketStatus(ticketId, ["COMPLETION_REPORTED"], "완료 승인");
    const ticket = this.transitionTicket(ticketId, "COMPLETED", managerId, note ?? "완료 승인");
    const complaint = this.findComplaint(ticket.complaintId);
    const repairs = this.store.repairs.filter((repair) => repair.ticketId === ticketId);

    for (const repair of repairs) {
      repair.status = "COMPLETED";
      repair.updatedAt = now();
    }

    complaint.status = "COMPLETED";
    complaint.updatedAt = now();
    this.persistStore();

    return ticket;
  }

  addMessage(senderUserId: string, ticketId: string, messageText: string) {
    const ticket = this.findTicket(ticketId);
    const user = this.store.users.find((account) => account.id === senderUserId);

    const message = this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      senderUserId,
      user?.role ?? "TENANT",
      messageText
    );
    this.persistStore();

    return message;
  }

  addTenantComplaintMessage(
    tenantId: string,
    complaintId: string,
    input: AddTenantComplaintMessageInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const messageText = input.messageText?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("추가 설명 또는 사진이 필요합니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      messageText || "추가 사진을 제출했습니다.",
      attachmentUrls
    );

    this.refreshAnalysisFromTenantFollowup(ticket, {
      messageText,
      attachmentUrls
    });

    if (ticket.status === "ADDITIONAL_INFO_REQUESTED" || ticket.status === "REOPENED") {
      this.transitionTicket(
        ticket.id,
        "REVIEWING",
        tenantId,
        attachmentUrls.length
          ? "임차인이 추가 사진과 설명을 제출"
          : "임차인이 추가 설명을 제출"
      );
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id]
    };
  }

  submitTenantAiFeedback(
    tenantId: string,
    complaintId: string,
    input: SubmitTenantAiFeedbackInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const target = input.target;
    const reason = input.reason?.trim() ?? "";
    const requestedAction = input.requestedAction?.trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!this.isAiFeedbackTarget(target)) {
      throw new BadRequestException("이의제기 대상을 선택해주세요.");
    }

    if (!reason) {
      throw new BadRequestException("이의제기 사유를 입력해주세요.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    const analysis = this.store.analyses[ticket.id];
    const createdAt = now();
    const targetLabel = this.aiFeedbackTargetLabel(target);
    const feedback: AiFeedback = {
      id: id("afb"),
      ticketId: ticket.id,
      complaintId: complaint.id,
      tenantId,
      target,
      targetLabel,
      originalValue: this.aiFeedbackOriginalValue(target, ticket, complaint, analysis),
      reason,
      requestedAction,
      attachmentUrls: [...attachmentUrls],
      status: "OPEN",
      createdAt,
      updatedAt: createdAt
    };

    this.store.aiFeedback.unshift(feedback);
    this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      [
        `AI 판단 이의제기: ${targetLabel}`,
        `사유: ${reason}`,
        requestedAction ? `요청 조치: ${requestedAction}` : undefined
      ]
        .filter(Boolean)
        .join("\n"),
      attachmentUrls
    );
    this.markAnalysisNeedsHumanReview(ticket, targetLabel, reason);

    if (ticket.status === "RECEIVED") {
      this.transitionTicket(ticket.id, "REVIEWING", tenantId, "AI 판단 이의제기 접수");
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return this.presentAiFeedback(feedback);
  }

  confirmTenantCompletion(
    tenantId: string,
    complaintId: string,
    input: ConfirmTenantCompletionInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    this.assertTicketStatus(ticket.id, ["COMPLETION_REPORTED", "COMPLETED"], "완료 확인");

    const note = input.note?.trim();
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      note ? `수리 완료를 확인했습니다. ${note}` : "수리 완료를 확인했습니다."
    );

    if (ticket.status === "COMPLETION_REPORTED") {
      this.transitionTicket(ticket.id, "COMPLETED", tenantId, "임차인 완료 확인");
      for (const repair of this.store.repairs.filter((item) => item.ticketId === ticket.id)) {
        if (repair.status === "COMPLETION_REPORTED") {
          repair.status = "COMPLETED";
          repair.updatedAt = now();
        }
      }
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket)
    };
  }

  reopenTenantComplaint(
    tenantId: string,
    complaintId: string,
    input: ReopenTenantComplaintInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const messageText = input.messageText?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("미해결 사유 또는 추가 사진이 필요합니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    this.assertTicketStatus(ticket.id, ["COMPLETION_REPORTED", "COMPLETED"], "재요청");
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      messageText || "미해결 사진을 추가했습니다.",
      attachmentUrls
    );
    this.transitionTicket(ticket.id, "REOPENED", tenantId, "임차인 미해결 재요청");
    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket)
    };
  }

  createMoveInChecklistItem(tenantId: string, input: CreateMoveInChecklistItemInput) {
    return this.checklist.createMoveInChecklistItem(tenantId, input);
  }

  listTenantMoveInChecklist(tenantId: string) {
    return this.checklist.listTenantMoveInChecklist(tenantId);
  }

  listManagerMoveInChecklist(managerId: string, roomId: string) {
    return this.checklist.listManagerMoveInChecklist(managerId, roomId);
  }

  saveAttachment(uploadedByUserId: string, input: SaveAttachmentInput) {
    return this.floorPlan.saveAttachment(uploadedByUserId, input);
  }

  createFloorPlanDraft(ownerId: string, input: SaveFloorPlanDraftInput) {
    return this.floorPlan.createFloorPlanDraft(ownerId, input);
  }

  getFloorPlanDraft(ownerId: string, floorPlanId: string) {
    return this.floorPlan.getFloorPlanDraft(ownerId, floorPlanId);
  }

  updateFloorPlanDraft(ownerId: string, floorPlanId: string, input: SaveFloorPlanDraftInput) {
    return this.floorPlan.updateFloorPlanDraft(ownerId, floorPlanId, input);
  }

  getTenantRoom(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("임차인 호실을 찾을 수 없습니다.");
    }

    return this.findRoom(roomId);
  }

  listTenantMoveouts(tenantId: string) {
    return this.moveout.listTenantMoveouts(tenantId);
  }

  getTenantMoveout(tenantId: string, moveoutId: string) {
    return this.moveout.getTenantMoveout(tenantId, moveoutId);
  }

  listTenantMoveoutRecords(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutRecords(tenantId, moveoutId);
  }

  listTenantMoveoutChecklist(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutChecklist(tenantId, moveoutId);
  }

  getTenantMoveoutSettlement(tenantId: string, moveoutId: string) {
    return this.moveout.getTenantMoveoutSettlement(tenantId, moveoutId);
  }

  listTenantMoveoutDisputes(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutDisputes(tenantId, moveoutId);
  }

  createTenantMoveoutInquiry(
    tenantId: string,
    moveoutId: string,
    input: CreateTenantMoveoutInquiryInput
  ) {
    return this.moveout.createTenantMoveoutInquiry(tenantId, moveoutId, input);
  }

  createTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: CreateMoveoutDisputeInput
  ) {
    return this.moveout.createTenantMoveoutDispute(tenantId, moveoutId, input);
  }

  getManagerMoveoutDashboard(managerId: string) {
    return this.moveout.getManagerMoveoutDashboard(managerId);
  }

  listManagerMoveoutRows(managerId: string) {
    return this.moveout.listManagerMoveoutRows(managerId);
  }

  getManagerMoveout(managerId: string, moveoutId: string) {
    return this.moveout.getManagerMoveout(managerId, moveoutId);
  }

  getManagerMoveoutRecords(managerId: string, moveoutId: string) {
    return this.moveout.getManagerMoveoutRecords(managerId, moveoutId);
  }

  getManagerReportAudit(managerId: string, moveoutId: string) {
    return this.moveout.getManagerReportAudit(managerId, moveoutId);
  }

  getManagerMoveoutSettlement(
    managerId: string,
    moveoutId: string
  ): MoveoutManagerSettlementReview {
    return this.moveout.getManagerMoveoutSettlement(managerId, moveoutId);
  }

  adjustManagerMoveoutWearVerdict(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustWearVerdictInput
  ) {
    return this.moveout.adjustManagerMoveoutWearVerdict(managerId, moveoutId, input);
  }

  adjustManagerMoveoutDeduction(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustDeductionInput
  ) {
    return this.moveout.adjustManagerMoveoutDeduction(managerId, moveoutId, input);
  }

  completeManagerMoveoutReview(
    managerId: string,
    moveoutId: string,
    input: MoveoutCompleteReviewInput
  ) {
    return this.moveout.completeManagerMoveoutReview(managerId, moveoutId, input);
  }

  respondManagerMoveoutDispute(
    managerId: string,
    moveoutId: string,
    input: MoveoutRespondDisputeInput
  ) {
    return this.moveout.respondManagerMoveoutDispute(managerId, moveoutId, input);
  }

  createMessagingThread(managerId: string, input: CreateMessagingThreadInput) {
    return this.messaging.createMessagingThread(managerId, input);
  }

  listTenantMessagingThreads(tenantId: string) {
    return this.messaging.listTenantMessagingThreads(tenantId);
  }

  getTenantMessagingThread(tenantId: string, threadId: string) {
    return this.messaging.getTenantMessagingThread(tenantId, threadId);
  }

  addTenantMessagingThreadMessage(
    tenantId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ) {
    return this.messaging.addTenantMessagingThreadMessage(tenantId, threadId, input);
  }

  listManagerMessagingThreads(managerId: string, context?: MessagingThreadContext) {
    return this.messaging.listManagerMessagingThreads(managerId, context);
  }

  getManagerMessagingThread(managerId: string, threadId: string) {
    return this.messaging.getManagerMessagingThread(managerId, threadId);
  }

  addManagerMessagingThreadMessage(
    managerId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ) {
    return this.messaging.addManagerMessagingThreadMessage(managerId, threadId, input);
  }

  createManagerAnnouncementDraft(managerId: string, input: CreateAnnouncementDraftInput) {
    return this.messaging.createManagerAnnouncementDraft(managerId, input);
  }

  listManagerAnnouncementDrafts(managerId: string) {
    return this.messaging.listManagerAnnouncementDrafts(managerId);
  }

  getManagerAnnouncementDraft(managerId: string, draftId: string) {
    return this.messaging.getManagerAnnouncementDraft(managerId, draftId);
  }

  listManagerAnnouncementRecipients(managerId: string, draftId: string) {
    return this.messaging.listManagerAnnouncementRecipients(managerId, draftId);
  }

  sendManagerAnnouncementDraft(managerId: string, draftId: string) {
    return this.messaging.sendManagerAnnouncementDraft(managerId, draftId);
  }

  listTenantMessagingAnnouncements(tenantId: string) {
    return this.messaging.listTenantMessagingAnnouncements(tenantId);
  }

  getTenantMessagingAnnouncement(tenantId: string, announcementId: string) {
    return this.messaging.getTenantMessagingAnnouncement(tenantId, announcementId);
  }

  markTenantMessagingAnnouncementRead(tenantId: string, announcementId: string) {
    return this.messaging.markTenantMessagingAnnouncementRead(tenantId, announcementId);
  }

  confirmTenantMessagingAnnouncement(tenantId: string, announcementId: string) {
    return this.messaging.confirmTenantMessagingAnnouncement(tenantId, announcementId);
  }

  listManagerAnnouncementResults(managerId: string) {
    return this.messaging.listManagerAnnouncementResults(managerId);
  }

  getManagerAnnouncementResult(managerId: string, announcementId: string) {
    return this.messaging.getManagerAnnouncementResult(managerId, announcementId);
  }

  private loadStore(): Store {
    if (!this.storeFilePath || !existsSync(this.storeFilePath)) {
      return this.seedDemoData ? createDemoStore() : createEmptyStore();
    }

    const parsed = JSON.parse(readFileSync(this.storeFilePath, "utf8")) as unknown;

    if (!this.isStoreSnapshot(parsed)) {
      throw new Error(`Roomlog store snapshot is invalid: ${this.storeFilePath}`);
    }

    return this.normalizeStoreSnapshot(parsed);
  }

  private normalizeStoreSnapshot(parsed: Store): Store {
    return {
      ...parsed,
      vendorInvites: parsed.vendorInvites ?? [],
      tenantInvites: parsed.tenantInvites ?? [],
      contracts: parsed.contracts ?? [],
      contractDocuments: parsed.contractDocuments ?? [],
      contractExtractions: parsed.contractExtractions ?? [],
      contractPrivacies: parsed.contractPrivacies ?? [],
      contractInvites: parsed.contractInvites ?? [],
      attachments: parsed.attachments ?? [],
      floorPlans: (parsed.floorPlans ?? []).map((floorPlan) => ({
        ...floorPlan,
        extractionMeta: floorPlan.extractionMeta ?? { scaleConfirmed: false },
        openings: floorPlan.openings ?? [],
        fixtures: floorPlan.fixtures ?? [],
        furnitures: []
      })),
      moveInChecklist: parsed.moveInChecklist ?? [],
      aiFeedback: parsed.aiFeedback ?? [],
      rooms: parsed.rooms.map((room) => ({
        ...room,
        landlordId: room.landlordId ?? "landlord-demo"
      })),
      intakeSessions: parsed.intakeSessions.map((session) => ({
        ...session,
        draft: {
          ...session.draft,
          contextHints: session.draft.contextHints ?? [],
          nextQuestions: session.draft.nextQuestions ?? [],
          tenantGuidance: session.draft.tenantGuidance ?? [],
          photoAnalysis: session.draft.photoAnalysis ?? this.emptyPhotoAnalysis(),
          intakeSlots: session.draft.intakeSlots ?? [],
          requiredInfo: session.draft.requiredInfo ?? [],
          duplicateCandidates: session.draft.duplicateCandidates ?? []
        },
        messages: session.messages.map((message) => ({
          ...message,
          attachmentUrls: message.attachmentUrls ?? []
        }))
      })),
      messages: parsed.messages.map((message) => ({
        ...message,
        attachmentUrls: message.attachmentUrls ?? []
      })),
      costs: parsed.costs ?? [],
      receipts: parsed.receipts ?? [],
      receiptOcrs: (parsed.receiptOcrs ?? []).map((ocr) => this.cloneReceiptOcr(ocr)),
      messagingThreads: (parsed.messagingThreads ?? []).map((thread) => ({
        ...thread,
        archivedNotice: thread.archivedNotice ?? true,
        pendingRequest: thread.pendingRequest ?? false,
        unreadCount: thread.unreadCount ?? 0
      })),
      messagingMessages: (parsed.messagingMessages ?? []).map((message) => ({
        ...message,
        attachmentUrls: message.attachmentUrls ?? []
      })),
      messagingAnnouncementDrafts: (parsed.messagingAnnouncementDrafts ?? []).map((draft) => ({
        ...draft,
        targetRoomIds: draft.targetRoomIds ?? [],
        translations: draft.translations ?? []
      })),
      messagingAnnouncements: parsed.messagingAnnouncements ?? [],
      messagingAnnouncementDeliveries: parsed.messagingAnnouncementDeliveries ?? [],
      moveouts: parsed.moveouts ?? [],
      moveoutRecords: parsed.moveoutRecords ?? [],
      moveoutChecklist: parsed.moveoutChecklist ?? [],
      moveoutSettlements: (parsed.moveoutSettlements ?? []).map((settlement) => ({
        ...settlement,
        deductions: settlement.deductions ?? []
      })),
      moveoutDeductions: parsed.moveoutDeductions ?? [],
      moveoutDisputes: (parsed.moveoutDisputes ?? []).map((dispute) => ({
        ...dispute,
        history: dispute.history ?? []
      })),
      moveoutReportAudits: parsed.moveoutReportAudits ?? []
    };
  }

  private persistStore() {
    if (!this.storeFilePath) {
      this.projectStore();
      return;
    }

    mkdirSync(dirname(this.storeFilePath), { recursive: true });
    const tempFilePath = `${this.storeFilePath}.tmp`;
    writeFileSync(tempFilePath, JSON.stringify(this.store, null, 2));
    renameSync(tempFilePath, this.storeFilePath);
    this.projectStore();
  }

  private projectStore() {
    if (!this.storeProjector) {
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(this.store)) as Store;
    this.pendingPersistence = this.pendingPersistence
      .then(() => this.storeProjector?.persist(snapshot))
      .then(
        () => {
          this.persistenceError = undefined;
        },
        (error) => {
          this.persistenceError = error;
        }
      );
  }

  private isStoreSnapshot(value: unknown): value is Store {
    const snapshot = value as Partial<Store> | undefined;

    return Boolean(
      snapshot &&
        Array.isArray(snapshot.users) &&
        Array.isArray(snapshot.rooms) &&
        snapshot.tenantRooms &&
        Array.isArray(snapshot.vendors) &&
        (snapshot.vendorInvites === undefined || Array.isArray(snapshot.vendorInvites)) &&
        (snapshot.tenantInvites === undefined || Array.isArray(snapshot.tenantInvites)) &&
        (snapshot.contracts === undefined || Array.isArray(snapshot.contracts)) &&
        (snapshot.contractDocuments === undefined || Array.isArray(snapshot.contractDocuments)) &&
        (snapshot.contractExtractions === undefined || Array.isArray(snapshot.contractExtractions)) &&
        (snapshot.contractPrivacies === undefined || Array.isArray(snapshot.contractPrivacies)) &&
        (snapshot.contractInvites === undefined || Array.isArray(snapshot.contractInvites)) &&
        (snapshot.attachments === undefined || Array.isArray(snapshot.attachments)) &&
        (snapshot.floorPlans === undefined || Array.isArray(snapshot.floorPlans)) &&
        (snapshot.moveInChecklist === undefined || Array.isArray(snapshot.moveInChecklist)) &&
        (snapshot.aiFeedback === undefined || Array.isArray(snapshot.aiFeedback)) &&
        Array.isArray(snapshot.intakeSessions) &&
        Array.isArray(snapshot.complaints) &&
        snapshot.analyses &&
        Array.isArray(snapshot.tickets) &&
        Array.isArray(snapshot.repairs) &&
        (snapshot.costs === undefined || Array.isArray(snapshot.costs)) &&
        (snapshot.receipts === undefined || Array.isArray(snapshot.receipts)) &&
        (snapshot.receiptOcrs === undefined || Array.isArray(snapshot.receiptOcrs)) &&
        (snapshot.messagingThreads === undefined || Array.isArray(snapshot.messagingThreads)) &&
        (snapshot.messagingMessages === undefined || Array.isArray(snapshot.messagingMessages)) &&
        (snapshot.messagingAnnouncementDrafts === undefined ||
          Array.isArray(snapshot.messagingAnnouncementDrafts)) &&
        (snapshot.messagingAnnouncements === undefined ||
          Array.isArray(snapshot.messagingAnnouncements)) &&
        (snapshot.messagingAnnouncementDeliveries === undefined ||
          Array.isArray(snapshot.messagingAnnouncementDeliveries)) &&
        (snapshot.moveouts === undefined || Array.isArray(snapshot.moveouts)) &&
        (snapshot.moveoutRecords === undefined || Array.isArray(snapshot.moveoutRecords)) &&
        (snapshot.moveoutChecklist === undefined || Array.isArray(snapshot.moveoutChecklist)) &&
        (snapshot.moveoutSettlements === undefined || Array.isArray(snapshot.moveoutSettlements)) &&
        (snapshot.moveoutDeductions === undefined || Array.isArray(snapshot.moveoutDeductions)) &&
        (snapshot.moveoutDisputes === undefined || Array.isArray(snapshot.moveoutDisputes)) &&
        (snapshot.moveoutReportAudits === undefined || Array.isArray(snapshot.moveoutReportAudits)) &&
        Array.isArray(snapshot.messages) &&
        Array.isArray(snapshot.history)
    );
  }

  private validateComplaintInput(input: CreateComplaintInput) {
    if (!input.title?.trim()) {
      throw new BadRequestException("신고 제목을 입력해주세요.");
    }

    if (!input.description?.trim()) {
      throw new BadRequestException("신고 내용을 입력해주세요.");
    }

    if (!input.location?.trim()) {
      throw new BadRequestException("발생 위치를 입력해주세요.");
    }
  }

  private emptyDraft(): IntakeDraft {
    return {
      title: "상담 초안",
      summary: "아직 접수할 내용이 충분하지 않습니다.",
      category: "기타",
      detailCategory: "확인 필요",
      priority: 4,
      responsibilityHint: "판단 어려움",
      confidenceScore: 0,
      reasons: ["상담 시작 전"],
      recommendedAction: "문제 위치와 증상을 먼저 확인하세요.",
      contextHints: [],
      nextQuestions: [
        "어느 공간의 어떤 부위에서 문제가 보이나요?",
        "언제부터 시작됐고 지금도 계속되고 있나요?",
        "방문 가능한 시간대가 언제인가요?"
      ],
      tenantGuidance: ["사진이 있으면 상담창에 첨부해 주세요."],
      photoAnalysis: this.emptyPhotoAnalysis(),
      intakeSlots: [
        {
          key: "symptom",
          label: "증상",
          status: "NEEDS_INFO",
          evidence: "아직 세입자 증상이 없습니다.",
          action: "어떤 문제가 보이는지 한 문장으로 알려주세요."
        },
        {
          key: "location",
          label: "위치",
          status: "NEEDS_INFO",
          evidence: "문제 위치가 필요합니다.",
          action: "방/공간과 문제 부위를 알려주세요."
        },
        {
          key: "occurrence",
          label: "발생 시점",
          status: "NEEDS_INFO",
          evidence: "언제부터 발생했는지 아직 모릅니다.",
          action: "언제 시작됐고 지금도 계속되는지 알려주세요."
        },
        {
          key: "risk",
          label: "위험 여부",
          status: "NEEDS_INFO",
          evidence: "안전 위험 여부를 확인해야 합니다.",
          action: "전기, 가스, 침수, 문 잠김 같은 안전 위험이 있는지 알려주세요."
        },
        {
          key: "photo",
          label: "사진",
          status: "NEEDS_INFO",
          evidence: "사진이 아직 첨부되지 않았습니다.",
          action: "문제 부위 근접 사진과 공간 전체 사진을 올려주세요."
        },
        {
          key: "visitTime",
          label: "방문 가능 시간",
          status: "NEEDS_INFO",
          evidence: "방문 가능 시간이 필요합니다.",
          action: "관리자나 업체가 확인할 수 있는 시간대를 알려주세요."
        }
      ],
      requiredInfo: ["문제 위치", "증상", "방문 가능 시간"],
      photoRequested: false,
      readyToFinalize: false,
      duplicateCandidates: []
    };
  }

  private emptyPhotoAnalysis(): PhotoAnalysis {
    return {
      attachmentUrls: [],
      previousAttachmentUrls: [],
      candidates: [],
      comparisonStatus: "추가 사진 필요",
      summary: "사진이 아직 첨부되지 않았습니다.",
      evidence: ["사진 첨부 후 문제 후보와 비교 상태를 분석합니다."],
      recommendedRetake: false
    };
  }

  private detectOccurrenceInfo(text: string) {
    const compact = text.replace(/\s+/g, " ").trim();

    if (!compact) {
      return undefined;
    }

    const match = compact.match(
      /(방금|어제(?:부터)?|오늘\s*(?:아침|오전|낮|오후|저녁|밤)?\s*부터|오늘부터|오늘\s*(?:처음|다시|또)|지난\s*\d*\s*(?:주|달|개월|일)?|며칠\s*(?:전|째|동안)?|\d{1,2}\s*일\s*전|\d{1,2}\s*시간\s*전|계속|지금도|반복|시작(?:됐|되었)?|발생(?:했|하였)?|떨어지(?:고|는|며|네요|나요|습니다)|떨어(?:집니다|져|졌)|새(?:고|는|네요|나요|어)|샙니다|고이(?:고|는|며|네요|나요|었습니다)|젖(?:고|은|었습니다)|잠기지\s*않|안\s*잠|나지\s*않|안\s*나|작동하지\s*않|고장(?:났|입니다)|[가-힣0-9]+\s*부터)/
    );

    return match?.[0]?.trim();
  }

  private detectSafetyRiskInfo(
    text: string,
    category: IntakeDraft["category"],
    priority: IntakeDraft["priority"]
  ) {
    if (category !== "하자") {
      return undefined;
    }

    if (priority === 1) {
      return "긴급 위험 가능성";
    }

    const compact = text.replace(/\s+/g, " ").trim();
    const match = compact.match(
      /(위험(?:은|한)?\s*(?:없|아니)|안전(?:은)?\s*(?:괜찮|문제\s*없)|전기(?:나|는|와)?\s*(?:가스)?[^.。!?]{0,16}(?:없|아니|괜찮)|가스[^.。!?]{0,16}(?:없|아니|괜찮)|침수[^.。!?]{0,16}(?:없|아니)|문[^.。!?]{0,12}잠[^.。!?]{0,12}(?:괜찮|됩)|위험|가스|누전|전기|콘센트|스위치|침수|잠기지|문이 안|불꽃|화재|감전|안전|천장에서\s*물|물이\s*(?:떨어|새|샘|고이)|누수|바닥(?:에|이)?\s*(?:물|젖)|곰팡이\s*냄새|도어락)/
    );

    return match?.[0]?.trim();
  }

  private buildIntakeSlots(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    location?: string;
    availableTimes?: string;
    photoRequested: boolean;
  }): IntakeSlot[] {
    const text = input.text.trim();
    const occurrenceInfo = this.detectOccurrenceInfo(text);
    const riskInfo = this.detectSafetyRiskInfo(text, input.category, input.priority);
    const photoIsUseful =
      input.category === "하자" &&
      (input.photoRequested ||
        ["누수", "곰팡이", "벽지", "바닥", "에어컨", "도어락", "보일러"].includes(
          input.detailCategory
        ));

    return [
      {
        key: "symptom",
        label: "증상",
        status: text ? "COLLECTED" : "NEEDS_INFO",
        value: text ? this.compactThreadMessage(text, text) : undefined,
        evidence: text ? "세입자 증상을 확인했습니다." : "아직 세입자 증상이 없습니다.",
        action: text ? undefined : "어떤 문제가 보이는지 한 문장으로 알려주세요."
      },
      {
        key: "location",
        label: "위치",
        status: input.location ? "COLLECTED" : "NEEDS_INFO",
        value: input.location,
        evidence: input.location
          ? `${input.location} 위치를 확인했습니다.`
          : "문제 위치가 필요합니다.",
        action: input.location ? undefined : "방/공간과 문제 부위를 알려주세요."
      },
      {
        key: "occurrence",
        label: "발생 시점",
        status: occurrenceInfo ? "COLLECTED" : input.category === "하자" ? "NEEDS_INFO" : "OPTIONAL",
        value: occurrenceInfo,
        evidence: occurrenceInfo
          ? "발생 시점이나 지속 여부를 확인했습니다."
          : input.category === "하자"
            ? "언제부터 발생했는지 아직 모릅니다."
            : "일반 문의라 발생 시점 확인은 선택 사항입니다.",
        action: occurrenceInfo
          ? undefined
          : input.category === "하자"
            ? "언제 시작됐고 지금도 계속되는지 알려주세요."
            : undefined
      },
      {
        key: "risk",
        label: "위험 여부",
        status: riskInfo ? "COLLECTED" : input.category === "하자" ? "NEEDS_INFO" : "OPTIONAL",
        value: riskInfo,
        evidence: riskInfo
          ? "안전 위험 판단에 필요한 단서를 확인했습니다."
          : input.category === "하자"
            ? "안전 위험 여부를 확인해야 합니다."
            : "일반 문의라 위험 확인은 선택 사항입니다.",
        action: riskInfo
          ? undefined
          : input.category === "하자"
            ? "전기, 가스, 침수, 문 잠김 같은 안전 위험이 있는지 알려주세요."
            : undefined
      },
      {
        key: "photo",
        label: "사진",
        status: input.hasPhoto ? "COLLECTED" : photoIsUseful ? "NEEDS_INFO" : "OPTIONAL",
        value: input.hasPhoto ? "첨부됨" : undefined,
        evidence: input.hasPhoto
          ? "사진이 이 상담 스레드에 첨부되었습니다."
          : photoIsUseful
            ? "사진이 있으면 관리자 판단이 빨라집니다."
            : "사진은 선택 사항입니다.",
        action: input.hasPhoto
          ? undefined
          : photoIsUseful
            ? "문제 부위 근접 사진과 공간 전체 사진을 올려주세요."
            : undefined
      },
      {
        key: "visitTime",
        label: "방문 가능 시간",
        status: input.availableTimes
          ? "COLLECTED"
          : input.category === "하자"
            ? "NEEDS_INFO"
            : "OPTIONAL",
        value: input.availableTimes,
        evidence: input.availableTimes
          ? `${input.availableTimes} 방문 가능 시간을 확인했습니다.`
          : input.category === "하자"
            ? "방문 가능 시간이 필요합니다."
            : "방문 일정이 필요하면 추가로 확인합니다.",
        action: input.availableTimes
          ? undefined
          : input.category === "하자"
            ? "관리자나 업체가 확인할 수 있는 시간대를 알려주세요."
            : undefined
      }
    ];
  }

  private intakeSlotCounts(slots: IntakeSlot[]) {
    return {
      collectedSlotCount: slots.filter((slot) => slot.status === "COLLECTED").length,
      openSlotCount: slots.filter((slot) => slot.status === "NEEDS_INFO").length
    };
  }

  private createIntakeMessage(
    sessionId: string,
    sender: IntakeMessage["sender"],
    messageText: string,
    inputMode: IntakeMessage["inputMode"]
  ): IntakeMessage {
    return {
      id: id("imsg"),
      sessionId,
      sender,
      messageText,
      attachmentUrls: [],
      inputMode,
      createdAt: now()
    };
  }

  private sessionHasPhoto(session: IntakeSession) {
    return session.messages.some(
      (message) => message.sender === "TENANT" && message.attachmentUrls.length > 0
    );
  }

  private buildIntakeDraft(session: IntakeSession): IntakeDraft {
    const tenantMessages = session.messages.filter((message) => message.sender === "TENANT");
    const text = tenantMessages
      .map((message) => [message.messageText, message.transcriptText].filter(Boolean).join(" "))
      .join(" ");
    const hasPhoto = tenantMessages.some((message) => message.attachmentUrls.length > 0);
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const location = this.extractLocation(text) || room?.roomNo;
    const availableTimes = this.extractAvailableTimes(text);
    const detailCategory = this.detectDetailCategory(text);
    const category = this.detectMainCategory(text, detailCategory);
    const priority = this.detectPriority(text, detailCategory);
    const occurredAt = this.detectOccurrenceInfo(text);
    const safetyRiskInfo = this.detectSafetyRiskInfo(text, category, priority);
    const photoRequested = category === "하자" && ["누수", "곰팡이", "벽지", "바닥", "에어컨"].includes(detailCategory) && !hasPhoto;
    const requiredInfo: string[] = [];

    if (!text.trim()) {
      requiredInfo.push("증상");
    }

    if (!location) {
      requiredInfo.push("문제 위치");
    }

    if (photoRequested && priority !== 1) {
      requiredInfo.push("문제 부위 사진");
    }

    if (!occurredAt && category === "하자") {
      requiredInfo.push("발생 시점");
    }

    if (!safetyRiskInfo && category === "하자") {
      requiredInfo.push("안전 위험 여부");
    }

    if (!availableTimes && category === "하자") {
      requiredInfo.push("방문 가능 시간");
    }

    const responsibilityHint = this.detectResponsibilityHint(text);
    const contextHints = this.roomContextHints(session, text, detailCategory);
    const duplicateCandidates = this.duplicateCandidatesForIntake(
      session,
      text,
      detailCategory,
      location
    );
    const photoAnalysis = this.buildPhotoAnalysis(session, text, detailCategory, hasPhoto);
    const nextQuestions = this.nextQuestionsForDraft({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      photoRequested,
      location,
      availableTimes,
      duplicateCandidates
    });
    const intakeSlots = this.buildIntakeSlots({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      location,
      availableTimes,
      photoRequested
    });
    const tenantGuidance = this.tenantGuidanceForDraft({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      contextHints,
      duplicateCandidates
    });
    const summaryLocation = location ?? room?.roomNo ?? "호실";
    const summary = `${summaryLocation}에서 ${detailCategory} 관련 문제가 접수되었습니다. ${
      priority === 1
        ? "피해 확산 또는 안전 위험 가능성이 있어 당일 확인이 필요합니다."
        : priority === 2
          ? "생활 불편이 커 빠른 확인과 일정 조율이 필요합니다."
          : "관리자 확인 후 일반 처리로 진행할 수 있습니다."
    }`;

    return {
      title: `${summaryLocation} ${detailCategory}`,
      summary,
      category,
      detailCategory,
      priority,
      responsibilityHint,
      confidenceScore: requiredInfo.length === 0 ? 0.84 : 0.58,
      reasons: [
        ...this.analysisReasons(text, detailCategory, priority, hasPhoto),
        ...contextHints,
        ...duplicateCandidates.map(
          (candidate) => `중복 가능 티켓: ${candidate.title} (${candidate.displayStatus})`
        )
      ],
      recommendedAction:
        duplicateCandidates.length
          ? "중복 가능성이 있는 기존 티켓이 있습니다. 같은 문제라면 기존 티켓에 상담 내용을 추가하고, 별도 문제라면 새 티켓으로 접수하세요."
          : contextHints.length
          ? "같은 호실의 과거 기록과 현재 증상을 함께 확인하고, 반복 하자 가능성을 관리자에게 전달하세요."
          : priority === 1
          ? "관리자에게 긴급 티켓으로 전달하고 누수 확산 여부와 전기 안전을 먼저 확인하세요."
          : photoRequested
            ? "문제 부위 사진을 받은 뒤 접수 초안을 확정하세요."
            : "관리자 검토 후 추가 정보 요청 또는 업체 배정을 진행하세요.",
      contextHints,
      nextQuestions,
      tenantGuidance,
      photoAnalysis,
      intakeSlots,
      requiredInfo,
      photoRequested,
      readyToFinalize: requiredInfo.length === 0,
      location,
      occurredAt,
      availableTimes,
      duplicateCandidates
    };
  }

  private nextQuestionsForDraft(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    photoRequested: boolean;
    location?: string;
    availableTimes?: string;
    duplicateCandidates: DuplicateTicketCandidate[];
  }) {
    const questions: string[] = [];
    const occurrenceInfo = this.detectOccurrenceInfo(input.text);
    const safetyRiskInfo = this.detectSafetyRiskInfo(input.text, input.category, input.priority);

    if (!input.location) {
      questions.push("문제가 보이는 정확한 공간과 부위를 알려주실 수 있나요?");
    }

    if (
      input.priority === 1 &&
      /(누수|천장|물이|침수|바닥)/.test(`${input.text} ${input.detailCategory}`)
    ) {
      questions.push("물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?");
    } else if (!occurrenceInfo && input.category === "하자") {
      questions.push("언제부터 시작됐고 지금도 같은 증상이 계속되고 있나요?");
    }

    if (!safetyRiskInfo && input.category === "하자") {
      questions.push("전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?");
    }

    if (
      input.category === "하자" &&
      !input.hasPhoto &&
      (input.photoRequested || ["누수", "곰팡이", "벽지", "바닥", "에어컨"].includes(input.detailCategory))
    ) {
      questions.push("문제 부위 근접 사진 1장과 공간 전체가 보이는 사진 1장을 올려주실 수 있나요?");
    }

    if (!input.availableTimes && input.category === "하자") {
      questions.push("관리자나 업체가 확인할 수 있는 방문 가능 시간대가 언제인가요?");
    }

    if (input.duplicateCandidates.length) {
      questions.push("같은 문제라면 기존 티켓에 추가할까요, 별도 문제라 새 티켓으로 접수할까요?");
    }

    if (questions.length === 0 && input.category !== "하자") {
      questions.push("확인받고 싶은 핵심 내용이나 관련 문서/사진이 있으면 함께 알려주세요.");
    }

    return questions.slice(0, 3);
  }

  private tenantGuidanceForDraft(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    contextHints: string[];
    duplicateCandidates: DuplicateTicketCandidate[];
  }) {
    const text = `${input.text} ${input.detailCategory}`;
    const guidance: string[] = [];

    if (/(가스|가스 냄새|gas)/i.test(text)) {
      guidance.push("가스 냄새가 강하면 창문을 열고 불꽃이나 전기 스위치는 만지지 말아주세요.");
    } else if (input.priority === 1 && /(누수|천장|물이|침수|바닥)/.test(text)) {
      guidance.push("물고임이 전기 콘센트, 조명, 스위치 근처라면 만지지 말고 안전한 곳에서 기다려주세요.");
    } else if (input.priority === 1 && /(누전|감전|전기|콘센트)/.test(text)) {
      guidance.push("전기 설비 주변 문제는 직접 만지지 말고 가능한 경우 관리자에게 차단기 확인을 요청하세요.");
    }

    if (input.category === "하자" && !input.hasPhoto) {
      guidance.push("사진은 문제 부위 근접 사진과 공간 전체 사진을 함께 올리면 관리자가 더 빨리 판단할 수 있습니다.");
    }

    if (input.contextHints.length) {
      guidance.push("같은 호실의 과거 기록은 참고 자료로만 쓰고, 현재 상태는 이번 상담 내용 기준으로 확인하겠습니다.");
    }

    if (input.duplicateCandidates.length) {
      guidance.push("중복 가능성이 있는 경우 새 접수 대신 기존 티켓에 추가 설명과 사진을 연결할 수 있습니다.");
    }

    if (guidance.length === 0) {
      guidance.push("추가 설명을 보내면 같은 상담 스레드에서 이어서 정리하겠습니다.");
    }

    return guidance.slice(0, 4);
  }

  private buildPhotoAnalysis(
    session: IntakeSession,
    text: string,
    detailCategory: string,
    hasPhoto: boolean
  ): PhotoAnalysis {
    const attachmentUrls = Array.from(
      new Set(
        session.messages
          .filter((message) => message.sender === "TENANT")
          .flatMap((message) => message.attachmentUrls)
      )
    );
    const candidates = this.photoCandidatesFor(detailCategory, text);

    if (!hasPhoto || attachmentUrls.length === 0) {
      return {
        attachmentUrls: [],
        previousAttachmentUrls: [],
        candidates,
        comparisonStatus: "추가 사진 필요",
        summary:
          candidates.length > 0
            ? `${candidates.join(", ")} 여부를 확인할 수 있는 사진이 필요합니다.`
            : "사진이 아직 첨부되지 않았습니다.",
        evidence: ["현재 상담 스레드에 하자 사진이 없습니다."],
        recommendedRetake: false
      };
    }

    const previousEntries = this.roomHistoryEntriesForIntake(session).filter(
      (entry) =>
        entry.attachmentUrls.length > 0 &&
        this.timelineEntryMatchesPhotoContext(entry, text, detailCategory)
    );
    const baselineItems = this.moveInChecklistBaselinesForPhoto(
      session.roomId,
      text,
      detailCategory
    );
    const previousAttachmentUrls = Array.from(
      new Set([
        ...baselineItems.flatMap((item) => item.attachmentUrls),
        ...previousEntries.flatMap((entry) => entry.attachmentUrls)
      ])
    ).filter((url) => !attachmentUrls.includes(url));
    const comparisonStatus: PhotoComparisonStatus = baselineItems.length
      ? "신규 발생 가능성"
      : previousAttachmentUrls.length
        ? "기존 하자 가능성"
        : "비교 어려움";
    const evidence = [
      `현재 첨부 사진 ${attachmentUrls.length}건이 기존 티켓에 연결됨`,
      candidates.length
        ? `텍스트와 사진 맥락상 ${candidates.join(", ")} 후보를 우선 검토`
        : "사진 후보는 관리자 검토가 필요함"
    ];

    if (baselineItems.length) {
      evidence.push(`입주 전 체크리스트 기준 사진 ${baselineItems.length}개 항목과 비교 필요`);
    } else if (previousAttachmentUrls.length) {
      evidence.push(`같은 호실의 과거 관련 사진 ${previousAttachmentUrls.length}건과 비교 필요`);
    } else {
      evidence.push("비교 가능한 같은 위치의 과거 사진을 찾지 못함");
    }

    return {
      attachmentUrls,
      previousAttachmentUrls,
      candidates,
      comparisonStatus,
      summary: baselineItems.length
        ? "입주 전 체크리스트 기준 사진이 있어 신규 발생 가능성을 함께 검토해야 합니다."
        : previousAttachmentUrls.length
        ? "같은 호실의 과거 관련 사진이 있어 반복 또는 기존 하자 가능성을 함께 검토해야 합니다."
        : "현재 사진은 접수 자료로 연결되었지만 같은 위치의 과거 사진이 부족해 비교가 어렵습니다.",
      evidence,
      recommendedRetake: previousAttachmentUrls.length === 0 && attachmentUrls.length < 2
    };
  }

  private photoCandidatesFor(detailCategory: string, text: string) {
    const candidates = new Set<string>();
    const normalized = `${detailCategory} ${text}`;

    if (/(누수|물|천장|샘|침수)/.test(normalized)) {
      candidates.add("누수");
    }

    if (/(곰팡이|얼룩)/.test(normalized)) {
      candidates.add("곰팡이");
    }

    if (/(벽지|도배)/.test(normalized)) {
      candidates.add("벽지 훼손");
    }

    if (/(바닥|마루|장판)/.test(normalized)) {
      candidates.add("바닥 손상");
    }

    if (/(에어컨|냉방|실내기)/.test(normalized)) {
      candidates.add("에어컨 문제");
    }

    if (/(창틀|창문|샷시)/.test(normalized)) {
      candidates.add("창틀 문제");
    }

    if (candidates.size === 0 && detailCategory && detailCategory !== "확인 필요") {
      candidates.add(detailCategory);
    }

    return Array.from(candidates);
  }

  private moveInChecklistBaselinesForPhoto(
    roomId: string,
    text: string,
    detailCategory: string
  ) {
    return this.store.moveInChecklist.filter(
      (item) =>
        item.roomId === roomId &&
        item.attachmentUrls.length > 0 &&
        this.moveInChecklistItemMatchesPhotoContext(item, text, detailCategory)
    );
  }

  private moveInChecklistItemMatchesPhotoContext(
    item: MoveInChecklistItem,
    text: string,
    detailCategory: string
  ) {
    const itemText = `${item.area} ${item.itemName} ${item.memo ?? ""}`;
    const normalizedText = `${detailCategory} ${text}`;

    return (
      itemText.includes(detailCategory) ||
      (/(화장실|욕실|천장|누수|물|침수)/.test(normalizedText) &&
        /(화장실|욕실|천장|누수|물|침수)/.test(itemText)) ||
      (/(싱크대|주방|수전|배수)/.test(normalizedText) &&
        /(싱크대|주방|수전|배수)/.test(itemText)) ||
      (/(벽지|도배|곰팡이|얼룩)/.test(normalizedText) &&
        /(벽지|도배|곰팡이|얼룩)/.test(itemText)) ||
      (/(바닥|마루|장판)/.test(normalizedText) && /(바닥|마루|장판)/.test(itemText)) ||
      (/(창틀|창문|샷시)/.test(normalizedText) && /(창틀|창문|샷시)/.test(itemText)) ||
      (/(에어컨|실내기|냉방)/.test(normalizedText) && /(에어컨|실내기|냉방)/.test(itemText))
    );
  }

  private timelineEntryMatchesPhotoContext(
    entry: RoomTimelineEntry,
    text: string,
    detailCategory: string
  ) {
    const entryText = `${entry.title} ${entry.description} ${entry.status ?? ""}`;
    const normalizedText = `${detailCategory} ${text}`;

    return (
      entryText.includes(detailCategory) ||
      (/(누수|물|천장|침수)/.test(normalizedText) && /(누수|물|천장|침수)/.test(entryText)) ||
      (/(곰팡이|얼룩)/.test(normalizedText) && /(곰팡이|얼룩)/.test(entryText)) ||
      (/(벽지|도배)/.test(normalizedText) && /(벽지|도배)/.test(entryText)) ||
      (/(바닥|마루|장판)/.test(normalizedText) && /(바닥|마루|장판)/.test(entryText)) ||
      (/(에어컨|냉방|실내기)/.test(normalizedText) && /(에어컨|냉방|실내기)/.test(entryText)) ||
      (/(창틀|창문|샷시)/.test(normalizedText) && /(창틀|창문|샷시)/.test(entryText))
    );
  }

  private async generateIntakeTurn(
    session: IntakeSession,
    fallbackDraft: IntakeDraft
  ): Promise<GeneratedIntakeTurn> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        source: "fallback",
        draft: fallbackDraft,
        assistantMessage: this.composeAssistantReply(fallbackDraft, session)
      };
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier(session.tenantId, session.id)
        },
        body: JSON.stringify({
          model: process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini",
          instructions: this.buildIntakeResponseInstructions(session),
          input: [
            {
              role: "user",
              content: this.buildIntakeResponseContent(session, fallbackDraft)
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "roomlog_intake_turn",
              strict: true,
              schema: this.intakeTurnJsonSchema()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI Responses failed with ${response.status}`);
      }

      const responseBody = (await response.json()) as Record<string, unknown>;
      const parsed = this.parseOpenAIIntakeTurn(responseBody);
      const draft = this.normalizeGeneratedDraft(parsed.draft, fallbackDraft);

      return {
        source: "openai",
        draft,
        assistantMessage: this.ensureAssistantReplyQuality(
          parsed.assistantMessage,
          draft,
          session
        )
      };
    } catch {
      return {
        source: "fallback",
        draft: fallbackDraft,
        assistantMessage: [
          "OpenAI 상담 생성에 일시적으로 연결하지 못해 로컬 안전 지침으로 먼저 정리합니다.",
          this.composeAssistantReply(fallbackDraft, session)
        ].join("\n")
      };
    }
  }

  private composeAssistantReply(draft: IntakeDraft, session?: IntakeSession) {
    const threadText = this.threadText(session);
    const safetyLines = this.safetyGuidance(threadText, draft);
    const tenantGuidanceLines = draft.tenantGuidance.filter(
      (line) => !(safetyLines.length && /(전기|콘센트|스위치|물고임)/.test(line))
    );
    const guidanceLines = Array.from(new Set([...safetyLines, ...tenantGuidanceLines]));
    const currentPhotoCount =
      draft.photoAnalysis.attachmentUrls.length ||
      session?.messages.reduce((total, message) => total + message.attachmentUrls.length, 0) ||
      0;
    const needsPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const contextLines = draft.contextHints.slice(0, 2);
    const duplicateLines = draft.duplicateCandidates.length
      ? [
          `중복 가능성이 있는 기존 티켓이 ${draft.duplicateCandidates.length}건 있습니다.`,
          `가장 유사한 티켓: ${draft.duplicateCandidates[0].title} (${draft.duplicateCandidates[0].displayStatus})`
        ]
      : [];
    const questionLines = draft.nextQuestions.slice(0, 3).map((question) => `- ${question}`);

    if (!draft.readyToFinalize) {
      return [
        "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요.",
        "제가 이해한 내용",
        `- ${draft.summary}`,
        `- 분류: ${draft.category} / ${draft.detailCategory}, 긴급도 P${draft.priority}`,
        draft.location ? `- 위치: ${draft.location}` : "",
        draft.availableTimes ? `- 방문 가능 시간: ${draft.availableTimes}` : "",
        "지금 할 일",
        ...(guidanceLines.length ? guidanceLines.map((line) => `- ${line}`) : ["- 추가 설명을 보내면 같은 상담 스레드에서 이어서 반영하겠습니다."]),
        needsPhoto || currentPhotoCount
          ? [
              "필요한 사진",
              currentPhotoCount
                ? `- 현재 첨부 사진 ${currentPhotoCount}건을 이 상담 스레드에 연결했습니다.`
                : "- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올려주세요.",
              `- 사진 판단: ${draft.photoAnalysis.summary}`
            ].join("\n")
          : "",
        [...contextLines, ...duplicateLines].length
          ? ["관리자 참고 맥락", ...[...contextLines, ...duplicateLines].map((line) => `- ${line}`)].join("\n")
          : "",
        questionLines.length ? "다음으로 확인할 질문" : "",
        ...questionLines,
        "접수 상태",
        draft.requiredInfo.length
          ? `- 추가 정보 필요: ${draft.requiredInfo.join(", ")}. 답변을 받으면 관리자에게 전달할 접수 초안을 갱신하겠습니다.`
          : "- 추가 확인 답변을 받으면 관리자에게 전달할 접수 초안 준비 여부를 다시 판단하겠습니다.",
        "- 답변과 사진은 이 상담 스레드에 이어서 저장됩니다."
      ].filter(Boolean).join("\n");
    }

    return [
      "접수 초안이 준비되었습니다. 이 상담 스레드의 내용을 아래처럼 정리했습니다.",
      "제가 이해한 내용",
      `- ${draft.summary}`,
      `- 분류: ${draft.category} / ${draft.detailCategory}, 긴급도 P${draft.priority}`,
      `- 책임 가능성: ${draft.responsibilityHint} 참고`,
      draft.location ? `- 위치: ${draft.location}` : "",
      draft.availableTimes ? `- 방문 가능 시간: ${draft.availableTimes}` : "",
      "지금 할 일",
      ...(guidanceLines.length ? guidanceLines.map((line) => `- ${line}`) : ["- 내용이 맞는지 확인한 뒤 접수 확정을 눌러주세요."]),
      needsPhoto || currentPhotoCount
        ? [
            "필요한 사진",
            currentPhotoCount
              ? `- 현재 첨부 사진 ${currentPhotoCount}건을 관리자 검토 자료로 연결했습니다.`
              : "- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올리면 관리자 판단이 빨라집니다.",
            `- 사진 판단: ${draft.photoAnalysis.summary}`
          ].join("\n")
        : "",
      [...contextLines, ...duplicateLines].length
        ? ["관리자 참고 맥락", ...[...contextLines, ...duplicateLines].map((line) => `- ${line}`)].join("\n")
        : "",
      draft.nextQuestions.length
        ? ["다음으로 확인할 질문", ...questionLines].join("\n")
        : "",
      "접수 상태",
      "- 접수 확정 가능: 내용이 맞으면 관리자 티켓으로 전달할 수 있습니다.",
      "- 이후 답변과 사진도 같은 상담 스레드에 이어서 저장됩니다."
    ].filter(Boolean).join("\n");
  }

  private ensureAssistantReplyQuality(
    message: string | undefined,
    draft: IntakeDraft,
    session?: IntakeSession
  ) {
    const generated = message?.trim() ?? "";
    const composed = this.composeAssistantReply(draft, session);

    if (!generated) {
      return composed;
    }

    const compact = generated.replace(/\s+/g, "");
    const isTerse =
      generated.length < 60 ||
      /^(확인했습니다|네|알겠습니다|접수했습니다|처리하겠습니다)[.!。]*$/.test(compact);
    const threadText = this.threadText(session);
    const needsSafety = this.safetyGuidance(threadText, draft).length > 0;
    const lacksSafety =
      needsSafety && !/(안전|전기|콘센트|스위치|가스|환기|불꽃|만지지|119|문이)/.test(generated);
    const needsPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const lacksPhoto = needsPhoto && !/(사진|촬영|첨부|근접|전체)/.test(generated);
    const needsVisit =
      draft.requiredInfo.some((item) => /방문|시간/.test(item)) ||
      draft.nextQuestions.some((question) => /방문|시간/.test(question));
    const lacksVisit = needsVisit && !/(방문|시간|일정|가능)/.test(generated);
    const needsQuestion = !draft.readyToFinalize && draft.nextQuestions.length > 0;
    const lacksQuestion = needsQuestion && !/[?？]|알려주|올려주|확인해/.test(generated);
    const lacksRoomlogWorkflow =
      !/(상담\s*스레드|같은 상담|이어.*저장|접수\s*(초안|상태|확정)|관리자|티켓)/.test(
        generated
      );

    if (
      isTerse ||
      lacksSafety ||
      lacksPhoto ||
      lacksVisit ||
      lacksQuestion ||
      lacksRoomlogWorkflow
    ) {
      return composed;
    }

    return generated;
  }

  private buildIntakeResponseInstructions(session: IntakeSession) {
    const room = this.store.rooms.find((item) => item.id === session.roomId);

    return [
      "당신은 Roomlog의 한국어 주거 하자/민원 접수 AI 상담사입니다.",
      "목표는 세입자와 자연스럽게 대화하면서 민원/하자/계약/납부/공용공간 이슈를 스레드별로 정확히 접수하는 것입니다.",
      room
        ? `현재 세입자의 기본 호실은 ${room.buildingName} ${room.roomNo} (${room.address})입니다.`
        : `현재 세입자의 roomId는 ${session.roomId}입니다.`,
      "반드시 지킬 원칙:",
      "- 이전 스레드가 아닌 현재 스레드의 대화와 첨부만 근거로 답합니다.",
      "- 같은 호실 과거 기록은 반복 가능성, 과거 조치, 관리자 확인 포인트를 잡기 위한 참고 자료입니다. 현재 세입자가 말하지 않은 내용을 단정하지 않습니다.",
      "- 법적 책임, 비용 부담, 과실을 확정하지 말고 가능성/관리자 검토 필요로 표현합니다.",
      "- 가스 냄새, 누전, 화재, 침수, 문 잠김 실패, 천장 누수처럼 안전 위험이 있으면 먼저 안전 행동을 안내합니다.",
      "- 질문은 한 번에 1-3개만 하고, 이미 답한 내용을 반복해서 묻지 않습니다.",
      "- draft.nextQuestions에는 세입자에게 바로 물을 1-3개의 구체 질문만 넣습니다.",
      "- draft.tenantGuidance에는 안전 행동, 사진 촬영 방법, 방문 준비처럼 세입자가 지금 할 일을 1-4개 넣습니다.",
      "- draft.intakeSlots에는 symptom, location, occurrence, risk, photo, visitTime 6개를 항상 넣고, 이미 확인된 정보는 COLLECTED, 더 물어볼 정보는 NEEDS_INFO, 이번 이슈에 덜 중요한 정보는 OPTIONAL로 표시합니다.",
      "- 사진이 있으면 사진 URL을 관리자 검토 자료로 연결하고, 사진이 부족하면 근접/전체 사진을 구분해서 요청합니다.",
      "- 응답은 세입자에게 보낼 assistantMessage와 접수 초안 draft를 JSON으로만 반환합니다.",
      "- draft.readyToFinalize는 증상, 위치, 긴급도 판단, 방문 가능 시간 또는 후속 안내가 충분할 때만 true입니다."
    ].join("\n");
  }

  private buildIntakeResponseContent(session: IntakeSession, fallbackDraft: IntakeDraft) {
    return [
      {
        type: "input_text",
        text: this.buildIntakeResponseInput(session, fallbackDraft)
      },
      ...this.intakeImageInputs(session)
    ];
  }

  private buildIntakeResponseInput(session: IntakeSession, fallbackDraft: IntakeDraft) {
    return [
      "현재 상담 스레드 대화:",
      this.threadText(session) || "아직 세입자 메시지가 없습니다.",
      "",
      "같은 호실 과거 기록:",
      this.roomHistoryContextForIntake(session, fallbackDraft) || "참고할 과거 기록이 없습니다.",
      "",
      "로컬 1차 분석 초안:",
      JSON.stringify(fallbackDraft, null, 2),
      "",
      "이 대화를 바탕으로 세입자에게 보낼 다음 답변과 최신 접수 초안을 만들어주세요."
    ].join("\n");
  }

  private intakeImageInputs(session: IntakeSession) {
    const urls = session.messages
      .filter((message) => message.sender === "TENANT")
      .flatMap((message) => message.attachmentUrls);
    const uniqueUrls = Array.from(new Set(urls));

    return uniqueUrls
      .map((fileUrl) => {
        const attachment = this.store.attachments.find(
          (item) => item.fileUrl === fileUrl && item.uploadedByUserId === session.tenantId
        );

        if (!attachment) {
          return undefined;
        }

        const filePath = join(this.uploadDir, attachment.fileName);

        if (!existsSync(filePath)) {
          return undefined;
        }

        const imageBytes = readFileSync(filePath);

        return {
          type: "input_image",
          image_url: `data:${attachment.mimeType};base64,${imageBytes.toString("base64")}`,
          detail: "auto"
        };
      })
      .filter((item): item is { type: string; image_url: string; detail: string } =>
        Boolean(item)
      )
      .slice(0, 4);
  }

  private parseOpenAIIntakeTurn(responseBody: Record<string, unknown>) {
    const outputText =
      typeof responseBody.output_text === "string"
        ? responseBody.output_text
        : this.extractOutputText(responseBody.output);

    if (!outputText) {
      throw new Error("OpenAI response did not include output_text");
    }

    return JSON.parse(outputText) as {
      assistantMessage?: string;
      draft?: Partial<IntakeDraft>;
    };
  }

  private extractOutputText(output: unknown) {
    if (!Array.isArray(output)) {
      return undefined;
    }

    for (const item of output) {
      const content = (item as { content?: unknown }).content;

      if (!Array.isArray(content)) {
        continue;
      }

      for (const part of content) {
        const text = (part as { text?: unknown }).text;

        if (typeof text === "string") {
          return text;
        }
      }
    }

    return undefined;
  }

  private normalizeGeneratedDraft(
    generated: Partial<IntakeDraft> | undefined,
    fallback: IntakeDraft
  ): IntakeDraft {
    if (!generated) {
      return fallback;
    }

    const categoryCandidates: IntakeDraft["category"][] = [
      "하자",
      "소음",
      "설비",
      "납부",
      "계약",
      "공용공간",
      "기타"
    ];
    const responsibilityCandidates: IntakeDraft["responsibilityHint"][] = [
      "임대인 책임 가능성",
      "임차인 책임 가능성",
      "판단 어려움"
    ];
    const priority =
      typeof generated.priority === "number" && generated.priority >= 1 && generated.priority <= 4
        ? (generated.priority as IntakeDraft["priority"])
        : fallback.priority;
    const category = categoryCandidates.includes(generated.category as IntakeDraft["category"])
      ? (generated.category as IntakeDraft["category"])
      : fallback.category;
    const responsibilityHint = responsibilityCandidates.includes(
      generated.responsibilityHint as IntakeDraft["responsibilityHint"]
    )
      ? (generated.responsibilityHint as IntakeDraft["responsibilityHint"])
      : fallback.responsibilityHint;

    return {
      title: generated.title?.trim() || fallback.title,
      summary: generated.summary?.trim() || fallback.summary,
      category,
      detailCategory: generated.detailCategory?.trim() || fallback.detailCategory,
      priority,
      responsibilityHint,
      confidenceScore:
        typeof generated.confidenceScore === "number"
          ? Math.max(0, Math.min(generated.confidenceScore, 1))
          : fallback.confidenceScore,
      reasons: this.nonEmptyStringArray(generated.reasons, fallback.reasons),
      recommendedAction: generated.recommendedAction?.trim() || fallback.recommendedAction,
      contextHints: this.nonEmptyStringArray(
        (generated as { contextHints?: unknown }).contextHints,
        fallback.contextHints
      ),
      nextQuestions: this.nonEmptyStringArray(
        (generated as { nextQuestions?: unknown }).nextQuestions,
        fallback.nextQuestions
      ).slice(0, 3),
      tenantGuidance: this.nonEmptyStringArray(
        (generated as { tenantGuidance?: unknown }).tenantGuidance,
        fallback.tenantGuidance
      ).slice(0, 4),
      photoAnalysis: this.normalizePhotoAnalysis(
        (generated as { photoAnalysis?: unknown }).photoAnalysis,
        fallback.photoAnalysis
      ),
      intakeSlots: this.normalizeIntakeSlots(
        (generated as { intakeSlots?: unknown }).intakeSlots,
        fallback.intakeSlots
      ),
      requiredInfo: this.nonEmptyStringArray(generated.requiredInfo, fallback.requiredInfo),
      photoRequested:
        typeof generated.photoRequested === "boolean"
          ? generated.photoRequested
          : fallback.photoRequested,
      readyToFinalize:
        typeof generated.readyToFinalize === "boolean"
          ? generated.readyToFinalize
          : fallback.readyToFinalize,
      location: generated.location?.trim() || fallback.location,
      occurredAt: generated.occurredAt?.trim() || fallback.occurredAt,
      availableTimes: generated.availableTimes?.trim() || fallback.availableTimes,
      duplicateCandidates: fallback.duplicateCandidates
    };
  }

  private normalizeIntakeSlots(value: unknown, fallback: IntakeSlot[]) {
    const keys: IntakeSlotKey[] = [
      "symptom",
      "location",
      "occurrence",
      "risk",
      "photo",
      "visitTime"
    ];
    const statuses = ["COLLECTED", "NEEDS_INFO", "OPTIONAL"];
    const input = Array.isArray(value) ? value : [];

    return fallback.map((fallbackSlot) => {
      const candidate = input.find(
        (slot) =>
          slot &&
          typeof slot === "object" &&
          (slot as { key?: unknown }).key === fallbackSlot.key
      ) as Partial<IntakeSlot> | undefined;

      if (!candidate || !keys.includes(candidate.key as IntakeSlotKey)) {
        return { ...fallbackSlot };
      }

      return {
        ...fallbackSlot,
        label: candidate.label?.trim() || fallbackSlot.label,
        status: statuses.includes(candidate.status ?? "")
          ? (candidate.status as IntakeSlot["status"])
          : fallbackSlot.status,
        value: candidate.value?.trim() || fallbackSlot.value,
        evidence: candidate.evidence?.trim() || fallbackSlot.evidence,
        action: candidate.action?.trim() || fallbackSlot.action
      };
    });
  }

  private normalizePhotoAnalysis(value: unknown, fallback: PhotoAnalysis): PhotoAnalysis {
    const input = value as Partial<PhotoAnalysis> | undefined;
    const comparisonStatuses: PhotoComparisonStatus[] = [
      "기존 하자 가능성",
      "신규 발생 가능성",
      "비교 어려움",
      "추가 사진 필요"
    ];

    if (!input || typeof input !== "object") {
      return fallback;
    }

    const comparisonStatus = comparisonStatuses.includes(
      input.comparisonStatus as PhotoComparisonStatus
    )
      ? (input.comparisonStatus as PhotoComparisonStatus)
      : fallback.comparisonStatus;

    return {
      attachmentUrls: this.nonEmptyStringArray(input.attachmentUrls, fallback.attachmentUrls),
      previousAttachmentUrls: this.nonEmptyStringArray(
        input.previousAttachmentUrls,
        fallback.previousAttachmentUrls
      ),
      candidates: this.nonEmptyStringArray(input.candidates, fallback.candidates),
      comparisonStatus,
      summary: input.summary?.trim() || fallback.summary,
      evidence: this.nonEmptyStringArray(input.evidence, fallback.evidence),
      recommendedRetake:
        typeof input.recommendedRetake === "boolean"
          ? input.recommendedRetake
          : fallback.recommendedRetake
    };
  }

  private nonEmptyStringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return items.length ? items.map((item) => item.trim()) : fallback;
  }

  private safetyGuidance(text: string, draft: IntakeDraft) {
    const lines: string[] = [];

    if (/(가스|가스 냄새|gas)/i.test(text)) {
      lines.push(
        "가스 냄새가 계속 나면 창문을 열어 환기하고, 불꽃·라이터·전기 스위치는 만지지 말아주세요.",
        "어지러움이 있거나 냄새가 강하면 실내 밖 안전한 곳으로 이동한 뒤 즉시 관리자와 119 또는 가스 안전 신고로 연락하세요."
      );
    } else if (/(누전|감전|전기|스위치|콘센트)/.test(text) && draft.priority === 1) {
      lines.push(
        "전기 주변으로 물이 번졌다면 스위치나 콘센트를 만지지 말고, 가능한 경우 안전한 위치에서 차단기 확인을 관리자에게 요청하세요."
      );
    } else if (/(문이 안 잠|안 잠김|도어락|현관)/.test(text) && draft.priority === 1) {
      lines.push(
        "문이 잠기지 않으면 임시로 안전한 곳에 머물고, 바로 관리자에게 긴급 확인을 요청하겠습니다."
      );
    } else if (/(천장에서 물|물이 계속|침수|바닥에 물)/.test(text) && draft.priority === 1) {
      lines.push(
        "물이 전기 설비 근처로 번지면 만지지 말고, 물고임 범위와 천장 전체가 보이게 사진을 남겨주세요."
      );
    }

    return lines;
  }

  private duplicateCandidatesForIntake(
    session: IntakeSession,
    text: string,
    detailCategory: string,
    location?: string
  ): DuplicateTicketCandidate[] {
    const normalizedText = `${text} ${detailCategory} ${location ?? ""}`;
    const locationTokens = this.locationTokens(location ?? text);

    return this.store.tickets
      .filter(
        (ticket) =>
          ticket.tenantId === session.tenantId &&
          ticket.roomId === session.roomId &&
          !["COMPLETED", "CANCELLED"].includes(ticket.status)
      )
      .map((ticket) => {
        const complaint = this.findComplaint(ticket.complaintId);
        const analysis = this.store.analyses[ticket.id];
        const candidateText = [
          complaint.title,
          complaint.description,
          complaint.location,
          ticket.category,
          analysis?.detailCategory,
          ticket.aiSummary
        ]
          .filter(Boolean)
          .join(" ");
        const matchedSignals: string[] = [];

        if (this.issueContextMatches(normalizedText, candidateText, detailCategory)) {
          matchedSignals.push(`유형: ${analysis?.detailCategory ?? ticket.category}`);
        }

        for (const token of locationTokens) {
          if (candidateText.includes(token)) {
            matchedSignals.push(`위치: ${token}`);
          }
        }

        return { ticket, complaint, analysis, matchedSignals };
      })
      .filter((candidate) => candidate.matchedSignals.length > 0)
      .sort(
        (left, right) =>
          right.matchedSignals.length - left.matchedSignals.length ||
          right.ticket.updatedAt.localeCompare(left.ticket.updatedAt)
      )
      .slice(0, 3)
      .map(({ ticket, complaint, analysis, matchedSignals }) => {
        const room = this.store.rooms.find((item) => item.id === ticket.roomId);

        return {
          ticketId: ticket.id,
          complaintId: complaint.id,
          title: complaint.title,
          roomLabel: [room?.buildingName, room?.roomNo].filter(Boolean).join(" ") || ticket.roomId,
          status: ticket.status,
          displayStatus: this.displayStatus(ticket.status),
          category: analysis?.detailCategory ?? ticket.category,
          priority: ticket.priority,
          summary: ticket.aiSummary,
          createdAt: ticket.createdAt,
          matchedSignals: Array.from(new Set(matchedSignals)),
          recommendedAction: "ATTACH_TO_EXISTING"
        };
      });
  }

  private locationTokens(text: string) {
    return ["화장실", "싱크대", "주방", "안방", "거실", "현관", "베란다", "천장", "보일러실"]
      .filter((token) => text.includes(token));
  }

  private roomContextHints(session: IntakeSession, text: string, detailCategory: string) {
    const normalizedText = `${text} ${detailCategory}`;
    const relevantEntries = this.roomHistoryEntriesForIntake(session).filter((entry) =>
      this.timelineEntryMatchesIntakeContext(entry, normalizedText, detailCategory)
    );

    if (!relevantEntries.length) {
      return [];
    }

    const latest = relevantEntries[0];
    return [
      `같은 호실에 ${detailCategory} 관련 과거 기록이 ${relevantEntries.length}건 있습니다.`,
      `최근 관련 기록: ${latest.title} - ${latest.description}`
    ];
  }

  private roomHistoryContextForIntake(session: IntakeSession, draft?: IntakeDraft) {
    return this.roomHistoryEntriesForIntake(session)
      .filter((entry) =>
        draft
          ? this.timelineEntryMatchesIntakeContext(
              entry,
              `${this.threadText(session)} ${draft.location ?? ""} ${draft.detailCategory}`,
              draft.detailCategory
            )
          : true
      )
      .slice(0, 8)
      .map((entry) => {
        const attachmentText = entry.attachmentUrls.length
          ? ` 첨부: ${entry.attachmentUrls.join(", ")}`
          : "";
        const statusText = entry.status ? ` 상태: ${entry.status}` : "";

        return `[${entry.type}] ${entry.title}${statusText} - ${entry.description}${attachmentText}`;
      })
      .join("\n");
  }

  private roomHistoryEntriesForIntake(session: IntakeSession) {
    return this.presentRoomTimeline(session.roomId).filter((entry) => {
      if (entry.sessionId === session.id) {
        return false;
      }

      if (entry.type === "INTAKE_SESSION" && entry.status !== "FINALIZED") {
        return false;
      }

      return true;
    });
  }

  private timelineEntryMatchesIntakeContext(
    entry: RoomTimelineEntry,
    text: string,
    detailCategory: string
  ) {
    const entryText = `${entry.title} ${entry.description} ${entry.status ?? ""}`;
    return this.issueContextMatches(text, entryText, detailCategory);
  }

  private repeatIssueSummaryForTicket(
    ticket: Ticket,
    analysis: AiAnalysis
  ): RepeatIssueSummary | undefined {
    const windowDays = 90;
    const currentComplaint = this.findComplaint(ticket.complaintId);
    const detailCategory = analysis.detailCategory ?? analysis.category ?? ticket.category;
    const currentText = [
      currentComplaint.title,
      currentComplaint.description,
      currentComplaint.location,
      ticket.category,
      detailCategory,
      ticket.aiSummary
    ].join(" ");
    const referenceTime = this.issueReferenceTime(currentComplaint, ticket);
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const matchedTickets = this.store.tickets
      .filter((candidate) => candidate.id !== ticket.id && candidate.roomId === ticket.roomId)
      .map((candidate) => {
        const complaint = this.findComplaint(candidate.complaintId);
        const candidateAnalysis = this.store.analyses[candidate.id];
        const candidateText = [
          complaint.title,
          complaint.description,
          complaint.location,
          candidate.category,
          candidateAnalysis?.detailCategory,
          candidate.aiSummary
        ]
          .filter(Boolean)
          .join(" ");

        return {
          ticket: candidate,
          complaint,
          candidateText
        };
      })
      .filter(({ ticket: candidate, complaint, candidateText }) => {
        const candidateTime = this.issueReferenceTime(complaint, candidate);

        if (Math.abs(referenceTime - candidateTime) > windowMs) {
          return false;
        }

        return this.issueContextMatches(currentText, candidateText, detailCategory);
      })
      .sort((left, right) => right.ticket.createdAt.localeCompare(left.ticket.createdAt));

    if (matchedTickets.length === 0) {
      return undefined;
    }

    const isRepeated = matchedTickets.length >= 2;
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);
    const roomLabel = [room?.buildingName, room?.roomNo].filter(Boolean).join(" ") || ticket.roomId;
    const label = isRepeated
      ? `최근 3개월 ${roomLabel} ${detailCategory} 관련 반복 민원 ${matchedTickets.length}건`
      : `최근 3개월 ${roomLabel} ${detailCategory} 관련 이력 ${matchedTickets.length}건`;

    return {
      isRepeated,
      matchCount: matchedTickets.length,
      windowDays,
      matchedTicketIds: matchedTickets.map(({ ticket: matchedTicket }) => matchedTicket.id),
      matchedComplaintIds: matchedTickets.map(({ complaint }) => complaint.id),
      label,
      evidence: matchedTickets.slice(0, 3).map(({ complaint, ticket: matchedTicket }) => {
        const issueDate = (complaint.occurredAt ?? matchedTicket.createdAt).slice(0, 10);
        return `${issueDate} ${complaint.title}: ${complaint.description}`;
      })
    };
  }

  private issueReferenceTime(complaint: Complaint, ticket: Ticket) {
    const occurredTime = complaint.occurredAt ? Date.parse(complaint.occurredAt) : NaN;

    if (!Number.isNaN(occurredTime)) {
      return occurredTime;
    }

    const createdTime = Date.parse(ticket.createdAt);
    return Number.isNaN(createdTime) ? Date.now() : createdTime;
  }

  private issueContextMatches(currentText: string, candidateText: string, detailCategory: string) {
    if (this.issueExplicitlyNegated(candidateText, detailCategory)) {
      return false;
    }

    if (detailCategory && candidateText.includes(detailCategory)) {
      return true;
    }

    const currentGroups = this.issueKeywordGroups(`${currentText} ${detailCategory}`);
    const candidateGroups = this.issueKeywordGroups(candidateText);

    return currentGroups.some((group) => candidateGroups.includes(group));
  }

  private issueExplicitlyNegated(candidateText: string, detailCategory: string) {
    if (!detailCategory) {
      return false;
    }

    return [
      `${detailCategory}과 무관`,
      `${detailCategory}와 무관`,
      `${detailCategory}와는 무관`,
      `${detailCategory}는 무관`,
      `${detailCategory} 관련 없음`,
      `${detailCategory} 관련이 없음`
    ].some((phrase) => candidateText.includes(phrase));
  }

  private issueKeywordGroups(text: string) {
    const groups: Array<[string, RegExp]> = [
      ["누수", /(누수|물이|물고임|물방울|천장|침수|샘|새고|떨어지)/],
      ["보일러", /(보일러|온수|난방)/],
      ["도어락", /(도어락|현관문|문이\s*(안\s*)?잠|문이\s*열|잠기지|잠김|잠금)/],
      ["에어컨", /(에어컨|냉방|실외기|배수)/],
      ["전기", /(누전|감전|전기|콘센트|스위치)/],
      ["곰팡이", /(곰팡이|얼룩|습기)/],
      ["벽지", /(벽지|도배)/],
      ["바닥", /(바닥|장판|마루)/]
    ];

    return groups.filter(([, pattern]) => pattern.test(text)).map(([group]) => group);
  }

  private threadText(session?: IntakeSession) {
    if (!session) {
      return "";
    }

    return session.messages
      .map((message) => {
        const attachmentText = message.attachmentUrls.length
          ? ` 첨부: ${message.attachmentUrls.join(", ")}`
          : "";
        return `${message.sender}: ${message.transcriptText || message.messageText}${attachmentText}`;
      })
      .join("\n");
  }

  private intakeTurnJsonSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: ["assistantMessage", "draft"],
      properties: {
        assistantMessage: { type: "string" },
        draft: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "summary",
            "category",
            "detailCategory",
            "priority",
            "responsibilityHint",
            "confidenceScore",
            "reasons",
            "recommendedAction",
            "contextHints",
            "nextQuestions",
            "tenantGuidance",
            "photoAnalysis",
            "intakeSlots",
            "requiredInfo",
            "photoRequested",
            "readyToFinalize",
            "location",
            "occurredAt",
            "availableTimes"
          ],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            category: {
              type: "string",
              enum: ["하자", "소음", "설비", "납부", "계약", "공용공간", "기타"]
            },
            detailCategory: { type: "string" },
            priority: { type: "integer", enum: [1, 2, 3, 4] },
            responsibilityHint: {
              type: "string",
              enum: ["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"]
            },
            confidenceScore: { type: "number", minimum: 0, maximum: 1 },
            reasons: {
              type: "array",
              items: { type: "string" }
            },
            recommendedAction: { type: "string" },
            contextHints: {
              type: "array",
              items: { type: "string" }
            },
            nextQuestions: {
              type: "array",
              minItems: 0,
              maxItems: 3,
              items: { type: "string" }
            },
            tenantGuidance: {
              type: "array",
              minItems: 0,
              maxItems: 4,
              items: { type: "string" }
            },
            photoAnalysis: {
              type: "object",
              additionalProperties: false,
              required: [
                "attachmentUrls",
                "previousAttachmentUrls",
                "candidates",
                "comparisonStatus",
                "summary",
                "evidence",
                "recommendedRetake"
              ],
              properties: {
                attachmentUrls: {
                  type: "array",
                  items: { type: "string" }
                },
                previousAttachmentUrls: {
                  type: "array",
                  items: { type: "string" }
                },
                candidates: {
                  type: "array",
                  items: { type: "string" }
                },
                comparisonStatus: {
                  type: "string",
                  enum: [
                    "기존 하자 가능성",
                    "신규 발생 가능성",
                    "비교 어려움",
                    "추가 사진 필요"
                  ]
                },
                summary: { type: "string" },
                evidence: {
                  type: "array",
                  items: { type: "string" }
                },
                recommendedRetake: { type: "boolean" }
              }
            },
            intakeSlots: {
              type: "array",
              minItems: 6,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "label", "status", "value", "evidence", "action"],
                properties: {
                  key: {
                    type: "string",
                    enum: [
                      "symptom",
                      "location",
                      "occurrence",
                      "risk",
                      "photo",
                      "visitTime"
                    ]
                  },
                  label: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["COLLECTED", "NEEDS_INFO", "OPTIONAL"]
                  },
                  value: { type: "string" },
                  evidence: { type: "string" },
                  action: { type: "string" }
                }
              }
            },
            requiredInfo: {
              type: "array",
              items: { type: "string" }
            },
            photoRequested: { type: "boolean" },
            readyToFinalize: { type: "boolean" },
            location: { type: "string" },
            occurredAt: { type: "string" },
            availableTimes: { type: "string" }
          }
        }
      }
    };
  }

  private buildRealtimeInstructions(
    session: IntakeSession,
    input: RealtimeClientSecretInput
  ) {
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const context = session.messages
      .slice(-10)
      .map((message) => {
        const attachmentText = message.attachmentUrls.length
          ? ` 첨부: ${message.attachmentUrls.join(", ")}`
          : "";

        return `${message.sender}: ${message.transcriptText || message.messageText}${attachmentText}`;
      })
      .join("\n");
    const purpose =
      input.purpose === "CALLBOT_INTAKE"
        ? "전화 통화 기반 민원 접수 콜봇"
        : "세입자 채팅/음성 기반 민원 접수 상담";
    const draft = session.draft;
    const slotStatusLabel: Record<IntakeSlot["status"], string> = {
      COLLECTED: "확인됨",
      NEEDS_INFO: "확인 필요",
      OPTIONAL: "선택"
    };
    const intakeSlotStatus = this.draftIntakeSlots(session)
      .map((slot) =>
        [
          `${slot.label}: ${slotStatusLabel[slot.status]}`,
          slot.value ? `값=${slot.value}` : undefined,
          slot.evidence ? `근거=${slot.evidence}` : undefined,
          slot.action ? `다음 행동=${slot.action}` : undefined
        ]
          .filter(Boolean)
          .join(" · ")
      )
      .join("\n");
    const draftStatus = [
      `제목: ${draft.title || "미정"}`,
      `요약: ${draft.summary || "미정"}`,
      `분류: ${draft.category} / ${draft.detailCategory}`,
      `긴급도: P${draft.priority}`,
      `위치: ${draft.location || "미확인"}`,
      `방문 가능 시간: ${draft.availableTimes || "미확인"}`,
      `사진 상태: ${draft.photoAnalysis.summary}`,
      `필요 정보: ${draft.requiredInfo.join(", ") || "없음"}`,
      `다음 질문 후보: ${draft.nextQuestions.join(" / ") || "없음"}`
    ].join("\n");

    return [
      "# 역할과 목표",
      "당신은 Roomlog의 주거 하자/민원 접수 AI 상담사입니다.",
      `상담 목적은 ${purpose}입니다.`,
      room
        ? `대상 호실: ${room.buildingName} ${room.roomNo}, ${room.address}.`
        : `대상 호실 ID: ${session.roomId}.`,
      "",
      "# 말투",
      "- 세입자 말을 끊지 말고 짧고 차분한 한국어로 응답합니다.",
      "- 직접 답변은 1-2문장으로 말하고, 추가 확인은 한 번에 하나의 질문만 합니다.",
      "- 사용자가 이미 말한 위치, 시간, 사진 여부, 위험 신호는 반복해서 묻지 않습니다.",
      "- 불안하거나 긴급한 상황에서는 먼저 안전 행동을 안내한 뒤 필요한 정보를 확인합니다.",
      "",
      "# 대화 흐름",
      "1. 증상과 위치를 자연스럽게 확인합니다.",
      "2. 발생 시점, 현재도 반복되는지, 안전 위험 여부를 확인합니다.",
      "3. 사진이 없고 하자 판단에 필요하면 근접 사진 1장과 공간 전체 사진 1장을 요청합니다.",
      "4. 관리자나 업체 방문 가능 시간대를 확인합니다.",
      "5. 충분한 정보가 모이면 접수 초안 제목, 요약, 위치, 긴급도, 추가 필요 정보를 짧게 정리합니다.",
      "",
      "# 안전 분류",
      "- 누수, 가스 냄새, 누전, 문 잠김 실패, 침수, 화재, 천장 물샘은 긴급 후보로 봅니다.",
      "- 전기 설비 근처 물고임, 가스 냄새, 문이 잠기지 않는 상황은 즉시 안전한 행동을 먼저 안내합니다.",
      "- 책임 소재를 확정하지 말고, 비용 부담도 '관리자 확인 필요' 또는 가능성으로만 표현합니다.",
      "",
      "# 사진과 기록",
      "- 사진이 있으면 현재 상담 스레드와 관리자 검토 자료로 연결된다고 말합니다.",
      "- 사진이 부족하면 어떤 사진이 필요한지 구체적으로 말합니다.",
      "- 같은 호실 과거 기록은 반복 가능성 판단의 참고 자료이며, 현재 세입자가 말하지 않은 내용을 단정하지 않습니다.",
      "",
      "# 불명확한 음성",
      "- 불명확한 음성, 주변 소음, 끊긴 발화는 추측하지 말고 짧게 다시 말해달라고 요청합니다.",
      "- 숫자, 호실, 시간처럼 중요한 값은 들은 값을 다시 확인합니다.",
      "",
      "# 완료 기준",
      "- 증상, 위치, 위험 여부, 사진 필요 여부, 방문 가능 시간이 확인되면 접수 초안을 정리합니다.",
      "- 정보가 부족하면 누락된 항목 중 가장 중요한 하나만 질문합니다.",
      "- 접수 초안이 준비되면 세입자가 화면에서 수정 후 확정할 수 있다고 안내합니다.",
      input.instructions ? `추가 운영 지침: ${input.instructions}` : "",
      "",
      "# 수집 정보 상태",
      intakeSlotStatus || "아직 수집된 정보가 없습니다.",
      "",
      "# 현재 접수 초안 상태",
      draftStatus,
      "",
      "# 현재 상담 스레드 컨텍스트",
      context || "아직 세입자 발화가 없습니다."
    ]
      .filter(Boolean)
      .join("\n");
  }

  private safetyIdentifier(tenantId: string, sessionId: string) {
    return createHash("sha256")
      .update(`roomlog:${tenantId}:${sessionId}:${tokenSecret}`)
      .digest("hex");
  }

  private extractLocation(text: string) {
    const locations = ["화장실", "싱크대", "주방", "안방", "거실", "현관", "베란다", "천장", "보일러실"];
    const roomMatch = text.match(/(\d{2,4}호)/);

    if (roomMatch?.[1]) {
      const afterRoom = text.slice((roomMatch.index ?? 0) + roomMatch[1].length, (roomMatch.index ?? 0) + 30);
      const space = locations.find((location) => afterRoom.includes(location));

      return [roomMatch[1], space].filter(Boolean).join(" ");
    }

    return locations.find((location) => text.includes(location));
  }

  private extractAvailableTimes(text: string) {
    const timeMatch = text.match(/(오늘|내일|평일|주말)?\s*(오전|오후|저녁)?\s*\d{1,2}시\s*(이후|전|부터)?/);

    if (timeMatch?.[0]) {
      return timeMatch[0].trim();
    }

    const naturalTimeMatch = text.match(
      /(오늘|내일|평일|주말)\s*(오전|오후|저녁|밤|낮|퇴근\s*후)|(오전|오후|저녁|밤|낮|퇴근\s*후)\s*(방문|가능)/
    );

    if (naturalTimeMatch?.[0]) {
      return naturalTimeMatch[0].replace(/\s+/g, " ").replace(/\s*(방문|가능).*$/, "").trim();
    }

    if (text.includes("언제든")) {
      return "언제든 가능";
    }

    return undefined;
  }

  private detectMainCategory(text: string, detailCategory: string): IntakeDraft["category"] {
    if (["소음", "층간소음"].some((word) => text.includes(word))) {
      return "소음";
    }

    if (["월세", "관리비", "납부", "연체"].some((word) => text.includes(word))) {
      return "납부";
    }

    if (["계약", "보증금", "특약"].some((word) => text.includes(word))) {
      return "계약";
    }

    if (["복도", "엘리베이터", "주차장", "공용"].some((word) => text.includes(word))) {
      return "공용공간";
    }

    return detailCategory === "일반 문의" ? "기타" : "하자";
  }

  private detectDetailCategory(text: string) {
    if (["누수", "물", "천장", "샘", "침수"].some((word) => text.includes(word))) {
      return "누수";
    }

    if (["보일러", "온수", "난방"].some((word) => text.includes(word))) {
      return "보일러";
    }

    if (["곰팡이", "얼룩"].some((word) => text.includes(word))) {
      return "곰팡이";
    }

    if (["도어락", "문이 안 잠", "현관"].some((word) => text.includes(word))) {
      return "도어락";
    }

    if (["에어컨", "냉방"].some((word) => text.includes(word))) {
      return "에어컨";
    }

    if (["소음", "층간소음"].some((word) => text.includes(word))) {
      return "소음";
    }

    return text.trim() ? "설비" : "확인 필요";
  }

  private detectPriority(text: string, detailCategory: string): IntakeDraft["priority"] {
    const emergencyWords = [
      "가스 냄새",
      "불꽃",
      "누전",
      "물이 계속",
      "천장에서 물",
      "보일러 완전 고장",
      "수도 안 나옴",
      "문이 안 잠김",
      "침수",
      "화재"
    ];

    if (emergencyWords.some((word) => text.includes(word))) {
      return 1;
    }

    if (["누수", "보일러"].includes(detailCategory)) {
      return 2;
    }

    return text.trim() ? 3 : 4;
  }

  private detectResponsibilityHint(text: string): AiAnalysis["responsibilityHint"] {
    if (["깨뜨", "파손", "떨어뜨", "부주의"].some((word) => text.includes(word))) {
      return "임차인 책임 가능성";
    }

    if (["계약", "공용", "이전부터"].some((word) => text.includes(word))) {
      return "판단 어려움";
    }

    return "임대인 책임 가능성";
  }

  private analysisReasons(text: string, detailCategory: string, priority: number, hasPhoto: boolean) {
    const reasons = [`상담 내용에서 ${detailCategory} 관련 표현이 확인됨`];

    if (priority === 1) {
      reasons.push("위험 키워드가 포함되어 긴급도가 상향됨");
    }

    if (hasPhoto) {
      reasons.push("사진 첨부가 있어 관리자 검토 자료로 연결 가능");
    }

    if (text.includes("방문")) {
      reasons.push("방문 가능 시간이 포함됨");
    }

    return reasons;
  }

  private refreshAnalysisFromTenantFollowup(
    ticket: Ticket,
    input: Required<Pick<AddTenantComplaintMessageInput, "attachmentUrls">> & {
      messageText: string;
    }
  ) {
    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      return;
    }

    const note = input.messageText || "추가 사진이 제출되었습니다.";
    const clippedNote = note.length > 120 ? `${note.slice(0, 117)}...` : note;
    const followupSummary = `추가 정보: ${clippedNote}`;
    const reasons = new Set(analysis.reasons ?? []);

    reasons.add("임차인이 기존 티켓에 추가 설명을 제출함");

    if (input.attachmentUrls.length > 0) {
      reasons.add("임차인 추가 사진이 기존 티켓에 연결됨");
    }

    analysis.summary = analysis.summary.includes(followupSummary)
      ? analysis.summary
      : `${analysis.summary}\n${followupSummary}`;
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction =
      input.attachmentUrls.length > 0
        ? "추가 사진과 설명을 바탕으로 문제 부위, 촬영 각도, 기존 기록 비교 가능성을 다시 검토하세요."
        : "추가 설명을 바탕으로 AI 요약과 긴급도 판단을 다시 검토하세요.";

    if (input.attachmentUrls.length > 0) {
      const currentPhotoAnalysis = analysis.photoAnalysis ?? this.emptyPhotoAnalysis();
      const attachmentUrls = Array.from(
        new Set([...currentPhotoAnalysis.attachmentUrls, ...input.attachmentUrls])
      );
      const candidates = currentPhotoAnalysis.candidates.length
        ? currentPhotoAnalysis.candidates
        : this.photoCandidatesFor(analysis.detailCategory ?? analysis.category, input.messageText);
      analysis.photoAnalysis = {
        ...currentPhotoAnalysis,
        attachmentUrls,
        candidates,
        comparisonStatus:
          currentPhotoAnalysis.previousAttachmentUrls.length > 0
            ? currentPhotoAnalysis.comparisonStatus
            : "비교 어려움",
        summary: "임차인이 추가 사진을 제출해 기존 티켓의 사진 분석 자료가 갱신되었습니다.",
        evidence: Array.from(
          new Set([
            ...currentPhotoAnalysis.evidence,
            "추가 사진이 기존 티켓에 연결됨",
            input.messageText || "사진과 함께 추가 설명이 제출됨"
          ])
        ),
        recommendedRetake: false
      };
    }

    analysis.confidenceScore = Math.min(0.95, Math.max(analysis.confidenceScore, 0.72));
    ticket.aiSummary = analysis.summary;
    ticket.priority = Math.min(ticket.priority, analysis.priority);
  }

  private analyzeComplaint(input: CreateComplaintInput): AiAnalysis {
    const text = `${input.title} ${input.description} ${input.location}`;
    const lower = text.toLowerCase();
    const emergencyWords = ["가스", "불꽃", "누전", "물이 계속", "천장", "보일러", "수도 안", "문이 안 잠", "침수", "화재"];
    const isEmergency = emergencyWords.some((word) => text.includes(word));
    const isLeak = ["누수", "물", "천장", "샘"].some((word) => text.includes(word));
    const isBoiler = ["보일러", "온수", "난방"].some((word) => text.includes(word));
    const isMold = ["곰팡이", "얼룩"].some((word) => text.includes(word));
    const tenantHint = ["깨뜨", "파손", "떨어뜨", "부주의"].some((word) => text.includes(word));
    const category = isLeak ? "누수" : isBoiler ? "보일러" : isMold ? "곰팡이" : lower.includes("door") ? "도어락" : "설비";
    const priority = isEmergency ? 1 : isLeak || isBoiler ? 2 : 3;
    const responsibilityHint = tenantHint ? "임차인 책임 가능성" : "임대인 책임 가능성";

    return {
      summary: `${input.location}의 ${category} 문제로 보이는 신고입니다. ${priority === 1 ? "즉시 확인이 필요한 긴급 건입니다." : "관리자 확인 후 처리 일정을 잡아야 합니다."}`,
      category,
      detailCategory: category,
      priority,
      responsibilityHint,
      confidenceScore: category === "설비" ? 0.62 : 0.78,
      reasons: [
        `${category} 관련 표현이 신고 내용에서 확인됨`,
        priority === 1 ? "긴급 키워드가 포함됨" : "관리자 검토 후 일정 조율 가능"
      ],
      recommendedAction:
        priority === 1
          ? "관리자 확인 후 당일 업체 배정을 권장합니다."
          : "사진과 방문 가능 시간을 확인한 뒤 업체 배정을 진행하세요."
    };
  }

  private isAiFeedbackTarget(target: unknown): target is AiFeedbackTarget {
    return ["SUMMARY", "CATEGORY", "PRIORITY", "RESPONSIBILITY", "COMPLETION"].includes(
      `${target}`
    );
  }

  private isResponsibilityHint(value: unknown): value is AiAnalysis["responsibilityHint"] {
    return ["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"].includes(`${value}`);
  }

  private aiFeedbackTargetLabel(target: AiFeedbackTarget) {
    const labels: Record<AiFeedbackTarget, string> = {
      SUMMARY: "AI 요약",
      CATEGORY: "민원 유형",
      PRIORITY: "긴급도",
      RESPONSIBILITY: "책임 가능성",
      COMPLETION: "완료 처리"
    };

    return labels[target];
  }

  private aiFeedbackOriginalValue(
    target: AiFeedbackTarget,
    ticket: Ticket,
    complaint: Complaint,
    analysis?: AiAnalysis
  ) {
    if (target === "SUMMARY") {
      return analysis?.summary ?? ticket.aiSummary;
    }

    if (target === "CATEGORY") {
      return `${analysis?.category ?? ticket.category}${
        analysis?.detailCategory ? ` / ${analysis.detailCategory}` : ""
      }`;
    }

    if (target === "PRIORITY") {
      return `P${ticket.priority} ${priorityLabelForAnalysis(ticket.priority)}`;
    }

    if (target === "RESPONSIBILITY") {
      return analysis?.responsibilityHint ?? ticket.responsibilityHint;
    }

    return this.displayStatus(ticket.status) || complaint.status;
  }

  private markAnalysisNeedsHumanReview(
    ticket: Ticket,
    targetLabel: string,
    reason: string
  ) {
    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      return;
    }

    const reasons = new Set(analysis.reasons ?? []);
    reasons.add(`임차인이 ${targetLabel} 판단에 이의제기함`);
    reasons.add(`이의제기 사유: ${reason.length > 90 ? `${reason.slice(0, 87)}...` : reason}`);
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction =
      "임차인 이의제기 내용을 우선 검토하고, 필요하면 AI 요약/긴급도/책임 가능성을 수정한 뒤 답변을 남기세요.";
    ticket.aiSummary = analysis.summary;
  }

  private presentRoomTimeline(roomId: string, scope: { tenantId?: string } = {}): RoomTimelineEntry[] {
    const room = this.findRoom(roomId);
    const tickets = this.store.tickets.filter(
      (ticket) =>
        ticket.roomId === roomId && (!scope.tenantId || ticket.tenantId === scope.tenantId)
    );
    const ticketIds = new Set(tickets.map((ticket) => ticket.id));
    const entries: RoomTimelineEntry[] = [];

    for (const item of this.store.moveInChecklist.filter(
      (entry) =>
        entry.roomId === roomId && (!scope.tenantId || entry.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${item.id}`,
        type: "MOVE_IN_CHECKLIST",
        roomId,
        room: { ...room },
        title: `${item.area} ${item.itemName}`,
        description: item.memo ?? "입주 전 기준 사진 기록",
        createdAt: item.createdAt,
        status: "입주 전 기록",
        attachmentUrls: [...item.attachmentUrls]
      });
    }

    for (const session of this.store.intakeSessions.filter(
      (item) => item.roomId === roomId && (!scope.tenantId || item.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${session.id}`,
        type: "INTAKE_SESSION",
        roomId,
        room: { ...room },
        title: session.draft.title,
        description:
          session.status === "FINALIZED"
            ? "AI 상담 스레드가 민원 티켓으로 접수되었습니다."
            : "AI 상담 스레드가 진행 중입니다.",
        createdAt: session.updatedAt,
        ticketId: session.ticketId,
        complaintId: session.complaintId,
        sessionId: session.id,
        status: session.status,
        attachmentUrls: Array.from(
          new Set(session.messages.flatMap((message) => message.attachmentUrls))
        )
      });
    }

    for (const complaint of this.store.complaints.filter(
      (item) => item.roomId === roomId && (!scope.tenantId || item.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${complaint.id}`,
        type: "COMPLAINT",
        roomId,
        room: { ...room },
        title: complaint.title,
        description: complaint.description,
        createdAt: complaint.createdAt,
        ticketId: complaint.ticketId,
        complaintId: complaint.id,
        status: complaint.status,
        attachmentUrls: []
      });
    }

    for (const feedback of this.store.aiFeedback.filter((item) => ticketIds.has(item.ticketId))) {
      entries.push({
        id: `timeline-${feedback.id}`,
        type: "AI_FEEDBACK",
        roomId,
        room: { ...room },
        title: `${feedback.targetLabel} 이의제기`,
        description: feedback.reason,
        createdAt: feedback.createdAt,
        ticketId: feedback.ticketId,
        complaintId: feedback.complaintId,
        status: feedback.status === "OPEN" ? "검토 필요" : "검토 완료",
        attachmentUrls: [...feedback.attachmentUrls]
      });
    }

    for (const history of this.store.history.filter((item) => ticketIds.has(item.ticketId))) {
      const ticket = this.findTicket(history.ticketId);
      entries.push({
        id: `timeline-${history.id}`,
        type: "STATUS_CHANGE",
        roomId,
        room: { ...room },
        title: history.toStatus,
        description: history.note ?? "상태 변경",
        createdAt: history.createdAt,
        ticketId: history.ticketId,
        complaintId: ticket.complaintId,
        status: history.toStatus,
        attachmentUrls: []
      });
    }

    for (const message of this.store.messages.filter((item) => ticketIds.has(item.ticketId))) {
      entries.push({
        id: `timeline-${message.id}`,
        type: "MESSAGE",
        roomId,
        room: { ...room },
        title: this.timelineSenderLabel(message.senderRole),
        description: message.messageText,
        createdAt: message.createdAt,
        ticketId: message.ticketId,
        complaintId: message.complaintId,
        senderRole: message.senderRole,
        attachmentUrls: [...message.attachmentUrls]
      });
    }

    for (const repair of this.store.repairs.filter((item) => ticketIds.has(item.ticketId))) {
      const ticket = this.findTicket(repair.ticketId);
      entries.push({
        id: `timeline-${repair.id}`,
        type: "REPAIR",
        roomId,
        room: { ...room },
        title: repair.title,
        description:
          repair.completionNote ??
          repair.estimateDescription ??
          repair.scheduledAt ??
          repair.description,
        createdAt: repair.updatedAt,
        ticketId: repair.ticketId,
        complaintId: ticket.complaintId,
        repairId: repair.id,
        status: repair.status,
        attachmentUrls: [...repair.completionPhotoUrls]
      });
    }

    return entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private timelineSenderLabel(senderRole: TicketMessage["senderRole"]) {
    if (senderRole === "TENANT") {
      return "임차인 메시지";
    }

    if (senderRole === "LANDLORD") {
      return "관리자 답변";
    }

    if (senderRole === "VENDOR") {
      return "업체 메시지";
    }

    if (senderRole === "AI_ASSISTANT") {
      return "AI 상담 기록";
    }

    return "시스템 기록";
  }

  private presentIntakeSession(session: IntakeSession) {
    const intakeSlots = this.draftIntakeSlots(session);

    return {
      ...session,
      threadSummary: this.presentIntakeThreadSummary(session),
      draft: {
        ...session.draft,
        reasons: [...session.draft.reasons],
        contextHints: [...(session.draft.contextHints ?? [])],
        nextQuestions: [...(session.draft.nextQuestions ?? [])],
        tenantGuidance: [...(session.draft.tenantGuidance ?? [])],
        photoAnalysis: this.presentPhotoAnalysis(session.draft.photoAnalysis),
        intakeSlots: this.presentIntakeSlots(intakeSlots),
        requiredInfo: [...session.draft.requiredInfo],
        duplicateCandidates: session.draft.duplicateCandidates.map((candidate) => ({
          ...candidate,
          matchedSignals: [...candidate.matchedSignals]
        }))
      },
      messages: session.messages.map((message) => ({
        ...message,
        attachmentUrls: [...message.attachmentUrls]
      })),
      room: this.store.rooms.find((room) => room.id === session.roomId)
    };
  }

  private draftIntakeSlots(session: IntakeSession) {
    return session.draft.intakeSlots?.length
      ? session.draft.intakeSlots
      : this.buildIntakeDraft(session).intakeSlots;
  }

  private presentIntakeSlots(slots: IntakeSlot[]) {
    return slots.map((slot) => ({ ...slot }));
  }

  private presentIntakeThreadSummary(session: IntakeSession): IntakeThreadSummary {
    const tenantMessages = session.messages.filter((message) => message.sender === "TENANT");
    const assistantMessages = session.messages.filter((message) => message.sender === "AI_ASSISTANT");
    const lastUserMessage = tenantMessages.at(-1);
    const lastAssistantMessage = assistantMessages.at(-1);
    const attachmentCount = session.messages.reduce(
      (total, message) => total + message.attachmentUrls.length,
      0
    );
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const roomLabel = room ? `${room.buildingName} ${room.roomNo}` : "호실";
    const slotCounts = this.intakeSlotCounts(this.draftIntakeSlots(session));

    return {
      title: this.intakeThreadTitle(session, roomLabel),
      channelLabel: this.intakeChannelLabel(session.sourceChannel),
      statusLabel: this.intakeThreadStatusLabel(session),
      detailCategory: session.draft.detailCategory,
      priority: session.draft.priority,
      lastUserMessage: this.compactThreadMessage(
        lastUserMessage?.transcriptText || lastUserMessage?.messageText,
        "아직 세입자 메시지가 없습니다."
      ),
      lastAssistantMessage: this.compactThreadMessage(
        lastAssistantMessage?.messageText,
        "AI가 상담 시작을 기다리고 있습니다."
      ),
      messageCount: session.messages.length,
      attachmentCount,
      collectedSlotCount: slotCounts.collectedSlotCount,
      openSlotCount: slotCounts.openSlotCount,
      requiredInfoCount: session.draft.requiredInfo.length,
      unresolvedQuestionCount: session.draft.nextQuestions.length,
      readyToFinalize: session.draft.readyToFinalize,
      updatedAt: session.updatedAt
    };
  }

  private intakeThreadTitle(session: IntakeSession, roomLabel: string) {
    if (session.messages.every((message) => message.sender !== "TENANT")) {
      return `${roomLabel} 새 상담`;
    }

    return session.draft.title || `${roomLabel} ${session.draft.detailCategory}`;
  }

  private intakeChannelLabel(sourceChannel: ComplaintSourceChannel) {
    const labels: Record<ComplaintSourceChannel, string> = {
      DIRECT_FORM: "앱 입력",
      REALTIME_CHAT: "AI 채팅",
      VOICE_CHAT: "AI 음성",
      CALLBOT: "콜봇"
    };

    return labels[sourceChannel];
  }

  private intakeThreadStatusLabel(session: IntakeSession) {
    if (session.status === "FINALIZED") {
      return "접수 완료";
    }

    if (session.status === "CANCELLED") {
      return "취소됨";
    }

    if (session.draft.readyToFinalize) {
      return "접수 확정 가능";
    }

    if (session.draft.requiredInfo.length > 0) {
      return `추가 정보 ${session.draft.requiredInfo.length}개 필요`;
    }

    return "상담 진행 중";
  }

  private compactThreadMessage(messageText: string | undefined, fallback: string) {
    const text = messageText?.replace(/\s+/g, " ").trim();

    if (!text) {
      return fallback;
    }

    return text.length > 86 ? `${text.slice(0, 83)}...` : text;
  }

  private inferManagerReplyIntent(ticket: Ticket): ManagerReplyIntent {
    if (ticket.status === "COMPLETION_REPORTED" || ticket.status === "COMPLETED") {
      return "COMPLETION_NOTICE";
    }

    if (ticket.assignedVendorId || ticket.status === "VENDOR_ASSIGNED") {
      return "ASSIGN_VENDOR_NOTICE";
    }

    if (this.ticketNeedsPhotoForManagerAssistant(ticket)) {
      return "REQUEST_PHOTO";
    }

    const complaint = this.findComplaint(ticket.complaintId);

    if (!complaint.availableTimes) {
      return "SCHEDULE_VISIT";
    }

    return ticket.status === "RECEIVED" ? "RECEIPT_ACK" : "REQUEST_DETAILS";
  }

  private managerReplySubject(
    intent: ManagerReplyIntent,
    ticket: Ticket,
    complaint: Complaint
  ) {
    const prefix: Record<ManagerReplyIntent, string> = {
      RECEIPT_ACK: "접수 확인",
      REQUEST_PHOTO: "추가 사진 요청",
      REQUEST_DETAILS: "추가 설명 요청",
      SCHEDULE_VISIT: "방문 일정 확인",
      ASSIGN_VENDOR_NOTICE: "업체 배정 안내",
      COMPLETION_NOTICE: "수리 완료 확인"
    };

    return `${prefix[intent]} · ${complaint.title || ticket.category}`;
  }

  private managerReplyTenantActionLabel(intent: ManagerReplyIntent) {
    const map: Partial<Record<ManagerReplyIntent, string>> = {
      REQUEST_PHOTO: "문제 부위 사진 업로드",
      REQUEST_DETAILS: "증상/발생 시점 추가 설명",
      SCHEDULE_VISIT: "방문 가능 시간 회신"
    };

    return map[intent];
  }

  private managerReplyEvidence(
    ticket: Ticket,
    complaint: Complaint,
    callbot: CallbotTicketContext | undefined
  ) {
    const analysis = this.store.analyses[ticket.id];
    const evidence = [
      `접수 채널: ${this.sourceChannelDisplay(ticket.sourceChannel)}`,
      `AI 요약: ${ticket.aiSummary}`,
      `긴급도: P${ticket.priority}`,
      `방문 가능 시간: ${complaint.availableTimes || "확인 필요"}`
    ];

    if (callbot) {
      evidence.push(`전사 내용: ${callbot.transcriptText}`);
      evidence.push(`콜봇 상태: ${callbot.statusNote}`);

      if (callbot.photoUploadUrl) {
        evidence.push(`사진 업로드 링크: ${callbot.photoUploadUrl}`);
      }
    }

    if (analysis?.photoAnalysis?.summary) {
      evidence.push(`사진 분석: ${analysis.photoAnalysis.summary}`);
    }

    return evidence;
  }

  private composeManagerReplyDraftMessage(input: {
    intent: ManagerReplyIntent;
    ticket: Ticket;
    complaint: Complaint;
    room?: Room;
    analysis?: AiAnalysis;
    callbot?: CallbotTicketContext;
    note?: string;
  }) {
    const { intent, ticket, complaint, room, analysis, callbot, note } = input;
    const roomLabel = room ? `${room.buildingName} ${room.roomNo}` : complaint.location;
    const channelText = callbot
      ? "콜봇 통화로 접수된 내용"
      : `${this.sourceChannelDisplay(ticket.sourceChannel)}로 접수된 내용`;
    const availableText = complaint.availableTimes
      ? `기록된 방문 가능 시간은 ${complaint.availableTimes}입니다.`
      : "방문 가능 시간은 아직 확인되지 않았습니다.";
    const noteLine = note ? `\n\n관리자 확인 메모: ${note}` : "";
    const referenceLine =
      "AI 분석은 참고용이며, 책임 소재와 비용 부담은 관리자 확인 후 별도로 안내드리겠습니다.";

    if (intent === "REQUEST_PHOTO") {
      return [
        `${roomLabel} ${complaint.title} 건 확인했습니다.`,
        `${channelText} 기준으로 ${ticket.aiSummary}`,
        "정확한 확인을 위해 문제 부위가 보이는 근접 사진 1장과 공간 전체가 보이는 사진 1장을 추가로 올려주세요.",
        availableText,
        "사진을 확인한 뒤 긴급도, 업체 배정 여부, 다음 조치 일정을 이어서 안내드리겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "REQUEST_DETAILS") {
      return [
        `${roomLabel} ${complaint.title} 건을 검토 중입니다.`,
        `${channelText}과 AI 요약은 확인했으나 처리 방향을 정하려면 추가 설명이 필요합니다.`,
        "증상이 시작된 시점, 현재도 반복되는지, 사용이 완전히 불가능한지 알려주세요.",
        availableText,
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "SCHEDULE_VISIT") {
      return [
        `${roomLabel} ${complaint.title} 건 확인했습니다.`,
        `${analysis?.recommendedAction ?? "현장 확인 또는 업체 점검 일정을 조율하겠습니다."}`,
        "방문 가능한 날짜와 시간대를 2개 이상 남겨주시면 가장 빠른 일정으로 조율하겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "ASSIGN_VENDOR_NOTICE") {
      return [
        `${roomLabel} ${complaint.title} 건은 협력업체 확인 단계로 넘겼습니다.`,
        `${analysis?.recommendedAction ?? "업체가 사진과 증상 요약을 확인한 뒤 방문 일정을 제안할 예정입니다."}`,
        availableText,
        "일정이 확정되면 이 티켓에서 다시 안내드리겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "COMPLETION_NOTICE") {
      return [
        `${roomLabel} ${complaint.title} 건의 수리 완료 보고가 접수되었습니다.`,
        "수리 결과를 확인하시고 문제가 해결되었으면 완료 확인을 눌러주세요.",
        "아직 문제가 남아 있다면 미해결 사유와 사진을 남겨 재요청할 수 있습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    return [
      `${roomLabel} ${complaint.title} 건 접수를 확인했습니다.`,
      `${channelText} 기준으로 ${ticket.aiSummary}`,
      `${availableText}`,
      "관리자가 AI 요약, 긴급도, 사진 자료를 검토한 뒤 다음 조치를 안내드리겠습니다.",
      referenceLine
    ].join("\n") + noteLine;
  }

  private sourceChannelDisplay(sourceChannel: ComplaintSourceChannel) {
    const labels: Record<ComplaintSourceChannel, string> = {
      DIRECT_FORM: "앱 직접 입력",
      REALTIME_CHAT: "리얼타임 챗봇",
      VOICE_CHAT: "음성 챗봇",
      CALLBOT: "콜봇"
    };

    return labels[sourceChannel];
  }

  private presentManagerAssistantTicket(ticket: Ticket): ManagerAssistantTicketMatch {
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);

    return {
      ticketId: ticket.id,
      complaintId: complaint.id,
      title: complaint.title,
      roomLabel: room ? `${room.buildingName} ${room.roomNo}` : "호실 확인 필요",
      status: ticket.status,
      displayStatus: this.displayStatus(ticket.status),
      sourceChannel: ticket.sourceChannel,
      priority: ticket.priority,
      category: ticket.category,
      summary: ticket.aiSummary,
      dueAt: ticket.dueAt
    };
  }

  private ticketNeedsPhotoForManagerAssistant(ticket: Ticket) {
    const analysis = this.store.analyses[ticket.id];
    const photoAnalysis = analysis?.photoAnalysis;
    const hasPhoto =
      (photoAnalysis?.attachmentUrls.length ?? 0) > 0 ||
      this.store.messages.some(
        (message) => message.ticketId === ticket.id && message.attachmentUrls.length > 0
      );
    const callbot = this.presentCallbotContext(ticket);
    const relatedText = [
      ticket.aiSummary,
      analysis?.recommendedAction,
      ...(analysis?.reasons ?? []),
      ...this.store.messages
        .filter((message) => message.ticketId === ticket.id)
        .map((message) => message.messageText)
    ].join("\n");

    return (
      Boolean(callbot?.needPhoto) ||
      (ticket.status === "ADDITIONAL_INFO_REQUESTED" && /사진|촬영|첨부/.test(relatedText)) ||
      (!hasPhoto && /사진|누수|천장|곰팡이|파손|하자/.test(relatedText))
    );
  }

  private composeManagerAssistantAnswer(
    question: string,
    filters: string[],
    matchedTickets: ManagerAssistantTicketMatch[]
  ) {
    const filterSummary = filters.join(", ");

    if (matchedTickets.length === 0) {
      return `"${question}" 조건으로 조회했지만 ${filterSummary}에 맞는 티켓은 없습니다. 기간이나 상태 조건을 넓히면 다시 확인할 수 있습니다.`;
    }

    const examples = matchedTickets
      .slice(0, 3)
      .map(
        (ticket) =>
          `${ticket.roomLabel} ${ticket.title}(${ticket.displayStatus}, P${ticket.priority})`
      )
      .join("; ");

    return `${filterSummary} 조건으로 ${matchedTickets.length}건을 찾았습니다. 우선 확인할 티켓은 ${examples}입니다.`;
  }

  private managerAssistantNextActions(
    matchedTickets: ManagerAssistantTicketMatch[],
    filters: string[]
  ) {
    if (matchedTickets.length === 0) {
      return ["조건을 넓히거나 호실/기간 조건을 제거해 다시 조회하세요."];
    }

    const actions = new Set<string>();

    if (filters.includes("업체 배정: 미배정")) {
      actions.add("긴급도와 사진 자료를 확인한 뒤 우선순위가 높은 티켓부터 업체 배정을 진행하세요.");
    }

    if (filters.some((filter) => filter.startsWith("사진:"))) {
      actions.add("사진이 필요한 티켓은 세입자에게 근접 사진과 공간 전체 사진을 요청하세요.");
    }

    if (filters.includes("접수 채널: 콜봇")) {
      actions.add("콜봇 티켓은 전사 내용, 통화 녹음, 사진 업로드 링크 발송 상태를 함께 확인하세요.");
    }

    if (filters.includes("긴급도: 1순위")) {
      actions.add("긴급 티켓은 당일 확인 여부와 위험 확산 가능성을 먼저 점검하세요.");
    }

    return actions.size ? Array.from(actions) : ["목록에서 티켓을 선택해 AI 요약과 처리 이력을 확인하세요."];
  }

  private presentComplaint(complaint: Complaint) {
    const ticket = this.findTicket(complaint.ticketId);
    const messages = this.store.messages
      .filter((message) => message.ticketId === ticket.id)
      .map((message) => this.presentTicketMessage(message));

    return {
      ...complaint,
      room: this.store.rooms.find((room) => room.id === complaint.roomId),
      displayStatus: this.displayStatus(ticket.status),
      ticket: this.presentTicket(ticket),
      nextAction: this.presentTenantNextAction(ticket, messages),
      aiFeedback: this.store.aiFeedback
        .filter((feedback) => feedback.ticketId === ticket.id)
        .map((feedback) => this.presentAiFeedback(feedback)),
      messages
    };
  }

  private presentTenantNextAction(
    ticket: Ticket,
    messages: ReturnType<typeof this.presentTicketMessage>[]
  ) {
    if (ticket.status !== "ADDITIONAL_INFO_REQUESTED") {
      return undefined;
    }

    const requestMessages = messages
      .filter(
        (message) =>
          ["LANDLORD", "SYSTEM", "AI_ASSISTANT"].includes(message.senderRole) &&
          /사진|촬영|첨부|추가 정보|추가 설명|업로드 링크/.test(message.messageText)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestRequest = requestMessages[0];
    const requestText = latestRequest?.messageText ?? ticket.aiSummary;
    const requiresPhoto = /사진|촬영|첨부|업로드 링크/.test(requestText);
    const requestedItems = [
      requiresPhoto ? "문제 부위 근접 사진" : undefined,
      requiresPhoto ? "공간 전체가 보이는 사진" : undefined,
      /설명|상태|추가 정보/.test(requestText) ? "현재 상태 설명" : undefined,
      /방문|시간/.test(requestText) ? "방문 가능 시간" : undefined
    ].filter((item): item is string => Boolean(item));

    return {
      kind: requiresPhoto ? "PHOTO_REQUEST" : "ADDITIONAL_INFO",
      title: requiresPhoto ? "추가 사진이 필요합니다" : "추가 정보가 필요합니다",
      description: requestText,
      requestedItems: requestedItems.length ? requestedItems : ["요청받은 추가 자료"],
      requiresPhoto,
      uploadHint: requiresPhoto
        ? "아래 추가 자료 제출에서 사진을 첨부하면 기존 티켓에 자동 연결됩니다."
        : "아래 추가 자료 제출에서 설명을 남기면 기존 티켓에 자동 연결됩니다."
    };
  }

  private presentTicket(ticket: Ticket) {
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);
    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    return {
      ...ticket,
      complaint,
      room,
      analysis: this.presentAnalysis(analysis, ticket),
      aiFeedback: this.store.aiFeedback
        .filter((feedback) => feedback.ticketId === ticket.id)
        .map((feedback) => this.presentAiFeedback(feedback)),
      assignedVendor: ticket.assignedVendorId
        ? this.store.vendors.find((vendor) => vendor.id === ticket.assignedVendorId)
        : undefined,
      repairs: this.store.repairs.filter((repair) => repair.ticketId === ticket.id),
      messages: this.store.messages
        .filter((message) => message.ticketId === ticket.id)
        .map((message) => this.presentTicketMessage(message)),
      history: this.store.history.filter((history) => history.ticketId === ticket.id),
      roomTimeline: this.presentRoomTimeline(ticket.roomId),
      callbot: this.presentCallbotContext(ticket)
    };
  }

  private presentCallbotContext(ticket: Ticket): CallbotTicketContext | undefined {
    if (ticket.sourceChannel !== "CALLBOT") {
      return undefined;
    }

    const messages = this.store.messages.filter((message) => message.ticketId === ticket.id);
    const recordingMessage = messages.find((message) =>
      message.messageText.startsWith("콜봇 통화 녹음:")
    );
    const uploadMessage = messages.find((message) =>
      message.messageText.startsWith("사진 업로드 링크 발송 대기:")
    );
    const uploadedAfterRequest = messages.some(
      (message) =>
        message.senderRole === "TENANT" &&
        message.attachmentUrls.length > 0 &&
        (!uploadMessage || message.createdAt.localeCompare(uploadMessage.createdAt) >= 0)
    );
    const recordingUrl = recordingMessage?.messageText.replace("콜봇 통화 녹음:", "").trim();
    const pendingPhotoUploadUrl = uploadMessage?.messageText
      .replace("사진 업로드 링크 발송 대기:", "")
      .trim();
    const photoUploadUrl = uploadedAfterRequest ? undefined : pendingPhotoUploadUrl;
    const tenantTranscript = messages
      .filter((message) => message.senderRole === "TENANT")
      .map((message) => message.messageText.trim())
      .filter(Boolean)
      .join("\n");
    const aiSummary =
      messages
        .filter((message) => message.senderRole === "AI_ASSISTANT")
        .map((message) => message.messageText.trim())
        .filter(Boolean)
        .join("\n") || ticket.aiSummary;
    const needPhoto =
      !uploadedAfterRequest &&
      (Boolean(photoUploadUrl) ||
      (ticket.status === "ADDITIONAL_INFO_REQUESTED" &&
        /사진|촬영|첨부/.test(`${ticket.aiSummary}\n${tenantTranscript}\n${aiSummary}`)));

    return {
      hasRecording: Boolean(recordingUrl),
      recordingUrl,
      transcriptText: tenantTranscript || "통화 전사 확인 필요",
      aiSummary,
      needPhoto,
      photoUploadUrl,
      statusNote: uploadedAfterRequest
        ? "사진 수신 후 검토중"
        : photoUploadUrl
          ? "사진 업로드 링크 발송 대기"
          : this.displayStatus(ticket.status)
    };
  }

  private presentTicketMessage(message: TicketMessage) {
    return {
      ...message,
      attachmentUrls: [...message.attachmentUrls]
    };
  }

  private presentAiFeedback(feedback: AiFeedback) {
    return {
      ...feedback,
      attachmentUrls: [...feedback.attachmentUrls]
    };
  }

  private presentAnalysis(analysis: AiAnalysis, ticket?: Ticket) {
    const repeatSummary = ticket
      ? this.repeatIssueSummaryForTicket(ticket, analysis)
      : analysis.repeatSummary;

    return {
      ...analysis,
      reasons: analysis.reasons ? [...analysis.reasons] : undefined,
      photoAnalysis: analysis.photoAnalysis
        ? this.presentPhotoAnalysis(analysis.photoAnalysis)
        : undefined,
      repeatSummary: repeatSummary ? this.presentRepeatIssueSummary(repeatSummary) : undefined
    };
  }

  private presentRepeatIssueSummary(summary: RepeatIssueSummary): RepeatIssueSummary {
    return {
      ...summary,
      matchedTicketIds: [...summary.matchedTicketIds],
      matchedComplaintIds: [...summary.matchedComplaintIds],
      evidence: [...summary.evidence]
    };
  }

  private presentPhotoAnalysis(photoAnalysis: PhotoAnalysis): PhotoAnalysis {
    return {
      ...photoAnalysis,
      attachmentUrls: [...photoAnalysis.attachmentUrls],
      previousAttachmentUrls: [...photoAnalysis.previousAttachmentUrls],
      candidates: [...photoAnalysis.candidates],
      evidence: [...photoAnalysis.evidence]
    };
  }

  private presentRepair(repair: RepairRequest) {
    const ticket = this.findTicket(repair.ticketId);

    return {
      ...repair,
      ticket: this.presentTicket(ticket)
    };
  }

  private cloneReceiptOcr(ocr: ReceiptOcr): ReceiptOcr {
    return {
      ...ocr,
      fields: {
        item: { ...ocr.fields.item },
        date: { ...ocr.fields.date },
        amount: { ...ocr.fields.amount },
        unitId: ocr.fields.unitId ? { ...ocr.fields.unitId } : undefined
      },
      lineItems: ocr.lineItems.map((item) => ({ ...item }))
    };
  }

  private displayUnitId(room: Room) {
    return room.roomNo.replace(/호$/u, "");
  }

  private elapsedHours(startIso: string, endIso: string) {
    const elapsed = this.timeOf(endIso) - this.timeOf(startIso);

    return elapsed > 0 ? Math.round((elapsed / 3_600_000) * 10) / 10 : undefined;
  }

  private median(values: number[]) {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  private average(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private timeOf(iso?: string) {
    return iso ? new Date(iso).getTime() || 0 : 0;
  }

  private displayStatus(status: TicketStatus) {
    const map: Record<TicketStatus, string> = {
      RECEIVED: "접수됨",
      REVIEWING: "검토중",
      ADDITIONAL_INFO_REQUESTED: "추가정보 요청",
      VENDOR_ASSIGNMENT_PENDING: "처리 준비중",
      VENDOR_ASSIGNED: "업체 배정",
      ESTIMATE_REVIEW: "처리 준비중",
      REPAIR_IN_PROGRESS: "수리중",
      COMPLETION_REPORTED: "완료 확인중",
      COMPLETED: "완료",
      REOPENED: "재요청",
      CANCELLED: "취소됨"
    };

    return map[status];
  }

  private assertTicketStatus(ticketId: string, allowed: TicketStatus[], action: string) {
    const ticket = this.findTicket(ticketId);

    if (!allowed.includes(ticket.status)) {
      throw new BadRequestException(
        `${action}을 처리할 수 없는 티켓 상태입니다. 현재 상태: ${ticket.status}`
      );
    }
  }

  private assertRepairStatus(repair: RepairRequest, allowed: RepairStatus[], action: string) {
    if (!allowed.includes(repair.status)) {
      throw new BadRequestException(
        `${action}을 처리할 수 없는 수리 상태입니다. 현재 상태: ${repair.status}`
      );
    }
  }

  private transitionTicket(ticketId: string, toStatus: TicketStatus, changedByUserId: string, note?: string) {
    const ticket = this.findTicket(ticketId);
    const fromStatus = ticket.status;
    ticket.status = toStatus;
    ticket.updatedAt = now();
    const complaint = this.findComplaint(ticket.complaintId);
    complaint.status = complaintStatusFor(toStatus);
    complaint.updatedAt = now();
    this.pushHistory(ticketId, changedByUserId, fromStatus, toStatus, note);

    return ticket;
  }

  private pushHistory(
    ticketId: string,
    changedByUserId: string,
    fromStatus: TicketStatus | undefined,
    toStatus: TicketStatus,
    note?: string
  ) {
    this.store.history.unshift({
      id: id("hst"),
      ticketId,
      changedByUserId,
      fromStatus,
      toStatus,
      note,
      createdAt: now()
    });
  }

  private addMessageInternal(
    ticketId: string,
    complaintId: string | undefined,
    senderUserId: string,
    senderRole: TicketMessage["senderRole"],
    messageText: string,
    attachmentUrls: string[] = []
  ) {
    const message: TicketMessage = {
      id: id("msg"),
      ticketId,
      complaintId,
      senderUserId,
      senderRole,
      messageText,
      attachmentUrls: [...attachmentUrls],
      createdAt: now()
    };

    this.store.messages.push(message);

    return message;
  }

  private findComplaint(complaintId: string) {
    const complaint = this.store.complaints.find((item) => item.id === complaintId);

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    return complaint;
  }

  private findTicket(ticketId: string) {
    const ticket = this.store.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      throw new NotFoundException("티켓을 찾을 수 없습니다.");
    }

    return ticket;
  }

  private findRoom(roomId: string) {
    const room = this.store.rooms.find((item) => item.id === roomId);

    if (!room) {
      throw new NotFoundException("호실을 찾을 수 없습니다.");
    }

    return room;
  }

  private canManagerAccessRoom(managerId: string, roomId: string) {
    return this.store.rooms.some((room) => room.id === roomId && room.landlordId === managerId);
  }

  private assertManagerCanAccessRoom(managerId: string, roomId: string) {
    const room = this.findRoom(roomId);

    if (room.landlordId !== managerId) {
      throw new ForbiddenException("담당 호실에만 접근할 수 있습니다.");
    }
  }

  private assertManagerCanAccessTicket(managerId: string, ticket: Ticket) {
    this.assertManagerCanAccessRoom(managerId, ticket.roomId);
  }

  private findIntakeSession(tenantId: string, sessionId: string) {
    const session = this.store.intakeSessions.find(
      (item) => item.id === sessionId && item.tenantId === tenantId
    );

    if (!session) {
      throw new NotFoundException("상담 스레드를 찾을 수 없습니다.");
    }

    return session;
  }

  private findRepair(repairId: string) {
    const repair = this.store.repairs.find((item) => item.id === repairId);

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return repair;
  }

}
