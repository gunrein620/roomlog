CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

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

CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");

CREATE INDEX "VendorProfile_createdByManagerId_idx" ON "VendorProfile"("createdByManagerId");

CREATE UNIQUE INDEX "VendorInvite_inviteToken_key" ON "VendorInvite"("inviteToken");

CREATE INDEX "VendorInvite_invitedByManagerId_status_idx" ON "VendorInvite"("invitedByManagerId", "status");
