CREATE TABLE "ManagerTicketRead" (
    "managerId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerTicketRead_pkey" PRIMARY KEY ("managerId", "ticketId")
);

CREATE INDEX "ManagerTicketRead_managerId_readAt_idx"
ON "ManagerTicketRead"("managerId", "readAt");

ALTER TABLE "ManagerTicketRead"
ADD CONSTRAINT "ManagerTicketRead_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "UserAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerTicketRead"
ADD CONSTRAINT "ManagerTicketRead_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
