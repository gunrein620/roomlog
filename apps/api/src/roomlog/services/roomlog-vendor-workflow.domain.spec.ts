import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaDomainEventRepository } from "../../domain-events/prisma-domain-event.repository";
import { PrismaVendorWorkflowRepository } from "../prisma-vendor-workflow.repository";
import type { VendorAccountResolver } from "../vendor-activation.repository";
import { RoomlogVendorWorkflowDomain } from "./roomlog-vendor-workflow.domain";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

interface WorkflowFixtureOptions {
  tenantAvailableTimes?: string;
  tenantInitiated?: boolean;
  attachmentUrls?: string[];
}

function workflowFixtureIdentity(suffix: string) {
  return {
    managerId: `manager_visit_${suffix}`,
    tenantId: `tenant_visit_${suffix}`,
    vendorUserId: `vendor_user_visit_${suffix}`,
    vendorId: `vendor_visit_${suffix}`,
    roomId: `room_visit_${suffix}`,
    complaintId: `complaint_visit_${suffix}`,
    ticketId: `ticket_visit_${suffix}`,
    repairId: `repair_visit_${suffix}`,
    estimateId: `estimate_visit_${suffix}`
  };
}

type WorkflowFixture = ReturnType<typeof workflowFixtureIdentity>;

async function createWorkflowFixture(
  prisma: PrismaClient,
  fixture: WorkflowFixture,
  options: WorkflowFixtureOptions = {}
) {
  const {
    managerId,
    tenantId,
    vendorUserId,
    vendorId,
    roomId,
    complaintId,
    ticketId,
    repairId,
    estimateId
  } = fixture;
  const suffix = repairId.replace(/^repair_visit_/, "");

  await prisma.userAccount.createMany({
    data: [
      {
        id: managerId,
        email: `${managerId}@roomlog.test`,
        passwordHash: "test",
        name: "방문 일정 관리자",
        role: "LANDLORD"
      },
      {
        id: tenantId,
        email: `${tenantId}@roomlog.test`,
        passwordHash: "test",
        name: "방문 일정 세입자",
        role: "TENANT"
      },
      {
        id: vendorUserId,
        email: `${vendorUserId}@roomlog.test`,
        passwordHash: "test",
        name: "방문 일정 업체",
        role: "VENDOR"
      }
    ]
  });
  await prisma.room.create({
    data: {
      id: roomId,
      buildingName: `방문 일정 빌라 ${suffix}`,
      roomNo: "801호",
      address: "서울시 성동구 방문로 8",
      landlordId: managerId
    }
  });
  await prisma.tenantRoom.create({ data: { tenantId, roomId } });
  await prisma.vendorProfile.create({
    data: {
      id: vendorId,
      businessName: `방문 일정 설비 ${suffix}`,
      contactPerson: "김기사",
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
      id: `vendor_link_visit_${suffix}`,
      vendorId,
      userId: vendorUserId
    }
  });
  await prisma.managerVendor.create({
    data: {
      id: `manager_vendor_visit_${suffix}`,
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
      title: "싱크대 누수 방문 요청",
      description: "싱크대 하부 누수 상태를 방문 점검해 주세요.",
      location: "주방",
      ...(options.tenantAvailableTimes === undefined
        ? {}
        : { availableTimes: options.tenantAvailableTimes }),
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
      status: "ESTIMATE_REVIEW",
      responsibilityHint: "판단 어려움",
      aiSummary: "싱크대 하부 누수 방문 점검"
    }
  });
  if (options.attachmentUrls) {
    await prisma.aiAnalysis.create({
      data: {
        ticketId,
        summary: "싱크대 하부 누수 사진 분석",
        category: "하자",
        detailCategory: "배관",
        priority: 2,
        responsibilityHint: "판단 어려움",
        confidenceScore: 0.9,
        reasons: ["누수 흔적이 보입니다."],
        recommendedAction: "방문 점검",
        photoAnalysis: { attachmentUrls: options.attachmentUrls }
      }
    });
  }
  await prisma.repairRequest.create({
    data: {
      id: repairId,
      ticketId,
      vendorId,
      status: "ESTIMATE_SUBMITTED",
      tenantInitiated: options.tenantInitiated ?? false,
      title: "배관 처리 요청",
      description: "누수 부위를 방문 점검해 주세요.",
      costBearer: options.tenantInitiated ? "TENANT" : null,
      completionPhotoUrls: []
    }
  });
  await prisma.vendorEstimate.create({
    data: {
      id: estimateId,
      repairId,
      vendorId,
      version: 1,
      origin: "LIVE",
      responseType: "VISIT_REQUIRED",
      status: "SUBMITTED",
      visitAvailableAt: new Date("2026-07-21T01:00:00.000Z"),
      workDescription: "누수 범위 확인을 위한 방문이 필요합니다.",
      submittedAt: new Date("2026-07-18T01:00:00.000Z")
    }
  });

  if (options.tenantInitiated) {
    await prisma.domainEventOutbox.create({
      data: {
        id: `event_visit_${suffix}`,
        eventKey: `vendor-job-assigned:${repairId}`,
        payloadHash: `fixture-${suffix}`,
        type: "VENDOR_JOB_ASSIGNED",
        targetUserIds: [vendorUserId],
        vendorId,
        repairId,
        actorUserId: tenantId,
        statusCode: "REQUESTED",
        occurredAt: new Date("2026-07-18T00:00:00.000Z")
      }
    });
  }

  return fixture;
}

