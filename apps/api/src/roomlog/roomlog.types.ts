export type UserRole = "TENANT" | "LANDLORD" | "VENDOR";

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
};

export type Complaint = {
  id: string;
  tenantId: string;
  roomId: string;
  ticketId: string;
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
  priority: number;
  responsibilityHint: "임대인 책임 가능성" | "임차인 책임 가능성" | "판단 어려움";
  confidenceScore: number;
  recommendedAction: string;
};

export type Ticket = {
  id: string;
  complaintId: string;
  tenantId: string;
  roomId: string;
  assignedVendorId?: string;
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
  senderRole: UserRole;
  messageText: string;
  createdAt: string;
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

export type AssignVendorInput = {
  vendorId: string;
  requestNote: string;
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
