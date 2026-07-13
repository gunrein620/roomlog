import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService } from "./roomlog.service";
import { RoomlogController } from "./roomlog.controller";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { announcementSourceHash } from "./services/roomlog-announcement-support";

function createMoveoutTestService() {
  const createdAt = "2026-07-01T00:00:00.000Z";

  return new RoomlogService({
    seedDemoData: false,
    initialStore: {
      users: [
        {
          id: "tenant-a",
          email: "tenant-a@roomlog.test",
          passwordHash: "hash",
          name: "임차인A",
          role: "TENANT",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "tenant-b",
          email: "tenant-b@roomlog.test",
          passwordHash: "hash",
          name: "임차인B",
          role: "TENANT",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "manager-a",
          email: "manager-a@roomlog.test",
          passwordHash: "hash",
          name: "관리인A",
          role: "LANDLORD",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "manager-b",
          email: "manager-b@roomlog.test",
          passwordHash: "hash",
          name: "관리인B",
          role: "LANDLORD",
          status: "ACTIVE",
          createdAt
        }
      ],
      rooms: [
        {
          id: "room-a",
          buildingName: "정글빌라",
          roomNo: "301호",
          address: "서울시 성동구 테스트로 1",
          landlordId: "manager-a"
        },
        {
          id: "room-b",
          buildingName: "정글빌라",
          roomNo: "401호",
          address: "서울시 성동구 테스트로 2",
          landlordId: "manager-b"
        }
      ],
      tenantRooms: {
        "tenant-a": "room-a",
        "tenant-b": "room-b"
      },
      vendors: [],
      vendorInvites: [],
      tenantInvites: [],
      contracts: [
        {
          id: "contract-a",
          roomId: "room-a",
          tenantId: "tenant-a",
          managerId: "manager-a",
          unitId: "301",
          landlordName: "관리인A",
          lifecycle: "active",
          review: "confirmed",
          deletion: "none",
          valueSource: "confirmed",
          monthlyRent: 700000,
          maintenanceFee: 70000,
          paymentDay: 25,
          startDate: "2025-08-01T00:00:00.000Z",
          endDate: "2026-07-31T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt,
          confirmedAt: createdAt,
          confirmedByManagerId: "manager-a"
        },
        {
          id: "contract-unconfirmed",
          roomId: "room-a",
          tenantId: "tenant-a",
          managerId: "manager-a",
          unitId: "301",
          landlordName: "관리인A",
          lifecycle: "active",
          review: "pending",
          deletion: "none",
          valueSource: "unverified",
          monthlyRent: 700000,
          maintenanceFee: 70000,
          paymentDay: 25,
          startDate: "2025-08-01T00:00:00.000Z",
          endDate: "2026-07-31T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt
        },
        {
          id: "contract-b",
          roomId: "room-b",
          tenantId: "tenant-b",
          managerId: "manager-b",
          unitId: "401",
          landlordName: "관리인B",
          lifecycle: "active",
          review: "confirmed",
          deletion: "none",
          valueSource: "confirmed",
          monthlyRent: 800000,
          maintenanceFee: 80000,
          paymentDay: 25,
          startDate: "2025-08-01T00:00:00.000Z",
          endDate: "2026-08-31T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt,
          confirmedAt: createdAt,
          confirmedByManagerId: "manager-b"
        }
      ],
      contractDocuments: [],
      contractExtractions: [],
      contractPrivacies: [],
      contractInvites: [],
      attachments: [],
      floorPlans: [],
      moveInChecklist: [],
      aiFeedback: [],
      intakeSessions: [],
      complaints: [],
      analyses: {},
      tickets: [],
      repairs: [],
      costs: [],
      receipts: [],
      receiptOcrs: [],
      messages: [],
      messagingThreads: [],
      messagingMessages: [],
      messagingAnnouncementDrafts: [],
      messagingAnnouncements: [],
      messagingAnnouncementDeliveries: [],
      history: [],
      moveouts: [
        {
          id: "mo-a",
          tenantId: "tenant-a",
          roomId: "room-a",
          contractId: "contract-a",
          unitId: "301",
          contractConfirmed: true,
          leaseEndDate: "2026-07-31T00:00:00.000Z",
          daysRemaining: 30,
          depositAmount: 10000000,
          estimatedRefundMin: 9800000,
          estimatedRefundMax: 9900000,
          settlementStatus: "estimate",
          prepProgress: 0.5,
          settlementId: "st-a",
          createdAt,
          updatedAt: createdAt
        },
        {
          id: "mo-unconfirmed",
          tenantId: "tenant-a",
          roomId: "room-a",
          contractId: "contract-unconfirmed",
          unitId: "301",
          contractConfirmed: false,
          depositAmount: 10000000,
          settlementStatus: "estimate",
          prepProgress: 0.2,
          settlementId: "st-unconfirmed",
          createdAt,
          updatedAt: createdAt
        },
        {
          id: "mo-b",
          tenantId: "tenant-b",
          roomId: "room-b",
          contractId: "contract-b",
          unitId: "401",
          contractConfirmed: true,
          leaseEndDate: "2026-08-31T00:00:00.000Z",
          daysRemaining: 61,
          depositAmount: 12000000,
          estimatedRefundMin: 12000000,
          estimatedRefundMax: 12000000,
          settlementStatus: "estimate",
          prepProgress: 0.4,
          settlementId: "st-b",
          createdAt,
          updatedAt: createdAt
        }
      ],
      moveoutRecords: [
        {
          id: "rec-a",
          summaryId: "mo-a",
          source: "movein_photo",
          title: "입주 전 욕실 사진",
          description: "입주 시점 사진이 있어 비교 가능합니다.",
          occurredAt: "2025-08-01T00:00:00.000Z",
          evidenceUrls: ["/api/files/moveout-before.jpg"],
          moveinComparisonAvailable: true
        },
        {
          id: "rec-blank",
          summaryId: "mo-a",
          source: "movein_photo",
          title: "입주 전 벽면 사진 공백",
          description: "입주 전 사진이 남아 있지 않은 벽면입니다.",
          occurredAt: "2025-08-01T00:00:00.000Z",
          moveinComparisonAvailable: false
        }
      ],
      moveoutChecklist: [],
      moveoutSettlements: [
        {
          id: "st-a",
          summaryId: "mo-a",
          depositAmount: 10000000,
          refundMin: 9800000,
          refundMax: 9900000,
          status: "estimate",
          disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
          createdAt
        },
        {
          id: "st-unconfirmed",
          summaryId: "mo-unconfirmed",
          depositAmount: 10000000,
          refundMin: 10000000,
          refundMax: 10000000,
          status: "estimate",
          disclaimer: "계약 미확정 상태에서는 정산을 확정할 수 없습니다.",
          createdAt
        }
      ],
      moveoutDeductions: [
        {
          id: "de-a",
          kind: "repair",
          summaryId: "mo-a",
          label: "욕실 수리비 후보",
          estimatedMin: 0,
          estimatedMax: 100000,
          needsConfirmation: false,
          evidenceNote: "입주 전 사진과 수리 이력 비교",
          source: "repair"
        }
      ],
      moveoutDisputes: [
        {
          id: "dp-sla",
          summaryId: "mo-a",
          targetItemId: "de-a",
          targetLabel: "욕실 수리비 후보",
          reason: "기존 하자입니다.",
          status: "received",
          slaDeadline: "2026-07-02T00:00:00.000Z",
          slaBreached: true,
          history: [{ status: "received", at: "2026-07-01T00:00:00.000Z" }],
          createdAt,
          updatedAt: createdAt
        }
      ],
      moveoutReportAudits: []
    } as any
  } as any);
}

function createReportTestService() {
  const createdAt = "2026-06-15T00:00:00.000Z";

  return new RoomlogService({
    seedDemoData: false,
    initialStore: {
      users: [
        {
          id: "tenant-report-a",
          email: "tenant-report-a@roomlog.test",
          passwordHash: "hash",
          name: "김민수",
          phone: "010-1111-2222",
          role: "TENANT",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "tenant-report-b",
          email: "tenant-report-b@roomlog.test",
          passwordHash: "hash",
          name: "이민지",
          phone: "010-3333-4444",
          role: "TENANT",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "manager-report-a",
          email: "manager-report-a@roomlog.test",
          passwordHash: "hash",
          name: "관리인A",
          role: "LANDLORD",
          status: "ACTIVE",
          createdAt
        },
        {
          id: "manager-report-b",
          email: "manager-report-b@roomlog.test",
          passwordHash: "hash",
          name: "관리인B",
          role: "LANDLORD",
          status: "ACTIVE",
          createdAt
        }
      ],
      rooms: [
        {
          id: "room-report-a",
          buildingName: "정글빌라",
          roomNo: "301호",
          address: "서울시 성동구 리포트로 1",
          landlordId: "manager-report-a"
        },
        {
          id: "room-report-b",
          buildingName: "바깥빌라",
          roomNo: "401호",
          address: "서울시 성동구 리포트로 2",
          landlordId: "manager-report-b"
        }
      ],
      tenantRooms: {
        "tenant-report-a": "room-report-a",
        "tenant-report-b": "room-report-b"
      },
      vendors: [],
      vendorInvites: [],
      tenantInvites: [],
      contracts: [
        {
          id: "contract-report-a",
          roomId: "room-report-a",
          tenantId: "tenant-report-a",
          managerId: "manager-report-a",
          unitId: "301",
          landlordName: "관리인A",
          lifecycle: "active",
          review: "confirmed",
          deletion: "none",
          valueSource: "confirmed",
          monthlyRent: 700000,
          maintenanceFee: 70000,
          paymentDay: 25,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2027-01-01T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt,
          confirmedAt: createdAt,
          confirmedByManagerId: "manager-report-a"
        }
      ],
      contractDocuments: [],
      contractExtractions: [],
      contractPrivacies: [],
      contractInvites: [],
      attachments: [],
      floorPlans: [],
      moveInChecklist: [],
      aiFeedback: [],
      intakeSessions: [],
      complaints: [
        {
          id: "complaint-report-a",
          tenantId: "tenant-report-a",
          roomId: "room-report-a",
          ticketId: "ticket-report-a",
          sourceChannel: "DIRECT_FORM",
          title: "욕실 누수 민원",
          description: "민감메모: 세입자 연락처 010-1111-2222로만 연락 요청",
          location: "욕실",
          status: "REVIEWING",
          createdAt,
          updatedAt: createdAt
        }
      ],
      analyses: {
        "ticket-report-a": {
          summary: "욕실 누수 검토 필요",
          category: "하자",
          priority: 2,
          responsibilityHint: "판단 어려움",
          confidenceScore: 0.62,
          reasons: ["반복 누수 가능성"],
          recommendedAction: "관리인 확인"
        }
      },
      tickets: [
        {
          id: "ticket-report-a",
          complaintId: "complaint-report-a",
          tenantId: "tenant-report-a",
          roomId: "room-report-a",
          sourceChannel: "DIRECT_FORM",
          category: "하자",
          priority: 2,
          status: "REVIEWING",
          responsibilityHint: "판단 어려움",
          aiSummary: "욕실 누수 검토 필요",
          createdAt,
          updatedAt: createdAt
        }
      ],
      repairs: [],
      costs: [
        {
          id: "cost-report-a",
          managerId: "manager-report-a",
          date: "2026-06-20T00:00:00.000Z",
          item: "욕실 누수 점검비",
          amount: 120000,
          type: "repair",
          scope: "unit",
          unitId: "301",
          status: "confirmed",
          verified: true,
          disclosure: "private",
          repairPayment: "unpaid",
          paymentRef: "invoice-report-a",
          createdAt,
          updatedAt: createdAt
        }
      ],
      receipts: [],
      receiptOcrs: [],
      messages: [],
      messagingThreads: [],
      messagingMessages: [],
      messagingAnnouncementDrafts: [],
      messagingAnnouncements: [],
      messagingAnnouncementDeliveries: [],
      history: [],
      moveouts: [
        {
          id: "moveout-report-a",
          tenantId: "tenant-report-a",
          roomId: "room-report-a",
          contractId: "contract-report-a",
          unitId: "301",
          contractConfirmed: true,
          leaseEndDate: "2026-12-31T00:00:00.000Z",
          daysRemaining: 183,
          depositAmount: 10000000,
          settlementStatus: "estimate",
          prepProgress: 0.3,
          createdAt,
          updatedAt: createdAt
        }
      ],
      moveoutRecords: [],
      moveoutChecklist: [],
      moveoutSettlements: [],
      moveoutDeductions: [],
      moveoutDisputes: [],
      moveoutReportAudits: []
    } as any
  } as any);
}

