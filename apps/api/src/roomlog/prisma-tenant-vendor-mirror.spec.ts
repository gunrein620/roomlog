import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaDomainEventRepository } from "../domain-events/prisma-domain-event.repository";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { PrismaTenantVendorConnectionRepository } from "./prisma-tenant-vendor-connection.repository";
import { RoomlogService } from "./roomlog.service";
import { RoomlogTenantVendorConnectionDomain } from "./services/roomlog-tenant-vendor-connection.domain";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

describe("tenant vendor workflow legacy mirror", () => {
  it(
    "preserves tenantInitiated through confirm, flush, DB reload, and manager presentation",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = Date.now().toString(36);
      const managerId = `manager_tenant_mirror_${suffix}`;
      const tenantId = `tenant_mirror_${suffix}`;
      const vendorUserId = `vendor_user_mirror_${suffix}`;
      const vendorId = `vendor_mirror_${suffix}`;
      const roomId = `room_tenant_mirror_${suffix}`;
      const complaintId = `complaint_tenant_mirror_${suffix}`;
      const ticketId = `ticket_tenant_mirror_${suffix}`;

      await prisma.userAccount.createMany({
        data: [
          {
            id: managerId,
            email: `${managerId}@roomlog.test`,
            passwordHash: "test",
            name: "자가수리 관리자",
            role: "LANDLORD"
          },
          {
            id: tenantId,
            email: `${tenantId}@roomlog.test`,
            passwordHash: "test",
            name: "자가수리 세입자",
            role: "TENANT"
          },
          {
            id: vendorUserId,
            email: `${vendorUserId}@roomlog.test`,
            passwordHash: "test",
            name: "자가수리 업체",
            role: "VENDOR"
          }
        ]
      });
      await prisma.room.create({
        data: {
          id: roomId,
          buildingName: `자가수리 빌라 ${suffix}`,
          roomNo: "801호",
          address: "서울시 성동구 자가수리로 8",
          landlordId: managerId
        }
      });
      await prisma.tenantRoom.create({ data: { tenantId, roomId } });
      await prisma.vendorProfile.create({
        data: {
          id: vendorId,
          businessName: `자가수리 설비 ${suffix}`,
          contactPerson: "이기사",
          phone: `02-${suffix.slice(-4).padStart(4, "0")}-8001`,
          serviceArea: "성동구",
          trades: ["PLUMBING"],
          serviceAreas: ["성동구"],
          verificationStatus: "VERIFIED",
          isActive: true
        }
      });
      await prisma.vendorAccountLink.create({
        data: {
          id: `vendor_link_mirror_${suffix}`,
          vendorId,
          userId: vendorUserId
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
          description: "싱크대 하부에서 물이 떨어집니다.",
          location: "주방",
          status: "SUBMITTED"
        }
      });
      await prisma.ticket.create({
        data: {
          id: ticketId,
          complaintId,
          tenantId,
          roomId,
          sourceChannel: "DIRECT_FORM",
          category: "배관",
          priority: 2,
          status: "RECEIVED",
          responsibilityHint: "임차인 책임 가능성",
          aiSummary: "싱크대 하부 누수"
        }
      });
      await prisma.aiAnalysis.create({
        data: {
          ticketId,
          summary: "싱크대 하부 누수",
          category: "배관",
          priority: 2,
          responsibilityHint: "임차인 책임 가능성",
          confidenceScore: 0.9,
          reasons: ["임차인 사용 중 파손 가능성"],
          recommendedAction: "세입자 협력업체 연결"
        }
      });

      const events = new PrismaDomainEventRepository(databaseUrl!);
      const repository = new PrismaTenantVendorConnectionRepository(
        databaseUrl!,
        events,
        "tenant-mirror-idempotency-secret"
      );
      const projector = new PrismaStoreProjector(databaseUrl!);
      const loadedStore = (await projector.load())!;
      const fixtureStore = JSON.parse(JSON.stringify(loadedStore)) as typeof loadedStore;
      for (const [key, value] of Object.entries(fixtureStore)) {
        if (Array.isArray(value)) {
          (fixtureStore as any)[key] = [];
        }
      }
      fixtureStore.users = loadedStore.users.filter((user) =>
        [managerId, tenantId, vendorUserId].includes(user.id)
      );
      fixtureStore.rooms = loadedStore.rooms.filter((room) => room.id === roomId);
      fixtureStore.tenantRooms = { [tenantId]: roomId };
      fixtureStore.vendors = loadedStore.vendors.filter((vendor) => vendor.id === vendorId);
      fixtureStore.complaints = loadedStore.complaints.filter(
        (complaint) => complaint.id === complaintId
      );
      fixtureStore.tickets = loadedStore.tickets.filter((ticket) => ticket.id === ticketId);
      fixtureStore.analyses = { [ticketId]: loadedStore.analyses[ticketId] };
      const service = new RoomlogService({
        seedDemoData: false,
        initialStore: fixtureStore,
        storeProjector: projector
      });
      const domain = new RoomlogTenantVendorConnectionDomain(
        repository,
        { tokenSecret: "tenant-mirror-token-secret" },
        service
      );

      try {
        const search = await domain.search(tenantId, complaintId);
        const selectedVendor = search.vendors.find(
          (vendor) => vendor.businessName === `자가수리 설비 ${suffix}`
        );
        assert.ok(selectedVendor);
        const preview = await domain.prepare(tenantId, complaintId, {
          vendorId: selectedVendor.vendorId
        });
        const confirmed = await domain.confirm(tenantId, complaintId, {
          previewId: preview.previewId,
          idempotencyKey: `tenant-mirror-${suffix}`,
          requestNote: "싱크대 배관을 확인해주세요."
        });
        await service.flushPersistence();

        const repair = await prisma.repairRequest.findUniqueOrThrow({
          where: { id: confirmed.request.id }
        });
        assert.equal(repair.tenantInitiated, true);
        const reloaded = await projector.load();
        assert.equal(
          reloaded?.repairs.find((item) => item.id === confirmed.request.id)
            ?.tenantInitiated,
          true
        );
        const managerTickets = await service.listCurrentTicketsForManager(managerId);
        assert.deepEqual(
          managerTickets.find((ticket) => ticket.id === ticketId)?.selfRepair,
          { active: true, statusLabel: "견적 요청" }
        );
      } finally {
        await service.onModuleDestroy();
        await repository.close();
        await events.close();
        await prisma.domainEventDelivery.deleteMany({
          where: { event: { repair: { ticketId } } }
        });
        await prisma.domainEventOutbox.deleteMany({
          where: { repair: { ticketId } }
        });
        await prisma.ticketMessage.deleteMany({ where: { ticketId } });
        await prisma.repairRequest.deleteMany({ where: { ticketId } });
        await prisma.aiAnalysis.deleteMany({ where: { ticketId } });
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
        await prisma.complaint.deleteMany({ where: { id: complaintId } });
        await prisma.vendorAccountLink.deleteMany({ where: { vendorId } });
        await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        await prisma.tenantRoom.deleteMany({ where: { roomId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
        await prisma.userAccount.deleteMany({
          where: { id: { in: [managerId, tenantId, vendorUserId] } }
        });
        await prisma.$disconnect();
      }
    }
  );
});
