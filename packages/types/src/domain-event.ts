export type RoomlogDomainEventType =
  | "VENDOR_JOB_ASSIGNED"
  | "VENDOR_ESTIMATE_SUBMITTED"
  | "VENDOR_ESTIMATE_REVISED"
  | "VENDOR_ESTIMATE_APPROVED"
  | "VENDOR_ESTIMATE_REVISION_REQUESTED"
  | "VENDOR_ESTIMATE_REJECTED"
  | "VENDOR_COMPLETION_SUBMITTED"
  | "VENDOR_PAYMENT_REQUEST_CREATED"
  | "VENDOR_COMPLETION_APPROVED"
  | "VENDOR_COMPLETION_REJECTED"
  | "VENDOR_PAYMENT_PENDING_APPROVAL"
  | "VENDOR_PAYMENT_PAID"
  | "VENDOR_PAYMENT_REVERSED"
  | "VENDOR_PAYMENT_CANCELLED"
  | "VENDOR_DIRECT_PAYMENT_VOIDED"
  | "VENDOR_PAYMENT_INSUFFICIENT_CREDIT"
  | "MANAGER_CREDIT_TOPUP_SUCCEEDED"
  | "MANAGER_CREDIT_TOPUP_FAILED";

export interface RoomlogDomainEvent {
  eventKey: string;
  type: RoomlogDomainEventType;
  targetUserIds: string[];
  vendorId?: string;
  managerId?: string;
  repairId?: string;
  paymentRequestId?: string;
  completionDecisionId?: string;
  actorUserId?: string;
  statusCode: string;
  occurredAt: string;
}
