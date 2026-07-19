import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaManagerVendorRepository } from "./prisma-manager-vendor.repository";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

describe("PrismaManagerVendorRepository.findJobByTicket", () => {
  it(
    "returns a reduced UNREGISTERED view and preserves the registered view contract",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const repository = new PrismaManagerVendorRepository(databaseUrl!);
      const suffix = Date.now().toString(36);
      const managerId = `usr_mgr_job_${suffix}`;
      const tenantId = `usr_tnt_job_${suffix}`;
      const roomId = `room_job_${suffix}`;
      const vendorId = `ven_job_${suffix}`;
      const complaintId = `cmp_job_${suffix}`;
      const ticketId = `tkt_job_${suffix}`;
      const repairId = `rep_job_${suffix}`;
      const relationId = `mvd_job_${suffix}`;

      try {
        await prisma.userAccount.createMany({
          data: [
            {
              id: managerId,
              email: `manager-job-${suffix}@roomlog.test`,
              passwordHash: "salt:hash",
              name: "잡 조회 관리자",
              role: "LANDLORD"
            },
            {
              id: tenantId,
              email: `tenant-job-${suffix}@roomlog.test`,
              passwordHash: "salt:hash",
              name: "잡 조회 세입자",
              role: "TENANT"
            }
          ]
        });
        await prisma.room.create({
          data: {
            id: roomId,
            buildingName: `잡 조회 빌라 ${suffix}`,
            roomNo: "701",
            address: "서울시 성동구 테스트로 7",
            landlordId: managerId
          }
        });
        await prisma.vendorProfile.create({
          data: {
            id: vendorId,
            businessName: "세입자 연결 설비",
            contactPerson: "김기사",
            phone: "02-700-7000",
            serviceArea: "성동구",
            trades: ["PLUMBING"],
            serviceAreas: ["성동구"],
            verificationStatus: "VERIFIED"
          }
        });
        await prisma.complaint.create({
          data: {
            id: complaintId,
            tenantId,
            roomId,
            ticketId,
            sourceChannel: "DIRECT_FORM",
            title: "싱크대 누수",
            description: "싱크대 하부에서 물이 샙니다.",
            location: "주방",
            status: "VENDOR_ASSIGNED"
          }
        });
        await prisma.ticket.create({
          data: {
            id: ticketId,
            complaintId,
            tenantId,
            roomId,
            assignedVendorId: vendorId,
            sourceChannel: "DIRECT_FORM",
            category: "배관",
            priority: 2,
            status: "VENDOR_ASSIGNED",
            responsibilityHint: "임차인 책임 가능성",
            aiSummary: "싱크대 하부 누수"
          }
        });
        await prisma.repairRequest.create({
          data: {
            id: repairId,
            ticketId,
            vendorId,
            status: "REQUESTED",
            title: "배관 처리 요청",
            description: "누수 부위를 점검해주세요.",
            completionPhotoUrls: []
          }
        });

        const unregistered = await repository.findJobByTicket(managerId, ticketId);
        assert.ok(unregistered);
        assert.equal(unregistered.partnership, "UNREGISTERED");
        if (unregistered.partnership !== "UNREGISTERED") {
          assert.fail("expected an unregistered tenant-connected vendor");
        }
        assert.deepEqual(Object.keys(unregistered.vendor).sort(), ["catalog", "vendorId"]);
        assert.equal(unregistered.vendor.vendorId, vendorId);
        assert.equal(unregistered.vendor.catalog.businessName, "세입자 연결 설비");
        assert.equal(unregistered.job.repairId, repairId);

        await prisma.managerVendor.create({
          data: { id: relationId, managerId, vendorId, status: "ACTIVE" }
        });

        const registered = await repository.findJobByTicket(managerId, ticketId);
        assert.ok(registered);
        assert.equal(registered.partnership, "REGISTERED");
        if (registered.partnership !== "REGISTERED") {
          assert.fail("expected a registered manager vendor");
        }
        assert.equal(registered.vendor.id, relationId);
        assert.equal(registered.vendor.managerId, managerId);
        assert.equal(registered.vendor.catalog.id, vendorId);
        assert.equal(registered.job.repairId, repairId);
      } finally {
        await prisma.managerVendor.deleteMany({ where: { managerId, vendorId } });
        await prisma.repairRequest.deleteMany({ where: { ticketId } });
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
        await prisma.complaint.deleteMany({ where: { id: complaintId } });
        await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
        await prisma.userAccount.deleteMany({
          where: { id: { in: [managerId, tenantId] } }
        });
        await repository.close();
        await prisma.$disconnect();
      }
    }
  );
});

describe("PrismaManagerVendorRepository.createManual", () => {
  it("exposes a durable manager-private creation operation", () => {
    const repository = new PrismaManagerVendorRepository(
      "postgresql://roomlog:roomlog@localhost:5433/roomlog",
    );
    const candidate = repository as unknown as { createManual?: unknown };

    assert.equal(typeof candidate.createManual, "function");
  });

  it(
    "persists the vendor for its manager without leaking it to another manager",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }),
      });
      const repository = new PrismaManagerVendorRepository(databaseUrl!);
      const suffix = Date.now().toString(36);
      const managerAId = `usr_mgr_manual_a_${suffix}`;
      const managerBId = `usr_mgr_manual_b_${suffix}`;
      let vendorId: string | undefined;

      try {
        await prisma.userAccount.createMany({
          data: [
            {
              id: managerAId,
              email: `manager-manual-a-${suffix}@roomlog.test`,
              passwordHash: "salt:hash",
              name: "수동 업체 관리자 A",
              role: "LANDLORD",
            },
            {
              id: managerBId,
              email: `manager-manual-b-${suffix}@roomlog.test`,
              passwordHash: "salt:hash",
              name: "수동 업체 관리자 B",
              role: "LANDLORD",
            },
          ],
        });

        const candidate = repository as unknown as {
          createManual(
            managerId: string,
            input: { businessName: string; phone: string; accountNumber: string },
          ): Promise<{
            vendorId: string;
            managerId: string;
            settlementAccountNumber?: string;
            catalog: { businessName: string; phone: string };
          }>;
        };
        const created = await candidate.createManual(managerAId, {
          businessName: "새봄 설비",
          phone: "01012345678",
          accountNumber: "1234567890",
        });
        vendorId = created.vendorId;

        assert.equal(created.managerId, managerAId);
        assert.equal(created.catalog.businessName, "새봄 설비");
        assert.equal(created.catalog.phone, "01012345678");
        assert.equal(created.settlementAccountNumber, "1234567890");
        assert.equal((await repository.list(managerAId, {})).length, 1);
        assert.equal((await repository.list(managerBId, {})).length, 0);
        assert.equal(await repository.getDetail(managerBId, created.vendorId), null);
        assert.equal(
          (await repository.searchCatalog(managerBId, {}))
            .some((row) => row.catalog.id === created.vendorId),
          false,
        );

        await assert.rejects(
          () => candidate.createManual(managerAId, {
            businessName: "중복 설비",
            phone: "01012345678",
            accountNumber: "9999999999",
          }),
          (error: unknown) =>
            error instanceof Error
            && "code" in error
            && error.code === "DUPLICATE_VENDOR",
        );
      } finally {
        if (vendorId) {
          await prisma.managerVendor.deleteMany({ where: { managerId: managerAId, vendorId } });
          await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        }
        await prisma.userAccount.deleteMany({ where: { id: { in: [managerAId, managerBId] } } });
        await repository.close();
        await prisma.$disconnect();
      }
    },
  );
});
