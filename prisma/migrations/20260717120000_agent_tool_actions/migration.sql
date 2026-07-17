CREATE TYPE "AgentToolActionStatus" AS ENUM (
  'PENDING',
  'EXECUTING',
  'EXECUTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED'
);

CREATE TABLE "AgentToolAction" (
  "id" TEXT NOT NULL,
  "activeKey" TEXT,
  "principalUserId" TEXT NOT NULL,
  "principalRole" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "executorName" TEXT,
  "toolCallId" TEXT NOT NULL,
  "arguments" JSONB NOT NULL,
  "commandPayload" JSONB,
  "confirmationCard" JSONB,
  "result" JSONB,
  "failureSummary" TEXT,
  "status" "AgentToolActionStatus" NOT NULL,
  "initiatedBy" "RepairPaymentInitiator" NOT NULL DEFAULT 'AI_AGENT',
  "expiresAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentToolAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentToolAction_activeKey_key"
  ON "AgentToolAction"("activeKey");
CREATE UNIQUE INDEX "AgentToolAction_principalUserId_principalRole_toolCallId_key"
  ON "AgentToolAction"("principalUserId", "principalRole", "toolCallId");
CREATE INDEX "AgentToolAction_principalUserId_status_createdAt_idx"
  ON "AgentToolAction"("principalUserId", "status", "createdAt");

ALTER TABLE "AgentToolAction"
  ADD CONSTRAINT "AgentToolAction_principalUserId_fkey"
  FOREIGN KEY ("principalUserId") REFERENCES "UserAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
