ALTER TABLE "Ticket"
  ADD COLUMN "directHandlingStartedAt" TIMESTAMP(3),
  ADD COLUMN "directHandlingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "directHandlingNote" TEXT;

ALTER TABLE "RepairRequest"
  ADD COLUMN "tenantInitiated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RepairRequest" AS repair
SET "tenantInitiated" = true
WHERE EXISTS (
  SELECT 1
  FROM "DomainEventOutbox" AS event
  WHERE event."repairId" = repair."id"
    AND event."eventKey" = 'vendor-job-assigned:' || repair."id"
    AND event."managerId" IS NULL
);
