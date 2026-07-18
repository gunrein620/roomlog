import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { PrismaDomainEventRepository } from "../domain-events/prisma-domain-event.repository";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { PrismaVendorWorkflowRepository } from "./prisma-vendor-workflow.repository";
import { RoomlogService } from "./roomlog.service";
import { VendorWorkflowRepositoryError } from "./vendor-workflow.repository";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

async function createFixture(prisma: PrismaClient, suffix: string) {
  const managerId = `manager_direct_${suffix}`;
  const tenantId = `tenant_direct_${suffix}`;
  const vendorUserId = `vendor_user_direct_${suffix}`;
  const vendorId = `vendor_direct_${suffix}`;
  const roomId = `room_direct_${suffix}`;
  const complaintId = `complaint_direct_${suffix}`;
  const ticketId = `ticket_direct_${suffix}`;

  await prisma.userAccount.createMany({
    data: [
      {
        id: managerId,
        email: `${managerId}@roomlog.test`,
        passwordHash: "test",
        name: "직접 처리 관리자",
        role: "LANDLORD"
      },
      {
        id: tenantId,
        email: `${tenantId}@roomlog.test`,
        passwordHash: "test",
        name: "직접 처리 세입자",
        role: "TENANT"
      },
      {
        id: vendorUserId,
        email: `${vendorUserId}@roomlog.test`,
        passwordHash: "test",
        name: "직접 처리 업체",
        role: "VENDOR"
      }
    ]
  });
  await prisma.room.create({
    data: {
      id: roomId,
      buildingName: `직접 처리 빌라 ${suffix}`,
      roomNo: "701호",
      address: "서울시 성동구 테스트로 7",
      landlordId: managerId
    }
  });
  await prisma.tenantRoom.create({ data: { tenantId, roomId } });
  await prisma.vendorProfile.create({
    data: {
      id: vendorId,
      businessName: `직접 처리 설비 ${suffix}`,
      contactPerson: "김기사",
      phone: `02-${suffix.slice(-4).padStart(4, "0")}-7001`,
      serviceArea: "성동구",
      trades: ["PLUMBING"],
      serviceAreas: ["성동구"],
      verificationStatus: "VERIFIED",
      isActive: true
    }
  });
  await prisma.vendorAccountLink.create({
    data: {
      id: `vendor_link_direct_${suffix}`,
      vendorId,
      userId: vendorUserId
    }
  });
  await prisma.managerVendor.create({
    data: {
      id: `manager_vendor_direct_${suffix}`,
      managerId,
      vendorId
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
      responsibilityHint: "판단 어려움",
      aiSummary: "싱크대 하부 누수"
    }
  });
  await prisma.aiAnalysis.create({
    data: {
      ticketId,
      summary: "싱크대 하부 누수",
      category: "배관",
      priority: 2,
      responsibilityHint: "판단 어려움",
      confidenceScore: 0.8,
      reasons: ["현장 점검 필요"],
      recommendedAction: "관리자 또는 업체가 확인"
    }
  });

  return { managerId, tenantId, vendorUserId, vendorId, roomId, complaintId, ticketId };
}

async function cleanupFixture(prisma: PrismaClient, fixture: Awaited<ReturnType<typeof createFixture>>) {
  await prisma.domainEventDelivery.deleteMany({
    where: { event: { repair: { ticketId: fixture.ticketId } } }
  });
  await prisma.domainEventOutbox.deleteMany({
    where: { repair: { ticketId: fixture.ticketId } }
  });
  await prisma.statusHistory.deleteMany({ where: { ticketId: fixture.ticketId } });
  await prisma.ticketMessage.deleteMany({ where: { ticketId: fixture.ticketId } });
  await prisma.cost.deleteMany({
    where: { managerId: fixture.managerId, unitId: fixture.roomId }
  });
  await prisma.repairRequest.deleteMany({ where: { ticketId: fixture.ticketId } });
  await prisma.aiAnalysis.deleteMany({ where: { ticketId: fixture.ticketId } });
  await prisma.ticket.deleteMany({ where: { id: fixture.ticketId } });
  await prisma.complaint.deleteMany({ where: { id: fixture.complaintId } });
  await prisma.managerVendor.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.vendorAccountLink.deleteMany({ where: { vendorId: fixture.vendorId } });
  await prisma.vendorProfile.deleteMany({ where: { id: fixture.vendorId } });
  await prisma.tenantRoom.deleteMany({ where: { roomId: fixture.roomId } });
  await prisma.room.deleteMany({ where: { id: fixture.roomId } });
  await prisma.userAccount.deleteMany({
    where: {
      id: { in: [fixture.managerId, fixture.tenantId, fixture.vendorUserId] }
    }
  });
}

