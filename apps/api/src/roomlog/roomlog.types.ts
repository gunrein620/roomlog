export type {
  ManagerAgentCommandInput,
  ManagerAgentCommandName,
  ManagerAgentCommandResult,
  ManagerAssistantIntent,
  ManagerCopilotChatRequest,
  ManagerCopilotChatResponse,
  ManagerCopilotPendingAction,
  ManagerDunningActionPreview,
  ManagerMessagingRecipient,
  StartManagerConversationInput,
  TenantLandlordConversation
} from "@roomlog/types";

export type CopilotChatRequest = import("@roomlog/types").ManagerCopilotChatRequest;
export type CopilotChatResponse = import("@roomlog/types").ManagerCopilotChatResponse;

export type UserRole = "SEEKER" | "TENANT" | "LANDLORD" | "VENDOR";
export type MessageSenderRole = Exclude<UserRole, "SEEKER"> | "AI_ASSISTANT" | "SYSTEM";
export type ComplaintSourceChannel = "DIRECT_FORM" | "REALTIME_CHAT" | "VOICE_CHAT" | "CALLBOT";

export type ComplaintStatus =
  | "SUBMITTED"
  | "REVIEWING"
  | "ADDITIONAL_INFO_REQUESTED"
  | "VENDOR_ASSIGNED"
  | "REPAIR_IN_PROGRESS"
  | "COMPLETED"
  | "REOPENED";

export type TicketStatus =
  | "RECEIVED"
  | "REVIEWING"
  | "ADDITIONAL_INFO_REQUESTED"
  | "VENDOR_ASSIGNMENT_PENDING"
  | "VENDOR_ASSIGNED"
  | "ESTIMATE_REVIEW"
  | "REPAIR_IN_PROGRESS"
  | "COMPLETION_REPORTED"
  | "COMPLETED"
  | "REOPENED"
  | "CANCELLED";

export type RepairStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "ESTIMATE_SUBMITTED"
  | "ESTIMATE_APPROVED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETION_REPORTED"
  | "COMPLETED"
  | "CANCELLED";

export type RepairCostBearer = "LANDLORD" | "TENANT" | "PENDING";

export type CostType = "repair" | "maintenance" | "common" | "other";
export type CostStatus = "draft" | "confirmed" | "amended" | "void";
export type CostAttributionScope = "unit" | "building";
export type DisclosureState = "public" | "private";
export type RepairPaymentState = "already_paid" | "unpaid";
export type CostReviewReason =
  | "ocr_low_confidence"
  | "classification_unclear"
  | "unit_unmatched";
export type ReceiptSource = "camera" | "file" | "online" | "manual";

export type Cost = {
  id: string;
  managerId?: string;
  date: string;
  item: string;
  amount: number;
  type: CostType;
  scope: CostAttributionScope;
  unitId?: string;
  status: CostStatus;
  verified: boolean;
  reviewReason?: CostReviewReason;
  disclosure?: DisclosureState;
  repairPayment?: RepairPaymentState;
  paymentRef?: string;
  receiptId?: string;
  supersedesId?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptLineItem = {
  label: string;
  amount: number;
  suggestedType?: CostType;
};

export type Receipt = {
  id: string;
  managerId?: string;
  source: ReceiptSource;
  imageUrl?: string;
  hasEvidence: boolean;
  uploadedAt: string;
  duplicateOfId?: string;
};

export type OcrField<T = string> = {
  value: T;
  confidence: number;
  needsReview: boolean;
};

export type ReceiptOcr = {
  id: string;
  receiptId: string;
  costId?: string;
  fields: {
    item: OcrField;
    date: OcrField;
    amount: OcrField<number>;
    unitId?: OcrField;
  };
  suggestedType?: CostType;
  typeConfidence?: number;
  lineItems: ReceiptLineItem[];
  createdAt: string;
};

export type MessagingThreadContext =
  | "defect"
  | "payment"
  | "contract"
  | "moveout"
  | "announcement"
  | "general";

export type MessagingMessageSender = "tenant" | "manager";
export type MessagingMessageKind = "text" | "photo_request" | "photo_response";
export type MessagingAnnouncementCategory = "urgent" | "life" | "event";
export type MessagingAnnouncementScope = "all" | "building" | "unit";
export type MessagingAnnouncementReadState = "unread" | "read" | "confirmed";
export type MessagingAnnouncementDraftStatus = "draft" | "sent";
export type MessagingAnnouncementLanguage = "en" | "zh" | "vi";

export type MessagingMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  sender: MessagingMessageSender;
  kind: MessagingMessageKind;
  body: string;
  originalBody?: string;
  attachmentUrls: string[];
  createdAt: string;
};

export type MessagingThread = {
  id: string;
  roomId: string;
  buildingName?: string;
  unitId: string;
  tenantId: string;
  context: MessagingThreadContext;
  contextRef?: string;
  contextLabel?: string;
  lastMessage: string;
  lastMessageSender?: MessagingMessageSender; // 목록 응답에도 포함 — 관리인 미응답 판정용 (presentThread에서 채움)
  unreadCount: number;
  pendingRequest: boolean;
  archivedNotice: boolean;
  createdAt: string;
  updatedAt: string;
  messages?: MessagingMessage[];
};

export type CreateMessagingThreadInput = {
  roomId: string;
  tenantId: string;
  context: MessagingThreadContext;
  contextRef?: string;
  contextLabel?: string;
  initialMessage?: {
    sender: MessagingMessageSender;
    body: string;
    kind?: MessagingMessageKind;
    attachmentUrls?: string[];
  };
};

export type CreateTenantMessagingThreadInput = {
  roomId?: string;
  context?: MessagingThreadContext;
  contextRef?: string;
  contextLabel?: string;
  body?: string;
  kind?: MessagingMessageKind;
  attachmentUrls?: string[];
};

export type AddMessagingThreadMessageInput = {
  body?: string;
  kind?: MessagingMessageKind;
  attachmentUrls?: string[];
};

export type MessagingAnnouncementTranslation = {
  lang: MessagingAnnouncementLanguage;
  langLabel?: string;
  title: string;
  body: string;
  reviewed: boolean;
  sourceHash?: string;
};

