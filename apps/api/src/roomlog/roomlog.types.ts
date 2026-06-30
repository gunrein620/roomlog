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

export type AttachmentCategory =
  | "COMPLAINT_PHOTO"
  | "ADDITIONAL_PHOTO"
  | "WORK_PHOTO"
  | "COMPLETION_PHOTO"
  | "INTAKE_PHOTO";

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
