CREATE TYPE "MessagingThreadContext" AS ENUM ('DEFECT', 'PAYMENT', 'CONTRACT', 'MOVEOUT', 'ANNOUNCEMENT', 'GENERAL');

CREATE TYPE "MessagingMessageSender" AS ENUM ('TENANT', 'MANAGER');

CREATE TYPE "MessagingMessageKind" AS ENUM ('TEXT', 'PHOTO_REQUEST', 'PHOTO_RESPONSE');

CREATE TYPE "MessagingAnnouncementCategory" AS ENUM ('URGENT', 'LIFE', 'EVENT');

CREATE TYPE "MessagingAnnouncementScope" AS ENUM ('ALL', 'BUILDING', 'UNIT');

CREATE TYPE "MessagingAnnouncementReadState" AS ENUM ('UNREAD', 'READ', 'CONFIRMED');

CREATE TYPE "MessagingAnnouncementDraftStatus" AS ENUM ('DRAFT', 'SENT');

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

CREATE INDEX "MessagingThread_tenantId_updatedAt_idx" ON "MessagingThread"("tenantId", "updatedAt");

CREATE INDEX "MessagingThread_roomId_context_idx" ON "MessagingThread"("roomId", "context");

CREATE INDEX "MessagingMessage_threadId_createdAt_idx" ON "MessagingMessage"("threadId", "createdAt");

CREATE INDEX "MessagingAnnouncementDraft_createdByManagerId_updatedAt_idx" ON "MessagingAnnouncementDraft"("createdByManagerId", "updatedAt");

CREATE INDEX "MessagingAnnouncement_senderId_sentAt_idx" ON "MessagingAnnouncement"("senderId", "sentAt");

CREATE INDEX "MessagingAnnouncementDelivery_tenantId_state_idx" ON "MessagingAnnouncementDelivery"("tenantId", "state");

CREATE INDEX "MessagingAnnouncementDelivery_announcementId_state_idx" ON "MessagingAnnouncementDelivery"("announcementId", "state");

ALTER TABLE "MessagingMessage"
ADD CONSTRAINT "MessagingMessage_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingAnnouncementDelivery"
ADD CONSTRAINT "MessagingAnnouncementDelivery_announcementId_fkey"
FOREIGN KEY ("announcementId") REFERENCES "MessagingAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
