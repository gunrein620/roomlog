import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type VendorAccountLink,
  type VendorProfile
} from "@prisma/client";
import type {
  VendorAccountLinkRecord,
  VendorAccountView,
  VendorCatalogRecord
} from "@roomlog/types";
import {
  RESCENE_ACTIVATION_ID_PREFIX,
  VendorActivationRepositoryError,
  type ResceneVendorActivationIssuePersistenceInput,
  type VendorAccountResolver,
  type VendorActivationRecord,
  type VendorActivationRepository,
  type VendorActivationRepositoryErrorCode
} from "./vendor-activation.repository";

type ClaimResult = {
  link: VendorAccountLinkRecord;
  vendor: VendorCatalogRecord;
};

type VendorActivationWithVendor = Prisma.VendorActivationGetPayload<{
  include: { vendor: true };
}>;

function mapActivation(row: VendorActivationWithVendor): VendorActivationRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    keyHash: row.keyHash,
    status: row.status,
    expiresAt: row.expiresAt,
    claimedByUserId: row.claimedByUserId ?? undefined,
    claimedAt: row.claimedAt ?? undefined,
    createdAt: row.createdAt,
    vendor: mapVendor(row.vendor)
  };
}

function mapLink(row: VendorAccountLink): VendorAccountLinkRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    linkedAt: row.linkedAt.toISOString()
  };
}

