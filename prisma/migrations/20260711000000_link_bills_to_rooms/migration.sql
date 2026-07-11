ALTER TABLE "Bill" ADD COLUMN "roomId" TEXT;

CREATE INDEX "Bill_roomId_billingMonth_idx" ON "Bill"("roomId", "billingMonth");

ALTER TABLE "Bill"
ADD CONSTRAINT "Bill_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
