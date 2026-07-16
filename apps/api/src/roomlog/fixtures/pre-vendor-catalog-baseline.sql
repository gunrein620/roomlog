-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SEEKER', 'TENANT', 'LANDLORD', 'VENDOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('GOOGLE', 'KAKAO', 'NAVER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ComplaintSourceChannel" AS ENUM ('DIRECT_FORM', 'REALTIME_CHAT', 'VOICE_CHAT', 'CALLBOT');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'REVIEWING', 'ADDITIONAL_INFO_REQUESTED', 'VENDOR_ASSIGNED', 'REPAIR_IN_PROGRESS', 'COMPLETED', 'REOPENED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'ADDITIONAL_INFO_REQUESTED', 'VENDOR_ASSIGNMENT_PENDING', 'VENDOR_ASSIGNED', 'ESTIMATE_REVIEW', 'REPAIR_IN_PROGRESS', 'COMPLETION_REPORTED', 'COMPLETED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'ESTIMATE_SUBMITTED', 'ESTIMATE_APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETION_REPORTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairCostBearer" AS ENUM ('LANDLORD', 'TENANT', 'PENDING');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('REPAIR', 'MAINTENANCE', 'COMMON', 'OTHER');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'AMENDED', 'VOID');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'SENT', 'CONFIRMING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CORRECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentReportStatus" AS ENUM ('CONFIRMING', 'MATCHED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "BillLineItemKind" AS ENUM ('RENT', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "BillPaymentTransactionStatus" AS ENUM ('READY', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "DepositMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'ORPHAN', 'MISMATCH');

-- CreateEnum
CREATE TYPE "OverdueStage" AS ENUM ('MINOR', 'WARNING', 'SEVERE');

-- CreateEnum
CREATE TYPE "CostAttributionScope" AS ENUM ('UNIT', 'BUILDING');

-- CreateEnum
CREATE TYPE "DisclosureState" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RepairPaymentState" AS ENUM ('ALREADY_PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "CostReviewReason" AS ENUM ('OCR_LOW_CONFIDENCE', 'CLASSIFICATION_UNCLEAR', 'UNIT_UNMATCHED');

-- CreateEnum
CREATE TYPE "ReceiptSource" AS ENUM ('CAMERA', 'FILE', 'ONLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContractLifecycle" AS ENUM ('UNREGISTERED', 'ANALYZING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContractReview" AS ENUM ('PENDING', 'INFO_REQUESTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ContractDeletionState" AS ENUM ('NONE', 'REQUESTED', 'COMPLETED', 'LIMITED', 'DENIED');

-- CreateEnum
CREATE TYPE "ContractValueSource" AS ENUM ('CONFIRMED', 'MANUAL', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ContractDocumentOrigin" AS ENUM ('TENANT_UPLOAD', 'MANAGER_UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('COMPLAINT_PHOTO', 'ADDITIONAL_PHOTO', 'WORK_PHOTO', 'COMPLETION_PHOTO', 'INTAKE_PHOTO', 'FLOOR_PLAN_SOURCE');

-- CreateEnum
CREATE TYPE "FloorPlanStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageSenderRole" AS ENUM ('TENANT', 'LANDLORD', 'VENDOR', 'AI_ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessagingThreadContext" AS ENUM ('DEFECT', 'PAYMENT', 'CONTRACT', 'MOVEOUT', 'ANNOUNCEMENT', 'GENERAL');

-- CreateEnum
CREATE TYPE "MessagingMessageSender" AS ENUM ('TENANT', 'MANAGER');

-- CreateEnum
CREATE TYPE "MessagingMessageKind" AS ENUM ('TEXT', 'PHOTO_REQUEST', 'PHOTO_RESPONSE');

-- CreateEnum
CREATE TYPE "MessagingAnnouncementCategory" AS ENUM ('URGENT', 'LIFE', 'EVENT');

-- CreateEnum
CREATE TYPE "MessagingAnnouncementScope" AS ENUM ('ALL', 'BUILDING', 'UNIT');

-- CreateEnum
CREATE TYPE "MessagingAnnouncementReadState" AS ENUM ('UNREAD', 'READ', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "MessagingAnnouncementDraftStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "ManagerReportPeriod" AS ENUM ('WEEK', 'MONTH', 'QUARTER');

-- CreateEnum
CREATE TYPE "ManagerReportStatus" AS ENUM ('DRAFT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ManagerReportSourceKind" AS ENUM ('BILLING', 'COMPLAINT', 'COST', 'UNIT', 'METRIC', 'CONTRACT', 'MOVEOUT', 'MESSAGING');

-- CreateEnum
CREATE TYPE "ManagerReportShareStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ManagerReportAuditAction" AS ENUM ('EXTERNAL_SHARE_CREATED', 'EXTERNAL_SHARE_VIEWED', 'EXTERNAL_SHARE_REVOKED');

-- CreateEnum
CREATE TYPE "MoveoutSettlementStatus" AS ENUM ('ESTIMATE', 'REVIEWING', 'REVIEW_DONE', 'RE_REVIEW');

-- CreateEnum
CREATE TYPE "MoveoutRecordSource" AS ENUM ('MOVEIN_PHOTO', 'DEFECT', 'REPAIR', 'PAYMENT', 'CHAT', 'CONTRACT');

-- CreateEnum
CREATE TYPE "MoveoutWearVerdict" AS ENUM ('AGING_LIKELY', 'DAMAGE_POSSIBLE', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "MoveoutDeductionKind" AS ENUM ('UNPAID', 'REPAIR', 'RESTORATION', 'CLEANING');

-- CreateEnum
CREATE TYPE "MoveoutChecklistCondition" AS ENUM ('NORMAL', 'AGING', 'DAMAGE_CHECK');

-- CreateEnum
CREATE TYPE "MoveoutDisputeStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'ANSWERED', 'CONFIRMED', 'RE_DISPUTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MoveoutWearAdjustmentAction" AS ENUM ('KEEP', 'ADJUST', 'REINFORCE');

-- CreateEnum
CREATE TYPE "IntakeSessionStatus" AS ENUM ('ACTIVE', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntakeInputMode" AS ENUM ('CHAT', 'VOICE', 'PHOTO');

-- CreateEnum
CREATE TYPE "PhotoComparisonStatus" AS ENUM ('NEW_ISSUE_LIKELY', 'EXISTING_ISSUE_LIKELY', 'NEEDS_MORE_PHOTOS', 'DIFFICULT_TO_COMPARE');

-- CreateEnum
CREATE TYPE "AiFeedbackTarget" AS ENUM ('SUMMARY', 'CATEGORY', 'PRIORITY', 'RESPONSIBILITY', 'COMPLETION');

-- CreateEnum
CREATE TYPE "AiFeedbackStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateEnum
CREATE TYPE "SplatAssetStatus" AS ENUM ('PROCESSING', 'UPLOADED', 'REGISTERED', 'FAILED');

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "buildingName" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landlordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomWall" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sourceWallId" TEXT NOT NULL,
    "start" JSONB NOT NULL,
    "end" JSONB NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "rotationRad" DOUBLE PRECISION NOT NULL,
    "position" JSONB NOT NULL,
    "dimensions" JSONB NOT NULL,
    "wallOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomWall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRoom" (
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRoom_pkey" PRIMARY KEY ("tenantId","roomId")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "unitId" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "correctionHistory" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maintenanceFeeId" TEXT,
    "depositConfirmationRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLineItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "BillLineItemKind" NOT NULL DEFAULT 'OTHER',
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReport" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "depositorName" TEXT,
    "status" "PaymentReportStatus" NOT NULL DEFAULT 'CONFIRMING',
    "etaHours" INTEGER NOT NULL DEFAULT 24,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "depositorName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "depositedAt" TIMESTAMP(3) NOT NULL,
    "matchStatus" "DepositMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedBillId" TEXT,
    "guessedUnitId" TEXT,
    "paymentTransactionId" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPaymentTransaction" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "itemKinds" "BillLineItemKind"[],
    "status" "BillPaymentTransactionStatus" NOT NULL DEFAULT 'READY',
    "paymentKey" TEXT,
    "method" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "rawResponse" JSONB,

    CONSTRAINT "BillPaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPaymentAllocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "billLineItemId" TEXT NOT NULL,
    "kind" "BillLineItemKind" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "BillPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceFee" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaintenanceFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceFeeItem" (
    "id" TEXT NOT NULL,
    "maintenanceFeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receiptAvailable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaintenanceFeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "serviceArea" TEXT NOT NULL,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "createdByManagerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvite" (
    "id" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedByManagerId" TEXT NOT NULL,
    "email" TEXT,
    "businessName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "serviceArea" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "signupUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "VendorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvite" (
    "id" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedByManagerId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "email" TEXT,
    "tenantName" TEXT NOT NULL,
    "phone" TEXT,
    "moveInDate" TIMESTAMP(3),
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "signupUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "TenantInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tenantId" TEXT,
    "managerId" TEXT,
    "unitId" TEXT NOT NULL,
    "landlordName" TEXT NOT NULL,
    "lifecycle" "ContractLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "review" "ContractReview" NOT NULL DEFAULT 'PENDING',
    "deletion" "ContractDeletionState" NOT NULL DEFAULT 'NONE',
    "valueSource" "ContractValueSource" NOT NULL DEFAULT 'UNVERIFIED',
    "monthlyRent" INTEGER,
    "maintenanceFee" INTEGER,
    "paymentDay" INTEGER,
    "optionInventory" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "extractionId" TEXT,
    "documentId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByManagerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "origin" "ContractDocumentOrigin" NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractExtraction" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "highlights" TEXT[],
    "items" JSONB NOT NULL,
    "helpNotes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPrivacy" (
    "contractId" TEXT NOT NULL,
    "maskingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "retention" JSONB NOT NULL,
    "forwardingConsent" BOOLEAN NOT NULL DEFAULT false,
    "deletion" "ContractDeletionState" NOT NULL DEFAULT 'NONE',
    "deletionSlaHours" INTEGER,
    "deletable" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPrivacy_pkey" PRIMARY KEY ("contractId")
);

-- CreateTable
CREATE TABLE "ContractInvite" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedByManagerId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "state" TEXT NOT NULL,
    "signupUrl" TEXT NOT NULL,
    "audit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "ContractInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "AttachmentCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "roomId" TEXT,
    "sourceAttachmentId" TEXT,
    "sourceImageUrl" TEXT,
    "status" "FloorPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "pixelToMmRatio" DOUBLE PRECISION NOT NULL,
    "walls" JSONB NOT NULL,
    "hiddenWallIds" TEXT[],
    "furnitures" JSONB NOT NULL,
    "room3d" JSONB NOT NULL,
    "extractionMeta" JSONB,
    "openings" JSONB,
    "fixtures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveInChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "memo" TEXT,
    "guidance" TEXT NOT NULL,
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveInChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FurnitureCatalogItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "priceKrw" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "color" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "depthMm" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "imageUrls" TEXT[],
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FurnitureCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sourceChannel" "ComplaintSourceChannel" NOT NULL DEFAULT 'REALTIME_CHAT',
    "status" "IntakeSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "draft" JSONB NOT NULL,
    "complaintId" TEXT,
    "ticketId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sender" "MessageSenderRole" NOT NULL,
    "messageText" TEXT NOT NULL,
    "transcriptText" TEXT,
    "attachmentUrls" TEXT[],
    "inputMode" "IntakeInputMode" NOT NULL,
    "realtimeEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sourceChannel" "ComplaintSourceChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "availableTimes" TEXT,
    "status" "ComplaintStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "assignedVendorId" TEXT,
    "sourceChannel" "ComplaintSourceChannel" NOT NULL,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "responsibilityHint" TEXT NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysis" (
    "ticketId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detailCategory" TEXT,
    "priority" INTEGER NOT NULL,
    "responsibilityHint" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[],
    "recommendedAction" TEXT NOT NULL,
    "photoAnalysis" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("ticketId")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "target" "AiFeedbackTarget" NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedAction" TEXT,
    "attachmentUrls" TEXT[],
    "status" "AiFeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "managerReviewNote" TEXT,
    "correctedValue" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "RepairStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimateAmount" INTEGER,
    "estimateDescription" TEXT,
    "costBearer" "RepairCostBearer",
    "estimateApprovedAt" TIMESTAMP(3),
    "estimateApprovalNote" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "completionPhotoUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "managerId" TEXT,
    "source" "ReceiptSource" NOT NULL,
    "imageUrl" TEXT,
    "hasEvidence" BOOLEAN NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicateOfId" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "managerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "item" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CostType" NOT NULL,
    "scope" "CostAttributionScope" NOT NULL,
    "unitId" TEXT,
    "status" "CostStatus" NOT NULL DEFAULT 'DRAFT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" "CostReviewReason",
    "disclosure" "DisclosureState",
    "repairPayment" "RepairPaymentState",
    "paymentRef" TEXT,
    "receiptId" TEXT,
    "supersedesId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptOcr" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "costId" TEXT,
    "itemValue" TEXT NOT NULL,
    "itemConfidence" DOUBLE PRECISION NOT NULL,
    "itemNeedsReview" BOOLEAN NOT NULL,
    "dateValue" TEXT NOT NULL,
    "dateConfidence" DOUBLE PRECISION NOT NULL,
    "dateNeedsReview" BOOLEAN NOT NULL,
    "amountValue" INTEGER NOT NULL,
    "amountConfidence" DOUBLE PRECISION NOT NULL,
    "amountNeedsReview" BOOLEAN NOT NULL,
    "unitIdValue" TEXT,
    "unitIdConfidence" DOUBLE PRECISION,
    "unitIdNeedsReview" BOOLEAN,
    "suggestedType" "CostType",
    "typeConfidence" DOUBLE PRECISION,
    "lineItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptOcr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "complaintId" TEXT,
    "repairId" TEXT,
    "senderUserId" TEXT NOT NULL,
    "senderRole" "MessageSenderRole" NOT NULL,
    "messageText" TEXT NOT NULL,
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingThread" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "context" "MessagingThreadContext" NOT NULL,
    "contextRef" TEXT,
    "contextLabel" TEXT,
    "lastMessage" TEXT NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "pendingRequest" BOOLEAN NOT NULL DEFAULT false,
    "archivedNotice" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "sender" "MessagingMessageSender" NOT NULL,
    "kind" "MessagingMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "originalBody" TEXT,
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingAnnouncementDraft" (
    "id" TEXT NOT NULL,
    "category" "MessagingAnnouncementCategory" NOT NULL,
    "scope" "MessagingAnnouncementScope" NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "targetRoomIds" TEXT[],
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "translations" JSONB NOT NULL,
    "confirmRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "MessagingAnnouncementDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByManagerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingAnnouncementDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingAnnouncement" (
    "id" TEXT NOT NULL,
    "draftId" TEXT,
    "category" "MessagingAnnouncementCategory" NOT NULL,
    "scope" "MessagingAnnouncementScope" NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "originalBody" TEXT,
    "sender" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "confirmRequired" BOOLEAN NOT NULL DEFAULT false,
    "safetyCta" TEXT,

    CONSTRAINT "MessagingAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingAnnouncementDelivery" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "preferredLang" TEXT NOT NULL,
    "state" "MessagingAnnouncementReadState" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MessagingAnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReport" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "period" "ManagerReportPeriod" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "ManagerReportStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "recipient" JSONB,
    "disclaimer" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "nextActions" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "linkedFollowUps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ManagerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReportSourceReference" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "sourceKind" "ManagerReportSourceKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "roomId" TEXT,
    "tenantId" TEXT,
    "label" TEXT NOT NULL,
    "drilldownScreenId" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReportSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReportExternalShare" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT true,
    "status" "ManagerReportShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByManagerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ManagerReportExternalShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReportAuditLogEntry" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "shareId" TEXT,
    "action" "ManagerReportAuditAction" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReportAuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "contractId" TEXT,
    "unitId" TEXT NOT NULL,
    "leaseEndDate" TIMESTAMP(3),
    "depositAmount" INTEGER,
    "estimatedRefundMin" INTEGER,
    "estimatedRefundMax" INTEGER,
    "settlementStatus" "MoveoutSettlementStatus" NOT NULL DEFAULT 'ESTIMATE',
    "prepProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "messagingThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutRecord" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "source" "MoveoutRecordSource" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "wearVerdict" "MoveoutWearVerdict",
    "wearNote" TEXT,
    "moveinComparisonAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutChecklistItem" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "condition" "MoveoutChecklistCondition" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutSettlement" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "depositAmount" INTEGER NOT NULL,
    "refundMin" INTEGER NOT NULL,
    "refundMax" INTEGER NOT NULL,
    "status" "MoveoutSettlementStatus" NOT NULL DEFAULT 'ESTIMATE',
    "disclaimer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutDeduction" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "kind" "MoveoutDeductionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "estimatedMin" INTEGER NOT NULL,
    "estimatedMax" INTEGER NOT NULL,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "evidenceNote" TEXT NOT NULL,
    "source" "MoveoutRecordSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutDispute" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "targetItemId" TEXT,
    "targetLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MoveoutDisputeStatus" NOT NULL DEFAULT 'RECEIVED',
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "managerResponse" TEXT,
    "messagingThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoveoutDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutDisputeEvent" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "status" "MoveoutDisputeStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutDisputeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveoutReportAuditEntry" (
    "id" TEXT NOT NULL,
    "moveoutId" TEXT NOT NULL,
    "recordItemId" TEXT NOT NULL,
    "action" "MoveoutWearAdjustmentAction" NOT NULL,
    "fromVerdict" "MoveoutWearVerdict",
    "toVerdict" "MoveoutWearVerdict",
    "evidenceNote" TEXT NOT NULL,
    "tenantNotified" BOOLEAN NOT NULL DEFAULT false,
    "managerName" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoveoutReportAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "MessageSenderRole" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplatAsset" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "listingId" TEXT,
    "floorPlanId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileKind" TEXT NOT NULL DEFAULT 'spz',
    "sizeBytes" INTEGER,
    "videoUrl" TEXT,
    "status" "SplatAssetStatus" NOT NULL DEFAULT 'UPLOADED',
    "transform" JSONB,
    "registrationPairs" JSONB,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplatAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeListing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "tradeType" TEXT NOT NULL,
    "depositManwon" INTEGER NOT NULL DEFAULT 0,
    "monthlyRentManwon" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT NOT NULL,
    "detailAddress" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "floorPlan" JSONB,
    "status" TEXT NOT NULL DEFAULT '노출중',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_phone_key" ON "UserAccount"("phone");

-- CreateIndex
CREATE INDEX "UserAccount_role_status_idx" ON "UserAccount"("role", "status");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerUserId_key" ON "SocialAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "Room_landlordId_idx" ON "Room"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_buildingName_roomNo_key" ON "Room"("buildingName", "roomNo");

-- CreateIndex
CREATE INDEX "RoomWall_roomId_wallOrder_idx" ON "RoomWall"("roomId", "wallOrder");

-- CreateIndex
CREATE INDEX "TenantRoom_roomId_idx" ON "TenantRoom"("roomId");

-- CreateIndex
CREATE INDEX "Bill_unitId_billingMonth_idx" ON "Bill"("unitId", "billingMonth");

-- CreateIndex
CREATE INDEX "Bill_roomId_billingMonth_idx" ON "Bill"("roomId", "billingMonth");

-- CreateIndex
CREATE INDEX "Bill_status_idx" ON "Bill"("status");

-- CreateIndex
CREATE INDEX "BillLineItem_billId_idx" ON "BillLineItem"("billId");

-- CreateIndex
CREATE INDEX "BillLineItem_kind_idx" ON "BillLineItem"("kind");

-- CreateIndex
CREATE INDEX "PaymentReport_billId_idx" ON "PaymentReport"("billId");

-- CreateIndex
CREATE INDEX "PaymentReport_unitId_status_idx" ON "PaymentReport"("unitId", "status");

-- CreateIndex
CREATE INDEX "Deposit_matchStatus_idx" ON "Deposit"("matchStatus");

-- CreateIndex
CREATE INDEX "Deposit_guessedUnitId_idx" ON "Deposit"("guessedUnitId");

-- CreateIndex
CREATE INDEX "Deposit_paymentTransactionId_idx" ON "Deposit"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillPaymentTransaction_orderId_key" ON "BillPaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "BillPaymentTransaction_billId_tenantId_idx" ON "BillPaymentTransaction"("billId", "tenantId");

-- CreateIndex
CREATE INDEX "BillPaymentTransaction_status_idx" ON "BillPaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "BillPaymentAllocation_transactionId_idx" ON "BillPaymentAllocation"("transactionId");

-- CreateIndex
CREATE INDEX "BillPaymentAllocation_billLineItemId_idx" ON "BillPaymentAllocation"("billLineItemId");

-- CreateIndex
CREATE INDEX "MaintenanceFee_unitId_billingMonth_idx" ON "MaintenanceFee"("unitId", "billingMonth");

-- CreateIndex
CREATE INDEX "MaintenanceFeeItem_maintenanceFeeId_idx" ON "MaintenanceFeeItem"("maintenanceFeeId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");

-- CreateIndex
CREATE INDEX "VendorProfile_createdByManagerId_idx" ON "VendorProfile"("createdByManagerId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorInvite_inviteToken_key" ON "VendorInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "VendorInvite_invitedByManagerId_status_idx" ON "VendorInvite"("invitedByManagerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvite_inviteToken_key" ON "TenantInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "TenantInvite_invitedByManagerId_status_idx" ON "TenantInvite"("invitedByManagerId", "status");

-- CreateIndex
CREATE INDEX "TenantInvite_roomId_idx" ON "TenantInvite"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_extractionId_key" ON "Contract"("extractionId");

-- CreateIndex
CREATE INDEX "Contract_roomId_idx" ON "Contract"("roomId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_updatedAt_idx" ON "Contract"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Contract_managerId_review_idx" ON "Contract"("managerId", "review");

-- CreateIndex
CREATE INDEX "Contract_deletion_updatedAt_idx" ON "Contract"("deletion", "updatedAt");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_uploadedAt_idx" ON "ContractDocument"("contractId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ContractDocument_uploadedByUserId_idx" ON "ContractDocument"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractExtraction_contractId_key" ON "ContractExtraction"("contractId");

-- CreateIndex
CREATE INDEX "ContractPrivacy_deletion_idx" ON "ContractPrivacy"("deletion");

-- CreateIndex
CREATE UNIQUE INDEX "ContractInvite_inviteToken_key" ON "ContractInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "ContractInvite_contractId_idx" ON "ContractInvite"("contractId");

-- CreateIndex
CREATE INDEX "ContractInvite_invitedByManagerId_state_idx" ON "ContractInvite"("invitedByManagerId", "state");

-- CreateIndex
CREATE INDEX "ContractInvite_roomId_idx" ON "ContractInvite"("roomId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedBy_category_idx" ON "Attachment"("uploadedBy", "category");

-- CreateIndex
CREATE INDEX "FloorPlan_ownerId_updatedAt_idx" ON "FloorPlan"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "FloorPlan_roomId_idx" ON "FloorPlan"("roomId");

-- CreateIndex
CREATE INDEX "FloorPlan_status_idx" ON "FloorPlan"("status");

-- CreateIndex
CREATE INDEX "MoveInChecklistItem_tenantId_roomId_idx" ON "MoveInChecklistItem"("tenantId", "roomId");

-- CreateIndex
CREATE INDEX "FurnitureCatalogItem_category_idx" ON "FurnitureCatalogItem"("category");

-- CreateIndex
CREATE UNIQUE INDEX "FurnitureCatalogItem_source_sourceProductId_key" ON "FurnitureCatalogItem"("source", "sourceProductId");

-- CreateIndex
CREATE INDEX "IntakeSession_tenantId_updatedAt_idx" ON "IntakeSession"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "IntakeSession_roomId_updatedAt_idx" ON "IntakeSession"("roomId", "updatedAt");

-- CreateIndex
CREATE INDEX "IntakeMessage_sessionId_createdAt_idx" ON "IntakeMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeMessage_realtimeEventId_idx" ON "IntakeMessage"("realtimeEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_ticketId_key" ON "Complaint"("ticketId");

-- CreateIndex
CREATE INDEX "Complaint_tenantId_createdAt_idx" ON "Complaint"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Complaint_roomId_createdAt_idx" ON "Complaint"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_complaintId_key" ON "Ticket"("complaintId");

-- CreateIndex
CREATE INDEX "Ticket_roomId_status_idx" ON "Ticket"("roomId", "status");

-- CreateIndex
CREATE INDEX "Ticket_assignedVendorId_status_idx" ON "Ticket"("assignedVendorId", "status");

-- CreateIndex
CREATE INDEX "Ticket_priority_status_idx" ON "Ticket"("priority", "status");

-- CreateIndex
CREATE INDEX "AiFeedback_ticketId_status_idx" ON "AiFeedback"("ticketId", "status");

-- CreateIndex
CREATE INDEX "AiFeedback_tenantId_createdAt_idx" ON "AiFeedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RepairRequest_vendorId_status_idx" ON "RepairRequest"("vendorId", "status");

-- CreateIndex
CREATE INDEX "RepairRequest_ticketId_status_idx" ON "RepairRequest"("ticketId", "status");

-- CreateIndex
CREATE INDEX "Receipt_uploadedAt_idx" ON "Receipt"("uploadedAt");

-- CreateIndex
CREATE INDEX "Receipt_managerId_idx" ON "Receipt"("managerId");

-- CreateIndex
CREATE INDEX "Receipt_duplicateOfId_idx" ON "Receipt"("duplicateOfId");

-- CreateIndex
CREATE INDEX "Cost_managerId_idx" ON "Cost"("managerId");

-- CreateIndex
CREATE INDEX "Cost_status_date_idx" ON "Cost"("status", "date");

-- CreateIndex
CREATE INDEX "Cost_type_date_idx" ON "Cost"("type", "date");

-- CreateIndex
CREATE INDEX "Cost_receiptId_idx" ON "Cost"("receiptId");

-- CreateIndex
CREATE INDEX "Cost_supersedesId_idx" ON "Cost"("supersedesId");

-- CreateIndex
CREATE INDEX "ReceiptOcr_receiptId_idx" ON "ReceiptOcr"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptOcr_costId_idx" ON "ReceiptOcr"("costId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketMessage_repairId_createdAt_idx" ON "TicketMessage"("repairId", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingThread_tenantId_updatedAt_idx" ON "MessagingThread"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "MessagingThread_roomId_context_idx" ON "MessagingThread"("roomId", "context");

-- CreateIndex
CREATE INDEX "MessagingMessage_threadId_createdAt_idx" ON "MessagingMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingAnnouncementDraft_createdByManagerId_updatedAt_idx" ON "MessagingAnnouncementDraft"("createdByManagerId", "updatedAt");

-- CreateIndex
CREATE INDEX "MessagingAnnouncement_senderId_sentAt_idx" ON "MessagingAnnouncement"("senderId", "sentAt");

-- CreateIndex
CREATE INDEX "MessagingAnnouncementDelivery_tenantId_state_idx" ON "MessagingAnnouncementDelivery"("tenantId", "state");

-- CreateIndex
CREATE INDEX "MessagingAnnouncementDelivery_announcementId_state_idx" ON "MessagingAnnouncementDelivery"("announcementId", "state");

-- CreateIndex
CREATE INDEX "ManagerReport_managerId_snapshotAt_idx" ON "ManagerReport"("managerId", "snapshotAt");

-- CreateIndex
CREATE INDEX "ManagerReport_status_snapshotAt_idx" ON "ManagerReport"("status", "snapshotAt");

-- CreateIndex
CREATE INDEX "ManagerReportSourceReference_reportId_sectionKey_idx" ON "ManagerReportSourceReference"("reportId", "sectionKey");

-- CreateIndex
CREATE INDEX "ManagerReportSourceReference_sourceKind_entityType_entityId_idx" ON "ManagerReportSourceReference"("sourceKind", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ManagerReportSourceReference_roomId_idx" ON "ManagerReportSourceReference"("roomId");

-- CreateIndex
CREATE INDEX "ManagerReportSourceReference_tenantId_idx" ON "ManagerReportSourceReference"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerReportExternalShare_token_key" ON "ManagerReportExternalShare"("token");

-- CreateIndex
CREATE INDEX "ManagerReportExternalShare_reportId_status_idx" ON "ManagerReportExternalShare"("reportId", "status");

-- CreateIndex
CREATE INDEX "ManagerReportExternalShare_createdByManagerId_createdAt_idx" ON "ManagerReportExternalShare"("createdByManagerId", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerReportAuditLogEntry_reportId_createdAt_idx" ON "ManagerReportAuditLogEntry"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerReportAuditLogEntry_shareId_createdAt_idx" ON "ManagerReportAuditLogEntry"("shareId", "createdAt");

-- CreateIndex
CREATE INDEX "MoveoutRequest_tenantId_updatedAt_idx" ON "MoveoutRequest"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "MoveoutRequest_roomId_settlementStatus_idx" ON "MoveoutRequest"("roomId", "settlementStatus");

-- CreateIndex
CREATE INDEX "MoveoutRequest_contractId_idx" ON "MoveoutRequest"("contractId");

-- CreateIndex
CREATE INDEX "MoveoutRecord_moveoutId_source_idx" ON "MoveoutRecord"("moveoutId", "source");

-- CreateIndex
CREATE INDEX "MoveoutChecklistItem_moveoutId_idx" ON "MoveoutChecklistItem"("moveoutId");

-- CreateIndex
CREATE UNIQUE INDEX "MoveoutSettlement_moveoutId_key" ON "MoveoutSettlement"("moveoutId");

-- CreateIndex
CREATE INDEX "MoveoutDeduction_moveoutId_needsConfirmation_idx" ON "MoveoutDeduction"("moveoutId", "needsConfirmation");

-- CreateIndex
CREATE INDEX "MoveoutDispute_moveoutId_status_idx" ON "MoveoutDispute"("moveoutId", "status");

-- CreateIndex
CREATE INDEX "MoveoutDispute_slaBreached_slaDeadline_idx" ON "MoveoutDispute"("slaBreached", "slaDeadline");

-- CreateIndex
CREATE INDEX "MoveoutDisputeEvent_disputeId_createdAt_idx" ON "MoveoutDisputeEvent"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "MoveoutReportAuditEntry_moveoutId_createdAt_idx" ON "MoveoutReportAuditEntry"("moveoutId", "createdAt");

-- CreateIndex
CREATE INDEX "MoveoutReportAuditEntry_managerId_createdAt_idx" ON "MoveoutReportAuditEntry"("managerId", "createdAt");

-- CreateIndex
CREATE INDEX "StatusHistory_ticketId_createdAt_idx" ON "StatusHistory"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SplatAsset_roomId_idx" ON "SplatAsset"("roomId");

-- CreateIndex
CREATE INDEX "SplatAsset_listingId_idx" ON "SplatAsset"("listingId");

-- CreateIndex
CREATE INDEX "SplatAsset_status_idx" ON "SplatAsset"("status");

-- CreateIndex
CREATE INDEX "TradeListing_status_createdAt_idx" ON "TradeListing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeListing_ownerId_idx" ON "TradeListing"("ownerId");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomWall" ADD CONSTRAINT "RoomWall_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoom" ADD CONSTRAINT "TenantRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoom" ADD CONSTRAINT "TenantRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLineItem" ADD CONSTRAINT "BillLineItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReport" ADD CONSTRAINT "PaymentReport_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_matchedBillId_fkey" FOREIGN KEY ("matchedBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "BillPaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPaymentTransaction" ADD CONSTRAINT "BillPaymentTransaction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPaymentAllocation" ADD CONSTRAINT "BillPaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BillPaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPaymentAllocation" ADD CONSTRAINT "BillPaymentAllocation_billLineItemId_fkey" FOREIGN KEY ("billLineItemId") REFERENCES "BillLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceFeeItem" ADD CONSTRAINT "MaintenanceFeeItem_maintenanceFeeId_fkey" FOREIGN KEY ("maintenanceFeeId") REFERENCES "MaintenanceFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractExtraction" ADD CONSTRAINT "ContractExtraction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrivacy" ADD CONSTRAINT "ContractPrivacy_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractInvite" ADD CONSTRAINT "ContractInvite_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveInChecklistItem" ADD CONSTRAINT "MoveInChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveInChecklistItem" ADD CONSTRAINT "MoveInChecklistItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSession" ADD CONSTRAINT "IntakeSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeMessage" ADD CONSTRAINT "IntakeMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysis" ADD CONSTRAINT "AiAnalysis_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptOcr" ADD CONSTRAINT "ReceiptOcr_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptOcr" ADD CONSTRAINT "ReceiptOcr_costId_fkey" FOREIGN KEY ("costId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingAnnouncementDelivery" ADD CONSTRAINT "MessagingAnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "MessagingAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReportSourceReference" ADD CONSTRAINT "ManagerReportSourceReference_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReportExternalShare" ADD CONSTRAINT "ManagerReportExternalShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReportAuditLogEntry" ADD CONSTRAINT "ManagerReportAuditLogEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ManagerReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutRequest" ADD CONSTRAINT "MoveoutRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutRequest" ADD CONSTRAINT "MoveoutRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutRequest" ADD CONSTRAINT "MoveoutRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutRecord" ADD CONSTRAINT "MoveoutRecord_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutChecklistItem" ADD CONSTRAINT "MoveoutChecklistItem_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutSettlement" ADD CONSTRAINT "MoveoutSettlement_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutDeduction" ADD CONSTRAINT "MoveoutDeduction_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutDispute" ADD CONSTRAINT "MoveoutDispute_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutDisputeEvent" ADD CONSTRAINT "MoveoutDisputeEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "MoveoutDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveoutReportAuditEntry" ADD CONSTRAINT "MoveoutReportAuditEntry_moveoutId_fkey" FOREIGN KEY ("moveoutId") REFERENCES "MoveoutRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplatAsset" ADD CONSTRAINT "SplatAsset_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplatAsset" ADD CONSTRAINT "SplatAsset_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "FloorPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