export type MessagingAnnouncementDraft = {
  id: string;
  category: MessagingAnnouncementCategory;
  scope: MessagingAnnouncementScope;
  targetLabel: string;
  targetRoomIds: string[];
  title: string;
  body: string;
  translations: MessagingAnnouncementTranslation[];
  confirmRequired: boolean;
  status: MessagingAnnouncementDraftStatus;
  createdByManagerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnnouncementDraftInput = {
  category: MessagingAnnouncementCategory;
  scope: MessagingAnnouncementScope;
  targetLabel: string;
  targetRoomIds?: string[];
  title: string;
  body: string;
  translations?: MessagingAnnouncementTranslation[];
  confirmRequired?: boolean;
};

export type UpdateAnnouncementDraftInput = {
  category: MessagingAnnouncementCategory;
  scope: MessagingAnnouncementScope;
  targetLabel: string;
  targetRoomIds: string[];
  title: string;
  body: string;
  translations: MessagingAnnouncementTranslation[];
};

export type AnnouncementTranslationRequest = {
  title: string;
  body: string;
  targetLang: MessagingAnnouncementLanguage;
};

export type AnnouncementTranslationResponse = MessagingAnnouncementTranslation & {
  langLabel: string;
  sourceHash: string;
};

export type MessagingAnnouncement = {
  id: string;
  draftId?: string;
  category: MessagingAnnouncementCategory;
  scope: MessagingAnnouncementScope;
  targetLabel: string;
  title: string;
  body: string;
  originalBody?: string;
  sender: string;
  senderId: string;
  sentAt: string;
  confirmRequired: boolean;
  safetyCta?: string;
  state?: MessagingAnnouncementReadState;
};

export type MessagingAnnouncementDelivery = {
  id: string;
  announcementId: string;
  tenantId: string;
  roomId: string;
  unitId: string;
  tenantName: string;
  preferredLang: string;
  state: MessagingAnnouncementReadState;
  readAt?: string;
  confirmedAt?: string;
  failed?: boolean;
};

export type MessagingAnnouncementResult = {
  announcementId: string;
  category: MessagingAnnouncementCategory;
  scope: MessagingAnnouncementScope;
  title: string;
  sentAt: string;
  version: number;
  confirmRequired: boolean;
  counts: {
    total: number;
    read: number;
    confirmed: number;
    unconfirmed: number;
    failed: number;
  };
  deliveries: Array<{
    unitId: string;
    tenantName: string;
    state: MessagingAnnouncementReadState;
    readAt?: string;
    confirmedAt?: string;
    failed?: boolean;
  }>;
};

export type ManagerReportPeriod = "week" | "month" | "quarter";
export type ManagerReportStatus = "draft" | "delivered";
export type ManagerReportSourceKind =
  | "billing"
  | "complaint"
  | "cost"
  | "unit"
  | "metric"
  | "contract"
  | "moveout"
  | "messaging";
export type ManagerReportFollowUpActionType = "dunning" | "notice";
export type ManagerReportFollowUpChannel = "announcement" | "thread";
export type ManagerReportShareStatus = "active" | "revoked";
export type ManagerReportAuditAction =
  | "external_share_created"
  | "external_share_viewed"
  | "external_share_revoked";

export type ManagerReportScope = {
  buildingId: string;
  buildingName: string;
  roomIds?: string[];
  unitIds?: string[];
};

export type ManagerReportRecipient = {
  id: string;
  name: string;
  role: "landlord";
  delivery: "account" | "external";
};

export type ManagerReportSource = {
  kind: ManagerReportSourceKind;
  label: string;
  drilldownScreenId: string;
  basis: string;
};

export type ManagerReportKpi = {
  label: string;
  value: string;
  unit?: string;
  formulaSource: ManagerReportSourceKind;
};

export type ManagerReportSection = {
  key: string;
  title: string;
  summary: string;
  source: ManagerReportSource;
  kpis?: ManagerReportKpi[];
};

export type ManagerReportNextAction = {
  label: string;
  actionType: ManagerReportFollowUpActionType;
  targetScreenId: "M-BILL-05" | "M-MSG-00";
  payload: {
    unitIds?: string[];
    billIds?: string[];
    periodLabel?: string;
    note?: string;
  };
};

export type ManagerReportSourceReference = {
  id: string;
  reportId: string;
  sectionKey: string;
  sourceKind: ManagerReportSourceKind;
  entityType: string;
  entityId: string;
  roomId?: string;
  tenantId?: string;
  label: string;
  drilldownScreenId: string;
  basis: string;
  snapshotAt: string;
  createdAt: string;
};

export type ManagerReportLinkedFollowUp = {
  id: string;
  channel: ManagerReportFollowUpChannel;
  actionType: ManagerReportFollowUpActionType;
  announcementDraftId?: string;
  threadId?: string;
  createdAt: string;
};

export type ManagerReport = {
  id: string;
  managerId: string;
  period: ManagerReportPeriod;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  scope: ManagerReportScope;
  status: ManagerReportStatus;
  snapshotAt: string;
  recipient?: ManagerReportRecipient;
  disclaimer: string;
  summary: string;
  nextActions: ManagerReportNextAction[];
  sections: ManagerReportSection[];
  sourceReferences?: ManagerReportSourceReference[];
  linkedFollowUps: ManagerReportLinkedFollowUp[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
};

export type CreateManagerReportInput = {
  period: ManagerReportPeriod;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  scope: ManagerReportScope;
  recipient?: ManagerReportRecipient;
};

export type AskManagerReportChatInput = {
  question: string;
};

export type ManagerReportChatAnswer = {
  id: string;
  interpretedQuery: string;
  basis: "realtime_billing" | "stored_analysis";
  answer: string;
  sources: ManagerReportSource[];
  draft?: {
    type: ManagerReportFollowUpActionType;
    targetScreenId: "M-BILL-05" | "M-MSG-00";
    payload: {
      unitIds?: string[];
      billIds?: string[];
      periodLabel?: string;
      note?: string;
    };
  };
  execution: "draft_only";
  createdAt: string;
};

export type CreateManagerReportExternalShareInput = {
  recipientName: string;
};

export type ManagerReportExternalShare = {
  id: string;
  reportId: string;
  token: string;
  recipientName: string;
  masked: boolean;
  status: ManagerReportShareStatus;
  createdByManagerId: string;
  createdAt: string;
  revokedAt?: string;
};

export type ManagerReportAuditLogEntry = {
  id: string;
  reportId: string;
  shareId?: string;
  action: ManagerReportAuditAction;
  actorId?: string;
  actorLabel: string;
  at: string;
  detail?: string;
};

export type CreateManagerReportFollowUpInput = {
  channel: ManagerReportFollowUpChannel;
  actionType: ManagerReportFollowUpActionType;
  title?: string;
  body: string;
  targetRoomIds?: string[];
  roomId?: string;
  tenantId?: string;
  translations?: MessagingAnnouncementTranslation[];
  confirmRequired?: boolean;
};

export type ManagerReportFollowUpResult = {
  kind: "announcement_draft" | "thread";
  reportId: string;
  followUpId: string;
  announcementDraftId?: string;
  threadId?: string;
};

export type MoveoutSettlementStatus = "estimate" | "reviewing" | "review_done" | "re_review";
export type MoveoutRecordSource =
  | "movein_photo"
  | "defect"
  | "repair"
  | "payment"
  | "chat"
  | "contract";
export type MoveoutWearVerdict = "aging_likely" | "damage_possible" | "unclear";
export type MoveoutDeductionKind = "unpaid" | "repair" | "restoration" | "cleaning";
export type MoveoutChecklistCondition = "normal" | "aging" | "damage_check";
export type MoveoutDisputeStatus =
  | "received"
  | "reviewing"
  | "answered"
  | "confirmed"
  | "re_disputed"
  | "resolved";
export type MoveoutWearAdjustmentAction = "keep" | "adjust" | "reinforce";
export type MoveoutReviewGateBlockReason =
  | "contract_unconfirmed"
  | "unresolved_dispute"
  | "needs_confirmation"
  | "no_movein_evidence";
export type MoveoutDisputeResponseKind = "accept" | "adjust" | "explain";
export type MoveoutDisputeReflectTarget = "report" | "settlement" | "none";

export type MoveoutSummary = {
  id: string;
  tenantId: string;
  roomId: string;
  contractId?: string;
  unitId: string;
  contractConfirmed: boolean;
  leaseEndDate?: string;
  daysRemaining?: number;
  depositAmount?: number;
  estimatedRefundMin?: number;
  estimatedRefundMax?: number;
  settlementStatus: MoveoutSettlementStatus;
  prepProgress: number;
  settlementId?: string;
  messagingThreadId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MoveoutRecordItem = {
  id: string;
  summaryId: string;
  source: MoveoutRecordSource;
  title: string;
  description: string;
  occurredAt?: string;
  wearVerdict?: MoveoutWearVerdict;
  wearNote?: string;
  evidenceUrls?: string[];
  moveinComparisonAvailable: boolean;
};

export type MoveoutChecklistItem = {
  id: string;
  summaryId: string;
  label: string;
  present: boolean;
  condition: MoveoutChecklistCondition;
  note?: string;
  attachmentUrls?: string[];
};

export type MoveoutDeductionCandidate = {
  id: string;
  summaryId: string;
  kind: MoveoutDeductionKind;
  label: string;
  estimatedMin: number;
  estimatedMax: number;
  needsConfirmation: boolean;
  evidenceNote: string;
  source: MoveoutRecordSource;
};

export type MoveoutSettlementEstimate = {
  id: string;
  summaryId: string;
  depositAmount: number;
  deductions: MoveoutDeductionCandidate[];
  refundMin: number;
  refundMax: number;
  status: MoveoutSettlementStatus;
  disclaimer: string;
  createdAt: string;
  updatedAt?: string;
};

export type MoveoutDisputeEvent = {
  id?: string;
  status: MoveoutDisputeStatus;
  at: string;
  note?: string;
  actorUserId?: string;
};

export type MoveoutDispute = {
  id: string;
  summaryId: string;
  targetItemId?: string;
  targetLabel: string;
  reason: string;
  attachmentUrls?: string[];
  status: MoveoutDisputeStatus;
  slaDeadline: string;
  slaBreached: boolean;
  managerResponse?: string;
  messagingThreadId?: string;
  history: MoveoutDisputeEvent[];
  createdAt: string;
  updatedAt: string;
};

export type MoveoutManagerRow = {
  summaryId: string;
  unitId: string;
  tenantName: string;
  contractConfirmed: boolean;
  leaseEndDate?: string;
  daysRemaining?: number;
  settlementStatus: MoveoutSettlementStatus;
  openDisputeCount: number;
  slaBreached: boolean;
  expiringSoon: boolean;
};

export type MoveoutDashboardSummary = {
  expiringSoon: number;
  disputesWaiting: number;
  slaBreached: number;
  reviewDone: number;
};

export type MoveoutReportAuditEntry = {
  id: string;
  summaryId: string;
  recordItemId: string;
  action: MoveoutWearAdjustmentAction;
  fromVerdict?: MoveoutWearVerdict;
  toVerdict?: MoveoutWearVerdict;
  evidenceNote: string;
  tenantNotified: boolean;
  managerName: string;
  managerId: string;
  at: string;
};

export type MoveoutReviewCompletionGate = {
  canComplete: boolean;
  blockingReasons: MoveoutReviewGateBlockReason[];
  slaBreached: boolean;
  overrideAvailable: boolean;
  message: string;
};

export type MoveoutManagerSettlementReview = {
  settlement: MoveoutSettlementEstimate;
  gate: MoveoutReviewCompletionGate;
  disputes: MoveoutDispute[];
  moveinEvidenceAvailable: boolean;
};

export type MoveoutAdjustWearVerdictInput = {
  recordItemId: string;
  action: MoveoutWearAdjustmentAction;
  toVerdict?: MoveoutWearVerdict;
  evidenceNote: string;
  notifyTenant: boolean;
};

export type MoveoutAdjustDeductionInput = {
  deductionId: string;
  estimatedMin?: number;
  estimatedMax?: number;
  resolveConfirmation?: boolean;
  note?: string;
};

export type MoveoutCompleteReviewInput = {
  acknowledgeEvidence: boolean;
  overrideSla?: boolean;
  overrideReason?: string;
};

export type MoveoutRespondDisputeInput = {
  disputeId: string;
  kind: MoveoutDisputeResponseKind;
  message: string;
  reflect?: MoveoutDisputeReflectTarget;
};

export type CreateMoveoutDisputeInput = {
  targetItemId?: string;
  targetLabel: string;
  reason: string;
  attachmentUrls?: string[];
};

export type CreateTenantMoveoutInquiryInput = {
  body: string;
  attachmentUrls?: string[];
};

export type UpdateMoveoutChecklistItemInput = {
  id?: string;
  label: string;
  present: boolean;
  condition: MoveoutChecklistCondition;
  note?: string;
  attachmentUrls?: string[];
};

export type UpdateMoveoutChecklistInput = {
  items: UpdateMoveoutChecklistItemInput[];
};

export type TenantMoveoutDisputeAction = "confirm" | "re_dispute" | "resolve";

export type UpdateTenantMoveoutDisputeInput = {
  disputeId: string;
  action: TenantMoveoutDisputeAction;
  reason?: string;
  attachmentUrls?: string[];
};

export type EscalateMoveoutDisputeInput = {
  disputeId: string;
  reason?: string;
};

export type ContractLifecycle =
  | "unregistered"
  | "analyzing"
  | "active"
  | "expiring_soon"
  | "expired";
export type ContractReview = "pending" | "info_requested" | "confirmed";
export type DeletionState = "none" | "requested" | "completed" | "limited" | "denied";
export type ContractValueSource = "confirmed" | "manual" | "unverified";
export type ExtractionGroup = "money" | "term" | "responsibility";
export type ContractDocumentOrigin = "tenant_upload" | "manager_upload" | "manual";

export type Contract = {
  id: string;
  roomId: string;
  tenantId?: string;
  managerId?: string;
  unitId: string;
  landlordName: string;
  lifecycle: ContractLifecycle;
  review: ContractReview;
  deletion: DeletionState;
  valueSource: ContractValueSource;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  optionInventory?: string[];
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  extractionId?: string;
  documentId?: string;
  confirmedAt?: string;
  confirmedByManagerId?: string;
  tradeAcceptedAt?: string;
};

export type ContractDocument = {
  id: string;
  contractId: string;
  uploadedByUserId?: string;
  origin: ContractDocumentOrigin;
  fileName?: string;
  fileUrl?: string;
  uploadedAt: string;
};

export type ExtractionItem = {
  label: string;
  value: string;
  group: ExtractionGroup;
  needsCheck: boolean;
  evidence?: string;
  masked?: boolean;
};

export type ContractHelpNote = {
  clause: string;
  plain: string;
  source?: string;
};

export type ContractExtraction = {
  id: string;
  contractId: string;
  confirmed: boolean;
  highlights: string[];
  items: ExtractionItem[];
  helpNotes: ContractHelpNote[];
  createdAt: string;
};

export type RetentionItem = {
  label: string;
  reason: string;
  until: string;
};

export type ContractPrivacy = {
  contractId: string;
  maskingEnabled: boolean;
  retention: RetentionItem[];
  forwardingConsent: boolean;
  deletion: DeletionState;
  deletionSlaHours?: number;
  deletable: boolean;
};

export type ContractInvite = {
  id: string;
  contractId: string;
  roomId: string;
  inviteToken: string;
  invitedByManagerId: string;
  tenantName: string;
  email?: string;
  phone?: string;
  state: "waiting" | "connected" | "disputed";
  signupUrl: string;
  audit: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

export type CreateTenantContractInput = {
  fileName?: string;
  fileUrl?: string;
  ocrConsent: boolean;
  storageConsent: boolean;
};

export type EnsureTradeContractDraftInput = {
  tradeContractId: string;
  roomId: string;
  tenantId: string;
  landlordId: string;
  landlordName: string;
  depositKrw: number;
  monthlyRent: number;
};

export type ConnectAcceptedTradeContractInput = {
  tradeContractId: string;
  listingTitle: string;
  location: string;
  roomNo?: string;
  tenantId: string;
  landlordId: string;
  landlordName: string;
  depositKrw: number;
  monthlyRent: number;
  acceptedAt: string;
};

export type CreateManagerContractInput = {
  roomId?: string;
  unitId?: string;
  tenantId?: string;
  tenantName?: string;
  fileName?: string;
  fileUrl?: string;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  startDate?: string;
  endDate?: string;
};

export type UpdateManagerContractManualValuesInput = {
  deposit?: string;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  startDate?: string;
  endDate?: string;
  account?: string;
};

export type UpdateManagerContractInventoryInput = {
  items: string[];
};

export type CreateManagerContractInviteInput = {
  tenantName: string;
  email?: string;
  phone?: string;
};

export type UpdateManagerContractInviteInput = {
  state: "waiting" | "connected" | "disputed";
  note?: string;
};

export type UpdateManagerContractPrivacyInput = {
  maskingEnabled?: boolean;
  forwardingConsent?: boolean;
  retentionNote?: string;
};

export type CostReviewQueueSummary = {
  ocrLowConfidence: number;
  classificationUnclear: number;
  unitUnmatched: number;
  unverifiedConfirmed: number;
  total: number;
};

export type MonthlyCostSummary = {
  month: string;
  totalAmount: number;
  byType: Record<CostType, number>;
  confirmedCount: number;
};

export type DisclosureEntry = {
  costId: string;
  item: string;
  amount: number;
  disclosure: DisclosureState;
  privateReason?: string;
};

export type DisclosureSetting = {
  month: string;
  scope: CostAttributionScope;
  unitId?: string;
  entries: DisclosureEntry[];
  hiddenCount: number;
  updatedAt: string;
};

export type AttachmentCategory =
  | "COMPLAINT_PHOTO"
  | "ADDITIONAL_PHOTO"
  | "WORK_PHOTO"
  | "COMPLETION_PHOTO"
  | "INTAKE_PHOTO"
  | "FLOOR_PLAN_SOURCE";

export type SocialProvider = "GOOGLE" | "KAKAO" | "NAVER";

export type SocialAccount = {
  id: string;
  provider: SocialProvider;
  providerUserId: string;
  userId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type UserAccount = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  createdAt: string;
};

export type Room = {
  id: string;
  buildingName: string;
  roomNo: string;
  address: string;
  landlordId?: string;
};

export type RoomWall = {
  id: string;
  roomId: string;
  sourceWallId: string;
  start: FloorPlanWallPoint;
  end: FloorPlanWallPoint;
  lengthMm: number;
  rotationRad: number;
  position: [number, number, number];
  dimensions: { width: number; height: number; depth: number };
  wallOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SimulatorWallData = {
  id: string;
  wall_id: string;
  start: FloorPlanWallPoint;
  end: FloorPlanWallPoint;
  length: number;
  height: number;
  depth: number;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: { width: number; height: number; depth: number };
  material: "wall";
  wall_order: number;
};

export type RoomTimelineEntryType =
  | "MOVE_IN_CHECKLIST"
  | "AI_FEEDBACK"
  | "INTAKE_SESSION"
  | "COMPLAINT"
  | "STATUS_CHANGE"
  | "MESSAGE"
  | "REPAIR";

export type RoomTimelineEntry = {
  id: string;
  type: RoomTimelineEntryType;
  roomId: string;
  room?: Room;
  title: string;
  description: string;
  createdAt: string;
  ticketId?: string;
  complaintId?: string;
  sessionId?: string;
  repairId?: string;
  status?: string;
  senderRole?: MessageSenderRole;
  attachmentUrls: string[];
};

export type Complaint = {
  id: string;
  tenantId: string;
  roomId: string;
  ticketId: string;
  sourceChannel: ComplaintSourceChannel;
  title: string;
  description: string;
  location: string;
  occurredAt?: string;
  availableTimes?: string;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
};

export type AiAnalysis = {
  summary: string;
  category: string;
  detailCategory?: string;
  priority: number;
  responsibilityHint: "임대인 책임 가능성" | "임차인 책임 가능성" | "판단 어려움";
  confidenceScore: number;
  reasons?: string[];
  recommendedAction: string;
  photoAnalysis?: PhotoAnalysis;
  repeatSummary?: RepeatIssueSummary;
};

export type RepeatIssueSummary = {
  isRepeated: boolean;
  matchCount: number;
  windowDays: number;
  matchedTicketIds: string[];
  matchedComplaintIds: string[];
  label: string;
  evidence: string[];
};

export type AiFeedbackTarget =
  | "SUMMARY"
  | "CATEGORY"
  | "PRIORITY"
  | "RESPONSIBILITY"
  | "COMPLETION";

export type AiFeedbackStatus = "OPEN" | "REVIEWED";

export type AiFeedback = {
  id: string;
  ticketId: string;
  complaintId: string;
  tenantId: string;
  target: AiFeedbackTarget;
  targetLabel: string;
  originalValue: string;
  reason: string;
  requestedAction?: string;
  attachmentUrls: string[];
  status: AiFeedbackStatus;
  managerReviewNote?: string;
  correctedValue?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Ticket = {
  id: string;
  complaintId: string;
  tenantId: string;
  roomId: string;
  assignedVendorId?: string;
  sourceChannel: ComplaintSourceChannel;
  category: string;
  priority: number;
  status: TicketStatus;
  responsibilityHint: string;
  aiSummary: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RepairRequest = {
  id: string;
  ticketId: string;
  vendorId: string;
  status: RepairStatus;
  title: string;
  description: string;
  estimateAmount?: number;
  estimateDescription?: string;
  costBearer?: RepairCostBearer;
  estimateApprovedAt?: string;
  estimateApprovalNote?: string;
  scheduledAt?: string;
  completedAt?: string;
  completionNote?: string;
  completionPhotoUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = {
  id: string;
  ticketId: string;
  complaintId?: string;
  senderUserId: string;
  senderRole: MessageSenderRole;
  messageText: string;
  attachmentUrls: string[];
  createdAt: string;
};

export type MoveInChecklistItem = {
  id: string;
  tenantId: string;
  roomId: string;
  area: string;
  itemName: string;
  memo?: string;
  guidance: string;
  attachmentUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateMoveInChecklistItemInput = {
  roomId?: string;
  area: string;
  itemName: string;
  memo?: string;
  attachmentUrls?: string[];
};

export type CallbotTicketContext = {
  hasRecording: boolean;
  recordingUrl?: string;
  transcriptText: string;
  aiSummary: string;
  needPhoto: boolean;
  photoUploadUrl?: string;
  statusNote: string;
};

export type ManagerAssistantQueryInput = {
  question: string;
};

export type ManagerAssistantTicketMatch = {
  ticketId: string;
  complaintId: string;
  title: string;
  roomLabel: string;
  status: TicketStatus;
  displayStatus: string;
  sourceChannel: ComplaintSourceChannel;
  priority: number;
  category: string;
  summary: string;
  dueAt?: string;
};

export type ManagerAssistantQueryResult = {
  question: string;
  answer: string;
  scope: string;
  filters: string[];
  matchedTickets: ManagerAssistantTicketMatch[];
  nextActions: string[];
  generatedAt: string;
};

export type ManagerReplyIntent =
  | "RECEIPT_ACK"
  | "REQUEST_PHOTO"
  | "REQUEST_DETAILS"
  | "SCHEDULE_VISIT"
  | "ASSIGN_VENDOR_NOTICE"
  | "COMPLETION_NOTICE";

export type ManagerReplyAction = "SEND_REPLY" | "REQUEST_ADDITIONAL_INFO";

export type ManagerReplyDraftInput = {
  intent?: ManagerReplyIntent;
  note?: string;
};

export type ManagerTicketReplyInput = {
  action?: ManagerReplyAction;
  messageText?: string;
};

export type ManagerReplyDraftResult = {
  ticketId: string;
  complaintId: string;
  intent: ManagerReplyIntent;
  subject: string;
  messageText: string;
  deliveryChannels: string[];
  requiresTenantAction: boolean;
  tenantActionLabel?: string;
  evidence: string[];
  warnings: string[];
  generatedAt: string;
};

export type Attachment = {
  id: string;
  uploadedByUserId: string;
  category: AttachmentCategory;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type FloorPlanStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type FloorPlanWallPoint = {
  x: number;
  y: number;
};

export type FloorPlanWall = {
  id: string | number;
  start: FloorPlanWallPoint;
  end: FloorPlanWallPoint;
};

export type FloorPlanExtractionMeta = {
  processingMs?: number;
  detectedWallCount?: number;
  removedNoiseCount?: number;
  scaleCandidates?: unknown[];
  scaleConfirmed?: boolean;
  [key: string]: unknown;
};

export type FloorPlanCandidate = {
  id: string;
  type: string;
  status: "CANDIDATE" | "CONFIRMED" | "REJECTED";
  confidence?: number;
  source?: string;
  [key: string]: unknown;
};

export type FloorPlanDraft = {
  id: string;
  ownerId: string;
  roomId?: string;
  sourceAttachmentId?: string;
  sourceImageUrl?: string;
  status: FloorPlanStatus;
  pixelToMmRatio: number;
  walls: FloorPlanWall[];
  hiddenWallIds: string[];
  furnitures: unknown[];
  room3d: Record<string, unknown>;
  extractionMeta: FloorPlanExtractionMeta;
  openings: FloorPlanCandidate[];
  fixtures: FloorPlanCandidate[];
  createdAt: string;
  updatedAt: string;
};

export type FloorPlanAiModelId =
  | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  | "nvidia/cosmos3-nano-reasoner"
  | "openai/floor-plan-vision";

export type FloorPlanAiModelMode = "vision-reasoning";

export type FloorPlanAiModel = {
  id: FloorPlanAiModelId;
  label: string;
  mode: FloorPlanAiModelMode;
  description: string;
};

export type FloorPlanAiAnalysisInput = {
  analysisMode?: "dimension" | "candidate-review" | "room-structure";
  imageDataUrl?: string;
  model?: FloorPlanAiModelId;
  prompt?: string;
  sourceAttachmentId?: string;
  wallCandidates?: FloorPlanAiWallCandidate[];
};

export type FloorPlanOpeningDetectionInput = {
  imageDataUrl?: string;
  sourceAttachmentId?: string;
};

export type FloorPlanOpeningType = "DOOR" | "WINDOW";

export type FloorPlanOpeningCandidateBox = {
  /** 0-1000 정규화 좌표, 좌상단 원점. x/y는 박스 좌상단. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloorPlanOpeningCandidate = {
  id: string;
  type: FloorPlanOpeningType;
  status: "CANDIDATE";
  confidence: number;
  source: string;
  boundingBox: FloorPlanOpeningCandidateBox;
};

export type FloorPlanDetectedWallBox = {
  id: string;
  confidence: number;
  boundingBox: FloorPlanOpeningCandidateBox;
};

export type FloorPlanOpeningDetectionResult = {
  status: "ready" | "config-required" | "failed";
  summary: string;
  model: string;
  openings: FloorPlanOpeningCandidate[];
  walls: FloorPlanDetectedWallBox[];
  imageWidth?: number;
  imageHeight?: number;
  warnings: string[];
};

export type FloorPlanAiTextDetection = {
  text: string;
  confidence?: number;
  boundingBox?: unknown;
  targetLine?: unknown;
};

export type FloorPlanAiDimensionKind =
  | "outer_total"
  | "outer_segment"
  | "room_span"
  | "wall_span"
  | "opening"
  | "furniture"
  | "fixture"
  | "area"
  | "ignore";

export type FloorPlanAiDimensionAxis = "horizontal" | "vertical" | "unknown";
export type FloorPlanAiDimensionPlacementStatus = "placed" | "unplaced" | "uncertain";

export type FloorPlanAiDimensionDetection = {
  appliesTo?: string;
  axis: FloorPlanAiDimensionAxis;
  boundingBox?: unknown;
  confidence?: number;
  kind: FloorPlanAiDimensionKind;
  placementStatus: FloorPlanAiDimensionPlacementStatus;
  reason?: string;
  targetLine?: unknown;
  text: string;
  useForFurnitureFit: boolean;
  useForWallGeneration: boolean;
  useForScale: boolean;
  valueMm?: number;
};

export type FloorPlanAiScaleCandidate = {
  confidence: number;
  pixelLength?: number;
  pixelToMmRatio?: number;
  realLengthMm: number;
  source: string;
};

export type FloorPlanAiWallCandidate = {
  id: string;
  end: FloorPlanWallPoint;
  lengthPx: number;
  orientation: "horizontal" | "vertical" | "diagonal";
  originalWallId?: string;
  start: FloorPlanWallPoint;
};

export type FloorPlanAiCandidateReview = {
  id: string;
  confidence?: number;
  reason?: string;
  verdict: "keep" | "reject" | "review";
};

export type FloorPlanAiNormalizedLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type FloorPlanAiMissingWallHint = {
  confidence?: number;
  description: string;
  line?: FloorPlanAiNormalizedLine;
  orientation?: "horizontal" | "vertical";
};

export type FloorPlanAiRoomStructurePlanStyle = "solid-filled" | "double-line-hollow" | "hatched" | "gray-fill";

export type FloorPlanAiRoomPolygonPoint = {
  x: number;
  y: number;
};

export type FloorPlanAiRoomStructure = {
  confidence: number;
  label: string;
  polygon: FloorPlanAiRoomPolygonPoint[];
};

export type FloorPlanAiRoomStructureNoiseFlags = {
  decorativeHatching: boolean;
  watermark: boolean;
};

export type FloorPlanAiAnalysisResult = {
  model: FloorPlanAiModelId;
  mode: FloorPlanAiModelMode;
  status: "ready" | "config-required" | "failed";
  summary: string;
  analysisMode?: "dimension" | "candidate-review" | "room-structure";
  candidateReviews?: FloorPlanAiCandidateReview[];
  missingWallHints?: FloorPlanAiMissingWallHint[];
  noiseFlags?: FloorPlanAiRoomStructureNoiseFlags;
  planStyle?: FloorPlanAiRoomStructurePlanStyle;
  rooms?: FloorPlanAiRoomStructure[];
  dimensions?: FloorPlanAiDimensionDetection[];
  textDetections: FloorPlanAiTextDetection[];
  scaleCandidates: FloorPlanAiScaleCandidate[];
  rawText?: string;
};

export type IntakeSessionStatus = "ACTIVE" | "FINALIZED" | "CANCELLED";
export type IntakeInputMode = "CHAT" | "VOICE" | "PHOTO";
export type IntakeMessageSender = "TENANT" | "AI_ASSISTANT" | "SYSTEM";
export type PhotoComparisonStatus =
  | "기존 하자 가능성"
  | "신규 발생 가능성"
  | "비교 어려움"
  | "추가 사진 필요";

export type PhotoAnalysis = {
  attachmentUrls: string[];
  previousAttachmentUrls: string[];
  candidates: string[];
  comparisonStatus: PhotoComparisonStatus;
  summary: string;
  evidence: string[];
  recommendedRetake: boolean;
};

export type IntakeSlotKey =
  | "symptom"
  | "location"
  | "occurrence"
  | "risk"
  | "photo"
  | "visitTime";

export type IntakeSlotStatus = "COLLECTED" | "NEEDS_INFO" | "OPTIONAL";

export type IntakeSlot = {
  key: IntakeSlotKey;
  label: string;
  status: IntakeSlotStatus;
  value?: string;
  evidence: string;
  action?: string;
};

export type IntakeDraft = {
  title: string;
  summary: string;
  category: "하자" | "소음" | "설비" | "납부" | "계약" | "공용공간" | "기타";
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  responsibilityHint: "임대인 책임 가능성" | "임차인 책임 가능성" | "판단 어려움";
  confidenceScore: number;
  reasons: string[];
  recommendedAction: string;
  contextHints: string[];
  nextQuestions: string[];
  tenantGuidance: string[];
  photoAnalysis: PhotoAnalysis;
  intakeSlots: IntakeSlot[];
  requiredInfo: string[];
  photoRequested: boolean;
  readyToFinalize: boolean;
  location?: string;
  occurredAt?: string;
  availableTimes?: string;
  duplicateCandidates: DuplicateTicketCandidate[];
};

export type DuplicateTicketCandidate = {
  ticketId: string;
  complaintId: string;
  title: string;
  roomLabel: string;
  status: TicketStatus;
  displayStatus: string;
  category: string;
  priority: number;
  summary: string;
  createdAt: string;
  matchedSignals: string[];
  recommendedAction: "ATTACH_TO_EXISTING" | "CREATE_NEW";
};

export type IntakeMessage = {
  id: string;
  sessionId: string;
  sender: IntakeMessageSender;
  messageText: string;
  transcriptText?: string;
  realtimeEventId?: string;
  attachmentUrls: string[];
  inputMode: IntakeInputMode;
  createdAt: string;
};

export type IntakeThreadSummary = {
  title: string;
  channelLabel: string;
  statusLabel: string;
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  lastUserMessage: string;
  lastAssistantMessage: string;
  messageCount: number;
  attachmentCount: number;
  collectedSlotCount: number;
  openSlotCount: number;
  requiredInfoCount: number;
  unresolvedQuestionCount: number;
  readyToFinalize: boolean;
  updatedAt: string;
};

export type IntakeSession = {
  id: string;
  tenantId: string;
  roomId: string;
  sourceChannel: ComplaintSourceChannel;
  status: IntakeSessionStatus;
  draft: IntakeDraft;
  messages: IntakeMessage[];
  complaintId?: string;
  ticketId?: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
};

export type RealtimePurpose = "TENANT_INTAKE" | "CALLBOT_INTAKE";

export type RealtimeClientSecretInput = {
  purpose?: RealtimePurpose;
  voice?: string;
  instructions?: string;
};

export type RecordRealtimeTurnInput = {
  userTranscript?: string;
  assistantTranscript?: string;
  eventId?: string;
  attachmentUrls?: string[];
};

export type RealtimeClientSecretResult = {
  mode: "openai" | "not_configured";
  sessionId: string;
  openaiSessionId?: string;
  model: string;
  voice: string;
  instructions: string;
  warning?: string;
  expiresAt?: string;
  clientSecret?: {
    value: string;
    expiresAt?: string;
  };
};

export type ManagerRealtimeClientSecretResult = RealtimeClientSecretResult & {
  tools: Array<Record<string, unknown>>;
  commandEndpoint: "/manager/agent/realtime/command";
};

export type StatusHistory = {
  id: string;
  ticketId: string;
  changedByUserId: string;
  fromStatus?: TicketStatus;
  toStatus: TicketStatus;
  note?: string;
  createdAt: string;
};

export type BillStatus =
  | "DRAFT"
  | "SENT"
  | "CONFIRMING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CORRECTED"
  | "CANCELED";

export type PaymentBadge = "NONE" | "DUE" | "CONFIRMING" | "PARTIAL" | "PAID" | "OVERDUE";

export type PaymentReportStatus = "CONFIRMING" | "MATCHED" | "MISMATCH";

export type BillLineItemKind = "RENT" | "MAINTENANCE" | "OTHER";

export type BillLineItemStatus = "UNPAID" | "PARTIAL" | "PAID";

export type BillPaymentTransactionStatus = "READY" | "APPROVED" | "FAILED";

export type DepositMatchStatus = "UNMATCHED" | "MATCHED" | "ORPHAN" | "MISMATCH";

export type OverdueStage = "MINOR" | "WARNING" | "SEVERE";

export type BillLineItem = {
  id?: string;
  label: string;
  kind?: BillLineItemKind;
  amount: number;
  paidAmount?: number;
};

export type PaymentAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type Bill = {
  id: string;
  roomId?: string;
  unitId: string;
  billingMonth: string;
  status: BillStatus;
  items: BillLineItem[];
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  correctionHistory?: string[];
  maintenanceFeeId?: string;
  depositConfirmationRequested?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaymentReport = {
  id: string;
  billId: string;
  unitId: string;
  amount: number;
  depositorName?: string;
  status: PaymentReportStatus;
  etaHours: number;
  reportedAt: string;
  confirmedAt?: string;
};

export type Deposit = {
  id: string;
  depositorName: string;
  amount: number;
  depositedAt: string;
  matchStatus: DepositMatchStatus;
  matchedBillId?: string;
  guessedUnitId?: string;
  paymentTransactionId?: string;
};

export type BillPaymentAllocation = {
  id: string;
  transactionId: string;
  billLineItemId: string;
  kind: BillLineItemKind;
  amount: number;
};

export type BillPaymentTransaction = {
  id: string;
  billId: string;
  tenantId: string;
  orderId: string;
  orderName: string;
  amount: number;
  itemKinds: BillLineItemKind[];
  status: BillPaymentTransactionStatus;
  paymentKey?: string;
  method?: string;
  requestedAt: string;
  approvedAt?: string;
  failedAt?: string;
  failureMessage?: string;
  rawResponse?: unknown;
  allocations: BillPaymentAllocation[];
};

export type MaintenanceFeeItem = {
  id?: string;
  label: string;
  amount: number;
  receiptAvailable: boolean;
};

export type MaintenanceFee = {
  id: string;
  unitId: string;
  billingMonth: string;
  items: MaintenanceFeeItem[];
  totalAmount: number;
  available: boolean;
};

export type DunningGuard = {
  blocked: boolean;
  hasConfirming: boolean;
  hasOrphan: boolean;
};

export type TeamBill = Omit<
  Bill,
  "items" | "bankName" | "accountNumber" | "accountHolder"
> & {
  items: Array<{
    label: string;
    kind: BillLineItemKind;
    amount: number;
    paidAmount: number;
    status: BillLineItemStatus;
  }>;
  account: PaymentAccount;
};

export type TeamManagerBillDetail = TeamBill & {
  guard: DunningGuard;
};

export type TeamTenantBillSummary = {
  bill: TeamBill;
  payableFrom: string;
  isUpcoming: boolean;
  canPay: boolean;
  remainingAmount: number;
};

export type TeamTenantBillingOverview = {
  current: TeamTenantBillSummary | null;
  upcoming: TeamTenantBillSummary | null;
  previousUnpaid: TeamTenantBillSummary[];
  asOf: string;
};

export type TeamTenantPaymentHistoryEventType =
  | "TOSS"
  | "DEPOSIT"
  | "REPORT"
  | "BILL_DUE";

export type TeamTenantPaymentHistoryEventStatus = "CONFIRMED" | "CONFIRMING" | "DUE";

export type TeamTenantPaymentHistoryEvent = {
  id: string;
  type: TeamTenantPaymentHistoryEventType;
  activityDate: string;
  amount: number;
  status: TeamTenantPaymentHistoryEventStatus;
  receiptAvailable: boolean;
};

export type TeamTenantPaymentHistoryRecord = {
  billId: string;
  billingMonth: string;
  activityDate: string;
  status: BillStatus;
  totalAmount: number;
  paidAmount: number;
  payments: TeamTenantPaymentHistoryEvent[];
};

export type TeamTenantPaymentHistory = {
  range: { from: string; to: string };
  bounds: { min: string; max: string; maxDays: 366 };
  records: TeamTenantPaymentHistoryRecord[];
};

export type TeamReport = PaymentReport;

export type TeamDeposit = Deposit;

export type TeamTransactionLedgerBill = {
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: BillStatus;
  items: TeamBill["items"];
};

export type TeamTransactionLedgerCost = {
  type: CostType;
  scope: CostAttributionScope;
  verified: boolean;
  evidenceAvailable: boolean;
  status: "confirmed" | "amended";
};

export type TeamTransactionLedgerRow = {
  id: string;
  direction: "deposit" | "withdrawal";
  occurredAt: string;
  amount: number;
  statusLabel: string;
  buildingName?: string;
  unitId?: string;
  candidateUnitId?: string;
  partyName?: string;
  itemLabel: string;
  depositorName?: string;
  linkedBillRelation?: "matched" | "candidate";
  linkedBill?: TeamTransactionLedgerBill;
  cost?: TeamTransactionLedgerCost;
};

export type TeamBillPaymentOrder = {
  billId: string;
  orderId: string;
  orderName: string;
  amount: number;
  itemKinds: BillLineItemKind[];
  customerKey: string;
  clientKey?: string;
};

export type TeamMaintenance = Omit<MaintenanceFee, "items"> & {
  items: Array<Pick<MaintenanceFeeItem, "label" | "amount" | "receiptAvailable">>;
};

export type TeamBillRow = {
  billId: string;
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount?: number;
  daysOverdue?: number;
  status: BillStatus;
  dueDate: string;
  badge?: PaymentBadge;
  guard?: DunningGuard;
};

export type TeamDashSummary = {
  total: number;
  confirmNeeded: number;
  pending: number;
  overdue: number;
};

export type TeamBillingScopeOption = {
  buildingName: string;
  address: string;
  roomCount: number;
};

export type TeamBillingScope = {
  buildings: TeamBillingScopeOption[];
  selectedBuilding?: string;
};

export type TeamBillingDashboardSummary = TeamDashSummary & {
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  overdueUnits: number;
};

export type TeamBillingRecentDeposit = TeamDeposit & {
  buildingName?: string;
  unitId?: string;
  needsBuildingReview: boolean;
};

export type TeamBillingDashboard = {
  scope: TeamBillingScope;
  billingMonth: string;
  summary: TeamBillingDashboardSummary;
  recentDeposits: TeamBillingRecentDeposit[];
  overduePreview: TeamOverdue[];
  bills: TeamBillRow[];
};

export type TeamCollectionBrief = {
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  billedUnits: number;
  fullyPaidUnits: number;
  partiallyPaidUnits: number;
  threeMonthAverageRate: number;
  sixMonthAverageRate: number;
  previousCollectionRate?: number;
  rateDelta?: number;
  confirmingAmount: number;
};

export type TeamCollectionPoint = {
  billingMonth: string;
  billedAmount: number;
  collectedAmount: number;
  unpaidAmount: number;
  collectionRate: number;
  billedUnits: number;
  fullyPaidUnits: number;
  partiallyPaidUnits: number;
};

export type TeamCollectionHistoryRange = {
  availableFromMonth: string;
  availableToMonth: string;
  appliedFromMonth: string;
  appliedToMonth: string;
};

export type TeamCollectionTimingPoint = {
  day: number;
  currentCumulativeAmount: number;
  previousCumulativeAmount: number;
};

export type TeamCollectionTiming = {
  currentMonth: string;
  previousMonth: string;
  onTimeCollectionRate: number;
  averageCollectionDay?: number;
  points: TeamCollectionTimingPoint[];
};

export type TeamCollectionBuildingRow = TeamCollectionPoint & {
  buildingName: string;
  address: string;
  roomCount: number;
  previousCollectionRate?: number;
  rateDelta?: number;
  bills: TeamBillRow[];
};

export type TeamCollection = {
  scope: TeamBillingScope;
  billingMonth: string;
  brief: TeamCollectionBrief;
  trend: TeamCollectionPoint[];
  history: TeamCollectionHistoryRange;
  timing: TeamCollectionTiming;
  buildings: TeamCollectionBuildingRow[];
  collectionRate: number;
  collectedAmount: number;
  unpaidAmount: number;
  vacancyLoss: number;
  confirmingAmount: number;
  orphanAmount: number;
  recentDeposits: TeamDeposit[];
};

export type TeamOverdue = {
  billId: string;
  roomId?: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth?: string;
  totalAmount?: number;
  paidAmount?: number;
  unpaidAmount: number;
  daysOverdue: number;
  stage: OverdueStage;
  dueDate: string;
  guard: DunningGuard;
};

export type TeamOverdueWorkspace = {
  scope: TeamBillingScope;
  asOf: string;
  summary: {
    activeUnpaidAmount: number;
    activeCount: number;
    severeCount: number;
    waitingCount: number;
  };
  activeCases: TeamOverdue[];
  waitingCases: TeamOverdue[];
};

export type TeamBillCreationOption = {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantName: string;
  contractId: string;
  monthlyRent: number;
  maintenanceFee: number;
  dueDate: string;
  duplicateBillId?: string;
};

export type TeamBillCreationUnavailableReason =
  | "NO_CONTRACT"
  | "CONTRACT_NOT_ACTIVE"
  | "CONTRACT_NOT_CONFIRMED"
  | "CONTRACT_VALUES_NOT_CONFIRMED"
  | "MONTHLY_RENT_MISSING"
  | "MAINTENANCE_FEE_MISSING"
  | "BILL_AMOUNT_INVALID"
  | "PAYMENT_DAY_MISSING"
  | "PAYMENT_DAY_INVALID";

export type TeamBillCreationUnavailableOption = {
  roomId: string;
  buildingName: string;
  unitId: string;
  tenantName: string;
  contractId?: string;
  reasons: TeamBillCreationUnavailableReason[];
};

export type TeamBillCreationData = {
  scope: TeamBillingScope;
  billingMonth: string;
  account: PaymentAccount;
  options: TeamBillCreationOption[];
  unavailableOptions: TeamBillCreationUnavailableOption[];
};

export type CreateManagerBillRowInput = {
  roomId: string;
  contractId: string;
  monthlyRent: number;
  maintenanceFee: number;
  dueDate: string;
};

export type CreateManagerBillsInput = {
  buildingName: string;
  billingMonth: string;
  account: PaymentAccount;
  rows: CreateManagerBillRowInput[];
};

export type CreateManagerBillsResult = {
  createdCount: number;
  billIds: string[];
  billingMonth: string;
  buildingName: string;
};

export type TeamDunning = {
  billId: string;
  buildingName?: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  unpaidAmount: number;
  dueDate: string;
  daysOverdue: number;
  draftText: string;
  channel: string;
  guard: DunningGuard;
};

export type CreatePaymentReportInput = {
  amount: number;
  depositorName?: string;
};

export type CreateBillPaymentOrderInput = {
  itemKinds: BillLineItemKind[];
};

export type ConfirmBillPaymentInput = {
  orderId: string;
  paymentKey: string;
  amount: number;
};

export type TossConfirmPaymentInput = {
  paymentKey: string;
  orderId: string;
  amount: number;
};

export type TossConfirmPaymentResult = TossConfirmPaymentInput & {
  method?: string;
  approvedAt?: string;
  status?: string;
  raw?: unknown;
};

export type TossPaymentGateway = {
  confirmPayment(input: TossConfirmPaymentInput): Promise<TossConfirmPaymentResult>;
};

export type MatchDepositInput = {
  billId: string;
};

export type SendDunningInput = {
  text: string;
  channel: string;
};

export type CreateComplaintInput = {
  title: string;
  description: string;
  location: string;
  roomId?: string;
  occurredAt?: string;
  availableTimes?: string;
};

export type CreateIntakeSessionInput = {
  roomId?: string;
  sourceChannel?: ComplaintSourceChannel;
};

export type CreateComplaintFromCallInput = {
  callSessionId: string;
  recordingUrl?: string;
  roomId?: string;
  transcriptText?: string;
  assistantSummary?: string;
  attachmentUrls?: string[];
};

export type SendIntakeMessageInput = {
  messageText?: string;
  transcriptText?: string;
  attachmentUrls?: string[];
  inputMode?: IntakeInputMode;
};

export type AddTenantComplaintMessageInput = {
  messageText?: string;
  attachmentUrls?: string[];
};

export type SubmitTenantAiFeedbackInput = {
  target: AiFeedbackTarget;
  reason: string;
  requestedAction?: string;
  attachmentUrls?: string[];
};

export type ReviewTenantAiFeedbackInput = {
  managerReviewNote: string;
  correctedSummary?: string;
  correctedCategory?: string;
  correctedDetailCategory?: string;
  correctedPriority?: 1 | 2 | 3 | 4;
  correctedResponsibilityHint?: AiAnalysis["responsibilityHint"];
  ticketStatus?: TicketStatus;
};

export type ConfirmTenantCompletionInput = {
  note?: string;
};

export type ReopenTenantComplaintInput = {
  messageText?: string;
  attachmentUrls?: string[];
};

export type AddVendorRepairMessageInput = {
  messageText?: string;
  attachmentUrls?: string[];
};

export type SaveAttachmentInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  category: AttachmentCategory;
};

export type SaveContractDocumentUploadInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

export type SaveFloorPlanDraftInput = {
  roomId?: string;
  sourceAttachmentId?: string;
  sourceImageUrl?: string;
  status?: FloorPlanStatus;
  pixelToMmRatio?: number;
  walls?: FloorPlanWall[];
  hiddenWallIds?: string[];
  furnitures?: unknown[];
  room3d?: Record<string, unknown>;
  extractionMeta?: FloorPlanExtractionMeta;
  openings?: FloorPlanCandidate[];
  fixtures?: FloorPlanCandidate[];
};

export type SaveRoomWallsInput = {
  pixelToMmRatio?: number;
  walls?: FloorPlanWall[];
};

export type CreateRoomInput = {
  buildingName?: string;
  roomNo?: string;
  address?: string;
  roomData?: SaveRoomWallsInput;
};

export type FinalizeIntakeInput = {
  confirmedTitle?: string;
  confirmedSummary?: string;
  confirmedLocation?: string;
  confirmedCategory?: IntakeDraft["category"];
  confirmedDetailCategory?: string;
  confirmedPriority?: IntakeDraft["priority"];
  confirmedResponsibilityHint?: IntakeDraft["responsibilityHint"];
  occurredAt?: string;
  availableTimes?: string;
  duplicateResolution?: "CREATE_NEW" | "ATTACH_TO_EXISTING";
  existingTicketId?: string;
};

export type AssignVendorInput = {
  vendorId: string;
  requestNote: string;
};

export type ApproveRepairEstimateInput = {
  costBearer: RepairCostBearer;
  note?: string;
};

export type SubmitEstimateInput = {
  estimateAmount: number;
  estimateDescription: string;
};

export type ScheduleRepairInput = {
  scheduledAt: string;
};

export type ReportCompletionInput = {
  completionNote: string;
  completionPhotoUrls?: string[];
};