async function completeDirectFixture(
  projector: PrismaStoreProjector,
  fixture: Awaited<ReturnType<typeof createFixture>>
) {
  await projector.startDirectHandling({
    managerId: fixture.managerId,
    ticketId: fixture.ticketId,
    note: "직접 처리 시작",
    occurredAt: new Date().toISOString()
  });
  await projector.completeDirectHandling({
    managerId: fixture.managerId,
    ticketId: fixture.ticketId,
    note: "직접 처리를 완료했습니다.",
    occurredAt: new Date().toISOString()
  });
}

describe("Prisma direct handling authority", () => {
  it(
    "rejects immediate direct start after a durable manager vendor assignment",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = `${Date.now().toString(36)}_assigned`;
      const fixture = await createFixture(prisma, suffix);
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      const projector = new PrismaStoreProjector(databaseUrl!);
      const service = new RoomlogService({
        seedDemoData: false,
        initialStore: (await projector.load())!,
        storeProjector: projector
      });

      try {
        await assignments.assignVendor({
          managerId: fixture.managerId,
          ticketId: fixture.ticketId,
          vendorId: fixture.vendorId,
          requestNote: "배관 누수 상태를 확인해주세요."
        });

        await assert.rejects(
          service.startDirectHandling(fixture.managerId, fixture.ticketId, {
            note: "업체 배정 직후 직접 처리 시도"
          }),
          (error: unknown) => {
            assert.ok(error instanceof ConflictException);
            assert.equal(error.getStatus(), 409);
            assert.match(error.message, /활성.*수리|수리.*진행/);
            return true;
          }
        );
        const ticket = await prisma.ticket.findUniqueOrThrow({
          where: { id: fixture.ticketId }
        });
        assert.equal(ticket.directHandlingStartedAt, null);
        assert.equal(
          await prisma.repairRequest.count({
            where: {
              ticketId: fixture.ticketId,
              status: { notIn: ["COMPLETED", "CANCELLED"] }
            }
          }),
          1
        );
      } finally {
        await service.onModuleDestroy();
        await assignments.close();
        await events.close();
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
      }
    }
  );

  it(
    "rejects a new vendor assignment while direct completion awaits tenant confirmation",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const fixture = await createFixture(prisma, `${Date.now().toString(36)}_reported`);
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      const projector = new PrismaStoreProjector(databaseUrl!);
      try {
        await completeDirectFixture(projector, fixture);

        await assert.rejects(
          assignments.assignVendor({
            managerId: fixture.managerId,
            ticketId: fixture.ticketId,
            vendorId: fixture.vendorId,
            requestNote: "완료 확인 대기 중 새 배정 시도"
          }),
          (error: unknown) => {
            assert.ok(error instanceof VendorWorkflowRepositoryError);
            assert.equal(error.code, "INVALID_STATE");
            return true;
          }
        );
        assert.equal(
          await prisma.repairRequest.count({ where: { ticketId: fixture.ticketId } }),
          0
        );
      } finally {
        await projector.disconnect();
        await assignments.close();
        await events.close();
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
      }
    }
  );

  it(
    "rejects a new vendor assignment after tenant-confirmed completion",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const fixture = await createFixture(prisma, `${Date.now().toString(36)}_completed`);
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      const projector = new PrismaStoreProjector(databaseUrl!);
      try {
        await completeDirectFixture(projector, fixture);
        await prisma.ticket.update({
          where: { id: fixture.ticketId },
          data: { status: "COMPLETED" }
        });
        await prisma.complaint.update({
          where: { id: fixture.complaintId },
          data: { status: "COMPLETED" }
        });

        await assert.rejects(
          assignments.assignVendor({
            managerId: fixture.managerId,
            ticketId: fixture.ticketId,
            vendorId: fixture.vendorId,
            requestNote: "세입자 완료 확인 뒤 새 배정 시도"
          }),
          (error: unknown) => {
            assert.ok(error instanceof VendorWorkflowRepositoryError);
            assert.equal(error.code, "INVALID_STATE");
            return true;
          }
        );
        assert.equal(
          await prisma.repairRequest.count({ where: { ticketId: fixture.ticketId } }),
          0
        );
      } finally {
        await projector.disconnect();
        await assignments.close();
        await events.close();
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
      }
    }
  );

  it(
    "allows a new vendor assignment after the completed ticket is reopened",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const fixture = await createFixture(prisma, `${Date.now().toString(36)}_reopened`);
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      const projector = new PrismaStoreProjector(databaseUrl!);
      try {
        await completeDirectFixture(projector, fixture);
        await prisma.ticket.update({
          where: { id: fixture.ticketId },
          data: { status: "REOPENED" }
        });
        await prisma.complaint.update({
          where: { id: fixture.complaintId },
          data: { status: "REOPENED" }
        });

        const assigned = await assignments.assignVendor({
          managerId: fixture.managerId,
          ticketId: fixture.ticketId,
          vendorId: fixture.vendorId,
          requestNote: "재접수 뒤 업체 배정"
        });
        assert.equal(assigned.status, "REQUESTED");
        assert.equal(
          await prisma.repairRequest.count({
            where: {
              ticketId: fixture.ticketId,
              status: { notIn: ["COMPLETED", "CANCELLED"] }
            }
          }),
          1
        );
      } finally {
        await projector.disconnect();
        await assignments.close();
        await events.close();
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
      }
    }
  );

  it(
    "allows changing the selected vendor when a vendor-assigned ticket has no active repair",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = `${Date.now().toString(36)}_selected_change`;
      const fixture = await createFixture(prisma, suffix);
      const alternateVendorId = `vendor_direct_alternate_${suffix}`;
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      try {
        await prisma.vendorProfile.create({
          data: {
            id: alternateVendorId,
            businessName: `직접 처리 변경 설비 ${suffix}`,
            contactPerson: "이기사",
            phone: `02-${suffix.slice(-4).padStart(4, "0")}-7003`,
            serviceArea: "성동구",
            trades: ["PLUMBING"],
            serviceAreas: ["성동구"],
            verificationStatus: "VERIFIED",
            isActive: true
          }
        });
        await prisma.managerVendor.create({
          data: {
            id: `manager_vendor_direct_alternate_${suffix}`,
            managerId: fixture.managerId,
            vendorId: alternateVendorId
          }
        });
        await prisma.vendorAccountLink.create({
          data: {
            id: `vendor_link_direct_alternate_${suffix}`,
            vendorId: alternateVendorId,
            userId: fixture.vendorUserId
          }
        });
        await prisma.ticket.update({
          where: { id: fixture.ticketId },
          data: { assignedVendorId: fixture.vendorId, status: "VENDOR_ASSIGNED" }
        });
        await prisma.complaint.update({
          where: { id: fixture.complaintId },
          data: { status: "VENDOR_ASSIGNED" }
        });

        const reassigned = await assignments.assignVendor({
          managerId: fixture.managerId,
          ticketId: fixture.ticketId,
          vendorId: alternateVendorId,
          requestNote: "선정 업체를 다른 업체로 변경합니다."
        });

        assert.equal(reassigned.status, "REQUESTED");
        assert.equal(
          (
            await prisma.ticket.findUniqueOrThrow({ where: { id: fixture.ticketId } })
          ).assignedVendorId,
          alternateVendorId
        );
      } finally {
        await assignments.close();
        await events.close();
        await prisma.managerVendor.deleteMany({ where: { vendorId: alternateVendorId } });
        await prisma.vendorAccountLink.deleteMany({ where: { vendorId: alternateVendorId } });
        try {
          await cleanupFixture(prisma, fixture);
        } finally {
          await prisma.vendorProfile.deleteMany({ where: { id: alternateVendorId } });
          await prisma.$disconnect();
        }
      }
    }
  );

  it(
    "preserves reassignment of an active requested repair to a different vendor",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = `${Date.now().toString(36)}_reassign`;
      const fixture = await createFixture(prisma, suffix);
      const alternateVendorId = `vendor_direct_alternate_${suffix}`;
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      try {
        await prisma.vendorProfile.create({
          data: {
            id: alternateVendorId,
            businessName: `직접 처리 대체 설비 ${suffix}`,
            contactPerson: "이기사",
            phone: `02-${suffix.slice(-4).padStart(4, "0")}-7002`,
            serviceArea: "성동구",
            trades: ["PLUMBING"],
            serviceAreas: ["성동구"],
            verificationStatus: "VERIFIED",
            isActive: true
          }
        });
        await prisma.managerVendor.create({
          data: {
            id: `manager_vendor_direct_alternate_${suffix}`,
            managerId: fixture.managerId,
            vendorId: alternateVendorId
          }
        });
        await prisma.vendorAccountLink.create({
          data: {
            id: `vendor_link_direct_alternate_${suffix}`,
            vendorId: alternateVendorId,
            userId: fixture.vendorUserId
          }
        });

        const original = await assignments.assignVendor({
          managerId: fixture.managerId,
          ticketId: fixture.ticketId,
          vendorId: fixture.vendorId,
          requestNote: "첫 업체 배정"
        });
        const reassigned = await assignments.assignVendor({
          managerId: fixture.managerId,
          ticketId: fixture.ticketId,
          vendorId: alternateVendorId,
          requestNote: "요청 상태에서 다른 업체로 재배정"
        });

        assert.equal(reassigned.status, "REQUESTED");
        assert.equal(
          (
            await prisma.repairRequest.findUniqueOrThrow({
              where: { id: reassigned.repairId }
            })
          ).vendorId,
          alternateVendorId
        );
        assert.equal(
          (
            await prisma.repairRequest.findUniqueOrThrow({
              where: { id: original.repairId }
            })
          ).status,
          "CANCELLED"
        );
        assert.equal(
          await prisma.repairRequest.count({
            where: {
              ticketId: fixture.ticketId,
              status: { notIn: ["COMPLETED", "CANCELLED"] }
            }
          }),
          1
        );
      } finally {
        await assignments.close();
        await events.close();
        await prisma.managerVendor.deleteMany({ where: { vendorId: alternateVendorId } });
        await prisma.vendorAccountLink.deleteMany({ where: { vendorId: alternateVendorId } });
        try {
          await cleanupFixture(prisma, fixture);
        } finally {
          await prisma.vendorProfile.deleteMany({ where: { id: alternateVendorId } });
          await prisma.$disconnect();
        }
      }
    }
  );

  it(
    "serializes concurrent manager assignment and direct start with one durable winner",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = `${Date.now().toString(36)}_race`;
      const fixture = await createFixture(prisma, suffix);
      const events = new PrismaDomainEventRepository(databaseUrl!);
      const assignments = new PrismaVendorWorkflowRepository(databaseUrl!, events);
      const projector = new PrismaStoreProjector(databaseUrl!);
      const service = new RoomlogService({
        seedDemoData: false,
        initialStore: (await projector.load())!,
        storeProjector: projector
      });

      try {
        const results = await Promise.allSettled([
          assignments.assignVendor({
            managerId: fixture.managerId,
            ticketId: fixture.ticketId,
            vendorId: fixture.vendorId,
            requestNote: "동시 배정 시도"
          }),
          service.startDirectHandling(fixture.managerId, fixture.ticketId, {
            note: "동시 직접 처리 시도"
          })
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
          results
            .map((result) =>
              result.status === "rejected"
                ? `${result.reason?.constructor?.name}: ${result.reason?.message}`
                : "fulfilled"
            )
            .join(" | ")
        );
        assert.equal(results.filter((result) => result.status === "rejected").length, 1);

        const ticket = await prisma.ticket.findUniqueOrThrow({
          where: { id: fixture.ticketId }
        });
        const activeRepairCount = await prisma.repairRequest.count({
          where: {
            ticketId: fixture.ticketId,
            status: { notIn: ["COMPLETED", "CANCELLED"] }
          }
        });
        const directActive = Boolean(
          ticket.directHandlingStartedAt && !ticket.directHandlingCompletedAt
        );
        assert.notEqual(directActive, activeRepairCount === 1);
        assert.equal(directActive || activeRepairCount === 1, true);
        assert.equal(
          await prisma.statusHistory.count({ where: { ticketId: fixture.ticketId } }),
          directActive ? 1 : 0
        );
      } finally {
        await service.onModuleDestroy();
        await assignments.close();
        await events.close();
        await cleanupFixture(prisma, fixture);
        await prisma.$disconnect();
      }
    }
  );

  it(
    "commits direct completion, optional cost, and cancellation as durable transactions",
    { skip: !databaseUrl },
    async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! })
      });
      const suffix = Date.now().toString(36);
      const completedFixture = await createFixture(prisma, `${suffix}_complete`);
      const cancelledFixture = await createFixture(prisma, `${suffix}_cancel`);
      const projector = new PrismaStoreProjector(databaseUrl!);

      try {
        await projector.startDirectHandling({
          managerId: completedFixture.managerId,
          ticketId: completedFixture.ticketId,
          note: "완료 경로 직접 처리 시작",
          occurredAt: new Date().toISOString()
        });
        await projector.completeDirectHandling({
          managerId: completedFixture.managerId,
          ticketId: completedFixture.ticketId,
          note: "누수 부품을 교체했습니다.",
          occurredAt: new Date().toISOString(),
          cost: { amount: 25_000, item: "누수 부품" }
        });
        await projector.startDirectHandling({
          managerId: cancelledFixture.managerId,
          ticketId: cancelledFixture.ticketId,
          note: "취소 경로 직접 처리 시작",
          occurredAt: new Date().toISOString()
        });
        await projector.cancelDirectHandling({
          managerId: cancelledFixture.managerId,
          ticketId: cancelledFixture.ticketId,
          reason: "전문 업체 진단이 필요합니다.",
          occurredAt: new Date().toISOString()
        });

        const [completedTicket, cancelledTicket, cost] = await Promise.all([
          prisma.ticket.findUniqueOrThrow({ where: { id: completedFixture.ticketId } }),
          prisma.ticket.findUniqueOrThrow({ where: { id: cancelledFixture.ticketId } }),
          prisma.cost.findFirst({
            where: {
              managerId: completedFixture.managerId,
              unitId: completedFixture.roomId,
              item: "누수 부품"
            }
          })
        ]);
        assert.equal(completedTicket.status, "COMPLETION_REPORTED");
        assert.ok(completedTicket.directHandlingCompletedAt);
        assert.equal(cost?.amount, 25_000);
        assert.equal(cost?.status, "DRAFT");
        assert.equal(cancelledTicket.status, "REVIEWING");
        assert.equal(cancelledTicket.directHandlingStartedAt, null);
        assert.equal(cancelledTicket.directHandlingNote, null);
        assert.equal(
          await prisma.statusHistory.count({
            where: { ticketId: { in: [completedFixture.ticketId, cancelledFixture.ticketId] } }
          }),
          4
        );
      } finally {
        await projector.disconnect();
        await cleanupFixture(prisma, completedFixture);
        await cleanupFixture(prisma, cancelledFixture);
        await prisma.$disconnect();
      }
    }
  );
});