async function cleanupWorkflowFixture(
  prisma: PrismaClient,
  fixture: WorkflowFixture
) {
  await prisma.domainEventDelivery.deleteMany({
    where: { event: { repairId: fixture.repairId } }
  });
  await prisma.domainEventOutbox.deleteMany({
    where: { repairId: fixture.repairId }
  });
  await prisma.ticketMessage.deleteMany({ where: { ticketId: fixture.ticketId } });
  await prisma.vendorEstimate.deleteMany({ where: { repairId: fixture.repairId } });
  await prisma.repairRequest.deleteMany({ where: { id: fixture.repairId } });
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

async function withWorkflowFixture(
  suffix: string,
  options: WorkflowFixtureOptions,
  run: (context: {
    prisma: PrismaClient;
    domain: RoomlogVendorWorkflowDomain;
    fixture: WorkflowFixture;
  }) => Promise<void>
) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! })
  });
  const fixture = workflowFixtureIdentity(suffix);
  let events: PrismaDomainEventRepository | undefined;
  let repository: PrismaVendorWorkflowRepository | undefined;

  try {
    await createWorkflowFixture(prisma, fixture, options);
    events = new PrismaDomainEventRepository(databaseUrl!);
    repository = new PrismaVendorWorkflowRepository(databaseUrl!, events);
    const vendorAccounts: VendorAccountResolver = {
      async resolveActiveVendorId(userId) {
        return userId === fixture.vendorUserId ? fixture.vendorId : undefined;
      },
      async resolveActiveVendorAccount() {
        return undefined;
      }
    };
    const domain = new RoomlogVendorWorkflowDomain(repository, vendorAccounts);
    await run({ prisma, domain, fixture });
  } finally {
    try {
      if (repository) await repository.close();
    } finally {
      try {
        if (events) await events.close();
      } finally {
        try {
          await cleanupWorkflowFixture(prisma, fixture);
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  }
}

describe("RoomlogVendorWorkflowDomain visit negotiation", () => {
  it(
    "omits null and blank tenant available times and trims populated projection values",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_detail`,
        { attachmentUrls: ["/api/files/visit-detail.jpg"] },
        async ({ prisma, domain, fixture }) => {
          const withoutTimes = await domain.getJob(
            fixture.vendorUserId,
            fixture.repairId
          );
          assert.equal(Object.hasOwn(withoutTimes, "tenantAvailableTimes"), false);
          assert.deepEqual(withoutTimes.attachmentUrls, [
            "/api/files/visit-detail.jpg"
          ]);

          await prisma.complaint.update({
            where: { id: fixture.complaintId },
            data: { availableTimes: "   " }
          });
          const withBlankTimes = await domain.getJob(
            fixture.vendorUserId,
            fixture.repairId
          );
          assert.equal(
            Object.hasOwn(withBlankTimes, "tenantAvailableTimes"),
            false
          );

          await prisma.complaint.update({
            where: { id: fixture.complaintId },
            data: { availableTimes: "  평일 오후 7시 이후  " }
          });
          const withTimes = await domain.getJob(
            fixture.vendorUserId,
            fixture.repairId
          );
          assert.equal(
            "tenantAvailableTimes" in withTimes
              ? withTimes.tenantAvailableTimes
              : undefined,
            "평일 오후 7시 이후"
          );
        }
      );
    }
  );

  it(
    "carries tenant availability through revision request and vendor version replacement",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_revision`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const reviewNote = "방문 시간 재협의: 주말 오전을 제안해 주세요.";
          const result = await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            {
              action: "REQUEST_REVISION",
              note: reviewNote,
              tenantAvailableTimes: "  주말 오전 9시부터 12시  "
            }
          );
          const replacementDraft = await domain.saveEstimateDraft(
            fixture.vendorUserId,
            fixture.repairId,
            undefined,
            {
              responseType: "VISIT_REQUIRED",
              visitAvailableAt: "2026-07-25T01:00:00.000Z",
              workDescription: "재협의한 주말 오전 시간으로 방문합니다."
            }
          );
          const draftVersions = await prisma.vendorEstimate.findMany({
            where: { repairId: fixture.repairId },
            orderBy: { version: "asc" }
          });

          assert.deepEqual(
            draftVersions.map(({ version, status }) => ({ version, status })),
            [
              { version: 1, status: "REVISION_REQUESTED" },
              { version: 2, status: "DRAFT" }
            ]
          );

          const replacement = await domain.submitEstimate(
            fixture.vendorUserId,
            fixture.repairId,
            replacementDraft.id
          );

          assert.equal(result.latestEstimate?.status, "REVISION_REQUESTED");
          assert.equal(result.latestEstimate?.reviewNote, reviewNote);
          assert.equal(replacementDraft.version, 2);
          assert.equal(replacementDraft.status, "DRAFT");
          assert.equal(replacement.version, 2);
          assert.equal(replacement.status, "SUBMITTED");

          const versions = await prisma.vendorEstimate.findMany({
            where: { repairId: fixture.repairId },
            orderBy: { version: "asc" }
          });
          assert.deepEqual(
            versions.map(({ id, version, status }) => ({ id, version, status })),
            [
              {
                id: fixture.estimateId,
                version: 1,
                status: "SUPERSEDED"
              },
              {
                id: replacement.id,
                version: 2,
                status: "SUBMITTED"
              }
            ]
          );

          const complaint = await prisma.complaint.findUniqueOrThrow({
            where: { id: fixture.complaintId }
          });
          assert.equal(complaint.availableTimes, "주말 오전 9시부터 12시");
        }
      );
    }
  );

  it(
    "rejects whitespace-only tenant availability at the domain boundary",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_times_blank`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ domain, fixture }) => {
          await assert.rejects(
            () => domain.reviewTenantEstimate(
              fixture.tenantId,
              fixture.repairId,
              fixture.estimateId,
              {
                action: "REQUEST_REVISION",
                note: "방문 시간을 다시 확인해 주세요.",
                tenantAvailableTimes: "  \n  "
              }
            ),
            BadRequestException
          );
        }
      );
    }
  );

  it(
    "accepts a same-note retry with the same tenant availability",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_retry_same`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const input = {
            action: "REQUEST_REVISION" as const,
            note: "방문 시간 재협의: 주말 오전을 제안해 주세요.",
            tenantAvailableTimes: "주말 오전 9시부터 12시"
          };

          await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            input
          );
          const retry = await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            input
          );

          assert.equal(retry.latestEstimate?.status, "REVISION_REQUESTED");
          const complaint = await prisma.complaint.findUniqueOrThrow({
            where: { id: fixture.complaintId }
          });
          assert.equal(complaint.availableTimes, input.tenantAvailableTimes);
        }
      );
    }
  );

  it(
    "creates and heals one tenant-visible revision message for a tenant review retry",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_revision_message`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const note = "방문 시간 재협의: 주말 오전을 제안해 주세요.";
          const input = {
            action: "REQUEST_REVISION" as const,
            note,
            tenantAvailableTimes: "주말 오전 9시부터 12시"
          };
          await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            input
          );

          const messageId = `estimate-revision-${fixture.estimateId}`;
          const created = await prisma.ticketMessage.findUniqueOrThrow({
            where: { id: messageId }
          });
          assert.equal(created.ticketId, fixture.ticketId);
          assert.equal(created.complaintId, fixture.complaintId);
          assert.equal(created.repairId, fixture.repairId);
          assert.equal(created.senderUserId, fixture.tenantId);
          assert.equal(created.senderRole, "TENANT");
          assert.match(created.messageText, /견적 수정/);
          assert.match(created.messageText, new RegExp(note));

          await prisma.ticketMessage.update({
            where: { id: messageId },
            data: {
              complaintId: null,
              repairId: null,
              senderUserId: "damaged-revision-message",
              senderRole: "VENDOR",
              messageText: "손상된 메시지"
            }
          });
          await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            input
          );

          const [healed, messages, reviewEvents] = await Promise.all([
            prisma.ticketMessage.findUniqueOrThrow({ where: { id: messageId } }),
            prisma.ticketMessage.findMany({ where: { ticketId: fixture.ticketId } }),
            prisma.domainEventOutbox.findMany({
              where: {
                eventKey: `tenant-vendor-estimate-review:${fixture.estimateId}:request_revision`
              }
            })
          ]);
          assert.equal(healed.ticketId, fixture.ticketId);
          assert.equal(healed.complaintId, fixture.complaintId);
          assert.equal(healed.repairId, fixture.repairId);
          assert.equal(healed.senderUserId, fixture.tenantId);
          assert.equal(healed.senderRole, "TENANT");
          assert.match(healed.messageText, new RegExp(note));
          assert.equal(messages.length, 1);
          assert.equal(reviewEvents.length, 1);
        }
      );
    }
  );

  it(
    "rejects a same-note retry with different tenant availability without mutating the complaint",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_retry_conflict`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const note = "방문 시간 재협의: 주말 오전을 제안해 주세요.";
          const acceptedTimes = "주말 오전 9시부터 12시";
          await domain.reviewTenantEstimate(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            {
              action: "REQUEST_REVISION",
              note,
              tenantAvailableTimes: acceptedTimes
            }
          );

          await assert.rejects(
            () => domain.reviewTenantEstimate(
              fixture.tenantId,
              fixture.repairId,
              fixture.estimateId,
              {
                action: "REQUEST_REVISION",
                note,
                tenantAvailableTimes: "평일 오후 6시 이후"
              }
            ),
            ConflictException
          );

          const complaint = await prisma.complaint.findUniqueOrThrow({
            where: { id: fixture.complaintId }
          });
          assert.equal(complaint.availableTimes, acceptedTimes);
        }
      );
    }
  );

  it(
    "rejects tenant availability longer than 200 characters at the domain boundary",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_times_long`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ domain, fixture }) => {
          await assert.rejects(
            () => domain.reviewTenantEstimate(
              fixture.tenantId,
              fixture.repairId,
              fixture.estimateId,
              {
                action: "REQUEST_REVISION",
                note: "방문 시간을 다시 확인해 주세요.",
                tenantAvailableTimes: "가".repeat(201)
              }
            ),
            BadRequestException
          );
        }
      );
    }
  );

  it(
    "does not update complaint availability from a manager revision request",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_revision`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ prisma, domain, fixture }) => {
          const reviewNote = "방문 시간 재협의: 세입자와 다시 확인해 주세요.";
          const result = await domain.reviewEstimate(
            fixture.managerId,
            fixture.repairId,
            fixture.estimateId,
            {
              action: "REQUEST_REVISION",
              note: reviewNote,
              tenantAvailableTimes: "관리자가 대신 입력한 시간"
            }
          );

          assert.equal(result.status, "REVISION_REQUESTED");
          assert.equal(result.reviewNote, reviewNote);
          const complaint = await prisma.complaint.findUniqueOrThrow({
            where: { id: fixture.complaintId }
          });
          assert.equal(complaint.availableTimes, "평일 오후");
        }
      );
    }
  );

  it(
    "creates and heals one tenant-visible revision message for a manager review retry",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_revision_message`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ prisma, domain, fixture }) => {
          const note = "방문 시간 재협의: 세입자와 다시 확인해 주세요.";
          const input = {
            action: "REQUEST_REVISION" as const,
            note
          };
          await domain.reviewEstimate(
            fixture.managerId,
            fixture.repairId,
            fixture.estimateId,
            input
          );

          const messageId = `estimate-revision-${fixture.estimateId}`;
          const created = await prisma.ticketMessage.findUniqueOrThrow({
            where: { id: messageId }
          });
          assert.equal(created.ticketId, fixture.ticketId);
          assert.equal(created.complaintId, fixture.complaintId);
          assert.equal(created.repairId, fixture.repairId);
          assert.equal(created.senderUserId, fixture.managerId);
          assert.equal(created.senderRole, "LANDLORD");
          assert.match(created.messageText, /견적 수정/);
          assert.match(created.messageText, new RegExp(note));

          await prisma.ticketMessage.update({
            where: { id: messageId },
            data: {
              complaintId: null,
              repairId: null,
              senderUserId: "damaged-revision-message",
              senderRole: "VENDOR",
              messageText: "손상된 메시지"
            }
          });
          await domain.reviewEstimate(
            fixture.managerId,
            fixture.repairId,
            fixture.estimateId,
            input
          );

          const [healed, messages, reviewEvents] = await Promise.all([
            prisma.ticketMessage.findUniqueOrThrow({ where: { id: messageId } }),
            prisma.ticketMessage.findMany({ where: { ticketId: fixture.ticketId } }),
            prisma.domainEventOutbox.findMany({
              where: {
                eventKey: `vendor-estimate-review:${fixture.estimateId}:request_revision`
              }
            })
          ]);
          assert.equal(healed.ticketId, fixture.ticketId);
          assert.equal(healed.complaintId, fixture.complaintId);
          assert.equal(healed.repairId, fixture.repairId);
          assert.equal(healed.senderUserId, fixture.managerId);
          assert.equal(healed.senderRole, "LANDLORD");
          assert.match(healed.messageText, new RegExp(note));
          assert.equal(messages.length, 1);
          assert.equal(reviewEvents.length, 1);
        }
      );
    }
  );

  it(
    "rejects whitespace-only tenant availability from a manager revision request",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_times_blank`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ domain, fixture }) => {
          await assert.rejects(
            () => domain.reviewEstimate(
              fixture.managerId,
              fixture.repairId,
              fixture.estimateId,
              {
                action: "REQUEST_REVISION",
                note: "방문 시간을 다시 확인해 주세요.",
                tenantAvailableTimes: "  \n  "
              }
            ),
            BadRequestException
          );
        }
      );
    }
  );

  it(
    "rejects tenant availability longer than 200 characters from a manager revision request",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_times_long`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ domain, fixture }) => {
          await assert.rejects(
            () => domain.reviewEstimate(
              fixture.managerId,
              fixture.repairId,
              fixture.estimateId,
              {
                action: "REQUEST_REVISION",
                note: "방문 시간을 다시 확인해 주세요.",
                tenantAvailableTimes: "가".repeat(201)
              }
            ),
            BadRequestException
          );
        }
      );
    }
  );

  it(
    "creates a tenant-visible message when the tenant confirms a visit",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_confirm`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const scheduledAt = "2026-07-21T01:00:00.000Z";
          await domain.confirmTenantEstimateVisit(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            { scheduledAt }
          );
          await domain.confirmTenantEstimateVisit(
            fixture.tenantId,
            fixture.repairId,
            fixture.estimateId,
            { scheduledAt }
          );

          const messages = await prisma.ticketMessage.findMany({
            where: {
              ticketId: fixture.ticketId,
              complaintId: fixture.complaintId,
              repairId: fixture.repairId,
              messageText: `방문 일정이 확정되었습니다 — ${scheduledAt}`
            }
          });
          assert.equal(messages.length, 1);
          assert.equal(messages[0]?.senderUserId, fixture.tenantId);
          assert.equal(messages[0]?.senderRole, "TENANT");
        }
      );
    }
  );

  it(
    "creates a tenant-visible message when the manager confirms a visit",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_confirm`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ prisma, domain, fixture }) => {
          const scheduledAt = "2026-07-21T01:00:00.000Z";
          await domain.confirmEstimateVisit(
            fixture.managerId,
            fixture.repairId,
            fixture.estimateId,
            { scheduledAt }
          );
          await domain.confirmEstimateVisit(
            fixture.managerId,
            fixture.repairId,
            fixture.estimateId,
            { scheduledAt }
          );

          const messages = await prisma.ticketMessage.findMany({
            where: {
              ticketId: fixture.ticketId,
              complaintId: fixture.complaintId,
              repairId: fixture.repairId,
              messageText: `방문 일정이 확정되었습니다 — ${scheduledAt}`
            }
          });
          assert.equal(messages.length, 1);
          assert.equal(messages[0]?.senderUserId, fixture.managerId);
          assert.equal(messages[0]?.senderRole, "LANDLORD");
        }
      );
    }
  );

  it(
    "rejects a tenant visit confirmation that differs from the current estimate proposal without mutation",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_confirm_mismatch`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          await assert.rejects(
            () => domain.confirmTenantEstimateVisit(
              fixture.tenantId,
              fixture.repairId,
              fixture.estimateId,
              { scheduledAt: "2026-07-22T10:00:00.000Z" }
            ),
            ConflictException
          );

          const [repair, estimate, messages] = await Promise.all([
            prisma.repairRequest.findUniqueOrThrow({ where: { id: fixture.repairId } }),
            prisma.vendorEstimate.findUniqueOrThrow({ where: { id: fixture.estimateId } }),
            prisma.ticketMessage.findMany({
              where: {
                repairId: fixture.repairId,
                id: { startsWith: "visit-confirmation-" }
              }
            })
          ]);
          assert.equal(repair.status, "ESTIMATE_SUBMITTED");
          assert.equal(repair.scheduledAt, null);
          assert.equal(estimate.status, "SUBMITTED");
          assert.equal(estimate.reviewedByTenantId, null);
          assert.equal(messages.length, 0);
        }
      );
    }
  );

  it(
    "rejects a manager visit confirmation that differs from the current estimate proposal without mutation",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_confirm_mismatch`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ prisma, domain, fixture }) => {
          await assert.rejects(
            () => domain.confirmEstimateVisit(
              fixture.managerId,
              fixture.repairId,
              fixture.estimateId,
              { scheduledAt: "2026-07-23T01:30:00.000Z" }
            ),
            ConflictException
          );

          const [repair, estimate, messages] = await Promise.all([
            prisma.repairRequest.findUniqueOrThrow({ where: { id: fixture.repairId } }),
            prisma.vendorEstimate.findUniqueOrThrow({ where: { id: fixture.estimateId } }),
            prisma.ticketMessage.findMany({
              where: {
                repairId: fixture.repairId,
                id: { startsWith: "visit-confirmation-" }
              }
            })
          ]);
          assert.equal(repair.status, "ESTIMATE_SUBMITTED");
          assert.equal(repair.scheduledAt, null);
          assert.equal(estimate.status, "SUBMITTED");
          assert.equal(estimate.reviewedByManagerId, null);
          assert.equal(messages.length, 0);
        }
      );
    }
  );

  it(
    "rejects a stale older tenant visit estimate without mutation",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_tenant_confirm_stale`,
        { tenantAvailableTimes: "평일 오후", tenantInitiated: true },
        async ({ prisma, domain, fixture }) => {
          const latestEstimateId = `${fixture.estimateId}_latest`;
          await prisma.vendorEstimate.create({
            data: {
              id: latestEstimateId,
              repairId: fixture.repairId,
              vendorId: fixture.vendorId,
              version: 2,
              origin: "LIVE",
              responseType: "VISIT_REQUIRED",
              status: "SUBMITTED",
              visitAvailableAt: new Date("2026-07-24T01:00:00.000Z"),
              workDescription: "더 최근에 제출된 방문 제안입니다.",
              submittedAt: new Date("2026-07-18T02:00:00.000Z")
            }
          });

          await assert.rejects(
            () => domain.confirmTenantEstimateVisit(
              fixture.tenantId,
              fixture.repairId,
              fixture.estimateId,
              { scheduledAt: "2026-07-21T01:00:00.000Z" }
            ),
            ConflictException
          );

          const [repair, estimates, messages] = await Promise.all([
            prisma.repairRequest.findUniqueOrThrow({ where: { id: fixture.repairId } }),
            prisma.vendorEstimate.findMany({
              where: { repairId: fixture.repairId },
              orderBy: { version: "asc" }
            }),
            prisma.ticketMessage.findMany({
              where: {
                repairId: fixture.repairId,
                id: { startsWith: "visit-confirmation-" }
              }
            })
          ]);
          assert.equal(repair.status, "ESTIMATE_SUBMITTED");
          assert.equal(repair.scheduledAt, null);
          assert.deepEqual(estimates.map(({ status }) => status), ["SUBMITTED", "SUBMITTED"]);
          assert.equal(messages.length, 0);
        }
      );
    }
  );

  it(
    "rejects a stale older manager visit estimate without mutation",
    { skip: !databaseUrl },
    async () => {
      await withWorkflowFixture(
        `${Date.now().toString(36)}_manager_confirm_stale`,
        { tenantAvailableTimes: "평일 오후" },
        async ({ prisma, domain, fixture }) => {
          const latestEstimateId = `${fixture.estimateId}_latest`;
          await prisma.vendorEstimate.create({
            data: {
              id: latestEstimateId,
              repairId: fixture.repairId,
              vendorId: fixture.vendorId,
              version: 2,
              origin: "LIVE",
              responseType: "VISIT_REQUIRED",
              status: "SUBMITTED",
              visitAvailableAt: new Date("2026-07-24T01:00:00.000Z"),
              workDescription: "더 최근에 제출된 방문 제안입니다.",
              submittedAt: new Date("2026-07-18T02:00:00.000Z")
            }
          });

          await assert.rejects(
            () => domain.confirmEstimateVisit(
              fixture.managerId,
              fixture.repairId,
              fixture.estimateId,
              { scheduledAt: "2026-07-21T01:00:00.000Z" }
            ),
            ConflictException
          );

          const [repair, estimates, messages] = await Promise.all([
            prisma.repairRequest.findUniqueOrThrow({ where: { id: fixture.repairId } }),
            prisma.vendorEstimate.findMany({
              where: { repairId: fixture.repairId },
              orderBy: { version: "asc" }
            }),
            prisma.ticketMessage.findMany({
              where: {
                repairId: fixture.repairId,
                id: { startsWith: "visit-confirmation-" }
              }
            })
          ]);
          assert.equal(repair.status, "ESTIMATE_SUBMITTED");
          assert.equal(repair.scheduledAt, null);
          assert.deepEqual(estimates.map(({ status }) => status), ["SUBMITTED", "SUBMITTED"]);
          assert.equal(messages.length, 0);
        }
      );
    }
  );
});