describe("RoomlogService", () => {
  it("seeds manager billing dummy rows across every billing management list", () => {
    const service = new RoomlogService();

    const dashboard = service.getManagerBillDashboard("landlord-demo");
    const collection = service.getManagerCollection("landlord-demo");
    const deposits = service.listManagerBillDeposits("landlord-demo");
    const overdue = service.listManagerOverdueCases("landlord-demo");

    assert.equal(dashboard.bills.length >= 5, true, "청구 목록은 최소 5건이어야 한다.");
    assert.equal(collection.recentDeposits.length, 5, "최근 입금은 5건이어야 한다.");
    assert.equal(deposits.paymentReports.length, 5, "납부 신고 큐는 5건이어야 한다.");
    assert.equal(deposits.deposits.length, 5, "실제 입금 매칭은 5건이어야 한다.");
    assert.equal(deposits.orphanDeposits.length, 5, "orphan 입금 큐는 5건이어야 한다.");
    assert.equal(deposits.mismatchDeposits.length, 5, "불일치 확인 요청은 5건이어야 한다.");
    assert.equal(overdue.activeCases.length, 5, "연체 세대 목록은 5건이어야 한다.");
    assert.equal(overdue.waitingCases.length, 5, "확인 대기 목록은 5건이어야 한다.");
  });

  it("backfills manager billing dummy rows when a persisted demo snapshot has empty billing tables", () => {
    const legacyDemoSnapshot = JSON.parse(
      JSON.stringify((new RoomlogService({ seedDemoData: true } as any) as any).store)
    );

    legacyDemoSnapshot.bills = [];
    legacyDemoSnapshot.paymentReports = [];
    legacyDemoSnapshot.deposits = [];
    legacyDemoSnapshot.maintenanceFees = [];

    const service = new RoomlogService({
      seedDemoData: true,
      initialStore: legacyDemoSnapshot
    } as any);

    const dashboard = service.getManagerBillDashboard("landlord-demo");
    const collection = service.getManagerCollection("landlord-demo");
    const deposits = service.listManagerBillDeposits("landlord-demo");
    const overdue = service.listManagerOverdueCases("landlord-demo");

    assert.equal(dashboard.bills.length >= 5, true, "청구 목록은 최소 5건이어야 한다.");
    assert.equal(collection.recentDeposits.length, 5, "최근 입금은 5건이어야 한다.");
    assert.equal(deposits.paymentReports.length, 5, "납부 신고 큐는 5건이어야 한다.");
    assert.equal(deposits.deposits.length, 5, "실제 입금 매칭은 5건이어야 한다.");
    assert.equal(deposits.orphanDeposits.length, 5, "orphan 입금 큐는 5건이어야 한다.");
    assert.equal(deposits.mismatchDeposits.length, 5, "불일치 확인 요청은 5건이어야 한다.");
    assert.equal(overdue.activeCases.length, 5, "연체 세대 목록은 5건이어야 한다.");
    assert.equal(overdue.waitingCases.length, 5, "확인 대기 목록은 5건이어야 한다.");
  });

  it("seeds manager ticket dashboard dummy rows with analyses and repair flows", () => {
    const service = new RoomlogService();

    const tickets = service.listTicketsForManager("landlord-demo");
    const titles = tickets.map((ticket: any) => ticket.complaint.title).join("\n");

    assert.equal(tickets.length, 5, "티켓 처리 대시보드는 데모 티켓 5건을 표시해야 한다.");
    assert.match(titles, /에어컨/);
    assert.match(titles, /세면대/);

    for (const ticket of tickets as any[]) {
      assert.ok(ticket.analysis, `${ticket.id}는 AI 분석을 포함해야 한다.`);
      assert.equal(ticket.repairs.length >= 1, true, `${ticket.id}는 하위 수리 흐름을 포함해야 한다.`);
    }
  });

  it("lets the manager realtime agent report ticket query results by defect keyword", () => {
    const service = new RoomlogService();

    const airconResult = service.runManagerAgentCommand("landlord-demo", {
      command: "ticket.query",
      text: "에어컨 티켓 조회해서 결과 보고해줘"
    });
    const sinkResult = service.runManagerAgentCommand("landlord-demo", {
      command: "ticket.query",
      text: "세면대 누수 티켓 조회해서 결과 보고해줘"
    });

    const airconTickets = ((airconResult.data as any).matchedTickets ?? []) as any[];
    const sinkTickets = ((sinkResult.data as any).matchedTickets ?? []) as any[];

    assert.equal(airconResult.status, "executed");
    assert.equal(airconTickets.length, 1);
    assert.match(airconResult.summary, /에어컨/);
    assert.equal(airconTickets[0].ticketId, "ticket-demo-aircon");
    assert.equal((airconResult.data as any).filters.includes("키워드: 에어컨"), true);

    assert.equal(sinkResult.status, "executed");
    assert.equal(sinkTickets.length, 1);
    assert.match(sinkResult.summary, /세면대/);
    assert.equal(sinkTickets[0].ticketId, "ticket-demo-sink");
    assert.equal((sinkResult.data as any).filters.includes("키워드: 세면대"), true);
  });

  it("stores uploaded image files locally and rejects non-image files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-upload-"));
    const service = new RoomlogService({
      uploadDir: dir,
      publicUploadBaseUrl: "/api/files"
    });
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
    ]);

    try {
      const attachment = await service.saveAttachment("tenant-demo", {
        buffer: pngBytes,
        originalName: "../leak photo.png",
        mimeType: "image/png",
        category: "COMPLAINT_PHOTO"
      });

      assert.equal(attachment.mimeType, "image/png");
      assert.equal(attachment.sizeBytes, pngBytes.length);
      assert.equal(attachment.fileUrl.startsWith("/api/files/"), true);
      assert.equal(attachment.fileName.includes(".."), false);
      assert.equal(existsSync(join(dir, attachment.fileName)), true);
      assert.deepEqual(readFileSync(join(dir, attachment.fileName)), pngBytes);
      await assert.rejects(
        async () =>
          await service.saveAttachment("tenant-demo", {
            buffer: Buffer.from("not an image"),
            originalName: "note.txt",
            mimeType: "text/plain",
            category: "COMPLAINT_PHOTO"
          }),
        /이미지/
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("saves an independent 2D and 3D floor plan draft without a room dependency", async () => {
    const service = new RoomlogService();
    const attachment = await service.saveAttachment("landlord-demo", {
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
      ]),
      originalName: "floor-plan.png",
      mimeType: "image/png",
      category: "FLOOR_PLAN_SOURCE"
    });

    const created = service.createFloorPlanDraft("landlord-demo", {
      sourceAttachmentId: attachment.id,
      sourceImageUrl: attachment.fileUrl,
      pixelToMmRatio: 18.5,
      walls: [
        { id: "wall-a", start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
        { id: "wall-b", start: { x: 120, y: 0 }, end: { x: 120, y: 80 } }
      ],
      hiddenWallIds: ["wall-b"],
      extractionMeta: {
        processingMs: 842,
        detectedWallCount: 2,
        removedNoiseCount: 14,
        scaleCandidates: [{ pixelLength: 220, realLengthMm: 5860, pixelToMmRatio: 26.64, confidence: 0.88 }],
        scaleConfirmed: true
      },
      openings: [{ id: "opening-a", type: "DOOR", status: "CONFIRMED", confidence: 0.81, source: "arc" }],
      fixtures: [{ id: "fixture-a", type: "SINK", status: "CONFIRMED", confidence: 0.76, source: "ocr+shape" }],
      room3d: {
        openings: [{ id: "opening-a" }],
        fixtures: [{ id: "fixture-a" }],
        walls: [{ id: "wall-a-3d", dimensions: { width: 2.2, height: 2.5, depth: 0.15 } }]
      }
    });

    assert.equal(created.ownerId, "landlord-demo");
    assert.equal(created.status, "DRAFT");
    assert.equal(created.sourceAttachmentId, attachment.id);
    assert.equal(created.sourceImageUrl, attachment.fileUrl);
    assert.equal(created.pixelToMmRatio, 18.5);
    assert.equal(created.walls.length, 2);
    assert.deepEqual(created.hiddenWallIds, ["wall-b"]);
    assert.equal(created.extractionMeta.scaleConfirmed, true);
    assert.equal(created.openings[0].status, "CONFIRMED");
    assert.equal(created.fixtures[0].type, "SINK");
    assert.deepEqual(created.furnitures, []);
    assert.equal("roomId" in created, false);

    const fetched = service.getFloorPlanDraft("landlord-demo", created.id);
    assert.equal(fetched.id, created.id);

    const updated = service.updateFloorPlanDraft("landlord-demo", created.id, {
      pixelToMmRatio: 20,
      hiddenWallIds: [],
      walls: [created.walls[0]],
      status: "PUBLISHED",
      extractionMeta: { ...created.extractionMeta, scaleConfirmed: true },
      openings: [{ ...created.openings[0], status: "CONFIRMED" }],
      fixtures: [{ ...created.fixtures[0], status: "CONFIRMED" }],
      room3d: { walls: [{ id: "wall-a-3d", dimensions: { width: 2.4, height: 2.5, depth: 0.15 } }] }
    });

    assert.equal(updated.pixelToMmRatio, 20);
    assert.equal(updated.status, "PUBLISHED");
    assert.equal(updated.walls.length, 1);
    assert.deepEqual(updated.hiddenWallIds, []);
    assert.throws(() => service.getFloorPlanDraft("tenant-demo", created.id), /집주인|권한/);
  });

  it("blocks publishing a commercial floor plan until scale and 3D data are confirmed", () => {
    const service = new RoomlogService();
    const created = service.createFloorPlanDraft("landlord-demo", {
      pixelToMmRatio: 18.5,
      walls: [{ id: "wall-a", start: { x: 0, y: 0 }, end: { x: 120, y: 0 } }],
      extractionMeta: { scaleConfirmed: false },
      room3d: {}
    });

    assert.throws(
      () =>
        service.updateFloorPlanDraft("landlord-demo", created.id, {
          status: "PUBLISHED",
          extractionMeta: { scaleConfirmed: false },
          room3d: {}
        }),
      /축척|3D|발행/
    );
  });

  it("stores room walls from detected floor-plan coordinates and returns simulator wallsData", () => {
    const service = new RoomlogService();

    const created = service.createRoom("landlord-demo", {
      buildingName: "도면빌라",
      roomNo: "501호",
      address: "서울시 성동구 도면로 5",
      roomData: {
        pixelToMmRatio: 20,
        walls: [
          { id: "wall-a", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
          { id: "wall-b", start: { x: 100, y: 0 }, end: { x: 100, y: 80 } }
        ]
      }
    });

    assert.equal(created.room.buildingName, "도면빌라");
    assert.equal(created.roomWalls.length, 2);
    assert.equal(created.roomWalls[0].roomId, created.room.id);
    assert.equal(created.roomWalls[0].sourceWallId, "wall-a");
    assert.equal(created.roomWalls[0].lengthMm, 2000);
    assert.equal(created.roomWalls[0].rotationRad, 0);
    assert.equal(created.roomWalls[1].lengthMm, 1600);

    const simulator = service.loadSimulatorRoom(created.room.id);
    assert.equal(simulator.room.id, created.room.id);
    assert.equal(simulator.wallsData.length, 2);
    assert.deepEqual(simulator.wallsData[0].dimensions, { width: 2, height: 2.5, depth: 0.15 });
    assert.deepEqual(simulator.wallsData[0].position, [-0.5, 1.25, -0.4]);
    assert.equal(simulator.room_objects.length, 0);

    const updatedWalls = service.replaceRoomWalls("landlord-demo", created.room.id, {
      pixelToMmRatio: 10,
      walls: [{ id: "wall-c", start: { x: 0, y: 0 }, end: { x: 0, y: 300 } }]
    });

    assert.equal(updatedWalls.length, 1);
    assert.equal(updatedWalls[0].sourceWallId, "wall-c");
    assert.equal(updatedWalls[0].lengthMm, 3000);
    assert.equal(service.loadSimulatorRoom(created.room.id).wallsData[0].dimensions.width, 3);
  });

  it("exposes hosted floor plan AI model choices including OpenAI vision", () => {
    const service = new RoomlogService();
    const models = service.listFloorPlanAiModels();

    assert.deepEqual(
      models.map((model) => model.id),
      [
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "nvidia/cosmos3-nano-reasoner",
        "openai/floor-plan-vision"
      ]
    );
    assert.equal(models.every((model) => model.mode === "vision-reasoning"), true);
  });

  it("uses NVIDIA integrate chat completions for floor plan reasoning models", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.NVIDIA_API_KEY;
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | undefined;

    process.env.NVIDIA_API_KEY = "nvapi-test";
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"summary":"도면 치수 후보를 검토했습니다.","scaleCandidates":[{"realLengthMm":5860,"pixelLength":320,"pixelToMmRatio":18.31,"confidence":0.82,"source":"nvidia/vlm"}]}'
              }
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.analyzeFloorPlanWithAi({
        imageDataUrl: "data:image/png;base64,Zm9v",
        model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
      });

      assert.equal(capturedUrl, "https://integrate.api.nvidia.com/v1/chat/completions");
      assert.equal(capturedBody?.model, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
      assert.equal(result.status, "ready");
      assert.equal(result.scaleCandidates[0].realLengthMm, 5860);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.NVIDIA_API_KEY = originalApiKey;
      else delete process.env.NVIDIA_API_KEY;
    }
  });

  it("detects floor plan openings via Roboflow and maps them to normalized candidates", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.ROBOFLOW_API_KEY;
    const originalModel = process.env.ROBOFLOW_FLOOR_PLAN_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";

    process.env.ROBOFLOW_API_KEY = "rf-test-key";
    process.env.ROBOFLOW_FLOOR_PLAN_MODEL = "cubicasa5k-2-qpmsa/1";
    globalThis.fetch = (async (input) => {
      capturedUrl = String(input);

      return new Response(
        JSON.stringify({
          image: { width: 1000, height: 500 },
          predictions: [
            { class: "window", confidence: 0.81, x: 450, y: 40, width: 180, height: 36 },
            { class: "door", confidence: 0.28, x: 500, y: 420, width: 20, height: 140 },
            // 같은 자리 중복 판정(겹침 큼) — 신뢰도 낮은 쪽이 제거되어야 함
            { class: "window", confidence: 0.31, x: 500, y: 421, width: 22, height: 138 },
            // wall 클래스는 openings가 아니라 walls로 분리
            { class: "wall", confidence: 0.7, x: 500, y: 250, width: 900, height: 20 },
            // 하한 미달 창문(30% 미만)은 제외
            { class: "window", confidence: 0.17, x: 900, y: 480, width: 30, height: 30 }
          ]
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.detectFloorPlanOpenings({ imageDataUrl: "data:image/png;base64,Zm9v" });

      assert.match(capturedUrl, /detect\.roboflow\.com\/cubicasa5k-2-qpmsa\/1/);
      assert.match(capturedUrl, /api_key=rf-test-key/);
      assert.match(capturedUrl, /confidence=20/);
      assert.equal(result.status, "ready");
      assert.equal(result.openings.length, 3);
      const window = result.openings.find((item) => item.type === "WINDOW");
      const door = result.openings.find((item) => item.type === "DOOR");
      assert.equal(window?.confidence, 0.81);
      // 중심 (450,40) 크기 180x36, 이미지 1000x500 → 좌상단 (360,44) 크기 (180,72) [0-1000 정규화]
      assert.equal(window?.boundingBox.x, 360);
      assert.equal(window?.boundingBox.y, 44);
      assert.equal(window?.boundingBox.width, 180);
      assert.equal(window?.boundingBox.height, 72);
      // 후보 검토용으로 door/window가 겹쳐도 서로 다른 타입이면 둘 다 남긴다
      assert.equal(door?.confidence, 0.28);
      assert.equal(result.openings.some((item) => item.confidence === 0.17), false);
      // wall 클래스는 walls 배열로 분리: 중심 (500,250) 크기 900x20, 이미지 1000x500 → 좌상단 (50,480) 크기 (900,40)
      assert.equal(result.walls.length, 1);
      assert.equal(result.walls[0].confidence, 0.7);
      assert.equal(result.walls[0].boundingBox.x, 50);
      assert.equal(result.walls[0].boundingBox.y, 480);
      assert.equal(result.walls[0].boundingBox.width, 900);
      assert.equal(result.walls[0].boundingBox.height, 40);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.ROBOFLOW_API_KEY = originalApiKey;
      else delete process.env.ROBOFLOW_API_KEY;
      if (originalModel) process.env.ROBOFLOW_FLOOR_PLAN_MODEL = originalModel;
      else delete process.env.ROBOFLOW_FLOOR_PLAN_MODEL;
    }
  });

  it("uses the current Roboflow Universe model version by default", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.ROBOFLOW_API_KEY;
    const originalModel = process.env.ROBOFLOW_FLOOR_PLAN_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";

    process.env.ROBOFLOW_API_KEY = "rf-test-key";
    delete process.env.ROBOFLOW_FLOOR_PLAN_MODEL;
    globalThis.fetch = (async (input) => {
      capturedUrl = String(input);

      return new Response(JSON.stringify({ image: { width: 1000, height: 500 }, predictions: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }) as typeof fetch;

    try {
      await service.detectFloorPlanOpenings({ imageDataUrl: "data:image/png;base64,Zm9v" });

      assert.match(capturedUrl, /detect\.roboflow\.com\/cubicasa5k-2-qpmsa\/6/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.ROBOFLOW_API_KEY = originalApiKey;
      else delete process.env.ROBOFLOW_API_KEY;
      if (originalModel) process.env.ROBOFLOW_FLOOR_PLAN_MODEL = originalModel;
      else delete process.env.ROBOFLOW_FLOOR_PLAN_MODEL;
    }
  });

  it("deduplicates nested Roboflow door and wall boxes before returning candidates", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.ROBOFLOW_API_KEY;
    const originalFetch = globalThis.fetch;

    process.env.ROBOFLOW_API_KEY = "rf-test-key";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          image: { width: 1000, height: 500 },
          predictions: [
            { class: "door", confidence: 0.6, x: 500, y: 180, width: 360, height: 80 },
            { class: "door", confidence: 0.16, x: 500, y: 180, width: 280, height: 40 },
            { class: "wall", confidence: 0.54, x: 820, y: 230, width: 80, height: 320 },
            { class: "wall", confidence: 0.35, x: 830, y: 235, width: 70, height: 300 }
          ]
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )) as typeof fetch;

    try {
      const result = await service.detectFloorPlanOpenings({ imageDataUrl: "data:image/png;base64,Zm9v" });

      assert.equal(result.openings.length, 1);
      assert.equal(result.openings[0].type, "DOOR");
      assert.equal(result.openings[0].confidence, 0.6);
      assert.equal(result.walls.length, 1);
      assert.equal(result.walls[0].confidence, 0.54);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.ROBOFLOW_API_KEY = originalApiKey;
      else delete process.env.ROBOFLOW_API_KEY;
    }
  });

  it("returns config-required for opening detection when ROBOFLOW_API_KEY is missing", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.ROBOFLOW_API_KEY;
    delete process.env.ROBOFLOW_API_KEY;

    try {
      const result = await service.detectFloorPlanOpenings({ imageDataUrl: "data:image/png;base64,Zm9v" });

      assert.equal(result.status, "config-required");
      assert.equal(result.openings.length, 0);
    } finally {
      if (originalApiKey) process.env.ROBOFLOW_API_KEY = originalApiKey;
    }
  });

  it("uses OpenAI Responses for the floor plan vision model", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFloorPlanModel = process.env.OPENAI_FLOOR_PLAN_MODEL;
    const originalChatModel = process.env.OPENAI_CHAT_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_FLOOR_PLAN_MODEL = "gpt-5.4-mini";
    delete process.env.OPENAI_CHAT_MODEL;
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text:
            '{"summary":"OpenAI가 도면 구조와 치수 후보를 검토했습니다.","textDetections":[{"text":"5860","confidence":0.84,"boundingBox":{"x":120,"y":80,"width":60,"height":20},"targetLine":{"x1":100,"y1":110,"x2":460,"y2":110}}],"scaleCandidates":[{"realLengthMm":5860,"pixelLength":293,"pixelToMmRatio":20,"confidence":0.78,"source":"openai/vision"}]}'
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.analyzeFloorPlanWithAi({
        imageDataUrl: "data:image/png;base64,Zm9v",
        model: "openai/floor-plan-vision"
      });

      assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
      assert.equal(capturedHeaders?.get("Authorization"), "Bearer sk-test-roomlog");
      assert.equal(capturedBody?.model, "gpt-5.4-mini");
      assert.match(String(capturedBody?.instructions), /단위 없는 3-5자리 치수 숫자/);
      assert.match(String(capturedBody?.instructions), /textDetections에 모든 보이는 치수 숫자/);
      assert.match(String(capturedBody?.instructions), /targetLine/);
      assert.match(String(capturedBody?.instructions), /Do not guess boundingBox or targetLine/);
      assert.equal(result.status, "ready");
      assert.equal(result.model, "openai/floor-plan-vision");
      assert.deepEqual(result.textDetections[0].targetLine, { x1: 100, y1: 110, x2: 460, y2: 110 });
      assert.equal(result.scaleCandidates[0].source, "openai/vision");
      assert.equal(result.scaleCandidates[0].pixelToMmRatio, 20);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalFloorPlanModel) process.env.OPENAI_FLOOR_PLAN_MODEL = originalFloorPlanModel;
      else delete process.env.OPENAI_FLOOR_PLAN_MODEL;
      if (originalChatModel) process.env.OPENAI_CHAT_MODEL = originalChatModel;
      else delete process.env.OPENAI_CHAT_MODEL;
    }
  });

  it("classifies dimensions and keeps furniture out of floor plan scale candidates", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFloorPlanModel = process.env.OPENAI_FLOOR_PLAN_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_FLOOR_PLAN_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text:
            '{"summary":"분류 완료","dimensions":[{"text":"5860mm","valueMm":5860,"kind":"outer_total","axis":"horizontal","confidence":0.9,"boundingBox":null,"targetLine":null,"placementStatus":"placed","useForScale":true,"useForWallGeneration":true,"useForFurnitureFit":false,"appliesTo":"overall","reason":"outer"},{"text":"1500 x 2000mm","valueMm":2000,"kind":"furniture","axis":"unknown","confidence":0.7,"boundingBox":null,"targetLine":null,"placementStatus":"unplaced","useForScale":false,"useForWallGeneration":false,"useForFurnitureFit":true,"appliesTo":"bed","reason":"multiplication label"}],"textDetections":[],"scaleCandidates":[{"realLengthMm":5860,"pixelLength":293,"pixelToMmRatio":20,"confidence":0.8,"source":"openai/vision"},{"realLengthMm":2000,"pixelLength":100,"pixelToMmRatio":20,"confidence":0.6,"source":"openai/vision"}]}'
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.analyzeFloorPlanWithAi({
        imageDataUrl: "data:image/png;base64,Zm9v",
        model: "openai/floor-plan-vision"
      });

      const instructions = String(capturedBody?.instructions);
      assert.match(instructions, /outer_total/);
      assert.match(instructions, /opening/);
      assert.match(instructions, /furniture/);
      assert.equal(result.dimensions?.length, 2);
      assert.equal(result.dimensions?.[0].kind, "outer_total");
      assert.equal(result.dimensions?.[0].useForScale, true);
      assert.equal(result.dimensions?.[1].kind, "furniture");
      assert.equal(result.dimensions?.[1].useForScale, false);
      assert.equal(result.dimensions?.[1].useForFurnitureFit, true);
      // 구조 치수(5860)만 축척 후보로 남고 가구값(2000)은 제외된다.
      assert.equal(result.scaleCandidates.length, 1);
      assert.equal(result.scaleCandidates[0].realLengthMm, 5860);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalFloorPlanModel) process.env.OPENAI_FLOOR_PLAN_MODEL = originalFloorPlanModel;
      else delete process.env.OPENAI_FLOOR_PLAN_MODEL;
    }
  });

  it("uses OpenAI Responses to review OpenCV floor plan wall candidates", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFloorPlanModel = process.env.OPENAI_FLOOR_PLAN_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_FLOOR_PLAN_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text:
            '{"summary":"OpenCV 후보를 검토했습니다.","candidateReviews":[{"id":"W1","verdict":"keep","confidence":0.86,"reason":"외곽 벽과 일치"}],"missingWallHints":[{"description":"오른쪽 세로 외곽 벽이 약하게 누락됨","confidence":0.62,"orientation":"vertical","line":{"x1":860,"y1":120,"x2":860,"y2":910}}]}'
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.analyzeFloorPlanWithAi({
        analysisMode: "candidate-review",
        imageDataUrl: "data:image/png;base64,Zm9v",
        model: "openai/floor-plan-vision",
        wallCandidates: [
          {
            end: { x: 120, y: 10 },
            id: "W1",
            lengthPx: 110,
            orientation: "horizontal",
            start: { x: 10, y: 10 }
          }
        ]
      });

      assert.match(String(capturedBody?.instructions), /OpenCV 도면 벽 후보 검토기/);
      assert.match(String(capturedBody?.instructions), /0~1000 정규화 좌표/);
      assert.match(String(capturedBody?.instructions), /candidateReviews/);
      assert.equal((capturedBody?.text as any)?.format?.type, "json_schema");
      assert.equal((capturedBody?.text as any)?.format?.strict, true);
      assert.equal((capturedBody?.text as any)?.format?.schema?.properties?.missingWallHints?.items?.properties?.line?.type, "object");
      assert.match(JSON.stringify(capturedBody), /wallCandidates/);
      assert.equal(result.analysisMode, "candidate-review");
      assert.equal(result.status, "ready");
      assert.equal(result.candidateReviews?.[0].id, "W1");
      assert.equal(result.candidateReviews?.[0].verdict, "keep");
      assert.equal(result.missingWallHints?.[0].description, "오른쪽 세로 외곽 벽이 약하게 누락됨");
      assert.equal(result.missingWallHints?.[0].orientation, "vertical");
      assert.equal(result.missingWallHints?.[0].line?.x1, 860);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalFloorPlanModel) process.env.OPENAI_FLOOR_PLAN_MODEL = originalFloorPlanModel;
      else delete process.env.OPENAI_FLOOR_PLAN_MODEL;
    }
  });

  it("uses OpenAI structured outputs for floor plan room structure analysis", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFloorPlanModel = process.env.OPENAI_FLOOR_PLAN_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_FLOOR_PLAN_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text:
            '{"summary":"방 구조를 분석했습니다.","planStyle":"double-line-hollow","noiseFlags":{"decorativeHatching":true,"watermark":false},"rooms":[{"label":"거실","confidence":0.82,"polygon":[{"x":100,"y":100},{"x":560,"y":100},{"x":560,"y":460},{"x":100,"y":460}]}]}'
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.analyzeFloorPlanWithAi({
        analysisMode: "room-structure",
        imageDataUrl: "data:image/png;base64,Zm9v",
        model: "openai/floor-plan-vision"
      });

      assert.match(String(capturedBody?.instructions), /방 구조 분석기/);
      assert.match(String(capturedBody?.instructions), /0~1000 정규화 좌표/);
      assert.equal((capturedBody?.text as any)?.format?.type, "json_schema");
      assert.equal((capturedBody?.text as any)?.format?.strict, true);
      assert.equal((capturedBody?.text as any)?.format?.schema?.properties?.planStyle?.type, "string");
      assert.match(JSON.stringify(capturedBody), /"detail":"high"/);
      assert.equal(result.analysisMode, "room-structure");
      assert.equal(result.status, "ready");
      assert.equal(result.planStyle, "double-line-hollow");
      assert.equal(result.noiseFlags?.decorativeHatching, true);
      assert.equal(result.rooms?.[0].label, "거실");
      assert.equal(result.rooms?.[0].polygon[2].x, 560);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalFloorPlanModel) process.env.OPENAI_FLOOR_PLAN_MODEL = originalFloorPlanModel;
      else delete process.env.OPENAI_FLOOR_PLAN_MODEL;
    }
  });

  it("persists users, intake threads, complaints, and tickets across service restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-store-"));
    const storeFilePath = join(dir, "store.json");

    try {
      const firstService = new RoomlogService({ storeFilePath });
      const auth = firstService.signup({
        email: "persisted-tenant@roomlog.test",
        password: "password123!",
        passwordConfirm: "password123!",
        name: "지속 세입자",
        phone: "010-7777-3001",
        role: "TENANT",
        buildingName: "지속 빌라",
        roomNo: "305호",
        address: "서울시 성동구 저장로 7"
      } as any);
      const firstThread = firstService.createIntakeSession(auth.userId, {
        sourceChannel: "REALTIME_CHAT"
      });
      const firstReply = await firstService.sendIntakeMessage(auth.userId, firstThread.session.id, {
        messageText:
          "305호 화장실 천장에서 물이 계속 떨어지고 오늘 저녁 7시 이후 방문 가능합니다.",
        attachmentUrls: ["/uploads/persisted-leak.jpg"],
        inputMode: "CHAT"
      });
      const finalized = firstService.finalizeIntakeSession(auth.userId, firstThread.session.id, {
        confirmedTitle: "305호 화장실 천장 누수",
        confirmedSummary: firstReply.session.draft.summary
      });

      const restartedService = new RoomlogService({ storeFilePath });
      const restartedAuth = restartedService.login({
        email: "persisted-tenant@roomlog.test",
        password: "password123!"
      });
      const persistedThreads = restartedService.listIntakeSessions(restartedAuth.userId);
      const persistedComplaints = restartedService.listTenantComplaints(restartedAuth.userId);

      assert.equal(restartedAuth.name, "지속 세입자");
      assert.equal(persistedThreads[0].id, firstThread.session.id);
      assert.equal(persistedThreads[0].status, "FINALIZED");
      assert.equal(persistedComplaints[0].id, finalized.complaint.id);
      assert.equal(persistedComplaints[0].ticket.id, finalized.ticket.id);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("can start without seeded demo accounts for production-style signup flows", () => {
    const service = new RoomlogService({ seedDemoData: false } as any);

    assert.throws(
      () =>
        service.login({
          email: "tenant@roomlog.test",
          password: "password123!"
        }),
      /올바르지/
    );
    assert.throws(() => service.getDemoState(), /데모/);
  });

  it("creates a public seeker account without room credentials", () => {
    const service = new RoomlogService({ seedDemoData: false } as any);
    const auth = service.signup({
      email: "public-seeker@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "Public Seeker",
      role: "SEEKER"
    });

    assert.equal(auth.role, "SEEKER");
    const me = service.getMe(`Bearer ${auth.accessToken}`);
    assert.equal(me.role, "SEEKER");
    assert.equal(me.roomId, undefined);
    assert.equal(me.managedRooms, undefined);
    assert.deepEqual(me.roles, ["SEEKER"]);
    assert.equal(me.primaryRole, "SEEKER");
  });

  it("derives roles from relations so one account can be TENANT and LANDLORD at once", () => {
    const service = new RoomlogService();
    const auth = service.login({ email: "multi@roomlog.test", password: "password123!" });

    assert.deepEqual([...auth.roles].sort(), ["LANDLORD", "SEEKER", "TENANT"]);

    const me = service.getMe(`Bearer ${auth.accessToken}`);
    assert.equal(me.primaryRole, "TENANT");
    assert.deepEqual([...me.roles].sort(), ["LANDLORD", "SEEKER", "TENANT"]);
    assert.equal(me.roomId, "room-301");
    assert.equal(me.managedRooms?.some((room) => room.id === "room-402"), true);
  });

  it("lets a derived multi-role account pass both TENANT and LANDLORD capability guards", () => {
    const service = new RoomlogService();
    const controller = new RoomlogController(service, new RealtimeGateway());
    const auth = service.login({ email: "multi@roomlog.test", password: "password123!" });
    const header = `Bearer ${auth.accessToken}`;

    // legacy role 단일값은 TENANT지만 소유한 집(room-402)이 있어 LANDLORD 표면도 통과해야 한다.
    assert.ok(controller.getTenantHome(header));
    assert.ok(controller.listManagerTickets(header));
  });

  it("blocks missing capabilities with 403 instead of asking to re-login", () => {
    const service = new RoomlogService();
    const controller = new RoomlogController(service, new RealtimeGateway());
    const auth = service.login({ email: "multi@roomlog.test", password: "password123!" });

    assert.throws(
      () => controller.listVendorRepairs(`Bearer ${auth.accessToken}`),
      (error: { status?: number }) => error.status === 403
    );
  });

  it("links a tenant invite to the already-logged-in account instead of a new signup", () => {
    const service = new RoomlogService();
    const invite = service.createTenantInvite("landlord-demo", {
      roomId: "room-301",
      tenantName: "Linked Seeker",
      email: "linked-seeker@roomlog.test"
    });

    const seekerAuth = service.signup({
      email: "linked-seeker@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "Linked Seeker",
      role: "SEEKER"
    });
    assert.deepEqual(seekerAuth.roles, ["SEEKER"]);

    const linked = service.acceptInviteForUser(seekerAuth.userId, "TENANT", invite.inviteToken);
    assert.equal(linked.linked, "TENANT");
    assert.equal(linked.roomId, "room-301");
    assert.equal(linked.roles.includes("TENANT"), true);

    // 멱등: 같은 계정이 같은 초대를 다시 열어도 에러가 아니라 연결 상태를 돌려준다.
    const relinked = service.acceptInviteForUser(seekerAuth.userId, "TENANT", invite.inviteToken);
    assert.equal(relinked.roomId, "room-301");

    // 다른 계정이 이미 사용된 초대를 열면 막힌다.
    const otherAuth = service.login({ email: "tenant@roomlog.test", password: "password123!" });
    assert.throws(
      () => service.acceptInviteForUser(otherAuth.userId, "TENANT", invite.inviteToken),
      /이미 사용된/
    );

    const me = service.getMe(`Bearer ${seekerAuth.accessToken}`);
    assert.equal(me.roomId, "room-301");
    assert.equal(me.roles.includes("TENANT"), true);
  });

  it("blocks invite linking when the invite email does not match the account", () => {
    const service = new RoomlogService();
    const invite = service.createTenantInvite("landlord-demo", {
      roomId: "room-301",
      tenantName: "다른 사람",
      email: "someone-else@roomlog.test"
    });

    const seekerAuth = service.signup({
      email: "mismatch-seeker@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "Mismatch Seeker",
      role: "SEEKER"
    });

    assert.throws(
      () => service.acceptInviteForUser(seekerAuth.userId, "TENANT", invite.inviteToken),
      /이메일/
    );
  });

  it("logs in and links a verified Google account through the social auth flow", async () => {
    const originalFetch = globalThis.fetch;
    const originalClientId = process.env.GOOGLE_LOGIN_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_LOGIN_CLIENT_SECRET;
    const requests: string[] = [];

    process.env.GOOGLE_LOGIN_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "google-client-secret";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      requests.push(url);

      if (url === "https://oauth2.googleapis.com/token") {
        const body = String(init?.body);
        assert.match(body, /client_id=google-client-id/);
        assert.match(body, /redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fgoogle%2Fcallback/);

        return new Response(JSON.stringify({ access_token: "google-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer google-access-token");

        return new Response(
          JSON.stringify({
            sub: "google-user-001",
            email: "GoogleUser@Roomlog.Test",
            email_verified: true,
            name: "Google User",
            picture: "https://example.test/avatar.png"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    try {
      const service = new RoomlogService({ seedDemoData: false } as any);

      await assert.rejects(
        () =>
          service.loginWithGoogle({
            code: "google-code-before-signup",
            redirectUri: "http://localhost:3000/api/auth/google/callback",
            role: "TENANT"
          }),
        /SOCIAL_SIGNUP_REQUIRED/
      );
      assert.equal((service as any).store.users.length, 0);
      assert.equal((service as any).store.socialAccounts.length, 0);

      const auth = await service.loginWithGoogle({
        code: "google-code",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        role: "TENANT",
        flow: "signup"
      });

      assert.equal(auth.role, "TENANT");
      assert.equal(auth.name, "Google User");
      assert.equal(service.getMe(`Bearer ${auth.accessToken}`).email, "googleuser@roomlog.test");
      assert.equal((service as any).store.socialAccounts.length, 1);
      assert.equal((service as any).store.socialAccounts[0].provider, "GOOGLE");

      const linked = await service.loginWithGoogle({
        code: "google-code-again",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
        role: "TENANT"
      });

      assert.equal(linked.userId, auth.userId);
      assert.equal((service as any).store.users.length, 1);
      assert.equal((service as any).store.socialAccounts.length, 1);
      assert.equal(requests.filter((url) => url === "https://oauth2.googleapis.com/token").length, 3);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalClientId === undefined) delete process.env.GOOGLE_LOGIN_CLIENT_ID;
      else process.env.GOOGLE_LOGIN_CLIENT_ID = originalClientId;
      if (originalClientSecret === undefined) delete process.env.GOOGLE_LOGIN_CLIENT_SECRET;
      else process.env.GOOGLE_LOGIN_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("projects signup state to configured persistence", async () => {
    const projectedStores: any[] = [];
    const service = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: async (store: any) => {
          projectedStores.push(JSON.parse(JSON.stringify(store)));
        }
      }
    } as any);

    const auth = service.signup({
      email: "projected-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "저장 세입자",
      phone: "010-9191-3001",
      role: "TENANT",
      buildingName: "프로젝션 빌라",
      roomNo: "701호",
      address: "서울시 성동구 저장로 91"
    } as any);

    await (service as any).flushPersistence();
    const projected = projectedStores.at(-1);

    assert.equal(projected.users[0].id, auth.userId);
    assert.equal(projected.users[0].email, "projected-tenant@roomlog.test");
    assert.equal(projected.rooms[0].buildingName, "프로젝션 빌라");
    assert.equal(projected.tenantRooms[auth.userId], projected.rooms[0].id);
  });

  it("hydrates an initial store snapshot before falling back to demo seed data", async () => {
    const projectedStores: any[] = [];
    const firstService = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: async (store: any) => {
          projectedStores.push(JSON.parse(JSON.stringify(store)));
        }
      }
    } as any);
    const auth = firstService.signup({
      email: "hydrated-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "복원 세입자",
      phone: "010-9292-3001",
      role: "TENANT",
      buildingName: "복원 빌라",
      roomNo: "801호",
      address: "서울시 성동구 복원로 80"
    } as any);

    await firstService.flushPersistence();
    const hydratedService = new RoomlogService({
      seedDemoData: true,
      initialStore: projectedStores.at(-1)
    });
    const hydratedAuth = hydratedService.login({
      email: "hydrated-tenant@roomlog.test",
      password: "password123!"
    });

    assert.equal(hydratedAuth.userId, auth.userId);
    assert.equal(hydratedService.getMe(`Bearer ${hydratedAuth.accessToken}`).room?.roomNo, "801호");
    const demoAuth = hydratedService.login({
      email: "tenant@roomlog.test",
      password: "password123!"
    });

    assert.equal(demoAuth.userId, "tenant-demo");
    assert.equal(
      hydratedService.listTenantMoveouts("tenant-demo").some((moveout: any) => moveout.id === "mo_0001"),
      true
    );
  });

  it("exposes runtime config so clients can hide demo auth in production-style mode", () => {
    const productionStyleService = new RoomlogService({ seedDemoData: false } as any);
    const demoStyleService = new RoomlogService({ seedDemoData: true } as any);

    assert.deepEqual((productionStyleService as any).getRuntimeConfig(), {
      demoAuth: { enabled: false }
    });
    assert.deepEqual((demoStyleService as any).getRuntimeConfig(), {
      demoAuth: { enabled: true }
    });
  });

  it("returns a Realtime setup response tied to an intake thread when OpenAI is not configured", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REALTIME_MODEL;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { sourceChannel: "VOICE_CHAT" });

    await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText: "현관 도어락이 안 잠기고 밤에 문이 열린 상태라 불안합니다.",
      inputMode: "CHAT"
    });

    const result = await service.createRealtimeClientSecret("tenant-demo", session.id, {
      purpose: "TENANT_INTAKE",
      voice: "cedar"
    });

    assert.equal(result.mode, "not_configured");
    assert.equal(result.sessionId, session.id);
    assert.equal(result.voice, "cedar");
    assert.equal(result.model, "gpt-realtime-2");
    assert.match(result.instructions, /도어락/);
    assert.match(result.instructions, /책임 소재를 확정하지/);
    assert.match(result.warning ?? "", /OPENAI_API_KEY/);

    if (originalApiKey) {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalRealtimeModel) {
      process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel;
    }
  });

  it("applies tenant corrections to the intake draft before finalizing a ticket", async () => {
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "REALTIME_CHAT"
    });

    await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText:
        "301호 거실 에어컨에서 물이 떨어지고 곰팡이 냄새가 납니다. 오늘 저녁 7시 이후 방문 가능합니다.",
      attachmentUrls: ["/uploads/living-room-ac-leak.jpg"],
      inputMode: "CHAT"
    });

    const finalized = service.finalizeIntakeSession("tenant-demo", session.id, {
      confirmedTitle: "301호 거실 에어컨 배수 누수",
      confirmedSummary:
        "AI 초안의 위치와 유형을 세입자가 정정했습니다. 거실 에어컨 배수 문제로 물 떨어짐과 냄새가 함께 있습니다.",
      confirmedLocation: "301호 거실 에어컨 아래",
      confirmedCategory: "설비",
      confirmedDetailCategory: "에어컨",
      confirmedPriority: 2,
      confirmedResponsibilityHint: "판단 어려움",
      availableTimes: "오늘 저녁 7시 이후"
    });

    assert.equal(finalized.complaint.title, "301호 거실 에어컨 배수 누수");
    assert.equal(finalized.complaint.location, "301호 거실 에어컨 아래");
    assert.equal(finalized.complaint.availableTimes, "오늘 저녁 7시 이후");
    assert.equal(finalized.ticket.analysis.summary, finalized.complaint.description);
    assert.equal(finalized.ticket.analysis.category, "에어컨");
    assert.equal(finalized.ticket.analysis.detailCategory, "에어컨");
    assert.equal(finalized.ticket.analysis.priority, 2);
    assert.equal(finalized.ticket.analysis.responsibilityHint, "판단 어려움");
    assert.ok(
      finalized.ticket.analysis.reasons?.some((reason) =>
        reason.includes("세입자가 접수 전 AI 초안을 정정")
      )
    );
  });

  it("creates an OpenAI Realtime client secret with thread context and safety headers", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
    const originalTranscriptionModel = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { sourceChannel: "VOICE_CHAT" });
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    let capturedBody: Record<string, unknown> | undefined;

    await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText: "화장실 천장에서 물이 계속 떨어지고 오늘 저녁 7시 이후 방문 가능합니다.",
      attachmentUrls: ["/uploads/leak-305.jpg"],
      inputMode: "CHAT"
    });

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2";
    process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          value: "ek_roomlog_test",
          expires_at: 1790000000,
          session: {
            id: "sess_openai_test",
            type: "realtime",
            model: "gpt-realtime-2",
            instructions: "effective instructions",
            audio: {
              output: {
                voice: "marin"
              }
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    try {
      const result = await service.createRealtimeClientSecret("tenant-demo", session.id, {
        purpose: "TENANT_INTAKE",
        voice: "marin"
      });
      const sessionPayload = capturedBody?.session as {
        type?: string;
        model?: string;
        instructions?: string;
        audio?: {
          input?: {
            transcription?: { model?: string; language?: string };
            turn_detection?: {
              type?: string;
              threshold?: number;
              prefix_padding_ms?: number;
              silence_duration_ms?: number;
              create_response?: boolean;
              interrupt_response?: boolean;
            };
          };
          output?: { voice?: string };
        };
      };

      assert.equal(capturedUrl, "https://api.openai.com/v1/realtime/client_secrets");
      assert.equal(capturedHeaders?.get("Authorization"), "Bearer sk-test-roomlog");
      assert.ok(capturedHeaders?.get("OpenAI-Safety-Identifier"));
      assert.equal(sessionPayload.type, "realtime");
      assert.equal(sessionPayload.model, "gpt-realtime-2");
      assert.equal(
        sessionPayload.audio?.input?.transcription?.model,
        "gpt-4o-mini-transcribe"
      );
      assert.equal(sessionPayload.audio?.input?.transcription?.language, "ko");
      assert.equal(sessionPayload.audio?.input?.turn_detection?.type, "server_vad");
      assert.equal(typeof sessionPayload.audio?.input?.turn_detection?.threshold, "number");
      assert.equal(sessionPayload.audio?.input?.turn_detection?.prefix_padding_ms, 300);
      assert.equal(
        typeof sessionPayload.audio?.input?.turn_detection?.silence_duration_ms,
        "number"
      );
      assert.equal(sessionPayload.audio?.input?.turn_detection?.create_response, true);
      assert.equal(sessionPayload.audio?.input?.turn_detection?.interrupt_response, true);
      assert.equal(sessionPayload.audio?.output?.voice, "marin");
      assert.match(sessionPayload.instructions ?? "", /화장실/);
      assert.match(sessionPayload.instructions ?? "", /오늘 저녁 7시 이후/);
      assert.match(sessionPayload.instructions ?? "", /# 역할과 목표/);
      assert.match(sessionPayload.instructions ?? "", /# 대화 흐름/);
      assert.match(sessionPayload.instructions ?? "", /한 번에 하나의 질문/);
      assert.match(sessionPayload.instructions ?? "", /불명확한 음성/);
      assert.match(sessionPayload.instructions ?? "", /완료 기준/);
      assert.equal(result.mode, "openai");
      assert.equal(result.clientSecret?.value, "ek_roomlog_test");
      assert.equal(result.openaiSessionId, "sess_openai_test");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (originalRealtimeModel) {
        process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel;
      } else {
        delete process.env.OPENAI_REALTIME_MODEL;
      }
      if (originalTranscriptionModel) {
        process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL = originalTranscriptionModel;
      } else {
        delete process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL;
      }
    }
  });

  it("includes unresolved intake slots in callbot Realtime instructions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 물이 계속 떨어집니다. 통화라 사진은 아직 못 보냈습니다.",
        inputMode: "VOICE"
      });

      const result = await service.createRealtimeClientSecret("tenant-demo", session.id, {
        purpose: "CALLBOT_INTAKE",
        voice: "marin"
      });

      assert.equal(result.mode, "not_configured");
      assert.match(result.instructions, /전화 통화 기반 민원 접수 콜봇/);
      assert.match(result.instructions, /# 수집 정보 상태/);
      assert.match(result.instructions, /사진: 확인 필요/);
      assert.match(result.instructions, /방문 가능 시간: 확인 필요/);
      assert.match(result.instructions, /근접 사진|공간 전체 사진/);
      assert.match(result.instructions, /누락된 항목 중 가장 중요한 하나만 질문/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("records Realtime voice transcripts as isolated intake thread messages", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const first = service.createIntakeSession("tenant-demo", { sourceChannel: "VOICE_CHAT" });
    const second = service.createIntakeSession("tenant-demo", { sourceChannel: "VOICE_CHAT" });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", first.session.id, {
        userTranscript: "301호 화장실 천장에서 물이 떨어지고 오늘 저녁 7시 이후 방문 가능합니다.",
        assistantTranscript:
          "301호 화장실 천장 누수로 긴급 접수 초안을 만들었습니다. 사진이 있으면 함께 올려주세요.",
        eventId: "evt_voice_1"
      });
      const tenantMessages = result.session.messages.filter((message) => message.sender === "TENANT");
      const assistantMessages = result.session.messages.filter(
        (message) => message.sender === "AI_ASSISTANT"
      );

      assert.equal(result.session.sourceChannel, "VOICE_CHAT");
      assert.equal(result.session.draft.location, "301호 화장실");
      assert.equal(result.session.draft.priority, 1);
      assert.equal(result.session.draft.readyToFinalize, true);
      assert.equal(tenantMessages.length, 1);
      assert.equal(tenantMessages[0].inputMode, "VOICE");
      assert.equal(
        tenantMessages[0].transcriptText,
        "301호 화장실 천장에서 물이 떨어지고 오늘 저녁 7시 이후 방문 가능합니다."
      );
      assert.equal(assistantMessages.at(-1)?.messageText.includes("긴급 접수 초안"), true);
      assert.equal(service.getIntakeSession("tenant-demo", second.session.id).messages.length, 1);
      await assert.rejects(
        () =>
          service.recordRealtimeTurn("tenant-demo", first.session.id, {
            userTranscript: " ",
            assistantTranscript: ""
          }),
        /전사 내용/
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("deduplicates retried Realtime turns by event id", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { sourceChannel: "CALLBOT" });
    const turn = {
      userTranscript: "301호 화장실 천장에서 물이 떨어지고 오늘 저녁 7시 이후 방문 가능합니다.",
      assistantTranscript: "301호 화장실 천장 누수 상담을 콜봇 스레드에 기록했습니다.",
      eventId: "evt_retried_callbot_turn"
    };

    try {
      const first = await service.recordRealtimeTurn("tenant-demo", session.id, turn);
      const retried = (await service.recordRealtimeTurn("tenant-demo", session.id, turn)) as any;
      const detail = service.getIntakeSession("tenant-demo", session.id);
      const tenantMessages = detail.messages.filter((message) => message.sender === "TENANT");
      const assistantMessages = detail.messages.filter((message) => message.sender === "AI_ASSISTANT");

      assert.equal(first.session.messages.length, 3);
      assert.equal(retried.deduplicated, true);
      assert.equal(retried.recordedMessages.length, 2);
      assert.equal(detail.messages.length, 3);
      assert.equal(tenantMessages.length, 1);
      assert.equal(assistantMessages.length, 2);
      assert.equal(retried.session.threadSummary.messageCount, 3);
      assert.match(retried.turnSummary.spokenReply, /콜봇 스레드/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("summarizes each intake thread with last turns, counters, and finalize state", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const leak = service.createIntakeSession("tenant-demo", { sourceChannel: "REALTIME_CHAT" });
    const callbot = service.createIntakeSession("tenant-demo", { sourceChannel: "CALLBOT" });

    try {
      await service.sendIntakeMessage("tenant-demo", leak.session.id, {
        messageText:
          "301호 화장실 천장에서 물이 떨어지고 바닥이 젖었습니다. 오늘 저녁 8시 이후 방문 가능합니다.",
        attachmentUrls: [
          "/api/files/thread-leak-wide.png",
          "/api/files/thread-leak-close.png"
        ],
        inputMode: "CHAT"
      });
      await service.recordRealtimeTurn("tenant-demo", callbot.session.id, {
        userTranscript: "301호 현관 도어락이 잠기지 않습니다. 오늘 밤 확인 가능합니다.",
        assistantTranscript:
          "도어락 잠금 불량으로 안전 확인이 필요한 콜봇 상담 스레드에 기록했습니다.",
        eventId: "evt_callbot_thread_summary"
      });

      const threads = service.listIntakeSessions("tenant-demo") as Array<any>;
      const leakThread = threads.find((thread) => thread.id === leak.session.id);
      const callbotThread = threads.find((thread) => thread.id === callbot.session.id);
      const leakDetail = service.getIntakeSession("tenant-demo", leak.session.id) as any;

      assert.equal(leakThread.threadSummary.channelLabel, "AI 채팅");
      assert.match(leakThread.threadSummary.title, /301호|화장실|누수/);
      assert.match(leakThread.threadSummary.statusLabel, /접수 확정 가능/);
      assert.equal(leakThread.threadSummary.messageCount, 3);
      assert.equal(leakThread.threadSummary.attachmentCount, 2);
      assert.equal(leakThread.threadSummary.requiredInfoCount, 0);
      assert.equal(leakThread.threadSummary.readyToFinalize, true);
      assert.match(leakThread.threadSummary.lastUserMessage, /화장실 천장/);
      assert.match(leakThread.threadSummary.lastAssistantMessage, /접수|정리|관리자|사진/);
      assert.deepEqual(leakDetail.threadSummary, leakThread.threadSummary);

      assert.equal(callbotThread.threadSummary.channelLabel, "콜봇");
      assert.match(callbotThread.threadSummary.lastUserMessage, /도어락/);
      assert.match(callbotThread.threadSummary.lastAssistantMessage, /도어락/);
      assert.notEqual(
        leakThread.threadSummary.lastUserMessage,
        callbotThread.threadSummary.lastUserMessage
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("stores a generated AI voice reply when a Realtime turn only has the tenant transcript", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "VOICE_CHAT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "현관 도어락이 잠기지 않고 밤에 문이 열릴까 봐 불안합니다. 오늘 밤 확인 가능합니다.",
        eventId: "evt_voice_missing_assistant"
      });
      const assistantMessages = result.session.messages.filter(
        (message) => message.sender === "AI_ASSISTANT"
      );

      assert.ok(
        result.recordedMessages.some((message) => message.sender === "AI_ASSISTANT"),
        "expected the server-generated AI reply to be returned as a recorded voice message"
      );
      assert.equal(assistantMessages.length, 2);
      assert.match(assistantMessages.at(-1)?.messageText ?? "", /도어락|잠기|안전|확인/);
      assert.equal(result.session.draft.detailCategory, "도어락");
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("returns a realtime turn summary with next questions and photo actions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고입니다. 통화라 사진은 아직 못 보냈습니다.",
        eventId: "evt_voice_turn_summary"
      });

      assert.equal(result.turnSummary.channelLabel, "콜봇");
      assert.equal(result.turnSummary.detailCategory, "누수");
      assert.equal(result.turnSummary.priority, 1);
      assert.equal(result.turnSummary.requiresPhoto, true);
      assert.equal(result.turnSummary.readyToFinalize, false);
      assert.match(result.turnSummary.statusLabel, /추가 확인|사진|방문/);
      assert.match(result.turnSummary.spokenReply, /누수|사진|안전|전기|스레드/);
      assert.equal(
        result.turnSummary.nextQuestions.some((question) => /사진|근접|전체/.test(question)),
        true
      );
      assert.equal(
        result.turnSummary.nextQuestions.some((question) => /방문|시간/.test(question)),
        true
      );
      assert.equal(
        result.turnSummary.tenantGuidance.some((guide) => /전기|콘센트|스위치|물고임/.test(guide)),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("keeps required realtime follow-up questions when duplicate candidates exist", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    service.createComplaint("tenant-demo", {
      title: "301호 화장실 천장 누수",
      description: "화장실 천장에서 물이 떨어지고 바닥에 물이 고입니다.",
      location: "301호 화장실 천장",
      occurredAt: "2026-06-28T20:00:00.000Z",
      availableTimes: "평일 저녁"
    });
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고입니다. 통화라 사진은 아직 못 보냈습니다.",
        eventId: "evt_voice_turn_summary_duplicate"
      });

      assert.equal(result.session.draft.duplicateCandidates.length, 1);
      assert.equal(
        result.turnSummary.nextQuestions.some((question) => /사진|근접|전체/.test(question)),
        true
      );
      assert.equal(
        result.turnSummary.nextQuestions.some((question) => /방문|시간/.test(question)),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("does not mix unrelated same-room history into a different Realtime defect context", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    service.createComplaint("tenant-demo", {
      title: "301호 거실 에어컨 배수 문제",
      description: "거실 에어컨 아래로 물이 떨어지는 설비 문제이며 도어락과 무관한 기록입니다.",
      location: "301호 거실 에어컨 아래",
      availableTimes: "평일 저녁"
    });
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "VOICE_CHAT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "현관 도어락이 잠기지 않아 밤에 문이 열릴까 불안합니다. 오늘 밤 확인 가능합니다.",
        eventId: "evt_voice_doorlock_without_ac_context"
      });
      const latestAssistant = result.session.messages.at(-1)?.messageText ?? "";

      assert.equal(result.session.draft.detailCategory, "도어락");
      assert.equal(result.session.draft.duplicateCandidates.length, 0);
      assert.doesNotMatch(result.session.draft.contextHints.join(" "), /에어컨|배수/);
      assert.doesNotMatch(latestAssistant, /에어컨|배수/);
      assert.doesNotMatch(latestAssistant, /중복 가능성이 있는 기존 티켓/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("finalizes callbot transcripts into a ticket and keeps photo follow-up state", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어집니다. 통화라 사진은 아직 못 보냈고 오늘 저녁 방문 가능합니다.",
        assistantTranscript:
          "긴급 누수로 접수하겠습니다. 사진 업로드 링크를 보내드리고 관리자에게 전달하겠습니다.",
        eventId: "evt_callbot_1"
      });

      const result = service.createComplaintFromCall("tenant-demo", {
        callSessionId: session.id,
        recordingUrl: "https://example.com/recordings/call-301-leak.mp3"
      });
      const ticketText = result.ticket.messages
        .map((message) => message.messageText)
        .join("\n");
      const finalizedSession = service.getIntakeSession("tenant-demo", session.id);

      assert.equal(result.channel, "콜봇");
      assert.equal(result.needPhoto, true);
      assert.equal(result.status, "사진 업로드 링크 발송 대기");
      assert.match(result.photoUploadUrl ?? "", /\/tenant\/complaints\//);
      assert.equal(result.complaint.nextAction?.kind, "PHOTO_REQUEST");
      assert.equal(result.complaint.nextAction?.requiresPhoto, true);
      assert.match(result.complaint.nextAction?.title ?? "", /사진/);
      assert.match(result.complaint.nextAction?.description ?? "", /업로드 링크|사진/);
      assert.equal(result.ticket.sourceChannel, "CALLBOT");
      assert.equal(result.ticket.status, "ADDITIONAL_INFO_REQUESTED");
      assert.equal(result.complaint.displayStatus, "추가정보 요청");
      assert.equal(finalizedSession.status, "FINALIZED");
      assert.match(ticketText, /통화 녹음/);
      assert.match(ticketText, /사진 업로드 링크/);
      assert.match(ticketText, /301호 화장실 천장/);

      const managerDetail = service.getTicketDetailForManager("landlord-demo", result.ticket.id);

      assert.equal(managerDetail.callbot?.hasRecording, true);
      assert.equal(
        managerDetail.callbot?.recordingUrl,
        "https://example.com/recordings/call-301-leak.mp3"
      );
      assert.match(managerDetail.callbot?.transcriptText ?? "", /통화라 사진은 아직 못 보냈고/);
      assert.match(managerDetail.callbot?.aiSummary ?? "", /사진 업로드 링크를 보내드리고/);
      assert.equal(managerDetail.callbot?.needPhoto, true);
      assert.match(managerDetail.callbot?.photoUploadUrl ?? "", /\/tenant\/complaints\//);
      assert.equal(managerDetail.callbot?.statusNote, "사진 업로드 링크 발송 대기");

      service.addTenantComplaintMessage("tenant-demo", result.complaint.id, {
        messageText: "콜봇 안내 링크로 천장 전체 사진과 누수 근접 사진을 올렸습니다.",
        attachmentUrls: ["/api/files/callbot-followup-leak.png"]
      });
      const afterPhotoDetail = service.getTicketDetailForManager("landlord-demo", result.ticket.id);
      const afterTenantDetail = service.getComplaintDetail("tenant-demo", result.complaint.id);

      assert.equal(afterPhotoDetail.status, "REVIEWING");
      assert.equal(afterPhotoDetail.callbot?.needPhoto, false);
      assert.equal(afterPhotoDetail.callbot?.statusNote, "사진 수신 후 검토중");
      assert.equal(afterPhotoDetail.callbot?.photoUploadUrl, undefined);
      assert.equal(afterTenantDetail.nextAction, undefined);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses OpenAI Responses structured output for high quality intake chat replies", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalChatModel = process.env.OPENAI_CHAT_MODEL;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_CHAT_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage:
              "상황이 급해 보여요. 전기 스위치 주변으로 물이 번지면 만지지 말고, 바닥 물고임 사진 1장과 천장 전체 사진 1장을 올려주세요. 오늘 저녁 7시 이후 방문 가능 시간까지 접수 초안에 반영하겠습니다.",
            draft: {
              title: "305호 화장실 천장 누수",
              summary:
                "305호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고이는 긴급 누수 건입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "임대인 책임 가능성",
              confidenceScore: 0.91,
              reasons: ["천장에서 물이 계속 떨어짐", "바닥 물고임", "방문 가능 시간 확인"],
              recommendedAction: "관리자에게 긴급 티켓으로 전달하고 당일 업체 확인을 요청하세요.",
              requiredInfo: [],
              photoRequested: false,
              readyToFinalize: true,
              location: "305호 화장실",
              occurredAt: "오늘",
              availableTimes: "오늘 저녁 7시 이후"
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "305호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고여요. 오늘 저녁 7시 이후 방문 가능합니다.",
        attachmentUrls: ["/uploads/leak-305.jpg"],
        inputMode: "CHAT"
      });
      const textFormat = (capturedBody?.text as { format?: { type?: string; name?: string } })
        ?.format;

      assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
      assert.equal(capturedHeaders?.get("Authorization"), "Bearer sk-test-roomlog");
      assert.ok(capturedHeaders?.get("OpenAI-Safety-Identifier"));
      assert.equal(capturedBody?.model, "gpt-5.4-mini");
      assert.equal(textFormat?.type, "json_schema");
      assert.equal(textFormat?.name, "roomlog_intake_turn");
      assert.equal(result.session.draft.title, "305호 화장실 천장 누수");
      assert.equal(result.session.draft.readyToFinalize, true);
      assert.match(result.assistantMessage.messageText, /전기 스위치/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (originalChatModel) {
        process.env.OPENAI_CHAT_MODEL = originalChatModel;
      } else {
        delete process.env.OPENAI_CHAT_MODEL;
      }
    }
  });

  it("upgrades terse OpenAI intake replies using the structured draft context", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage: "확인했습니다.",
            draft: {
              title: "301호 화장실 천장 누수",
              summary:
                "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고이는 긴급 누수 건입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "임대인 책임 가능성",
              confidenceScore: 0.88,
              reasons: ["천장 누수", "바닥 물고임"],
              recommendedAction: "관리자에게 긴급 확인을 요청하세요.",
              contextHints: [],
              nextQuestions: [
                "물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?",
                "문제 부위 근접 사진 1장과 공간 전체가 보이는 사진 1장을 올려주실 수 있나요?",
                "관리자나 업체가 확인할 수 있는 방문 가능 시간대가 언제인가요?"
              ],
              tenantGuidance: [
                "물고임이 전기 콘센트, 조명, 스위치 근처라면 만지지 말고 안전한 곳에서 기다려주세요.",
                "사진은 문제 부위 근접 사진과 공간 전체 사진을 함께 올리면 관리자가 더 빨리 판단할 수 있습니다."
              ],
              photoAnalysis: {
                attachmentUrls: [],
                previousAttachmentUrls: [],
                candidates: ["누수"],
                comparisonStatus: "추가 사진 필요",
                summary: "누수 여부를 확인할 수 있는 사진이 필요합니다.",
                evidence: ["현재 상담 스레드에 하자 사진이 없습니다."],
                recommendedRetake: false
              },
              requiredInfo: [],
              photoRequested: true,
              readyToFinalize: true,
              location: "301호 화장실",
              occurredAt: "오늘",
              availableTimes: ""
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )) as typeof fetch;

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고여요.",
        inputMode: "CHAT"
      });

      assert.notEqual(result.assistantMessage.messageText.trim(), "확인했습니다.");
      assert.match(result.assistantMessage.messageText, /301호 화장실|누수|천장/);
      assert.match(result.assistantMessage.messageText, /전기|콘센트|조명|스위치/);
      assert.match(result.assistantMessage.messageText, /근접 사진|공간 전체|사진/);
      assert.match(result.assistantMessage.messageText, /방문 가능|시간/);
      assert.match(result.assistantMessage.messageText, /상담 스레드|접수 확정|관리자/);
      assert.equal(result.session.draft.readyToFinalize, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("upgrades OpenAI replies that miss Roomlog thread and handoff context", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage:
              "물이 계속 떨어진다면 전기 스위치나 콘센트 주변은 만지지 마세요. 문제 부위 근접 사진과 공간 전체 사진을 올려주시고 방문 가능한 시간도 알려주세요. 물이 지금도 떨어지는지 확인해 주세요?",
            draft: {
              title: "301호 화장실 천장 누수",
              summary:
                "301호 화장실 천장에서 물이 떨어져 전기 주변 안전 확인과 사진 자료가 필요한 상황입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "임대인 책임 가능성",
              confidenceScore: 0.82,
              reasons: ["천장 누수", "전기 주변 안전 우려"],
              recommendedAction: "관리자 긴급 확인이 필요합니다.",
              contextHints: [],
              nextQuestions: [
                "물이 지금도 계속 떨어지고 있나요?",
                "문제 부위 근접 사진과 공간 전체 사진을 올려주실 수 있나요?",
                "방문 가능한 시간대가 언제인가요?"
              ],
              tenantGuidance: [
                "전기 스위치나 콘센트 주변으로 물이 번지면 만지지 말고 안전한 곳에서 기다려주세요."
              ],
              photoAnalysis: {
                attachmentUrls: [],
                previousAttachmentUrls: [],
                candidates: ["누수"],
                comparisonStatus: "추가 사진 필요",
                summary: "현재 상담 스레드에 사진이 없어 근접/전체 사진이 필요합니다.",
                evidence: ["사진 없음"],
                recommendedRetake: false
              },
              requiredInfo: ["사진", "방문 가능 시간"],
              photoRequested: true,
              readyToFinalize: false,
              location: "301호 화장실",
              occurredAt: "",
              availableTimes: ""
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )) as typeof fetch;

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 화장실 천장에서 물이 떨어지고 전등 근처라 불안합니다.",
        inputMode: "CHAT"
      });

      assert.match(result.assistantMessage.messageText, /상담 스레드/);
      assert.match(result.assistantMessage.messageText, /접수 상태|접수 초안/);
      assert.match(result.assistantMessage.messageText, /관리자/);
      assert.match(result.assistantMessage.messageText, /사진|방문 가능 시간/);
      assert.notEqual(
        result.assistantMessage.messageText,
        "물이 계속 떨어진다면 전기 스위치나 콘센트 주변은 만지지 마세요. 문제 부위 근접 사진과 공간 전체 사진을 올려주시고 방문 가능한 시간도 알려주세요. 물이 지금도 떨어지는지 확인해 주세요?"
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("formats local fallback chat replies like a high quality 상담사 response", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고입니다. 전등 근처라 무섭고 오늘 저녁 8시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const reply = result.assistantMessage.messageText;

      assert.match(reply, /제가 이해한 내용/);
      assert.match(reply, /지금 할 일/);
      assert.match(reply, /필요한 사진|사진/);
      assert.match(reply, /접수 상태/);
      assert.match(reply, /전기|전등|스위치|콘센트/);
      assert.match(reply, /만지지 말/);
      assert.match(reply, /근접 사진|공간 전체|천장 전체/);
      assert.match(reply, /오늘 저녁 8시 이후/);
      assert.match(reply, /상담 스레드/);
      assert.equal(result.session.draft.readyToFinalize, true);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("keeps defect intake open until occurrence and safety risk are confirmed", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      const first = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 세면대 수전 손잡이가 헐거워졌습니다. 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });

      assert.equal(first.session.draft.readyToFinalize, false);
      assert.equal(first.session.draft.requiredInfo.includes("발생 시점"), true);
      assert.equal(first.session.draft.requiredInfo.includes("안전 위험 여부"), true);
      assert.equal(
        first.session.draft.nextQuestions.some((question) => /언제부터|시작|계속/.test(question)),
        true
      );
      assert.equal(
        first.session.draft.nextQuestions.some((question) => /전기|가스|침수|잠김|위험/.test(question)),
        true
      );

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "어제부터 시작됐고 지금도 헐겁습니다. 전기나 가스 같은 위험은 없습니다.",
        inputMode: "CHAT"
      });

      assert.equal(second.session.draft.readyToFinalize, true);
      assert.equal(second.session.draft.requiredInfo.includes("발생 시점"), false);
      assert.equal(second.session.draft.requiredInfo.includes("안전 위험 여부"), false);
      assert.match(second.assistantMessage.messageText, /접수 초안|접수 확정/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("separates current intake thread from same-room historical context in OpenAI prompts", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    const past = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    await service.sendIntakeMessage("tenant-demo", past.session.id, {
      messageText:
        "지난달에도 301호 화장실 천장에서 물이 떨어져 업체가 실리콘 보강을 했습니다. 오늘 저녁 7시 이후 방문 가능합니다.",
      inputMode: "CHAT"
    });
    service.finalizeIntakeSession("tenant-demo", past.session.id, {
      confirmedTitle: "과거 301호 화장실 누수",
      confirmedSummary: "지난달 301호 화장실 천장 누수로 실리콘 보강 조치가 있었습니다."
    });

    const unrelatedActive = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    await service.sendIntakeMessage("tenant-demo", unrelatedActive.session.id, {
      messageText: "절대 새 상담에 섞이면 안 되는 현관 도어락 배터리 경고음 상담입니다.",
      inputMode: "CHAT"
    });

    const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage:
              "같은 화장실 누수 이력이 있어 반복 가능성까지 함께 접수 초안에 반영했습니다.",
            draft: {
              title: "301호 화장실 천장 반복 누수 의심",
              summary: "301호 화장실 천장에서 다시 물이 떨어져 과거 누수 이력과 함께 확인이 필요합니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "임대인 책임 가능성",
              confidenceScore: 0.92,
              reasons: ["현재 상담에서 천장 누수 언급", "같은 호실 과거 누수 이력 확인"],
              recommendedAction: "관리자가 과거 보수 이력과 현재 사진을 함께 확인해 업체 재점검을 요청하세요.",
              requiredInfo: [],
              photoRequested: false,
              readyToFinalize: true,
              location: "301호 화장실",
              occurredAt: "오늘",
              availableTimes: "오늘 저녁",
              contextHints: ["같은 호실 과거 누수 이력이 있습니다."]
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    try {
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText: "오늘 다시 301호 화장실 천장에서 물이 떨어집니다. 오늘 저녁 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const input = capturedBody?.input as Array<{ content?: Array<{ text?: string }> }>;
      const promptText = input?.[0]?.content?.find((part) => typeof part.text === "string")?.text ?? "";

      assert.match(promptText, /현재 상담 스레드 대화/);
      assert.match(promptText, /같은 호실 과거 기록/);
      assert.match(promptText, /과거 301호 화장실 누수/);
      assert.match(promptText, /실리콘 보강/);
      assert.doesNotMatch(promptText, /절대 새 상담에 섞이면 안 되는/);
      assert.match(result.session.draft.contextHints.join(" "), /과거 누수/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("sends uploaded intake photos to OpenAI Responses as image inputs", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const dir = mkdtempSync(join(tmpdir(), "roomlog-openai-image-"));
    const service = new RoomlogService({
      uploadDir: dir,
      publicUploadBaseUrl: "/api/files"
    });
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const attachment = await service.saveAttachment("tenant-demo", {
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
      ]),
      originalName: "ceiling-leak.png",
      mimeType: "image/png",
      category: "COMPLAINT_PHOTO"
    });
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage: "사진까지 확인해 누수 접수 초안을 갱신했습니다.",
            draft: {
              title: "301호 천장 누수",
              summary: "301호 천장 누수 사진이 첨부된 하자 신고입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "임대인 책임 가능성",
              confidenceScore: 0.9,
              reasons: ["사진 첨부", "누수 의심"],
              recommendedAction: "관리자 긴급 확인 후 업체 배정을 검토하세요.",
              requiredInfo: [],
              photoRequested: false,
              readyToFinalize: true,
              location: "301호",
              occurredAt: "",
              availableTimes: "오늘 저녁"
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }) as typeof fetch;

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "천장에서 물이 떨어지는 사진입니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: [attachment.fileUrl],
        inputMode: "CHAT"
      });
      const input = capturedBody?.input as Array<{ content?: Array<Record<string, unknown>> }>;
      const content = input?.[0]?.content ?? [];
      const imagePart = content.find((part) => part.type === "input_image");

      assert.ok(imagePart, "expected an input_image part");
      assert.equal(imagePart.detail, "auto");
      assert.match(String(imagePart.image_url), /^data:image\/png;base64,/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("creates structured photo analysis and compares current photos with same-room history", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const past = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      await service.sendIntakeMessage("tenant-demo", past.session.id, {
        messageText:
          "지난달 301호 화장실 천장에서 물이 떨어지는 사진입니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: ["/api/files/past-ceiling-leak.png"],
        inputMode: "CHAT"
      });
      service.finalizeIntakeSession("tenant-demo", past.session.id, {
        confirmedTitle: "과거 301호 화장실 천장 누수",
        confirmedSummary: "지난달 301호 화장실 천장 누수 사진이 접수되었습니다."
      });

      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText:
          "오늘 다시 301호 화장실 천장에서 물이 떨어지는 사진입니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: ["/api/files/current-ceiling-leak.png"],
        inputMode: "CHAT"
      });
      const finalized = service.finalizeIntakeSession("tenant-demo", current.session.id);

      assert.deepEqual(result.session.draft.photoAnalysis.attachmentUrls, [
        "/api/files/current-ceiling-leak.png"
      ]);
      assert.equal(result.session.draft.photoAnalysis.candidates.includes("누수"), true);
      assert.equal(result.session.draft.photoAnalysis.comparisonStatus, "기존 하자 가능성");
      assert.equal(
        result.session.draft.photoAnalysis.previousAttachmentUrls.includes(
          "/api/files/past-ceiling-leak.png"
        ),
        true
      );
      assert.match(result.session.draft.photoAnalysis.summary, /과거|반복|이전/);
      assert.equal(finalized.analysis.photoAnalysis?.comparisonStatus, "기존 하자 가능성");
      assert.deepEqual(finalized.analysis.photoAnalysis?.attachmentUrls, [
        "/api/files/current-ceiling-leak.png"
      ]);
      assert.equal(
        finalized.ticket.analysis.photoAnalysis?.previousAttachmentUrls.includes(
          "/api/files/past-ceiling-leak.png"
        ),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses move-in checklist photos as baseline evidence for later defect photo analysis", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const checklistItem = service.createMoveInChecklistItem("tenant-demo", {
        roomId: "room-301",
        area: "화장실",
        itemName: "천장",
        memo: "입주 시 천장 누수 흔적 없음",
        attachmentUrls: ["/api/files/move-in-bathroom-ceiling-clean.png"]
      });
      const tenantChecklist = service.listTenantMoveInChecklist("tenant-demo");
      const managerChecklist = service.listManagerMoveInChecklist("landlord-demo", "room-301");

      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText:
          "오늘 301호 화장실 천장에서 물이 떨어지는 사진입니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: ["/api/files/current-bathroom-ceiling-leak.png"],
        inputMode: "CHAT"
      });

      assert.equal(checklistItem.area, "화장실");
      assert.equal(checklistItem.itemName, "천장");
      assert.equal(checklistItem.guidance.includes("정면"), true);
      assert.equal(tenantChecklist[0].id, checklistItem.id);
      assert.equal(managerChecklist[0].id, checklistItem.id);
      assert.equal(
        result.session.draft.photoAnalysis.previousAttachmentUrls.includes(
          "/api/files/move-in-bathroom-ceiling-clean.png"
        ),
        true
      );
      assert.equal(result.session.draft.photoAnalysis.comparisonStatus, "신규 발생 가능성");
      assert.match(result.session.draft.photoAnalysis.evidence.join("\n"), /입주 전|체크리스트/);
      assert.match(result.session.draft.photoAnalysis.summary, /입주 전|신규/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("preserves the generated AI draft when finalizing an intake session", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage: "관리비 청구 금액 이의제기 접수 초안을 만들었습니다.",
            draft: {
              title: "AI 확정 관리비 이의제기",
              summary: "301호 세입자가 계약서와 다른 관리비 청구 금액 확인을 요청했습니다.",
              category: "납부",
              detailCategory: "관리비 청구",
              priority: 4,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.88,
              reasons: ["계약서와 청구 금액 불일치 주장", "금액 확인 요청"],
              recommendedAction: "관리자가 계약서와 이번 달 청구서를 대조해 답변하세요.",
              requiredInfo: [],
              photoRequested: false,
              readyToFinalize: true,
              location: "301호",
              occurredAt: "",
              availableTimes: ""
            }
          })
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )) as typeof fetch;

    try {
      const reply = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 관리비 청구 금액이 계약서와 달라서 확인 요청드립니다.",
        inputMode: "CHAT"
      });
      const finalized = service.finalizeIntakeSession("tenant-demo", session.id);

      assert.equal(reply.session.draft.title, "AI 확정 관리비 이의제기");
      assert.equal(finalized.complaint.title, "AI 확정 관리비 이의제기");
      assert.equal(finalized.ticket.category, "관리비 청구");
      assert.equal(
        finalized.ticket.aiSummary,
        "301호 세입자가 계약서와 다른 관리비 청구 금액 확인을 요청했습니다."
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("gives safety-first fallback guidance for urgent intake chats without OpenAI", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    const result = await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText: "주방에서 가스 냄새가 계속 나고 어지러워요.",
      inputMode: "CHAT"
    });

    assert.equal(result.session.draft.priority, 1);
    assert.match(result.assistantMessage.messageText, /창문|환기/);
    assert.match(result.assistantMessage.messageText, /불꽃|스위치/);
    assert.match(result.assistantMessage.messageText, /즉시|바로/);

    if (originalApiKey) {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("keeps fallback Korean intake summaries natural when extracting a room location", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    const result = await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText:
        "301호 화장실 천장에서 물이 떨어지는 사진입니다. 오늘 저녁 7시 이후 방문 가능합니다.",
      attachmentUrls: ["/api/files/leak.png"],
      inputMode: "CHAT"
    });

    assert.equal(result.session.draft.location, "301호 화장실");
    assert.doesNotMatch(result.session.draft.summary, /물이에서/);
    assert.match(result.session.draft.summary, /301호 화장실에서 누수/);

    if (originalApiKey) {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("recognizes natural visit availability and surfaces same-room context in fallback replies", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const past = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      await service.sendIntakeMessage("tenant-demo", past.session.id, {
        messageText:
          "지난번 301호 화장실 천장에서 물이 떨어져 실리콘 보강을 했고 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      service.finalizeIntakeSession("tenant-demo", past.session.id, {
        confirmedTitle: "지난 301호 화장실 누수",
        confirmedSummary: "지난 301호 화장실 천장 누수로 실리콘 보강 이력이 있습니다.",
        confirmedLocation: "301호 화장실",
        availableTimes: "오늘 저녁 7시 이후"
      });
      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText: "오늘 또 301호 화장실 천장에서 물이 떨어져요. 오늘 저녁 방문 가능합니다.",
        inputMode: "CHAT"
      });

      assert.equal(result.session.draft.availableTimes, "오늘 저녁");
      assert.equal(result.session.draft.requiredInfo.includes("방문 가능 시간"), false);
      assert.equal(result.session.draft.readyToFinalize, true);
      assert.match(result.assistantMessage.messageText, /같은 호실|과거 기록|최근 관련 기록/);
      assert.match(result.session.draft.contextHints.join(" "), /누수 관련 과거 기록/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("generates high quality fallback intake guidance with concrete next questions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실 천장에서 물이 떨어지고 바닥이 젖었어요.",
        inputMode: "CHAT"
      });
      const draft = result.session.draft;

      assert.equal(draft.priority, 1);
      assert.equal(draft.nextQuestions.length >= 2, true);
      assert.equal(
        draft.nextQuestions.some((question) => /사진|전체|근접/.test(question)),
        true
      );
      assert.equal(
        draft.nextQuestions.some((question) => /방문|시간/.test(question)),
        true
      );
      assert.equal(
        draft.tenantGuidance.some((guide) => /전기|콘센트|스위치|물고임/.test(guide)),
        true
      );
      assert.match(result.assistantMessage.messageText, /확인할게요|정리하고 있어요/);
      assert.match(result.assistantMessage.messageText, /다음으로/);
      assert.match(result.assistantMessage.messageText, /사진/);
      assert.doesNotMatch(result.assistantMessage.messageText, /필요 정보:/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("tracks intake readiness slots across a thread before finalizing", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const first = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실 천장에서 물이 계속 떨어지고 바닥이 젖었어요.",
        inputMode: "CHAT"
      });
      const firstSlots = Object.fromEntries(
        first.session.draft.intakeSlots.map((slot) => [slot.key, slot])
      );

      assert.equal(firstSlots.symptom.status, "COLLECTED");
      assert.equal(firstSlots.location.status, "COLLECTED");
      assert.equal(firstSlots.risk.status, "COLLECTED");
      assert.equal(firstSlots.photo.status, "NEEDS_INFO");
      assert.equal(firstSlots.visitTime.status, "NEEDS_INFO");
      assert.match(firstSlots.photo.action ?? "", /근접|전체|사진/);
      assert.equal(first.session.threadSummary.openSlotCount, 2);
      assert.equal(first.session.threadSummary.collectedSlotCount, 4);

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "오늘 저녁 8시 이후 방문 가능합니다. 전체 사진과 천장 근접 사진도 첨부했습니다.",
        attachmentUrls: ["/uploads/thread-wide.jpg", "/uploads/thread-close.jpg"],
        inputMode: "CHAT"
      });
      const secondSlots = Object.fromEntries(
        second.session.draft.intakeSlots.map((slot) => [slot.key, slot])
      );

      assert.equal(secondSlots.photo.status, "COLLECTED");
      assert.equal(secondSlots.visitTime.status, "COLLECTED");
      assert.equal(second.session.draft.readyToFinalize, true);
      assert.equal(second.session.threadSummary.openSlotCount, 0);
      assert.equal(second.session.threadSummary.collectedSlotCount, 6);
      assert.match(second.assistantMessage.messageText, /접수 가능|필수 정보|사진|방문/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("validates signup input and rejects forgeable demo-style tokens", () => {
    const service = new RoomlogService();

    assert.throws(
      () =>
        service.signup({
          email: "bad-email",
          password: "short",
          name: "",
          role: "TENANT"
        }),
      /이메일/
    );

    const forgedToken = Buffer.from("landlord-demo:LANDLORD:manager@roomlog.test").toString(
      "base64url"
    );

    assert.throws(
      () => service.getUserFromToken(`Bearer ${forgedToken}`),
      /올바르지 않습니다/
    );
  });

  it("normalizes signup phone numbers before duplicate checks", () => {
    const service = new RoomlogService();

    service.signup({
      email: "phone-normalized@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "번호 세입자",
      phone: "010-4444-7788",
      role: "TENANT",
      buildingName: "룸로그 빌라",
      roomNo: "701호",
      address: "서울시 성동구 테스트로 12"
    } as any);

    assert.throws(
      () =>
        service.signup({
          email: "phone-normalized-copy@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "중복 세입자",
          phone: "010 4444 7788",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          roomNo: "702호",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /휴대폰/
    );
  });

  it("rejects malformed signup phone numbers and weak passwords", () => {
    const service = new RoomlogService();

    assert.throws(
      () =>
        service.signup({
          email: "bad-phone@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "짧은 번호",
          phone: "123-45",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          roomNo: "703호",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /휴대폰 번호는 숫자 10~11자리/
    );

    assert.throws(
      () =>
        service.signup({
          email: "weak-password@roomlog.test",
          password: "password",
          passwordConfirm: "password",
          name: "약한 비밀번호",
          phone: "010-4444-7799",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          roomNo: "704호",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /비밀번호는 영문과 숫자를 포함/
    );
  });

  it("creates role-specific profiles and room links during signup", () => {
    const service = new RoomlogService();

    const tenantAuth = service.signup({
      email: "tenant-profile@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "호실 세입자",
      phone: "010-4444-3001",
      role: "TENANT",
      buildingName: "룸로그 빌라",
      roomNo: "502호",
      address: "서울시 성동구 테스트로 12"
    } as any);
    const tenantProfile = service.getMe(`Bearer ${tenantAuth.accessToken}`);
    const tenantThread = service.createIntakeSession(tenantAuth.userId, {});

    assert.equal(tenantProfile.phone, "01044443001");
    assert.equal(tenantProfile.roomId, tenantThread.session.roomId);
    assert.equal(tenantProfile.room?.buildingName, "룸로그 빌라");
    assert.equal(tenantProfile.room?.roomNo, "502호");
    assert.equal(tenantThread.session.room?.roomNo, "502호");

    const managerAuth = service.signup({
      email: "manager-profile@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "건물 관리자",
      phone: "010-4444-1001",
      role: "LANDLORD",
      buildingName: "성수 관리 빌딩",
      roomNo: "101호",
      address: "서울시 성동구 관리로 1"
    } as any);
    const managerProfile = service.getMe(`Bearer ${managerAuth.accessToken}`);

    assert.equal(managerProfile.managedRooms?.length, 1);
    assert.equal(managerProfile.managedRooms?.[0].buildingName, "성수 관리 빌딩");
    assert.equal(managerProfile.managedRooms?.[0].roomNo, "101호");

    assert.throws(
      () =>
        service.signup({
          email: "vendor-profile@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "수리 기사",
          phone: "010-4444-9001",
          role: "VENDOR",
          businessName: "성수 누수 설비",
          serviceArea: "성동구, 광진구"
        } as any),
      /초대/
    );

    const invite = service.createVendorInvite(managerAuth.userId, {
      email: "vendor-profile@roomlog.test",
      businessName: "성수 누수 설비",
      contactPerson: "수리 기사",
      phone: "010-4444-9001",
      serviceArea: "성동구, 광진구"
    });
    const vendorAuth = service.signup({
      email: "vendor-profile@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "수리 기사",
      phone: "010-4444-9001",
      role: "VENDOR",
      inviteToken: invite.inviteToken
    } as any);
    const vendorProfile = service.getMe(`Bearer ${vendorAuth.accessToken}`);
    const vendor = service.listVendors().find((item) => item.userId === vendorAuth.userId);

    assert.equal(vendorProfile.vendorId, vendor?.id);
    assert.equal(vendor?.businessName, "성수 누수 설비");
    assert.equal(vendor?.serviceArea, "성동구, 광진구");
    assert.equal(service.listVendorInvites(managerAuth.userId)[0].status, "ACCEPTED");
    assert.throws(
      () =>
        service.signup({
          email: "vendor-reuse@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "재사용 기사",
          phone: "010-4444-9002",
          role: "VENDOR",
          inviteToken: invite.inviteToken
        } as any),
      /이미 사용/
    );

    assert.throws(
      () =>
        service.signup({
          email: "duplicate-phone@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "중복 번호",
          phone: "010-4444-3001",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          roomNo: "503호",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /휴대폰/
    );
  });

  it("connects invited tenants to the manager room during signup", () => {
    const service = new RoomlogService();
    const managerAuth = service.signup({
      email: "tenant-invite-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "초대 관리자",
      phone: "010-4444-1100",
      role: "LANDLORD",
      buildingName: "초대 빌라",
      roomNo: "701호",
      address: "서울시 성동구 초대로 7"
    } as any);
    const managerProfile = service.getMe(`Bearer ${managerAuth.accessToken}`);
    const roomId = managerProfile.managedRooms?.[0].id;

    assert.ok(roomId);

    const invite = service.createTenantInvite(managerAuth.userId, {
      roomId,
      email: "invited-tenant@roomlog.test",
      tenantName: "초대 세입자",
      phone: "010-4444-3100",
      moveInDate: "2026-07-01"
    });
    const tenantAuth = service.signup({
      email: "invited-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "초대 세입자",
      phone: "010-4444-3100",
      role: "TENANT",
      inviteToken: invite.inviteToken
    } as any);
    const tenantProfile = service.getMe(`Bearer ${tenantAuth.accessToken}`);
    const tenantThread = service.createIntakeSession(tenantAuth.userId, {});
    const invites = service.listTenantInvites(managerAuth.userId);

    assert.equal(tenantProfile.roomId, roomId);
    assert.equal(tenantProfile.room?.landlordId, managerAuth.userId);
    assert.equal(tenantProfile.room?.buildingName, "초대 빌라");
    assert.equal(tenantThread.session.roomId, roomId);
    assert.equal(invites[0].status, "ACCEPTED");
    assert.equal(invites[0].acceptedByUserId, tenantAuth.userId);
    assert.throws(
      () =>
        service.signup({
          email: "tenant-invite-reuse@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "재사용 세입자",
          phone: "010-4444-3101",
          role: "TENANT",
          inviteToken: invite.inviteToken
        } as any),
      /이미 사용/
    );
  });

  it("returns safe signup invite previews before account creation", () => {
    const service = new RoomlogService();
    const managerAuth = service.signup({
      email: "preview-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "미리보기 관리자",
      phone: "010-4444-1200",
      role: "LANDLORD",
      buildingName: "프리뷰 하우스",
      roomNo: "801호",
      address: "서울시 성동구 프리뷰로 8"
    } as any);
    const managerProfile = service.getMe(`Bearer ${managerAuth.accessToken}`);
    const roomId = managerProfile.managedRooms?.[0].id;

    assert.ok(roomId);

    const tenantInvite = service.createTenantInvite(managerAuth.userId, {
      roomId,
      email: "preview-tenant@roomlog.test",
      tenantName: "프리뷰 세입자",
      phone: "010-4444-3200",
      moveInDate: "2026-07-02"
    });
    const vendorInvite = service.createVendorInvite(managerAuth.userId, {
      email: "preview-vendor@roomlog.test",
      businessName: "프리뷰 설비",
      contactPerson: "프리뷰 기사",
      phone: "010-4444-9200",
      serviceArea: "성동구"
    });

    const tenantPreview = service.getSignupInvitePreview("TENANT", tenantInvite.inviteToken);
    const vendorPreview = service.getSignupInvitePreview("VENDOR", vendorInvite.inviteToken);

    assert.equal(tenantPreview.role, "TENANT");
    assert.equal(tenantPreview.status, "PENDING");
    assert.equal(tenantPreview.invitedBy, "미리보기 관리자");
    assert.equal(tenantPreview.expectedName, "프리뷰 세입자");
    assert.equal(tenantPreview.email, "preview-tenant@roomlog.test");
    assert.equal(tenantPreview.phone, "01044443200");
    assert.equal(tenantPreview.emailLocked, true);
    assert.equal(tenantPreview.phoneLocked, true);
    assert.equal(tenantPreview.room?.buildingName, "프리뷰 하우스");
    assert.equal(tenantPreview.room?.roomNo, "801호");
    assert.equal(tenantPreview.targetLabel, "프리뷰 하우스 801호");

    assert.equal(vendorPreview.role, "VENDOR");
    assert.equal(vendorPreview.status, "PENDING");
    assert.equal(vendorPreview.invitedBy, "미리보기 관리자");
    assert.equal(vendorPreview.expectedName, "프리뷰 기사");
    assert.equal(vendorPreview.businessName, "프리뷰 설비");
    assert.equal(vendorPreview.serviceArea, "성동구");
    assert.equal(vendorPreview.emailLocked, true);
    assert.equal(vendorPreview.phoneLocked, true);

    service.signup({
      email: "preview-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "프리뷰 세입자",
      phone: "010-4444-3200",
      role: "TENANT",
      inviteToken: tenantInvite.inviteToken
    } as any);

    assert.throws(
      () => service.getSignupInvitePreview("TENANT", tenantInvite.inviteToken),
      /이미 사용/
    );
    assert.throws(() => service.getSignupInvitePreview("TENANT", "missing-token"), /유효하지/);
  });

  it("validates role-specific signup profile fields", () => {
    const service = new RoomlogService();

    assert.throws(
      () =>
        service.signup({
          email: "tenant-missing-room@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "호실 없음",
          phone: "010-5555-3001",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /호실/
    );

    assert.throws(
      () =>
        service.signup({
          email: "vendor-missing-business@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "업체 없음",
          phone: "010-5555-9001",
          role: "VENDOR",
          serviceArea: "성동구"
        } as any),
      /초대/
    );

    assert.throws(
      () =>
        service.createVendorInvite("landlord-demo", {
          businessName: "",
          contactPerson: "업체 없음",
          phone: "010-5555-9001",
          serviceArea: "성동구"
        }),
      /업체명/
    );

    assert.throws(
      () =>
        service.signup({
          email: "password-mismatch@roomlog.test",
          password: "password123!",
          passwordConfirm: "password456!",
          name: "비밀번호 불일치",
          phone: "010-5555-3002",
          role: "TENANT",
          buildingName: "룸로그 빌라",
          roomNo: "504호",
          address: "서울시 성동구 테스트로 12"
        } as any),
      /비밀번호 확인/
    );
  });

  it("keeps each AI intake consultation in an isolated thread and finalizes one thread into a complaint", async () => {
    const service = new RoomlogService();
    const first = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const second = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    await service.sendIntakeMessage("tenant-demo", first.session.id, {
      messageText: "화장실 천장에서 물이 계속 떨어지고 바닥에 물이 고여요.",
      inputMode: "CHAT"
    });
    const firstReply = await service.sendIntakeMessage("tenant-demo", first.session.id, {
      messageText: "305호 화장실이고 오늘 저녁 7시 이후 방문 가능합니다.",
      attachmentUrls: ["/uploads/leak-305.jpg"],
      inputMode: "CHAT"
    });
    const secondReply = await service.sendIntakeMessage("tenant-demo", second.session.id, {
      messageText: "현관 도어락 배터리 경고음이 납니다.",
      inputMode: "CHAT"
    });

    assert.equal(firstReply.session.messages.filter((message) => message.sender === "TENANT").length, 2);
    assert.equal(secondReply.session.messages.filter((message) => message.sender === "TENANT").length, 1);
    assert.equal(firstReply.session.draft.priority, 1);
    assert.equal(firstReply.session.draft.readyToFinalize, true);
    assert.equal(secondReply.session.draft.priority, 3);

    const finalized = service.finalizeIntakeSession("tenant-demo", first.session.id, {
      confirmedTitle: "305호 화장실 천장 누수",
      confirmedSummary: firstReply.session.draft.summary
    });

    assert.equal(finalized.complaint.title, "305호 화장실 천장 누수");
    assert.equal(finalized.ticket.sourceChannel, "REALTIME_CHAT");
    assert.equal(finalized.analysis.priority, 1);
    assert.equal(
      finalized.ticket.messages.some((message) => message.senderRole === "AI_ASSISTANT"),
      true
    );
    const tenantMessageWithPhoto = finalized.ticket.messages.find((message) =>
      message.attachmentUrls.includes("/uploads/leak-305.jpg")
    );
    assert.ok(tenantMessageWithPhoto, "expected finalized ticket timeline to keep photo URLs");
    assert.equal(tenantMessageWithPhoto.messageText.includes("첨부:"), false);
    assert.equal(service.getIntakeSession("tenant-demo", first.session.id).status, "FINALIZED");
    assert.equal(service.getIntakeSession("tenant-demo", second.session.id).status, "ACTIVE");
  });

  it("detects duplicate intake candidates and can attach a consultation to an existing ticket", async () => {
    const service = new RoomlogService();
    const original = service.createComplaint("tenant-demo", {
      title: "301호 화장실 천장 누수",
      description: "화장실 천장에서 물이 떨어지고 바닥에 물이 고입니다.",
      location: "화장실 천장",
      occurredAt: "2026-06-28T20:00:00.000Z",
      availableTimes: "평일 저녁"
    });
    const session = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    const reply = await service.sendIntakeMessage("tenant-demo", session.session.id, {
      messageText:
        "또 301호 화장실 천장에서 물이 계속 떨어집니다. 오늘 저녁 8시 이후 방문 가능합니다.",
      attachmentUrls: ["/api/files/repeat-leak.png"],
      inputMode: "CHAT"
    });

    assert.equal(reply.session.draft.duplicateCandidates.length, 1);
    assert.equal(reply.session.draft.duplicateCandidates[0].ticketId, original.ticket.id);
    assert.match(reply.assistantMessage.messageText, /기존 티켓|중복/);

    const attached = service.finalizeIntakeSession("tenant-demo", session.session.id, {
      duplicateResolution: "ATTACH_TO_EXISTING",
      existingTicketId: original.ticket.id
    });
    const tenantComplaints = service.listTenantComplaints("tenant-demo");
    const existingDetail = service.getTicketDetailForManager("landlord-demo", original.ticket.id);
    const finalizedSession = service.getIntakeSession("tenant-demo", session.session.id);

    assert.equal(attached.ticket.id, original.ticket.id);
    assert.equal(attached.complaint.id, original.complaint.id);
    assert.equal(tenantComplaints.length, 1);
    assert.equal(finalizedSession.ticketId, original.ticket.id);
    assert.equal(finalizedSession.complaintId, original.complaint.id);
    assert.equal(
      existingDetail.messages.some((message) =>
        message.messageText.includes("중복 가능성이 있어 기존 티켓에 상담 내용을 추가")
      ),
      true
    );
    assert.equal(
      existingDetail.messages.some((message) =>
        message.attachmentUrls.includes("/api/files/repeat-leak.png")
      ),
      true
    );
    assert.match(existingDetail.analysis.summary, /추가 정보|또 301호 화장실/);
  });

  it("scopes manager ticket reads and writes to rooms they manage", () => {
    const service = new RoomlogService();
    const otherManager = service.signup({
      email: "other-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "다른 관리자",
      phone: "010-6666-1001",
      role: "LANDLORD",
      buildingName: "외부 빌라",
      roomNo: "802호",
      address: "서울시 성동구 외부로 8"
    } as any);
    const otherTenant = service.signup({
      email: "other-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "외부 세입자",
      phone: "010-6666-3001",
      role: "TENANT",
      buildingName: "외부 빌라",
      roomNo: "802호",
      address: "서울시 성동구 외부로 8"
    } as any);

    const ownTicket = service.createComplaint("tenant-demo", {
      title: "정글빌라 누수",
      description: "301호 화장실 천장에서 물이 떨어집니다.",
      location: "301호 화장실",
      availableTimes: "오늘 저녁 7시 이후"
    }).ticket;
    const otherTicket = service.createComplaint(otherTenant.userId, {
      title: "외부 빌라 보일러",
      description: "802호 보일러가 켜지지 않습니다.",
      location: "802호 보일러실",
      availableTimes: "내일 오전 10시 이후"
    }).ticket;

    const visibleTickets = service.listTicketsForManager("landlord-demo");

    assert.equal(visibleTickets.some((ticket) => ticket.id === ownTicket.id), true);
    assert.equal(visibleTickets.some((ticket) => ticket.id === otherTicket.id), false);
    assert.equal(service.listTicketsForManager(otherManager.userId)[0].id, otherTicket.id);
    assert.throws(
      () => service.getTicketDetailForManager("landlord-demo", otherTicket.id),
      /접근/
    );
    assert.throws(
      () =>
        service.updateTicket("landlord-demo", otherTicket.id, {
          priority: 1
        }),
      /접근/
    );
    assert.throws(
      () => service.requestAdditionalInfo("landlord-demo", otherTicket.id, "사진을 더 보내주세요."),
      /접근/
    );
  });

  it("lets a real linked tenant start a messaging thread that the linked manager can reply to", () => {
    const service = new RoomlogService();

    const manager = service.signup({
      email: "linked-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "연결 관리자",
      phone: "010-7000-1001",
      role: "LANDLORD",
      buildingName: "연결 빌라",
      roomNo: "910호",
      address: "서울시 성동구 연결로 10"
    } as any);

    const tenant = service.signup({
      email: "linked-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "연결 세입자",
      phone: "010-7000-3001",
      role: "TENANT",
      buildingName: "연결 빌라",
      roomNo: "910호",
      address: "서울시 성동구 연결로 10"
    } as any);

    const tenantRoom = service.getTenantRoom(tenant.userId);
    assert.equal(tenantRoom.landlordId, manager.userId);

    const started = service.createTenantMessagingThread(tenant.userId, {
      context: "general",
      contextLabel: "일반 문의",
      body: "공용 현관등이 깜빡입니다."
    });

    assert.equal(started.tenantId, tenant.userId);
    assert.equal(started.unitId, "910");
    assert.equal(started.messages?.length, 1);
    assert.equal(started.messages?.[0]?.sender, "tenant");
    assert.equal(started.messages?.[0]?.body, "공용 현관등이 깜빡입니다.");

    const managerThreads = service.listManagerMessagingThreads(manager.userId);
    assert.equal(managerThreads.some((thread) => thread.id === started.id), true);
    // 목록 응답의 마지막 발신자 — 대시보드 "미응답" 판정이 이 필드에 의존한다.
    assert.equal(managerThreads.find((thread) => thread.id === started.id)?.lastMessageSender, "tenant");

    const managerReply = service.addManagerMessagingThreadMessage(manager.userId, started.id, {
      body: "오늘 점검하겠습니다."
    });
    const replyMessages = managerReply.messages ?? [];
    assert.equal(replyMessages[replyMessages.length - 1]?.sender, "manager");
    assert.equal(
      service.listManagerMessagingThreads(manager.userId).find((thread) => thread.id === started.id)
        ?.lastMessageSender,
      "manager"
    );
    assert.equal(replyMessages[replyMessages.length - 1]?.body, "오늘 점검하겠습니다.");

    const tenantView = service.getTenantMessagingThread(tenant.userId, started.id);
    const tenantMessages = tenantView.messages ?? [];
    assert.equal(tenantMessages[tenantMessages.length - 1]?.body, "오늘 점검하겠습니다.");

    const otherManager = service.signup({
      email: "unlinked-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "외부 관리자",
      phone: "010-7000-1002",
      role: "LANDLORD",
      buildingName: "외부 빌라",
      roomNo: "1호",
      address: "서울시 성동구 외부로 1"
    } as any);

    assert.throws(
      () => service.getManagerMessagingThread(otherManager.userId, started.id),
      /메시지 스레드/
    );
  });

  it("lets tenants and managers delete only scoped messaging threads", () => {
    const service = new RoomlogService();

    const otherManager = service.signup({
      email: "delete-other-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "삭제 외부 관리자",
      phone: "010-7622-1001",
      role: "LANDLORD",
      buildingName: "삭제 외부빌라",
      roomNo: "801호",
      address: "서울시 성동구 삭제로 8"
    } as any);
    const otherTenant = service.signup({
      email: "delete-other-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "삭제 외부 세입자",
      phone: "010-7622-3001",
      role: "TENANT",
      buildingName: "삭제 외부빌라",
      roomNo: "801호",
      address: "서울시 성동구 삭제로 8"
    } as any);

    const tenantThread = service.createTenantMessagingThread("tenant-demo", {
      context: "general",
      contextLabel: "삭제 테스트",
      body: "임차인이 삭제할 스레드입니다."
    });
    service.addManagerMessagingThreadMessage("landlord-demo", tenantThread.id, {
      body: "삭제 전에 달린 관리자 답장입니다."
    });

    assert.equal(
      service.getDemoState().messagingMessages.some((message) => message.threadId === tenantThread.id),
      true
    );
    assert.throws(
      () => service.deleteTenantMessagingThread(otherTenant.userId, tenantThread.id),
      /메시지 스레드/
    );

    const tenantDeleted = service.deleteTenantMessagingThread("tenant-demo", tenantThread.id);
    assert.equal(tenantDeleted.deleted, true);
    assert.equal(
      service.listTenantMessagingThreads("tenant-demo").some((thread) => thread.id === tenantThread.id),
      false
    );
    assert.equal(
      service.listManagerMessagingThreads("landlord-demo").some((thread) => thread.id === tenantThread.id),
      false
    );
    assert.equal(
      service.getDemoState().messagingMessages.some((message) => message.threadId === tenantThread.id),
      false
    );
    assert.throws(
      () => service.getTenantMessagingThread("tenant-demo", tenantThread.id),
      /메시지 스레드/
    );

    const managerThread = service.createMessagingThread("landlord-demo", {
      roomId: "room-301",
      tenantId: "tenant-demo",
      context: "general",
      contextLabel: "관리인 삭제 테스트",
      initialMessage: {
        sender: "tenant",
        body: "관리인이 삭제할 스레드입니다."
      }
    });
    assert.throws(
      () => service.deleteManagerMessagingThread(otherManager.userId, managerThread.id),
      /메시지 스레드/
    );

    const managerDeleted = service.deleteManagerMessagingThread("landlord-demo", managerThread.id);
    assert.equal(managerDeleted.threadId, managerThread.id);
    assert.equal(
      service.listManagerMessagingThreads("landlord-demo").some((thread) => thread.id === managerThread.id),
      false
    );
    assert.equal(
      service.listTenantMessagingThreads("tenant-demo").some((thread) => thread.id === managerThread.id),
      false
    );
  });

  it("scopes messaging threads and enforces server-side messaging gates", () => {
    const service = new RoomlogService();
    const otherManager = service.signup({
      email: "message-other-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "메시지 외부 관리자",
      phone: "010-6622-1001",
      role: "LANDLORD",
      buildingName: "메시지 외부빌라",
      roomNo: "801호",
      address: "서울시 성동구 외부로 8"
    } as any);
    const otherTenant = service.signup({
      email: "message-other-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "메시지 외부 세입자",
      phone: "010-6622-3001",
      role: "TENANT",
      buildingName: "메시지 외부빌라",
      roomNo: "801호",
      address: "서울시 성동구 외부로 8"
    } as any);

    const ownThread = service.createMessagingThread("landlord-demo", {
      roomId: "room-301",
      tenantId: "tenant-demo",
      context: "payment",
      contextLabel: "7월 관리비 문의",
      initialMessage: {
        sender: "tenant",
        body: "7월 관리비 산정 기준을 확인하고 싶습니다."
      }
    });
    const otherThread = service.createMessagingThread(otherManager.userId, {
      roomId: service.getTenantRoom(otherTenant.userId).id,
      tenantId: otherTenant.userId,
      context: "general",
      contextLabel: "외부 세대 문의",
      initialMessage: {
        sender: "tenant",
        body: "외부 세대 문의입니다."
      }
    });

    const tenantThreads = service.listTenantMessagingThreads("tenant-demo");
    const managerThreads = service.listManagerMessagingThreads("landlord-demo");
    const listedOwnThread = managerThreads.find((thread) => thread.id === ownThread.id);

    assert.equal(ownThread.buildingName, "정글빌라");
    assert.equal(ownThread.unitId, "301");
    assert.equal(listedOwnThread?.buildingName, "정글빌라");
    assert.equal(listedOwnThread?.unitId, "301");
    assert.equal(tenantThreads.some((thread) => thread.id === ownThread.id), true);
    assert.equal(tenantThreads.some((thread) => thread.id === otherThread.id), false);
    assert.equal(managerThreads.some((thread) => thread.id === ownThread.id), true);
    assert.equal(managerThreads.some((thread) => thread.id === otherThread.id), false);
    assert.throws(
      () =>
        service.addManagerMessagingThreadMessage("landlord-demo", ownThread.id, {
          body: "미납 상태라 오늘 바로 납부하세요."
        }),
      /독촉|납부|청구/
    );
  });

  it("requires reviewed urgent announcement translations before send and separates read from confirmation", () => {
    const service = new RoomlogService();
    const sourceTitle = "긴급 단수 안내";
    const sourceBody = "오늘 18시부터 긴급 단수가 있습니다.";
    const sourceHash = announcementSourceHash(sourceTitle, sourceBody);

    const unsafeDraft = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "urgent",
      scope: "building",
      targetLabel: "정글빌라 전체",
      title: sourceTitle,
      body: sourceBody,
      confirmRequired: true,
      translations: [
        {
          lang: "en",
          title: "Emergency water outage",
          body: "Emergency water outage starts at 18:00.",
          reviewed: true,
          sourceHash
        }
      ]
    });

    assert.throws(
      () => service.sendManagerAnnouncementDraft("landlord-demo", unsafeDraft.id),
      /검수|번역/
    );

    const reviewedDraft = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "urgent",
      scope: "building",
      targetLabel: "정글빌라 전체",
      title: sourceTitle,
      body: sourceBody,
      confirmRequired: true,
      translations: [
        {
          lang: "en",
          title: "Emergency water outage",
          body: "Emergency water outage starts at 18:00.",
          reviewed: true,
          sourceHash
        },
        {
          lang: "zh",
          title: "紧急停水通知",
          body: "今天18时开始紧急停水。",
          reviewed: true,
          sourceHash
        },
        {
          lang: "vi",
          title: "Thông báo cắt nước khẩn cấp",
          body: "Việc cắt nước khẩn cấp bắt đầu lúc 18:00 hôm nay.",
          reviewed: true,
          sourceHash
        }
      ]
    });
    const sent = service.sendManagerAnnouncementDraft("landlord-demo", reviewedDraft.id);

    let tenantAnnouncement = service.getTenantMessagingAnnouncement(
      "tenant-demo",
      sent.announcementId
    );
    assert.equal(tenantAnnouncement.state, "unread");
    assert.equal(tenantAnnouncement.confirmRequired, true);

    tenantAnnouncement = service.markTenantMessagingAnnouncementRead(
      "tenant-demo",
      sent.announcementId
    );
    assert.equal(tenantAnnouncement.state, "read");

    tenantAnnouncement = service.confirmTenantMessagingAnnouncement(
      "tenant-demo",
      sent.announcementId
    );
    assert.equal(tenantAnnouncement.state, "confirmed");
    assert.equal(service.listManagerAnnouncementResults("landlord-demo")[0].counts.confirmed, 1);
  });

  it("invalidates reviewed translations when the Korean announcement source changes", () => {
    const service = new RoomlogService();
    const title = "긴급 점검 안내";
    const body = "오늘 18시에 긴급 점검합니다.";
    const sourceHash = announcementSourceHash(title, body);
    const created = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "urgent",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title,
      body,
      translations: [
        { lang: "en", title: "Emergency inspection", body: "Inspection at 18:00.", reviewed: true, sourceHash },
        { lang: "zh", title: "紧急检查", body: "18时检查。", reviewed: true, sourceHash },
        { lang: "vi", title: "Kiểm tra khẩn cấp", body: "Kiểm tra lúc 18:00.", reviewed: true, sourceHash }
      ]
    });

    const updated = service.updateManagerAnnouncementDraft("landlord-demo", created.id, {
      category: "urgent",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title,
      body: "오늘 19시에 긴급 점검합니다.",
      translations: created.translations
    });

    assert.equal(updated.translations.every((translation) => !translation.reviewed), true);
    assert.throws(
      () => service.sendManagerAnnouncementDraft("landlord-demo", created.id),
      /검수|원문|번역/
    );
  });

  it("keeps translations reviewed when they were regenerated for the changed source", () => {
    const service = new RoomlogService();
    const title = "긴급 점검 안내";
    const body = "오늘 18시에 긴급 점검합니다.";
    const created = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "urgent",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title,
      body,
      translations: [
        { lang: "en", title: "Emergency inspection", body: "Inspection at 18:00.", reviewed: true, sourceHash: announcementSourceHash(title, body) },
        { lang: "zh", title: "紧急检查", body: "18时检查。", reviewed: true, sourceHash: announcementSourceHash(title, body) },
        { lang: "vi", title: "Kiểm tra khẩn cấp", body: "Kiểm tra lúc 18:00.", reviewed: true, sourceHash: announcementSourceHash(title, body) }
      ]
    });
    const nextBody = "오늘 19시에 긴급 점검합니다.";
    const nextSourceHash = announcementSourceHash(title, nextBody);

    const updated = service.updateManagerAnnouncementDraft("landlord-demo", created.id, {
      category: "urgent",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title,
      body: nextBody,
      translations: created.translations.map((translation) => ({
        ...translation,
        reviewed: true,
        sourceHash: nextSourceHash
      }))
    });

    assert.equal(updated.translations.every((translation) => translation.reviewed), true);
    assert.doesNotThrow(() => service.sendManagerAnnouncementDraft("landlord-demo", created.id));
  });

  it("updates manager announcement drafts without duplicating them and enforces target ownership", () => {
    const service = new RoomlogService();
    const created = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "life",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title: "점검 안내",
      body: "내일 점검합니다.",
      translations: []
    });
    const beforeCount = service.listManagerAnnouncementDrafts("landlord-demo").length;

    const updated = service.updateManagerAnnouncementDraft("landlord-demo", created.id, {
      category: "life",
      scope: "building",
      targetLabel: "정글빌라 2세대",
      targetRoomIds: ["room-301", "room-302"],
      title: "점검 시간 변경",
      body: "내일 14시에 점검합니다.",
      translations: []
    });

    assert.equal(updated.id, created.id);
    assert.equal(updated.title, "점검 시간 변경");
    assert.deepEqual(updated.targetRoomIds, ["room-301", "room-302"]);
    assert.equal(service.listManagerAnnouncementDrafts("landlord-demo").length, beforeCount);
    assert.throws(
      () =>
        service.updateManagerAnnouncementDraft("manager-outside", created.id, {
          category: "life",
          scope: "unit",
          targetLabel: "301호",
          targetRoomIds: ["room-301"],
          title: "권한 없는 수정",
          body: "수정하면 안 됩니다.",
          translations: []
        }),
      /초안|권한|찾을 수/
    );
  });

  it("rejects sent draft updates and derives confirmation from category", () => {
    const service = new RoomlogService();
    const sourceHash = announcementSourceHash("긴급 점검 안내", "오늘 18시에 긴급 점검합니다.");
    const created = service.createManagerAnnouncementDraft("landlord-demo", {
      category: "urgent",
      scope: "unit",
      targetLabel: "301호",
      targetRoomIds: ["room-301"],
      title: "긴급 점검 안내",
      body: "오늘 18시에 긴급 점검합니다.",
      confirmRequired: false,
      translations: [
        {
          lang: "en",
          title: "Emergency inspection",
          body: "An emergency inspection starts at 18:00 today.",
          reviewed: true,
          sourceHash
        },
        {
          lang: "zh",
          title: "紧急检查通知",
          body: "今天18:00进行紧急检查。",
          reviewed: true,
          sourceHash
        },
        {
          lang: "vi",
          title: "Thông báo kiểm tra khẩn cấp",
          body: "Hôm nay sẽ kiểm tra khẩn cấp lúc 18:00.",
          reviewed: true,
          sourceHash
        }
      ]
    });

    assert.equal(created.confirmRequired, true);
    service.sendManagerAnnouncementDraft("landlord-demo", created.id);
    assert.throws(
      () =>
        service.updateManagerAnnouncementDraft("landlord-demo", created.id, {
          category: "urgent",
          scope: "unit",
          targetLabel: "301호",
          targetRoomIds: ["room-301"],
          title: "수정 시도",
          body: "발송 후에는 수정할 수 없습니다.",
          translations: []
        }),
      /발송|수정/
    );
  });

  it("rejects announcement scope and target room mismatches", () => {
    const service = new RoomlogService();

    assert.throws(
      () =>
        service.createManagerAnnouncementDraft("landlord-demo", {
          category: "life",
          scope: "all",
          targetLabel: "전체",
          targetRoomIds: ["room-301"],
          title: "전체 공지",
          body: "전체 세대에 전달할 내용입니다.",
          translations: []
        }),
      /전체|대상/
    );
    assert.throws(
      () =>
        service.createManagerAnnouncementDraft("landlord-demo", {
          category: "life",
          scope: "building",
          targetLabel: "정글빌라",
          targetRoomIds: [],
          title: "건물 공지",
          body: "건물 대상 공지입니다.",
          translations: []
        }),
      /건물|대상/
    );
  });

  it("translates one announcement language with strict structured output", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalTranslationModel = process.env.OPENAI_TRANSLATION_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_TRANSLATION_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            title: "[Urgent] Water outage",
            body: "Water will be unavailable from 14:00 to 16:00."
          })
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const service = new RoomlogService();
      const translated = await service.translateManagerAnnouncement("landlord-demo", {
        title: "[긴급] 단수 안내",
        body: "14시부터 16시까지 단수됩니다.",
        targetLang: "en"
      });

      assert.equal(translated.lang, "en");
      assert.equal(translated.langLabel, "English");
      assert.equal(translated.reviewed, false);
      assert.match(translated.sourceHash, /^[a-f0-9]{64}$/);
      assert.equal(capturedBody?.model, "gpt-5.4-mini");
      assert.equal((capturedBody?.text as { format?: { type?: string } })?.format?.type, "json_schema");
      assert.equal((capturedBody?.text as { format?: { strict?: boolean } })?.format?.strict, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalTranslationModel) process.env.OPENAI_TRANSLATION_MODEL = originalTranslationModel;
      else delete process.env.OPENAI_TRANSLATION_MODEL;
    }
  });

  it("rejects announcement auto translation when the OpenAI key is missing", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const service = new RoomlogService();
      await assert.rejects(
        () =>
          service.translateManagerAnnouncement("landlord-demo", {
            title: "단수 안내",
            body: "오늘 단수됩니다.",
            targetLang: "vi"
          }),
        /자동 번역|사용할 수/
      );
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("answers manager natural-language ticket queries from scoped operational data", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어집니다. 전화라 사진은 아직 못 보냈고 오늘 저녁 방문 가능합니다.",
        assistantTranscript:
          "긴급 누수로 접수하겠습니다. 사진 업로드 링크를 보내드리고 관리자에게 전달하겠습니다.",
        eventId: "evt_manager_query_callbot"
      });
      const callbot = service.createComplaintFromCall("tenant-demo", {
        callSessionId: session.id,
        recordingUrl: "https://example.com/recordings/query-callbot.mp3"
      });
      const unassignedUrgent = service.createComplaint("tenant-demo", {
        title: "주방 천장에서 물이 계속 떨어져요",
        description: "천장에서 물이 계속 떨어지고 바닥까지 젖어 즉시 확인이 필요합니다.",
        location: "주방 천장",
        availableTimes: "오늘 오후"
      });
      const assignedUrgent = service.createComplaint("tenant-demo", {
        title: "보일러가 꺼졌어요",
        description: "보일러가 켜지지 않아 온수와 난방을 쓸 수 없습니다.",
        location: "주방 보일러실",
        availableTimes: "오늘 언제든"
      });
      service.assignVendor("landlord-demo", assignedUrgent.ticket.id, {
        vendorId: "vendor-demo",
        requestNote: "긴급 점검 부탁드립니다."
      });

      const callbotResult = service.queryManagerAssistant("landlord-demo", {
        question: "콜봇으로 접수된 미처리 민원만 보여줘"
      });
      const urgentResult = service.queryManagerAssistant("landlord-demo", {
        question: "긴급도 1순위 민원 중 아직 업체 배정 안 된 건 보여줘"
      });

      assert.equal(callbotResult.matchedTickets.length, 1);
      assert.equal(callbotResult.matchedTickets[0].ticketId, callbot.ticket.id);
      assert.equal(callbotResult.matchedTickets[0].sourceChannel, "CALLBOT");
      assert.equal(callbotResult.filters.includes("접수 채널: 콜봇"), true);
      assert.equal(callbotResult.filters.includes("상태: 미처리"), true);
      assert.match(callbotResult.answer, /콜봇/);
      assert.match(callbotResult.answer, /1건/);

      assert.equal(
        urgentResult.matchedTickets.some((ticket) => ticket.ticketId === unassignedUrgent.ticket.id),
        true
      );
      assert.equal(
        urgentResult.matchedTickets.some((ticket) => ticket.ticketId === assignedUrgent.ticket.id),
        false
      );
      assert.equal(urgentResult.filters.includes("긴급도: 1순위"), true);
      assert.equal(urgentResult.filters.includes("업체 배정: 미배정"), true);
      assert.match(urgentResult.nextActions.join("\n"), /업체 배정/);
      assert.throws(
        () => service.queryManagerAssistant("landlord-demo", { question: "   " }),
        /질문/
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("creates a manager Realtime session with only allowlisted operation tools", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const result = await service.createManagerRealtimeClientSecret("landlord-demo", {
        voice: "marin"
      });

      assert.equal(result.mode, "not_configured");
      assert.match(result.sessionId, /manager-agent:landlord-demo/);
      assert.match(result.instructions, /관리인 운영 에이전트/);
      assert.match(result.instructions, /티켓 처리/);
      assert.match(result.instructions, /청구 관리/);
      assert.match(result.instructions, /소통/);
      assert.match(result.instructions, /독촉 발송은 billing\.send_dunning/);
      assert.doesNotMatch(result.instructions, /확인중 입금 또는 orphan 입금이 있으면 서버가 차단/);
      assert.equal(result.tools.some((tool: any) => tool.name === "run_manager_agent_command"), true);
      assert.match(JSON.stringify(result.tools), /ticket.query/);
      assert.match(JSON.stringify(result.tools), /billing.summary/);
      assert.match(JSON.stringify(result.tools), /billing.send_dunning/);
      assert.match(JSON.stringify(result.tools), /messaging.draft_reply/);
      assert.match(JSON.stringify(result.tools), /messaging.send_reply/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("uses OpenAI Responses to phrase manager realtime command answers with queried data", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalChatModel = process.env.OPENAI_CHAT_MODEL;
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_CHAT_MODEL = "gpt-5.4-mini";
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          output_text: "미납은 411호 888,000원, 502호 640,000원 등 총 1,888,000원입니다."
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const result = await service.runManagerAgentCommandForRealtime("landlord-demo", {
        command: "billing.summary",
        text: "미납된 호수와 금액 알려줘"
      });

      assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
      assert.equal(capturedHeaders?.get("Authorization"), "Bearer sk-test-roomlog");
      assert.equal(capturedBody?.model, "gpt-5.4-mini");
      assert.match(String(capturedBody?.instructions), /Roomlog 관리인 실시간 AI/);
      assert.match(JSON.stringify(capturedBody?.input), /미납된 호수와 금액/);
      assert.match(JSON.stringify(capturedBody?.input), /billing\.summary/);
      const requestText = (((capturedBody?.input as any[])?.[0]?.content as any[])?.[0]?.text ?? "{}") as string;
      const requestPayload = JSON.parse(requestText);
      const replyData = requestPayload.data;
      assert.match(JSON.stringify(capturedBody?.input), /currentMonthUnpaidBills/);
      assert.equal(replyData.dashboard.bills, undefined);
      assert.equal(
        replyData.currentMonthUnpaidBills.every(
          (bill: any) => bill.billingMonth === replyData.collection.billingMonth
        ),
        true
      );
      assert.equal(result.status, "executed");
      assert.equal(result.domain, "billing");
      assert.equal(result.summary, "미납은 411호 888,000원, 502호 640,000원 등 총 1,888,000원입니다.");
      assert.equal(result.navigation?.href, "/manager/billing");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalChatModel) process.env.OPENAI_CHAT_MODEL = originalChatModel;
      else delete process.env.OPENAI_CHAT_MODEL;
    }
  });

  it("keeps the deterministic manager realtime command summary when OpenAI phrasing fails", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "temporarily unavailable" } }), {
        headers: { "Content-Type": "application/json" },
        status: 503
      })) as typeof fetch;

    try {
      const result = await service.runManagerAgentCommandForRealtime("landlord-demo", {
        command: "billing.summary",
        text: "미납된 호수와 금액 알려줘"
      });

      assert.equal(result.status, "executed");
      assert.equal(result.domain, "billing");
      assert.match(result.summary, /이번 달 청구/);
      assert.match(result.summary, /미납/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("runs manager agent commands through a narrow server allowlist", async () => {
    const service = new RoomlogService();
    const ticketResult = service.runManagerAgentCommand("landlord-demo", {
      command: "ticket.query",
      text: "긴급도 1순위 민원 중 아직 업체 배정 안 된 건 보여줘"
    });
    const billingResult = service.runManagerAgentCommand("landlord-demo", {
      command: "billing.summary",
      text: "이번 달 수납 현황 알려줘"
    });
    const draftResult = service.runManagerAgentCommand("landlord-demo", {
      command: "messaging.draft_reply",
      text: "사진을 더 요청하는 답장 초안 만들어줘"
    });
    const dunningResult = service.runManagerAgentCommand("landlord-demo", {
      command: "billing.send_dunning",
      text: "411호 미납 독촉 바로 보내줘"
    });
    const guardedDunningResult = service.runManagerAgentCommand("landlord-demo", {
      command: "billing.send_dunning",
      billId: "bill-demo-guarded",
      text: "301호 확인중 청구 독촉 보내줘"
    });

    assert.equal(ticketResult.status, "executed");
    assert.equal(ticketResult.domain, "ticket");
    assert.match(ticketResult.summary, /조건으로/);
    assert.equal(ticketResult.navigation?.href, "/manager/ticket/dash/00");

    assert.equal(billingResult.status, "executed");
    assert.equal(billingResult.domain, "billing");
    assert.match(billingResult.summary, /수납률|청구/);
    assert.equal(billingResult.navigation?.href, "/manager/billing");

    assert.equal(draftResult.status, "draft_only");
    assert.equal(draftResult.domain, "messaging");
    assert.match(draftResult.summary, /초안/);
    assert.match(String((draftResult.data as any).draftText), /사진/);
    assert.equal(draftResult.navigation?.href, "/manager/messaging/00");

    assert.equal(dunningResult.status, "executed");
    assert.equal(dunningResult.domain, "billing");
    assert.match(dunningResult.summary, /411호.*독촉.*발송/);
    assert.equal(dunningResult.navigation?.href, "/manager/billing/dunning/bill-demo-overdue-411?id=bill-demo-overdue-411&send=ok");

    assert.equal(guardedDunningResult.status, "executed");
    assert.equal(guardedDunningResult.domain, "billing");
    assert.match(guardedDunningResult.summary, /301호.*독촉.*발송/);
    assert.equal(guardedDunningResult.navigation?.href, "/manager/billing/dunning/bill-demo-guarded?id=bill-demo-guarded&send=ok");
  });

  it("sends a manager realtime message into the tenant-visible messaging thread", async () => {
    const service = new RoomlogService();
    const body = "오늘 오후 4시에 공용 현관등 점검을 진행하겠습니다.";

    const result = service.runManagerAgentCommand("landlord-demo", {
      command: "messaging.send_reply",
      threadId: "mth_demo_general",
      body
    });
    const tenantThread = service.getTenantMessagingThread("tenant-demo", "mth_demo_general");
    const lastMessage = tenantThread.messages?.at(-1);

    assert.equal(result.status, "executed");
    assert.equal(result.domain, "messaging");
    assert.match(result.summary, /임차인.*수신|메시지.*전달/);
    assert.equal(tenantThread.lastMessage, body);
    assert.equal(tenantThread.unreadCount, 2);
    assert.equal(lastMessage?.sender, "manager");
    assert.equal(lastMessage?.body, body);
  });

  it("records realtime dunning sends in the tenant-visible payment thread", async () => {
    const service = new RoomlogService();

    const result = service.runManagerAgentCommand("landlord-demo", {
      command: "billing.send_dunning",
      text: "411호 연체 독촉 메시지 바로 보내줘"
    });
    const tenantThreads = service.listTenantMessagingThreads("tenant-billing-411");
    const paymentThread = tenantThreads.find(
      (thread) => thread.context === "payment" && thread.contextRef === "bill-demo-overdue-411"
    );

    assert.equal(result.status, "executed");
    assert.ok(paymentThread, "독촉 발송은 임차인 payment 메시지함에 기록되어야 한다.");
    assert.equal(paymentThread.lastMessage, (result.data as any).text);
    assert.equal(paymentThread.unreadCount, 1);

    const detail = service.getTenantMessagingThread("tenant-billing-411", paymentThread.id);
    const lastMessage = detail.messages?.at(-1);

    assert.equal(lastMessage?.sender, "manager");
    assert.match(lastMessage?.body ?? "", /미납|청구|독촉/);
  });

  it("sends guarded realtime dunning requests immediately into tenant-visible payment threads", async () => {
    const service = new RoomlogService();

    const result = service.runManagerAgentCommand("landlord-demo", {
      command: "billing.send_dunning",
      text: "302호 독촉 메시지 보내"
    });
    const tenantThreads = service.listTenantMessagingThreads("tenant-billing-302");
    const paymentThread = tenantThreads.find(
      (thread) => thread.context === "payment" && thread.contextRef === "bill-demo-guarded-302"
    );

    assert.equal(result.status, "executed");
    assert.equal(result.domain, "billing");
    assert.ok(paymentThread, "확인중 청구도 독촉 요청 즉시 임차인 payment 메시지함에 기록되어야 한다.");
    assert.equal(paymentThread.lastMessage, (result.data as any).text);
    assert.equal(paymentThread.unreadCount, 1);
  });

  it("blocks realtime manager messages that look like payment dunning", async () => {
    const service = new RoomlogService();

    const result = service.runManagerAgentCommand("landlord-demo", {
      command: "messaging.send_reply",
      threadId: "mth_demo_general",
      body: "301호 미납 독촉 메시지 보내줘"
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.domain, "messaging");
    assert.match(result.summary, /발송|독촉|확인/);
  });

  it("drafts contextual manager replies and sends the edited reply into the ticket timeline", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어집니다. 사진은 아직 못 보냈고 오늘 저녁 7시 이후 방문 가능합니다.",
        assistantTranscript:
          "콜봇으로 긴급 누수 접수 초안을 만들고 사진 업로드 링크를 안내하겠습니다.",
        eventId: "evt_manager_reply_draft"
      });
      const callbot = service.createComplaintFromCall("tenant-demo", {
        callSessionId: session.id,
        recordingUrl: "https://example.com/recordings/reply-draft-callbot.mp3"
      });

      const draft = service.draftManagerTicketReply("landlord-demo", callbot.ticket.id, {
        intent: "REQUEST_PHOTO",
        note: "천장 누수 확인용 사진 요청"
      });
      const editedMessage = `${draft.messageText}\n\n관리자 메모: 접수된 통화 내용을 확인했고 사진 확인 후 바로 배정하겠습니다.`;
      const sent = service.sendManagerTicketReply("landlord-demo", callbot.ticket.id, {
        action: "REQUEST_ADDITIONAL_INFO",
        messageText: editedMessage
      });
      const detail = service.getComplaintDetail("tenant-demo", callbot.complaint.id);
      const latestLandlordMessage = sent.ticket.messages
        .filter((message) => message.senderRole === "LANDLORD")
        .at(-1);
      const timeline = service.getTenantRoomTimeline("tenant-demo");

      assert.equal(draft.ticketId, callbot.ticket.id);
      assert.equal(draft.intent, "REQUEST_PHOTO");
      assert.equal(draft.requiresTenantAction, true);
      assert.equal(draft.deliveryChannels.includes("앱 알림"), true);
      assert.match(draft.messageText, /콜봇|통화/);
      assert.match(draft.messageText, /천장|누수/);
      assert.match(draft.messageText, /전체|근접|사진/);
      assert.match(draft.messageText, /오늘 저녁/);
      assert.match(draft.evidence.join("\n"), /전사|사진 업로드 링크/);
      assert.match(draft.warnings.join("\n"), /확정|참고/);
      assert.equal(sent.ticket.status, "ADDITIONAL_INFO_REQUESTED");
      assert.equal(detail.displayStatus, "추가정보 요청");
      assert.equal(latestLandlordMessage?.messageText, editedMessage);
      assert.equal(
        timeline.some(
          (entry) =>
            entry.ticketId === callbot.ticket.id &&
            entry.senderRole === "LANDLORD" &&
            entry.description === editedMessage
        ),
        true
      );
      assert.throws(
        () =>
          service.sendManagerTicketReply("landlord-demo", callbot.ticket.id, {
            action: "SEND_REPLY",
            messageText: "   "
          }),
        /답변/
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("links tenant additional info photos to the existing ticket and refreshes analysis", () => {
    const service = new RoomlogService();
    const created = service.createComplaint("tenant-demo", {
      title: "301호 화장실 누수",
      description: "화장실 천장에 물자국이 있는데 사진은 아직 없습니다.",
      location: "301호 화장실",
      availableTimes: "오늘 저녁"
    });

    service.requestAdditionalInfo(
      "landlord-demo",
      created.ticket.id,
      "천장 전체 사진과 물이 떨어지는 부분 근접 사진을 올려주세요."
    );

    const result = service.addTenantComplaintMessage("tenant-demo", created.complaint.id, {
      messageText: "천장 전체 사진과 물방울이 보이는 근접 사진을 추가했습니다.",
      attachmentUrls: ["/api/files/additional-ceiling-leak.png"]
    });
    const detail = service.getComplaintDetail("tenant-demo", created.complaint.id);
    const tenantMessages = detail.messages.filter((message) => message.senderRole === "TENANT");
    const latestTenantMessage = tenantMessages.at(-1);
    const timeline = service.getTenantRoomTimeline("tenant-demo");

    assert.equal(result.ticket.id, created.ticket.id);
    assert.equal(result.ticket.status, "REVIEWING");
    assert.equal(detail.displayStatus, "검토중");
    assert.deepEqual(latestTenantMessage?.attachmentUrls, [
      "/api/files/additional-ceiling-leak.png"
    ]);
    assert.match(result.ticket.aiSummary, /추가 정보/);
    assert.match(result.ticket.analysis.recommendedAction, /추가 사진/);
    assert.equal(
      timeline.some(
        (entry) =>
          entry.ticketId === created.ticket.id &&
          entry.attachmentUrls.includes("/api/files/additional-ceiling-leak.png")
      ),
      true
    );
    assert.equal(service.listTenantComplaints("tenant-demo").length, 1);
  });

  it("builds a room timeline from intake, ticket, status, message, and repair records", async () => {
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { sourceChannel: "REALTIME_CHAT" });

    await service.sendIntakeMessage("tenant-demo", session.id, {
      messageText: "301호 화장실 천장에서 물이 떨어집니다. 오늘 저녁 7시 이후 방문 가능합니다.",
      attachmentUrls: ["/api/files/timeline-leak.png"],
      inputMode: "CHAT"
    });
    const finalized = service.finalizeIntakeSession("tenant-demo", session.id);

    service.requestAdditionalInfo("landlord-demo", finalized.ticket.id, "천장 전체 사진도 부탁드립니다.");
    service.assignVendor("landlord-demo", finalized.ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "누수 원인 점검 후 방문 가능 시간을 제안해주세요."
    });
    const timeline = service.getTenantRoomTimeline("tenant-demo");
    const types = timeline.map((entry) => entry.type);

    assert.equal(timeline[0].room?.roomNo, "301호");
    assert.equal(types.includes("INTAKE_SESSION"), true);
    assert.equal(types.includes("COMPLAINT"), true);
    assert.equal(types.includes("STATUS_CHANGE"), true);
    assert.equal(types.includes("MESSAGE"), true);
    assert.equal(types.includes("REPAIR"), true);
    assert.equal(
      timeline.some((entry) => entry.attachmentUrls.includes("/api/files/timeline-leak.png")),
      true
    );
    assert.equal(
      service
        .getManagerRoomTimeline("landlord-demo", "room-301")
        .some((entry) => entry.ticketId === finalized.ticket.id),
      true
    );
    assert.throws(() => service.getManagerRoomTimeline("landlord-demo", "missing-room"), /호실/);
  });

  it("does not expose another tenant's room timeline entries to an invited tenant", () => {
    const service = new RoomlogService();
    const created = service.createComplaint("tenant-demo", {
      title: "기존 세입자 전용 누수 기록",
      description:
        "기존 세입자만 볼 수 있어야 하는 301호 화장실 누수 기록입니다.",
      location: "301호 화장실",
      availableTimes: "오늘 저녁"
    });
    const invite = service.createTenantInvite("landlord-demo", {
      roomId: "room-301",
      email: "timeline-invited-tenant@roomlog.test",
      tenantName: "타임라인 초대 세입자",
      phone: "010-7777-3100"
    });
    const invited = service.signup({
      email: "timeline-invited-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "타임라인 초대 세입자",
      phone: "010-7777-3100",
      role: "TENANT",
      inviteToken: invite.inviteToken
    } as any);
    const invitedTimeline = service.getTenantRoomTimeline(invited.userId);
    const originalTimeline = service.getTenantRoomTimeline("tenant-demo");
    const managerTimeline = service.getManagerRoomTimeline("landlord-demo", "room-301");

    assert.equal(originalTimeline.some((entry) => entry.ticketId === created.ticket.id), true);
    assert.equal(managerTimeline.some((entry) => entry.ticketId === created.ticket.id), true);
    assert.equal(invitedTimeline.some((entry) => entry.ticketId === created.ticket.id), false);
    assert.doesNotMatch(
      invitedTimeline.map((entry) => entry.description).join("\n"),
      /기존 세입자만 볼 수 있어야/
    );
  });

  it("creates a tenant complaint with linked ticket analysis", () => {
    const service = new RoomlogService();

    const complaint = service.createComplaint("tenant-demo", {
      title: "천장에서 물이 떨어져요",
      description:
        "어젯밤부터 안방 천장 모서리에서 물이 계속 떨어지고 얼룩이 커지고 있어요.",
      location: "안방 천장",
      occurredAt: "2026-06-29T21:10:00.000Z",
      availableTimes: "평일 오후 7시 이후"
    });

    assert.equal(complaint.complaint.status, "SUBMITTED");
    assert.equal(complaint.ticket.status, "RECEIVED");
    assert.equal(complaint.ticket.category, "누수");
    assert.equal(complaint.ticket.priority, 1);
    assert.equal(complaint.analysis.responsibilityHint, "임대인 책임 가능성");
  });

  it("surfaces repeated same-room issue context in manager ticket analysis", () => {
    const service = new RoomlogService();

    const first = service.createComplaint("tenant-demo", {
      title: "301호 화장실 천장 누수",
      description: "화장실 천장에서 물이 떨어지고 바닥에 물이 고입니다.",
      location: "301호 화장실 천장",
      occurredAt: "2026-06-10T20:00:00.000Z",
      availableTimes: "평일 저녁"
    });
    const second = service.createComplaint("tenant-demo", {
      title: "301호 화장실 천장 물샘 재발",
      description: "지난번과 같은 화장실 천장 주변에서 다시 물이 떨어집니다.",
      location: "301호 화장실 천장",
      occurredAt: "2026-06-20T20:00:00.000Z",
      availableTimes: "주말 오전"
    });
    const repeated = service.createComplaint("tenant-demo", {
      title: "301호 화장실 천장 반복 누수",
      description: "화장실 천장에서 또 물이 떨어져 반복 하자 여부 확인이 필요합니다.",
      location: "301호 화장실 천장",
      occurredAt: "2026-06-29T20:00:00.000Z",
      availableTimes: "오늘 저녁"
    });

    const managerDetail = service.getTicketDetailForManager("landlord-demo", repeated.ticket.id);

    assert.equal(managerDetail.analysis.repeatSummary?.isRepeated, true);
    assert.equal(managerDetail.analysis.repeatSummary?.matchCount, 2);
    assert.deepEqual(
      managerDetail.analysis.repeatSummary?.matchedTicketIds.toSorted(),
      [first.ticket.id, second.ticket.id].toSorted()
    );
    assert.match(managerDetail.analysis.repeatSummary?.label ?? "", /반복|3개월|2건/);
    assert.match(managerDetail.analysis.repeatSummary?.evidence.join("\n") ?? "", /화장실|누수/);
  });

  it("attaches tenant AI feedback to the existing ticket without creating a duplicate complaint", () => {
    const service = new RoomlogService();
    const created = service.createComplaint("tenant-demo", {
      title: "화장실 천장 물샘",
      description: "화장실 천장에서 물이 계속 떨어져 긴급 확인이 필요합니다.",
      location: "화장실 천장",
      occurredAt: "2026-06-29T22:00:00.000Z",
      availableTimes: "오늘 밤 가능"
    });

    const feedback = service.submitTenantAiFeedback("tenant-demo", created.complaint.id, {
      target: "PRIORITY",
      reason: "물이 계속 떨어지는데 일반 검토가 아니라 긴급 출동 대상입니다.",
      requestedAction: "오늘 중 관리자 확인과 업체 긴급 방문을 요청합니다.",
      attachmentUrls: ["/api/files/appeal-priority.png"]
    });
    const detail = service.getTicketDetailForManager("landlord-demo", created.ticket.id);
    const tenantTimeline = service.getTenantRoomTimeline("tenant-demo");

    assert.equal(feedback.ticketId, created.ticket.id);
    assert.equal(feedback.status, "OPEN");
    assert.equal(feedback.target, "PRIORITY");
    assert.match(feedback.originalValue, /P1|긴급|1/);
    assert.match(feedback.reason, /긴급 출동/);
    assert.deepEqual(feedback.attachmentUrls, ["/api/files/appeal-priority.png"]);
    assert.equal(service.listTenantComplaints("tenant-demo").length, 1);
    assert.equal(detail.aiFeedback.length, 1);
    assert.equal(detail.aiFeedback[0].id, feedback.id);
    assert.equal(
      detail.messages.some((message) =>
        message.messageText.includes("AI 판단 이의제기: 긴급도")
      ),
      true
    );
    assert.equal(
      tenantTimeline.some(
        (entry) =>
          entry.type === "AI_FEEDBACK" &&
          entry.ticketId === created.ticket.id &&
          entry.attachmentUrls.includes("/api/files/appeal-priority.png")
      ),
      true
    );
  });

  it("lets managers review tenant AI feedback and applies corrected analysis values", () => {
    const service = new RoomlogService();
    const created = service.createComplaint("tenant-demo", {
      title: "주방 수납장 문짝 흔들림",
      description: "며칠 전부터 수납장 문짝이 삐걱거리고 경첩이 헐거워졌습니다.",
      location: "주방 수납장",
      occurredAt: "2026-06-29T20:00:00.000Z",
      availableTimes: "평일 저녁"
    });
    const feedback = service.submitTenantAiFeedback("tenant-demo", created.complaint.id, {
      target: "PRIORITY",
      reason: "문짝이 곧 떨어질 것 같아서 일반 처리보다 빠른 확인이 필요합니다.",
      requestedAction: "우선 처리로 조정해주세요."
    });

    const reviewed = service.reviewTenantAiFeedback(
      "landlord-demo",
      created.ticket.id,
      feedback.id,
      {
        managerReviewNote: "경첩 탈락 위험을 인정해 우선 처리로 조정합니다.",
        correctedPriority: 2,
        correctedSummary: "주방 수납장 경첩 탈락 위험이 있어 우선 확인이 필요한 건입니다.",
        correctedResponsibilityHint: "판단 어려움"
      }
    );
    const tenantDetail = service.getComplaintDetail("tenant-demo", created.complaint.id);
    const tenantTimeline = service.getTenantRoomTimeline("tenant-demo");

    assert.equal(reviewed.priority, 2);
    assert.match(reviewed.aiSummary, /우선 확인/);
    assert.equal(reviewed.responsibilityHint, "판단 어려움");
    assert.equal(reviewed.analysis.priority, 2);
    assert.equal(reviewed.analysis.responsibilityHint, "판단 어려움");
    assert.match(reviewed.analysis.recommendedAction ?? "", /이의제기 검토 결과/);
    assert.equal(reviewed.aiFeedback[0].status, "REVIEWED");
    assert.equal(reviewed.aiFeedback[0].managerReviewNote, "경첩 탈락 위험을 인정해 우선 처리로 조정합니다.");
    assert.match(reviewed.aiFeedback[0].correctedValue ?? "", /P2 우선/);
    assert.equal(tenantDetail.aiFeedback[0].status, "REVIEWED");
    assert.equal(tenantDetail.aiFeedback[0].managerReviewNote, reviewed.aiFeedback[0].managerReviewNote);
    assert.equal(
      reviewed.messages.some((message) =>
        message.messageText.includes("AI 이의제기 검토 결과")
      ),
      true
    );
    assert.equal(
      tenantTimeline.some(
        (entry) =>
          entry.type === "AI_FEEDBACK" &&
          entry.ticketId === created.ticket.id &&
          entry.status === "검토 완료"
      ),
      true
    );
  });

  it("moves a ticket through vendor assignment and completion approval", () => {
    const service = new RoomlogService();
    const { ticket } = service.createComplaint("tenant-demo", {
      title: "보일러가 완전히 꺼졌어요",
      description: "보일러가 켜지지 않아 온수와 난방을 쓸 수 없습니다.",
      location: "주방 보일러실",
      occurredAt: "2026-06-29T08:30:00.000Z",
      availableTimes: "오늘 언제든 가능"
    });

    const repair = service.assignVendor("landlord-demo", ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "긴급 점검 후 견적을 제출해주세요."
    });

    assert.equal(repair.status, "REQUESTED");
    assert.equal(service.getTicket(ticket.id)?.status, "VENDOR_ASSIGNED");

    const estimate = service.submitEstimate("vendor-demo", repair.id, {
      estimateAmount: 120000,
      estimateDescription: "순환 펌프 점검 및 부품 교체 예상"
    });

    assert.equal(estimate.status, "ESTIMATE_SUBMITTED");
    assert.equal(service.getTicket(ticket.id)?.status, "ESTIMATE_REVIEW");
    assert.throws(
      () =>
        service.scheduleRepair("vendor-demo", repair.id, {
          scheduledAt: "2026-06-30T10:00:00.000Z"
        }),
      /승인|상태/
    );

    const approvedEstimate = service.approveRepairEstimate("landlord-demo", repair.id, {
      costBearer: "LANDLORD",
      note: "보일러 기본 설비 문제로 임대인 부담 승인"
    });

    assert.equal(approvedEstimate.status, "ESTIMATE_APPROVED");
    assert.equal(approvedEstimate.costBearer, "LANDLORD");
    assert.equal(approvedEstimate.estimateApprovalNote, "보일러 기본 설비 문제로 임대인 부담 승인");

    service.scheduleRepair("vendor-demo", repair.id, {
      scheduledAt: "2026-06-30T10:00:00.000Z"
    });
    const tenantDetailAfterSchedule = service.getComplaintDetail("tenant-demo", ticket.complaintId);
    const tenantMessageText = tenantDetailAfterSchedule.messages
      .map((message) => message.messageText)
      .join("\n");

    assert.equal(tenantDetailAfterSchedule.displayStatus, "수리중");
    assert.match(tenantMessageText, /방문 일정이 확정/);
    assert.match(tenantMessageText, /2026-06-30T10:00:00.000Z/);
    assert.match(tenantMessageText, /임대인 부담/);

    const report = service.reportCompletion("vendor-demo", repair.id, {
      completionNote: "부품 교체 후 온수 정상 작동 확인",
      completionPhotoUrls: ["/uploads/repair-complete.jpg"]
    });

    assert.equal(report.status, "COMPLETION_REPORTED");
    assert.equal(service.getTicket(ticket.id)?.status, "COMPLETION_REPORTED");

    const completed = service.approveCompletion(
      "landlord-demo",
      ticket.id,
      "임차인 확인 후 완료 승인"
    );

    assert.equal(completed.status, "COMPLETED");
    assert.equal(service.getComplaint(completed.complaintId)?.status, "COMPLETED");
  });

  it("projects manager vendor management data from completed repairs with sample guards", () => {
    const service = new RoomlogService();
    const { ticket } = service.createComplaint("tenant-demo", {
      title: "욕실 누수 점검 요청",
      description: "욕실 천장 모서리에서 물이 떨어져 배관 점검이 필요합니다.",
      location: "욕실 천장",
      occurredAt: "2026-06-29T08:30:00.000Z",
      availableTimes: "평일 오전"
    });

    const repair = service.assignVendor("landlord-demo", ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "누수 부위 확인 후 현장 사진을 남겨주세요."
    });
    service.submitEstimate("vendor-demo", repair.id, {
      estimateAmount: 120000,
      estimateDescription: "욕실 배관 누수 점검 및 실리콘 보수"
    });
    service.approveRepairEstimate("landlord-demo", repair.id, {
      costBearer: "LANDLORD",
      note: "기본 배관 문제로 임대인 부담 승인"
    });
    service.scheduleRepair("vendor-demo", repair.id, {
      scheduledAt: "2026-06-30T10:00:00.000Z"
    });
    service.reportCompletion("vendor-demo", repair.id, {
      completionNote: "배관 연결부 보수 후 누수 테스트 완료",
      completionPhotoUrls: ["/uploads/vendor-complete.jpg"]
    });
    service.approveCompletion("landlord-demo", ticket.id, "완료 확인");

    const vendors = service.listManagerVendorMgmtVendors("landlord-demo", {
      q: "빠른",
      trade: "plumbing",
      sort: "trade_recent"
    });
    assert.equal(vendors.length, 1);
    assert.equal(vendors[0].id, "vendor-demo");
    assert.equal(vendors[0].name, "빠른누수 설비");
    assert.equal(vendors[0].source, "auto");
    assert.equal(vendors[0].dealCount, 1);
    assert.deepEqual(vendors[0].trades.includes("plumbing"), true);

    const detail = service.getManagerVendorMgmtDetail("landlord-demo", "vendor-demo");
    assert.equal(detail.jobs.length, 1);
    assert.equal(detail.jobs[0].ticketId, ticket.id);
    assert.equal(detail.jobs[0].vendorJobId, repair.id);
    assert.equal(detail.jobs[0].unitId, "301");
    assert.equal(detail.jobs[0].rated, false);
    assert.equal(detail.perf.completedCount, 1);
    assert.equal(detail.perf.ratedCount, 0);
    assert.equal(detail.perf.ratingVisible, false);
    assert.equal(detail.perf.aiCommentEnabled, false);
    assert.equal(detail.perf.satisfactionAvg, undefined);
    assert.match(detail.perf.mirrorNotice, /V-JOB/);

    const noMatch = service.listManagerVendorMgmtVendors("landlord-demo", { trade: "electrical" });
    assert.equal(noMatch.length, 0);
  });

  it("creates and updates manager-owned vendor profiles without leaking between managers", () => {
    const service = new RoomlogService();
    const store = (service as unknown as { store: { users: any[] } }).store;
    store.users.push({
      id: "landlord-second",
      email: "landlord-second@roomlog.test",
      passwordHash: "hash",
      name: "Second Manager",
      role: "LANDLORD",
      status: "ACTIVE",
      createdAt: "2026-07-01T00:00:00.000Z"
    });

    const created = service.createManagerVendorProfile("landlord-demo", {
      businessName: "Seocho Electric",
      contactPerson: "Kim",
      phone: "010-1111-2222",
      serviceArea: "Seocho-gu"
    });

    assert.equal(created.vendor.name, "Seocho Electric");
    assert.equal(created.vendor.source, "manual");
    assert.equal(created.vendor.dealCount, 0);
    assert.equal(
      service
        .listManagerVendorMgmtVendors("landlord-demo", { q: "seocho" })
        .some((vendor) => vendor.id === created.vendor.id),
      true
    );
    assert.equal(
      service
        .listManagerVendorMgmtVendors("landlord-second", { q: "seocho" })
        .some((vendor) => vendor.id === created.vendor.id),
      false
    );

    const updated = service.updateManagerVendorProfile("landlord-demo", created.vendor.id, {
      businessName: "Seocho Electric Plus",
      contactPerson: "Lee",
      phone: "010-3333-4444",
      serviceArea: "Seocho-gu, Gangnam-gu"
    });

    assert.equal(updated.vendor.name, "Seocho Electric Plus");
    assert.equal(updated.vendor.contactPerson, "Lee");
    assert.equal(updated.vendor.phone, "01033334444");
    assert.throws(
      () =>
        service.updateManagerVendorProfile("landlord-second", created.vendor.id, {
          businessName: "Leaked Vendor",
          contactPerson: "Other",
          phone: "010-5555-6666",
          serviceArea: "Other Area"
        }),
      /업체|Vendor/
    );
  });

  it("projects manager cost ledger from landlord repair costs and excludes non-spend states", () => {
    const service = new RoomlogService();
    const completeRepair = (
      title: string,
      costBearer: "LANDLORD" | "TENANT" | "PENDING",
      estimateAmount: number
    ) => {
      const { ticket } = service.createComplaint("tenant-demo", {
        title,
        description: "욕실 천장 누수 보수 요청입니다.",
        location: "욕실 천장",
        occurredAt: "2026-07-01T08:30:00.000Z",
        availableTimes: "평일 오전"
      });
      const repair = service.assignVendor("landlord-demo", ticket.id, {
        vendorId: "vendor-demo",
        requestNote: "현장 확인 후 견적을 남겨주세요."
      });

      service.submitEstimate("vendor-demo", repair.id, {
        estimateAmount,
        estimateDescription: "누수 점검 및 실리콘 보수"
      });
      service.approveRepairEstimate("landlord-demo", repair.id, {
        costBearer,
        note: "비용 주체 확인"
      });
      service.scheduleRepair("vendor-demo", repair.id, {
        scheduledAt: "2026-07-02T10:00:00.000Z"
      });
      service.reportCompletion("vendor-demo", repair.id, {
        completionNote: "보수 완료"
      });
      service.approveCompletion("landlord-demo", ticket.id, "완료 확인");

      return repair;
    };

    const landlordRepair = completeRepair("임대인 부담 누수 보수", "LANDLORD", 120000);
    const tenantRepair = completeRepair("임차인 부담 소모품 교체", "TENANT", 80000);
    const projectedCost = service
      .listManagerCosts("landlord-demo")
      .find((cost) => cost.paymentRef === landlordRepair.id);
    assert.ok(projectedCost);

    const store = (service as unknown as { store: { costs: any[]; rooms: any[] } }).store;
    store.rooms.push({
      id: "room-other-manager-101",
      buildingName: "다른 관리동",
      roomNo: "101호",
      address: "서울시 테스트구 1",
      landlordId: "landlord-other"
    });
    store.costs.push(
      {
        id: "cost_review_draft",
        managerId: "landlord-demo",
        date: projectedCost.date,
        item: "복도 조명 교체",
        amount: 48000,
        type: "common",
        scope: "building",
        status: "draft",
        verified: false,
        reviewReason: "ocr_low_confidence",
        createdAt: projectedCost.createdAt,
        updatedAt: projectedCost.updatedAt
      },
      {
        id: "cost_private_maintenance",
        managerId: "landlord-demo",
        date: projectedCost.date,
        item: "공용 관리비 정산",
        amount: 30000,
        type: "maintenance",
        scope: "building",
        status: "confirmed",
        verified: false,
        disclosure: "private",
        createdAt: projectedCost.createdAt,
        updatedAt: projectedCost.updatedAt
      },
      {
        id: "cost_void_duplicate",
        date: projectedCost.date,
        item: "중복 등록 출장비",
        amount: 50000,
        type: "repair",
        scope: "unit",
        unitId: "301",
        status: "void",
        verified: true,
        voidReason: "중복 등록",
        createdAt: projectedCost.createdAt,
        updatedAt: projectedCost.updatedAt
      }
    );

    const costs = service.listManagerCosts("landlord-demo");
    assert.ok(costs.some((cost) => cost.paymentRef === landlordRepair.id));
    assert.equal(costs.some((cost) => cost.paymentRef === tenantRepair.id), false);
    assert.equal(
      service.listManagerCosts("landlord-other").some((cost) => cost.id === "cost_private_maintenance"),
      false
    );

    const queue = service.getManagerCostReviewQueueSummary("landlord-demo");
    assert.equal(queue.ocrLowConfidence, 1);
    assert.equal(queue.total, 1);
    assert.equal(queue.unverifiedConfirmed, 1);

    const month = projectedCost.date.slice(0, 7);
    const summary = service.getManagerMonthlyCostSummary("landlord-demo", month);
    assert.equal(summary.totalAmount, 150000);
    assert.equal(summary.byType.repair, 120000);
    assert.equal(summary.byType.maintenance, 30000);
    assert.equal(summary.byType.common, 0);
    assert.equal(summary.confirmedCount, 2);

    const disclosure = service.getManagerDisclosureSetting("landlord-demo", month);
    assert.equal(disclosure.hiddenCount, 1);
    assert.equal(disclosure.entries[0].costId, "cost_private_maintenance");
  });

  it("persists manager cost OCR decisions, disclosure changes, and void audit state", () => {
    const service = new RoomlogService();
    const store = (service as unknown as { store: { costs: any[]; receipts: any[]; receiptOcrs: any[] } }).store;
    const createdAt = "2026-12-01T00:00:00.000Z";

    store.receipts.push({
      id: "receipt_real_1",
      managerId: "landlord-demo",
      source: "file",
      hasEvidence: true,
      uploadedAt: createdAt
    });
    store.receiptOcrs.push({
      id: "ocr_real_1",
      receiptId: "receipt_real_1",
      fields: {
        item: { value: "December maintenance lighting", confidence: 0.96, needsReview: false },
        date: { value: createdAt, confidence: 0.95, needsReview: false },
        amount: { value: 41000, confidence: 0.54, needsReview: true }
      },
      suggestedType: "maintenance",
      typeConfidence: 0.72,
      lineItems: [{ label: "lighting", amount: 41000, suggestedType: "maintenance" }],
      createdAt
    });

    const confirmed = service.confirmManagerReceiptOcr("landlord-demo", "ocr_real_1");
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.verified, false);
    assert.equal(confirmed.disclosure, "public");
    assert.equal(
      store.receiptOcrs.find((ocr) => ocr.id === "ocr_real_1")?.costId,
      confirmed.id
    );
    assert.equal(service.getManagerMonthlyCostSummary("landlord-demo", "2026-12").totalAmount, 41000);

    const privateSetting = service.updateManagerCostDisclosure(
      "landlord-demo",
      confirmed.id,
      "private"
    );
    assert.equal(privateSetting.hiddenCount, 1);

    const publicSetting = service.updateManagerCostDisclosure(
      "landlord-demo",
      confirmed.id,
      "public"
    );
    assert.equal(publicSetting.hiddenCount, 0);

    const voided = service.voidManagerCost("landlord-demo", confirmed.id, "duplicate receipt");
    assert.equal(voided.status, "void");
    assert.equal(voided.voidReason, "duplicate receipt");
    assert.equal(service.getManagerMonthlyCostSummary("landlord-demo", "2026-12").totalAmount, 0);
  });

  it("lets tenants confirm completion or reopen unresolved repairs after vendor completion reports", () => {
    const service = new RoomlogService();
    const createReportedRepair = (title: string) => {
      const { complaint, ticket } = service.createComplaint("tenant-demo", {
        title,
        description: "욕실 천장 보수 후에도 물 자국과 물방울이 남아 있습니다.",
        location: "욕실 천장",
        occurredAt: "2026-06-29T20:00:00.000Z",
        availableTimes: "평일 저녁"
      });
      const repair = service.assignVendor("landlord-demo", ticket.id, {
        vendorId: "vendor-demo",
        requestNote: "현장 확인 후 보수 완료 사진을 남겨주세요."
      });
      service.submitEstimate("vendor-demo", repair.id, {
        estimateAmount: 90000,
        estimateDescription: "실리콘 보강 및 누수 흔적 점검"
      });
      service.approveRepairEstimate("landlord-demo", repair.id, {
        costBearer: "LANDLORD",
        note: "현장 보수 견적 승인"
      });
      service.scheduleRepair("vendor-demo", repair.id, {
        scheduledAt: "2026-07-01T10:00:00.000Z"
      });
      service.reportCompletion("vendor-demo", repair.id, {
        completionNote: "실리콘 보강 후 누수 흔적 확인",
        completionPhotoUrls: ["/api/files/completion.jpg"]
      });

      return { complaint, ticket };
    };

    const confirmTarget = createReportedRepair("욕실 천장 보수 완료 확인");
    const confirmed = service.confirmTenantCompletion("tenant-demo", confirmTarget.complaint.id, {
      note: "지금은 물이 떨어지지 않습니다."
    });

    assert.equal(confirmed.ticket.status, "COMPLETED");
    assert.equal(confirmed.complaint.displayStatus, "완료");
    assert.equal(service.getComplaint(confirmTarget.complaint.id)?.status, "COMPLETED");
    assert.equal(
      confirmed.ticket.messages.some(
        (message) =>
          message.senderRole === "TENANT" &&
          message.messageText.includes("물이 떨어지지 않습니다")
      ),
      true
    );

    const reopenTarget = createReportedRepair("욕실 천장 미해결 재요청");
    const reopened = service.reopenTenantComplaint("tenant-demo", reopenTarget.complaint.id, {
      messageText: "수리 후에도 같은 위치에서 다시 물이 떨어집니다.",
      attachmentUrls: ["/api/files/reopen-leak.jpg"]
    });

    assert.equal(reopened.ticket.status, "REOPENED");
    assert.equal(reopened.complaint.displayStatus, "재요청");
    assert.equal(service.getComplaint(reopenTarget.complaint.id)?.status, "REOPENED");
    assert.equal(reopened.message.senderRole, "TENANT");
    assert.deepEqual(reopened.message.attachmentUrls, ["/api/files/reopen-leak.jpg"]);
    assert.equal(
      reopened.ticket.messages.some(
        (message) =>
          message.senderRole === "TENANT" &&
          message.messageText.includes("다시 물이 떨어집니다") &&
          message.attachmentUrls.includes("/api/files/reopen-leak.jpg")
      ),
      true
    );

    const reassignedRepair = service.assignVendor("landlord-demo", reopenTarget.ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "재요청 건으로 같은 부위를 다시 확인해주세요."
    });
    assert.equal(reassignedRepair.status, "REQUESTED");
    assert.equal(service.getTicket(reopenTarget.ticket.id)?.status, "VENDOR_ASSIGNED");

    assert.throws(
      () =>
        service.confirmTenantCompletion("tenant-other", reopenTarget.complaint.id, {
          note: "다른 세입자의 완료 확인"
        }),
      /민원/
    );
    assert.throws(
      () =>
        service.reopenTenantComplaint("tenant-demo", confirmTarget.complaint.id, {
          messageText: "   "
        }),
      /사유/
    );
  });

  it("lets only the assigned vendor add ticket-scoped repair messages with photos", () => {
    const service = new RoomlogService();
    const { ticket } = service.createComplaint("tenant-demo", {
      title: "욕실 천장 점검 요청",
      description: "욕실 천장 모서리에 물방울이 맺혀 업체 확인이 필요합니다.",
      location: "욕실 천장",
      availableTimes: "내일 오전"
    });
    const repair = service.assignVendor("landlord-demo", ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "누수 부위 확인 전 현장 사진을 남겨주세요."
    });
    service.addTenantComplaintMessage("tenant-demo", ticket.complaintId, {
      messageText: "물방울 사진을 추가로 남깁니다.",
      attachmentUrls: ["/api/files/tenant-leak.jpg"]
    });
    const otherInvite = service.createVendorInvite("landlord-demo", {
      email: "other-vendor-message@roomlog.test",
      businessName: "다른 설비",
      contactPerson: "다른 기사",
      phone: "010-6666-7777",
      serviceArea: "성동구"
    });
    const otherVendor = service.signup({
      email: "other-vendor-message@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "다른 기사",
      phone: "010-6666-7778",
      role: "VENDOR",
      inviteToken: otherInvite.inviteToken
    } as any);

    const vendorMessage = service.addVendorRepairMessage("vendor-demo", repair.id, {
      messageText: "방문 전 누수 차단 밸브 위치를 확인해주세요.",
      attachmentUrls: ["/api/files/vendor-before-visit.jpg"]
    });
    const managerDetail = service.getTicketDetailForManager("landlord-demo", ticket.id);
    const vendorList = service.listVendorRepairs("vendor-demo");
    const vendorDetail = service.getVendorRepair("vendor-demo", repair.id);
    const vendorTicket = vendorDetail.ticket as Record<string, unknown>;
    const vendorComplaint = vendorDetail.ticket.complaint as Record<string, unknown>;
    const vendorRoom = vendorDetail.ticket.room as Record<string, unknown>;
    const vendorPhotoAnalysis = vendorDetail.ticket.analysis.photoAnalysis as
      | Record<string, unknown>
      | undefined;
    const vendorMessageTicket = vendorMessage.ticket as Record<string, unknown>;

    assert.equal(vendorMessage.message.senderRole, "VENDOR");
    assert.deepEqual(vendorMessage.message.attachmentUrls, [
      "/api/files/vendor-before-visit.jpg"
    ]);
    assert.equal(
      managerDetail.messages.some(
        (message) =>
          message.senderRole === "VENDOR" &&
          message.messageText.includes("누수 차단 밸브") &&
          message.attachmentUrls.includes("/api/files/vendor-before-visit.jpg")
      ),
      true
    );
    assert.equal(vendorList[0]?.ticket.complaint.title, "욕실 천장 점검 요청");
    assert.equal(vendorDetail.managerRequestText, "누수 부위 확인 전 현장 사진을 남겨주세요.");
    assert.equal(vendorDetail.visitMemo, "내일 오전");
    assert.deepEqual(vendorDetail.ticket.attachmentUrls, ["/api/files/tenant-leak.jpg"]);
    assert.deepEqual(vendorDetail.ticket.complaint.attachmentUrls, [
      "/api/files/tenant-leak.jpg"
    ]);
    assert.deepEqual(vendorDetail.ticket.room, {
      buildingName: "정글빌라",
      roomNo: "301호"
    });
    assert.equal("tenantId" in vendorTicket, false);
    assert.equal("roomId" in vendorTicket, false);
    assert.equal("messages" in vendorTicket, false);
    assert.equal("history" in vendorTicket, false);
    assert.equal("roomTimeline" in vendorTicket, false);
    assert.equal("callbot" in vendorTicket, false);
    assert.equal("aiFeedback" in vendorTicket, false);
    assert.equal("tenantId" in vendorComplaint, false);
    assert.equal("roomId" in vendorComplaint, false);
    assert.equal("address" in vendorRoom, false);
    assert.equal(
      Boolean(vendorPhotoAnalysis && "previousAttachmentUrls" in vendorPhotoAnalysis),
      false
    );
    assert.equal("messages" in vendorMessageTicket, false);
    assert.throws(
      () =>
        service.addVendorRepairMessage(otherVendor.userId, repair.id, {
          messageText: "배정되지 않은 업체 메시지"
        }),
      /수리 요청/
    );
    assert.throws(
      () =>
        service.addVendorRepairMessage("vendor-demo", repair.id, {
          messageText: "   "
        }),
      /메시지/
    );
  });

  it("blocks manager and vendor actions that do not match the ticket workflow", () => {
    const service = new RoomlogService();
    const { ticket } = service.createComplaint("tenant-demo", {
      title: "천장에서 물이 떨어져요",
      description: "화장실 천장에서 물이 계속 떨어지고 있습니다.",
      location: "화장실 천장",
      availableTimes: "오늘 저녁 7시 이후"
    });

    assert.throws(
      () => service.approveCompletion("landlord-demo", ticket.id, "아직 작업 전 완료 승인"),
      /상태/
    );

    const repair = service.assignVendor("landlord-demo", ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "긴급 확인 부탁드립니다."
    });

    assert.throws(
      () =>
        service.scheduleRepair("vendor-demo", repair.id, {
          scheduledAt: "2026-06-30T10:00:00.000Z"
        }),
      /상태/
    );

    service.submitEstimate("vendor-demo", repair.id, {
      estimateAmount: 80000,
      estimateDescription: "현장 점검 및 보수"
    });
    service.approveRepairEstimate("landlord-demo", repair.id, {
      costBearer: "LANDLORD",
      note: "현장 점검 견적 승인"
    });
    service.scheduleRepair("vendor-demo", repair.id, {
      scheduledAt: "2026-06-30T10:00:00.000Z"
    });
    service.reportCompletion("vendor-demo", repair.id, {
      completionNote: "조치 완료"
    });
    service.approveCompletion("landlord-demo", ticket.id, "완료 확인");

    assert.throws(
      () =>
        service.submitEstimate("vendor-demo", repair.id, {
          estimateAmount: 100000,
          estimateDescription: "완료 후 재견적"
        }),
      /상태/
    );
  });

  it("wires contract document APIs with tenant/manager scope and server confirmation gates", () => {
    const service = new RoomlogService();

    const contracts = service.listTenantContracts("tenant-demo");
    assert.equal(contracts.some((contract) => contract.id === "ct_0001"), true);
    assert.equal(contracts.some((contract) => contract.id === "ct_moveout_0001"), true);

    const tenantContract = service.getTenantContract("tenant-demo", "ct_0001");
    const tenantExtraction = service.getTenantContractExtraction("tenant-demo", tenantContract.id);
    const tenantPrivacy = service.getTenantContractPrivacy("tenant-demo", tenantContract.id);

    assert.equal(tenantContract.review, "pending");
    assert.equal(tenantExtraction.confirmed, false);
    assert.equal(tenantPrivacy.maskingEnabled, true);
    assert.equal(
      service.getManagerContractDashboard("landlord-demo").counts.needsCheck,
      tenantExtraction.items.filter((item) => item.needsCheck).length
    );

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", tenantContract.id),
      /확인 필요/
    );
    assert.equal(service.getManagerContractDashboard("tenant-demo").rows.length, 0);
    assert.throws(
      () =>
        service.confirmManagerContractReview("tenant-demo", tenantContract.id, {
          confirmNeedsCheck: true
        }),
      /관리 가능한 계약서/
    );

    const manualValues = {
      monthlyRent: 650000,
      maintenanceFee: 70000,
      paymentDay: 25,
      startDate: "2026-03-01",
      endDate: "2099-12-31"
    };
    service.updateManagerContractManualValues(
      "landlord-demo",
      tenantContract.id,
      manualValues
    );

    const confirmed = service.confirmManagerContractReview("landlord-demo", tenantContract.id, {
      confirmNeedsCheck: true
    });

    assert.equal(confirmed.row.contract.lifecycle, "active");
    assert.equal(confirmed.row.contract.review, "confirmed");
    assert.equal(confirmed.row.contract.valueSource, "confirmed");
    assert.equal(service.getTenantContract("tenant-demo", tenantContract.id).review, "confirmed");
    assert.equal(service.getTenantContractExtraction("tenant-demo", tenantContract.id).confirmed, true);

    const deletion = service.decideManagerContractDeletion(
      "landlord-demo",
      tenantContract.id,
      "limited",
      "정산 예외 확인"
    );

    assert.equal(deletion.privacy.deletion, "limited");
    assert.equal(
      service.getTenantContractPrivacy("tenant-demo", tenantContract.id).deletion,
      "limited"
    );
  });

  it("uses OpenAI contract OCR when an API key is configured", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalContractOcrModel = process.env.OPENAI_CONTRACT_OCR_MODEL;
    const originalFetch = globalThis.fetch;
    const uploadDir = mkdtempSync(join(tmpdir(), "roomlog-contract-ocr-"));
    let capturedUrl = "";
    let capturedBody: Record<string, any> = {};

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_CONTRACT_OCR_MODEL = "gpt-contract-ocr-test";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, any>;

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            summary: "계약서 원문에서 금액과 기간을 추출했습니다.",
            highlights: ["보증금 2천만원", "월세 80만원"],
            items: [
              {
                label: "보증금",
                value: "20,000,000원",
                group: "money",
                needsCheck: false,
                evidence: "보증금은 금 이천만원정",
                masked: false
              },
              {
                label: "상세 주소",
                value: "서울시 성동구 성수동 301호",
                group: "term",
                needsCheck: true,
                evidence: "목적물 소재지",
                masked: true
              }
            ],
            helpNotes: [
              {
                clause: "관리자 확인",
                plain: "원문과 금액을 한 번 더 대조하세요.",
                source: "OpenAI OCR"
              }
            ]
          })
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }) as typeof fetch;

    try {
      const service = new RoomlogService({ uploadDir });
      const upload = await service.saveManagerContractUpload("landlord-demo", {
        buffer: Buffer.from("fake-contract-image"),
        originalName: "contract.png",
        mimeType: "image/png"
      });
      const created = service.createManagerContract("landlord-demo", {
        unitId: "301",
        fileName: upload.fileName,
        fileUrl: upload.fileUrl
      });
      const result = await service.runManagerContractOcr("landlord-demo", created.row.contract.id);

      assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
      assert.equal(capturedBody.model, "gpt-contract-ocr-test");
      assert.equal(
        capturedBody.input?.[0]?.content?.some((part: Record<string, unknown>) => part.type === "input_image"),
        true
      );
      assert.match(result.extraction.highlights.join("\n"), /실제 OCR/);
      assert.equal(
        result.extraction.items.find((item) => item.label === "보증금")?.value,
        "20,000,000원"
      );
      assert.equal(
        result.extraction.items.find((item) => item.label === "상세 주소")?.masked,
        true
      );
      assert.equal(result.row.contract.valueSource, "unverified");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalContractOcrModel) process.env.OPENAI_CONTRACT_OCR_MODEL = originalContractOcrModel;
      else delete process.env.OPENAI_CONTRACT_OCR_MODEL;
      rmSync(uploadDir, { force: true, recursive: true });
    }
  });

  it("lets a tenant read only their own moveout request", () => {
    const service = createMoveoutTestService() as any;

    assert.equal(service.getTenantMoveout("tenant-a", "mo-a").id, "mo-a");
    assert.throws(() => service.getTenantMoveout("tenant-b", "mo-a"), /퇴실|찾을 수|접근/);
    assert.throws(() => service.listTenantMoveoutRecords("tenant-b", "mo-a"), /퇴실|찾을 수|접근/);
    assert.throws(() => service.listTenantMoveoutChecklist("tenant-b", "mo-a"), /퇴실|찾을 수|접근/);
    assert.throws(() => service.getTenantMoveoutSettlement("tenant-b", "mo-a"), /퇴실|찾을 수|접근/);
    assert.throws(() => service.listTenantMoveoutDisputes("tenant-b", "mo-a"), /퇴실|찾을 수|접근/);
  });

  it("returns moveout record evidence without exposing mutable store arrays", () => {
    const service = createMoveoutTestService() as any;

    const records = service.listTenantMoveoutRecords("tenant-a", "mo-a");
    const record = records.find((item: any) => item.id === "rec-a");

    assert.deepEqual(record.evidenceUrls, ["/api/files/moveout-before.jpg"]);
    record.evidenceUrls.push("/api/files/mutated.jpg");
    assert.deepEqual(
      service.listTenantMoveoutRecords("tenant-a", "mo-a").find((item: any) => item.id === "rec-a").evidenceUrls,
      ["/api/files/moveout-before.jpg"]
    );
  });

  it("lets a manager read only moveouts for rooms they manage", () => {
    const service = createMoveoutTestService() as any;
    const managerARows = service.listManagerMoveoutRows("manager-a");
    const managerBRows = service.listManagerMoveoutRows("manager-b");

    assert.equal(managerARows.some((row: any) => row.summaryId === "mo-a"), true);
    assert.equal(managerARows.some((row: any) => row.summaryId === "mo-b"), false);
    assert.equal(managerBRows.some((row: any) => row.summaryId === "mo-b"), true);
    assert.equal(managerBRows.some((row: any) => row.summaryId === "mo-a"), false);
    assert.equal(service.getManagerMoveoutSettlement("manager-a", "mo-a").settlement.id, "st-a");
    assert.throws(
      () => service.getManagerMoveoutSettlement("manager-b", "mo-a"),
      /담당 호실|퇴실|찾을 수/
    );
    assert.throws(() => service.getManagerMoveoutRecords("manager-b", "mo-a"), /담당 호실|퇴실|찾을 수/);
    assert.throws(() => service.getManagerReportAudit("manager-b", "mo-a"), /담당 호실|퇴실|찾을 수/);
    assert.throws(
      () =>
        service.adjustManagerMoveoutDeduction("manager-b", "mo-a", {
          deductionId: "de-a",
          estimatedMin: 0,
          estimatedMax: 0,
          resolveConfirmation: true
        }),
      /담당 호실|퇴실|찾을 수/
    );
    assert.throws(
      () =>
        service.adjustManagerMoveoutWearVerdict("manager-b", "mo-a", {
          recordItemId: "rec-a",
          action: "reinforce",
          evidenceNote: "타 호실 접근 시도",
          notifyTenant: true
        }),
      /담당 호실|퇴실|찾을 수/
    );
    assert.throws(
      () =>
        service.completeManagerMoveoutReview("manager-b", "mo-a", {
          acknowledgeEvidence: true,
          overrideSla: true,
          overrideReason: "타 호실 접근 시도"
        }),
      /담당 호실|퇴실|찾을 수/
    );
    assert.throws(
      () =>
        service.respondManagerMoveoutDispute("manager-b", "mo-a", {
          disputeId: "dp-sla",
          kind: "explain",
          message: "타 호실 접근 시도",
          reflect: "none"
        }),
      /담당 호실|퇴실|찾을 수/
    );
  });

  it("blocks moveout review completion while the contract is unconfirmed", () => {
    const service = createMoveoutTestService() as any;

    assert.throws(
      () =>
        service.completeManagerMoveoutReview("manager-a", "mo-unconfirmed", {
          acknowledgeEvidence: true
        }),
      /계약/
    );
  });

  it("does not allow blank move-in evidence to establish tenant responsibility", () => {
    const service = createMoveoutTestService() as any;

    assert.throws(
      () =>
        service.adjustManagerMoveoutWearVerdict("manager-a", "mo-a", {
          recordItemId: "rec-blank",
          action: "adjust",
          toVerdict: "damage_possible",
          evidenceNote: "입주 전 사진이 없어 임차인 책임으로 봅니다.",
          notifyTenant: true
        }),
      /공백|책임/
    );
  });

  it("requires a manager reason before using moveout SLA override", () => {
    const service = createMoveoutTestService() as any;

    assert.throws(
      () =>
        service.completeManagerMoveoutReview("manager-a", "mo-a", {
          acknowledgeEvidence: true,
          overrideSla: true
        }),
      /사유/
    );
  });

  it("creates and links a manager-visible messaging thread for tenant moveout inquiries", () => {
    const service = createMoveoutTestService() as any;

    const result = service.createTenantMoveoutInquiry("tenant-a", "mo-a", {
      body: "퇴실 일정과 예상 정산 문의드립니다.",
      attachmentUrls: ["/api/files/moveout-question.jpg", ""]
    });
    const managerThreads = service.listManagerMessagingThreads("manager-a", "moveout");
    const tenantThread = service.getTenantMessagingThread("tenant-a", result.thread.id);

    assert.equal(result.thread.context, "moveout");
    assert.equal(result.thread.contextRef, "mo-a");
    assert.equal(managerThreads.some((thread: any) => thread.id === result.thread.id), true);
    assert.match(tenantThread.messages.at(-1).body, /퇴실 일정/);
    assert.deepEqual(tenantThread.messages.at(-1).attachmentUrls, ["/api/files/moveout-question.jpg"]);
  });

  it("lets a tenant save moveout checklist item state and recalculates preparation progress", () => {
    const service = createMoveoutTestService() as any;

    const result = service.updateTenantMoveoutChecklist("tenant-a", "mo-a", {
      items: [
        {
          id: "ck-cardkey",
          label: "현관 카드키 2개",
          present: true,
          condition: "normal",
          note: "반납 준비 완료",
          attachmentUrls: ["/api/files/key-before.jpg", "/api/files/key-before.jpg", ""]
        },
        {
          id: "ck-mailbox",
          label: "우편함 열쇠",
          present: false,
          condition: "damage_check",
          note: "분실 여부 확인 중"
        }
      ]
    });
    const saved = service.listTenantMoveoutChecklist("tenant-a", "mo-a");
    const summary = service.getTenantMoveout("tenant-a", "mo-a");

    assert.equal(result.length, 2);
    assert.equal(saved[0].summaryId, "mo-a");
    assert.equal(saved[0].note, "반납 준비 완료");
    assert.deepEqual(saved[0].attachmentUrls, ["/api/files/key-before.jpg"]);
    assert.equal(saved[1].condition, "damage_check");
    assert.equal(summary.prepProgress, 0.5);
    assert.throws(
      () =>
        service.updateTenantMoveoutChecklist("tenant-b", "mo-a", {
          items: [{ label: "침대 프레임", present: true, condition: "normal" }]
        }),
      /퇴실|찾을 수|접근/
    );
  });

  it("stores tenant moveout dispute evidence and sends it to the manager thread", () => {
    const service = createMoveoutTestService() as any;

    const dispute = service.createTenantMoveoutDispute("tenant-a", "mo-a", {
      targetItemId: "de-a",
      targetLabel: "욕실 수리비 후보",
      reason: "입주 전 사진과 같은 흔적입니다.",
      attachmentUrls: ["/api/files/bath-before.jpg", "/api/files/bath-before.jpg", ""]
    });
    const managerThreads = service.listManagerMessagingThreads("manager-a", "moveout");
    const threadSummary = managerThreads.find((candidate: any) => candidate.id === dispute.messagingThreadId);
    const thread = service.getManagerMessagingThread("manager-a", threadSummary.id);

    assert.deepEqual(dispute.attachmentUrls, ["/api/files/bath-before.jpg"]);
    assert.equal(thread.messages.at(-1).attachmentUrls.includes("/api/files/bath-before.jpg"), true);
  });

  it("lets a tenant confirm, re-dispute, resolve, and escalate moveout disputes", () => {
    const service = createMoveoutTestService() as any;

    const answered = service.respondManagerMoveoutDispute("manager-a", "mo-a", {
      disputeId: "dp-sla",
      kind: "explain",
      message: "입주 전 사진과 수리 이력을 다시 확인했습니다.",
      reflect: "none"
    });
    const confirmed = service.updateTenantMoveoutDispute("tenant-a", "mo-a", {
      disputeId: answered.id,
      action: "confirm"
    });
    const redisputed = service.updateTenantMoveoutDispute("tenant-a", "mo-a", {
      disputeId: answered.id,
      action: "re_dispute",
      reason: "사진의 위치가 다릅니다.",
      attachmentUrls: ["/api/files/tenant-redispute.jpg"]
    });
    const escalated = service.escalateTenantMoveoutDispute("tenant-a", "mo-a", {
      disputeId: answered.id,
      reason: "응답 후에도 기한이 경과했습니다."
    });
    const resolved = service.updateTenantMoveoutDispute("tenant-a", "mo-a", {
      disputeId: answered.id,
      action: "resolve"
    });

    assert.equal(confirmed.status, "confirmed");
    assert.equal(redisputed.status, "re_disputed");
    assert.deepEqual(redisputed.attachmentUrls, ["/api/files/tenant-redispute.jpg"]);
    assert.equal(escalated.status, "reviewing");
    assert.equal(resolved.status, "resolved");
    assert.equal(
      resolved.history.some((event: any) => event.note?.includes("에스컬레이션")),
      true
    );
  });

  it("reflects accepted moveout disputes into settlement deductions", () => {
    const service = createMoveoutTestService() as any;

    service.respondManagerMoveoutDispute("manager-a", "mo-a", {
      disputeId: "dp-sla",
      kind: "accept",
      message: "입주 전부터 있던 하자로 인정해 차감 후보에서 제외합니다.",
      reflect: "settlement"
    });
    const review = service.getManagerMoveoutSettlement("manager-a", "mo-a");
    const deduction = review.settlement.deductions.find((item: any) => item.id === "de-a");

    assert.equal(deduction.estimatedMin, 0);
    assert.equal(deduction.estimatedMax, 0);
    assert.equal(deduction.needsConfirmation, false);
    assert.equal(review.settlement.refundMin, 10000000);
    assert.equal(review.settlement.refundMax, 10000000);
  });

  it("seeds the KAN-134 moveout demo flow for tenant and manager APIs", () => {
    const service = new RoomlogService({ seedDemoData: true } as any) as any;

    const tenantMoveouts = service.listTenantMoveouts("tenant-demo");
    const managerRows = service.listManagerMoveoutRows("landlord-demo");
    const settlement = service.getManagerMoveoutSettlement("landlord-demo", "mo_0001");

    assert.equal(tenantMoveouts.some((moveout: any) => moveout.id === "mo_0001"), true);
    assert.equal(managerRows.some((row: any) => row.summaryId === "mo_0001"), true);
    assert.equal(settlement.settlement.deductions.length, 4);
    assert.equal(settlement.disputes.length, 1);
  });

  it("backfills the KAN-134 moveout demo flow when a local demo snapshot already exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-moveout-seed-"));
    const storeFilePath = join(dir, "roomlog-store.json");
    const legacyDemoSnapshot = JSON.parse(
      JSON.stringify((new RoomlogService({ seedDemoData: true } as any) as any).store)
    );

    legacyDemoSnapshot.moveouts = [];
    legacyDemoSnapshot.moveoutRecords = [];
    legacyDemoSnapshot.moveoutChecklist = [];
    legacyDemoSnapshot.moveoutSettlements = [];
    legacyDemoSnapshot.moveoutDeductions = [];
    legacyDemoSnapshot.moveoutDisputes = [];
    legacyDemoSnapshot.moveoutReportAudits = [];

    try {
      writeFileSync(storeFilePath, JSON.stringify(legacyDemoSnapshot));

      const service = new RoomlogService({ seedDemoData: true, storeFilePath } as any) as any;
      const tenantMoveouts = service.listTenantMoveouts("tenant-demo");
      const settlement = service.getManagerMoveoutSettlement("landlord-demo", "mo_0001");

      assert.equal(tenantMoveouts.some((moveout: any) => moveout.id === "mo_0001"), true);
      assert.deepEqual(settlement.gate.blockingReasons, ["unresolved_dispute"]);
      assert.equal(settlement.gate.overrideAvailable, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("backfills the KAN-134 moveout demo flow when a persisted database snapshot is loaded", () => {
    const legacyDemoSnapshot = JSON.parse(
      JSON.stringify((new RoomlogService({ seedDemoData: true } as any) as any).store)
    );

    legacyDemoSnapshot.moveouts = [];
    legacyDemoSnapshot.moveoutRecords = [];
    legacyDemoSnapshot.moveoutChecklist = [];
    legacyDemoSnapshot.moveoutSettlements = [];
    legacyDemoSnapshot.moveoutDeductions = [];
    legacyDemoSnapshot.moveoutDisputes = [];
    legacyDemoSnapshot.moveoutReportAudits = [];

    const service = new RoomlogService({
      seedDemoData: true,
      initialStore: legacyDemoSnapshot
    } as any) as any;
    const settlement = service.getManagerMoveoutSettlement("landlord-demo", "mo_0001");

    assert.equal(service.listTenantMoveouts("tenant-demo").some((moveout: any) => moveout.id === "mo_0001"), true);
    assert.deepEqual(settlement.gate.blockingReasons, ["unresolved_dispute"]);
    assert.equal(settlement.gate.overrideAvailable, true);
  });

  it("lets a manager read only reports for rooms they manage", () => {
    const service = createReportTestService() as any;

    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    assert.equal(service.getManagerReport("manager-report-a", report.id).id, report.id);
    assert.throws(
      () => service.getManagerReport("manager-report-b", report.id),
      /리포트|담당|찾을 수/
    );
  });

  it("stores the report snapshot timestamp and returns it in report responses", () => {
    const service = createReportTestService() as any;

    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    assert.match(report.snapshotAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(service.getManagerReport("manager-report-a", report.id).snapshotAt, report.snapshotAt);
  });

  it("does not create or return aggregate report sections without source references", () => {
    const service = createReportTestService() as any;

    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });
    const references = service.listManagerReportSourceReferences("manager-report-a", report.id);

    assert.equal(report.sections.length > 0, true);
    for (const section of report.sections) {
      assert.ok(section.source);
      assert.equal(
        references.some(
          (reference: any) =>
            reference.sectionKey === section.key &&
            reference.sourceKind === section.source.kind &&
            reference.entityType &&
            reference.entityId
        ),
        true
      );
    }
  });

  it("keeps chatbot report actions as draft suggestions instead of executing them", () => {
    const service = createReportTestService() as any;
    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    const beforeDrafts = service.listManagerAnnouncementDrafts("manager-report-a").length;
    const beforeThreads = service.listManagerMessagingThreads("manager-report-a").length;
    const answer = service.askManagerReportChat("manager-report-a", report.id, {
      question: "301호 미납 독촉문을 보내줘"
    });

    assert.equal(answer.draft?.type, "dunning");
    assert.equal(answer.execution, "draft_only");
    assert.equal(service.listManagerAnnouncementDrafts("manager-report-a").length, beforeDrafts);
    assert.equal(service.listManagerMessagingThreads("manager-report-a").length, beforeThreads);
  });

  it("masks personal data, contact details, and sensitive notes in external report shares", () => {
    const service = createReportTestService() as any;
    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });
    const internalPayload = JSON.stringify(
      service.listManagerReportSourceReferences("manager-report-a", report.id)
    );

    const share = service.createManagerReportExternalShare("manager-report-a", report.id, {
      recipientName: "외부 임대인"
    });
    const shared = service.getExternalReportShare(share.token);
    const externalPayload = JSON.stringify(shared);

    assert.match(internalPayload, /010-1111-2222/);
    assert.match(internalPayload, /민감메모/);
    assert.equal(shared.delivery.masked, true);
    assert.doesNotMatch(externalPayload, /010-1111-2222/);
    assert.doesNotMatch(externalPayload, /민감메모/);
    assert.doesNotMatch(externalPayload, /tenant-report-a@roomlog\.test/);
  });

  it("writes audit logs when external report shares are created, viewed, and revoked", () => {
    const service = createReportTestService() as any;
    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    const share = service.createManagerReportExternalShare("manager-report-a", report.id, {
      recipientName: "외부 임대인"
    });
    service.getExternalReportShare(share.token);
    service.revokeManagerReportExternalShare("manager-report-a", report.id, share.id);

    const auditActions = service
      .listManagerReportAuditLog("manager-report-a", report.id)
      .map((entry: any) => entry.action);

    assert.deepEqual(auditActions.sort(), [
      "external_share_created",
      "external_share_revoked",
      "external_share_viewed"
    ]);
  });

  it("creates report follow-up actions by linking to M-MSG announcement drafts", () => {
    const service = createReportTestService() as any;
    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    const followUp = service.createManagerReportFollowUp("manager-report-a", report.id, {
      channel: "announcement",
      actionType: "notice",
      title: "누수 점검 안내",
      body: "301호 누수 점검 일정 안내입니다.",
      targetRoomIds: ["room-report-a"]
    });
    const draft = service.getManagerAnnouncementDraft(
      "manager-report-a",
      followUp.announcementDraftId
    );

    assert.equal(followUp.kind, "announcement_draft");
    assert.equal(draft.title, "누수 점검 안내");
    assert.equal(draft.status, "draft");
  });

  it("blocks payment or settlement dunning when report follow-up tries to use a 1:1 thread", () => {
    const service = createReportTestService() as any;
    const report = service.createManagerReport("manager-report-a", {
      period: "month",
      periodLabel: "2026년 6월",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      scope: {
        buildingId: "building-jungle",
        buildingName: "정글빌라",
        roomIds: ["room-report-a"],
        unitIds: ["301"]
      }
    });

    assert.throws(
      () =>
        service.createManagerReportFollowUp("manager-report-a", report.id, {
          channel: "thread",
          actionType: "dunning",
          roomId: "room-report-a",
          tenantId: "tenant-report-a",
          body: "미납 관리비 독촉 안내입니다."
        }),
      /독촉|청구|납부/
    );
    assert.equal(service.listManagerMessagingThreads("manager-report-a", "payment").length, 0);
  });
});
