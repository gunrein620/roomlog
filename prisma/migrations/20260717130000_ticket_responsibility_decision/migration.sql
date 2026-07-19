ALTER TABLE "Ticket"
  ADD COLUMN "responsibilityDecidedById" TEXT,
  ADD COLUMN "responsibilityDecidedAt" TIMESTAMP(3),
  ADD COLUMN "responsibilityDecisionNote" TEXT;
