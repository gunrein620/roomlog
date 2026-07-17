ALTER TABLE "TradeListing" ADD COLUMN "roomId" TEXT;

CREATE INDEX "TradeListing_roomId_idx" ON "TradeListing"("roomId");

ALTER TABLE "TradeListing"
  ADD CONSTRAINT "TradeListing_roomId_fkey"
  FOREIGN KEY ("roomId")
  REFERENCES "Room"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