function mapVendor(row: VendorProfile): VendorCatalogRecord {
  return {
    id: row.id,
    businessName: row.businessName,
    contactPerson: row.contactPerson,
    phone: row.phone,
    businessNumber: row.businessNumber ?? undefined,
    trades: row.trades,
    serviceAreas: row.serviceAreas,
    verificationStatus: row.verificationStatus,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function repositoryError(
  code: VendorActivationRepositoryErrorCode,
  message: string
) {
  return new VendorActivationRepositoryError(code, message);
}

function unavailableVendorError() {
  return repositoryError(
    "UNAVAILABLE_VENDOR",
    "Vendor catalog is unavailable for activation."
  );
}

async function lockAvailableVendor(
  tx: Prisma.TransactionClient,
  vendorId: string
) {
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "VendorProfile"
    WHERE "id" = ${vendorId}
    FOR NO KEY UPDATE
  `);
  if (lockedRows.length !== 1) throw unavailableVendorError();

  const vendor = await tx.vendorProfile.findUnique({ where: { id: vendorId } });
  if (
    !vendor ||
    !vendor.isActive ||
    vendor.verificationStatus === "REJECTED"
  ) {
    throw unavailableVendorError();
  }

  return vendor;
}

function isUniqueConflict(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class PrismaVendorActivationRepository
  implements VendorActivationRepository, VendorAccountResolver
{
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    this.prisma = new PrismaClient({ adapter });
  }

  async getByKeyHash(keyHash: string) {
    const activation = await this.prisma.vendorActivation.findUnique({
      where: { keyHash },
      include: { vendor: true }
    });

    return activation ? mapActivation(activation) : undefined;
  }

  async listRescene() {
    const activations = await this.prisma.vendorActivation.findMany({
      where: { id: { startsWith: RESCENE_ACTIVATION_ID_PREFIX } },
      include: { vendor: true },
      orderBy: { createdAt: "desc" }
    });
    return activations.map(mapActivation);
  }

  async issue(input: ResceneVendorActivationIssuePersistenceInput) {
    return await this.prisma.$transaction(async (tx) => {
      await tx.vendorProfile.create({
        data: {
          id: input.vendorId,
          businessName: input.vendor.businessName,
          contactPerson: input.vendor.contactPerson,
          phone: input.vendor.phone,
          serviceArea: input.vendor.serviceAreas[0],
          serviceAreas: input.vendor.serviceAreas,
          trades: input.vendor.trades,
          verificationStatus: "PENDING",
          isActive: true,
          createdAt: input.now
        }
      });
      const activation = await tx.vendorActivation.create({
        data: {
          id: input.activationId,
          vendorId: input.vendorId,
          keyHash: input.keyHash,
          status: "ISSUED",
          expiresAt: input.expiresAt,
          createdAt: input.now
        },
        include: { vendor: true }
      });
      return mapActivation(activation);
    });
  }

  async getActiveAccountLink(userId: string) {
    const link = await this.prisma.vendorAccountLink.findFirst({
      where: { userId, status: "ACTIVE" }
    });

    return link ? mapLink(link) : undefined;
  }

  async resolveActiveVendorId(userId: string) {
    const link = await this.getActiveAccountLink(userId);
    return link?.vendorId;
  }

  async resolveActiveVendorAccount(
    userId: string
  ): Promise<VendorAccountView | undefined> {
    const link = await this.prisma.vendorAccountLink.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { vendor: true }
    });

    if (!link) return undefined;

    return {
      vendor: mapVendor(link.vendor),
      accountStatus: "LINKED",
      role: link.role
    };
  }

  async claim(input: {
    activationId: string;
    userId: string;
    now: Date;
  }): Promise<ClaimResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const activationReference = await tx.vendorActivation.findUnique({
          where: { id: input.activationId },
          select: { vendorId: true }
        });

        if (!activationReference) {
          throw repositoryError("INVALID_KEY", "Vendor activation key is invalid.");
        }

        const vendor = await lockAvailableVendor(
          tx,
          activationReference.vendorId
        );
        const activation = await tx.vendorActivation.findUnique({
          where: { id: input.activationId }
        });
        if (!activation || activation.vendorId !== activationReference.vendorId) {
          throw repositoryError("INVALID_KEY", "Vendor activation key is invalid.");
        }

        const [activeUserLink, activeVendorOwner] = await Promise.all([
          tx.vendorAccountLink.findFirst({
            where: { userId: input.userId, status: "ACTIVE" }
          }),
          tx.vendorAccountLink.findFirst({
            where: {
              vendorId: activation.vendorId,
              role: "OWNER",
              status: "ACTIVE"
            }
          })
        ]);

        if (activation.status === "EXPIRED") {
          throw repositoryError("EXPIRED_KEY", "Vendor activation key has expired.");
        }

        if (activation.status !== "ISSUED") {
          throw repositoryError(
            "ALREADY_CLAIMED",
            "Vendor activation key is no longer claimable."
          );
        }

        if (activation.expiresAt.getTime() <= input.now.getTime()) {
          throw repositoryError("EXPIRED_KEY", "Vendor activation key has expired.");
        }

        if (activeUserLink) {
          throw repositoryError(
            activeUserLink.vendorId === activation.vendorId
              ? "ALREADY_CLAIMED"
              : "ACCOUNT_ALREADY_LINKED",
            "This account already has an active vendor link."
          );
        }

        if (activeVendorOwner) {
          throw repositoryError(
            "ALREADY_CLAIMED",
            "This vendor already has an active owner."
          );
        }

        if (vendor.verificationStatus !== "PENDING") {
          throw unavailableVendorError();
        }

        const link = await tx.vendorAccountLink.create({
          data: {
            id: randomUUID(),
            vendorId: activation.vendorId,
            userId: input.userId,
            role: "OWNER",
            status: "ACTIVE",
            linkedAt: input.now
          }
        });

        const claimed = await tx.vendorActivation.updateMany({
          where: { id: activation.id, status: "ISSUED" },
          data: {
            status: "CLAIMED",
            claimedByUserId: input.userId,
            claimedAt: input.now
          }
        });

        if (claimed.count !== 1) {
          throw repositoryError(
            "ALREADY_CLAIMED",
            "Vendor activation key was claimed concurrently."
          );
        }

        const verifiedVendor = await tx.vendorProfile.update({
          where: { id: vendor.id },
          data: { verificationStatus: "VERIFIED" }
        });

        return {
          link: mapLink(link),
          vendor: mapVendor(verifiedVendor)
        };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw repositoryError(
          "ACCOUNT_ALREADY_LINKED",
          "This account or vendor already has an active link."
        );
      }
      throw error;
    }
  }

  async close() {
    await this.prisma.$disconnect();
  }
}
