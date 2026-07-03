export type UserRole = "TENANT" | "LANDLORD" | "VENDOR";
export type MessageSenderRole = UserRole | "AI_ASSISTANT" | "SYSTEM";
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
  unitId: string;
  tenantId: string;
  context: MessagingThreadContext;
  contextRef?: string;
  contextLabel?: string;
  lastMessage: string;
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

export type AddMessagingThreadMessageInput = {
  body?: string;
  kind?: MessagingMessageKind;
  attachmentUrls?: string[];
};

export type MessagingAnnouncementTranslation = {
  lang: string;
  langLabel?: string;
  title: string;
  body: string;
  reviewed: boolean;
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
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  extractionId?: string;
  documentId?: string;
  confirmedAt?: string;
  confirmedByManagerId?: string;
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

export type StatusHistory = {
  id: string;
  ticketId: string;
  changedByUserId: string;
  fromStatus?: TicketStatus;
  toStatus: TicketStatus;
  note?: string;
  createdAt: string;
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

export type SaveFloorPlanDraftInput = {
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
