import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { Store } from "./roomlog.service";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

describe("PrismaStoreProjector", () => {
  it(
    "projects signup and intake thread state into Postgres tables",
    { skip: !databaseUrl },
    async () => {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      const prisma = new PrismaClient({ adapter });
      const suffix = Date.now().toString(36);
      const tenantId = `usr_project_${suffix}`;
      const roomId = `room_project_${suffix}`;
      const sessionId = `sess_project_${suffix}`;
      const messageId = `msg_project_${suffix}`;
      const complaintId = `cmp_project_${suffix}`;
      const ticketId = `tkt_project_${suffix}`;
      const projector = new PrismaStoreProjector(databaseUrl!);
      const now = new Date().toISOString();
      const store: Store = {
        users: [
          {
            id: tenantId,
            email: `project-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "프로젝션 세입자",
            phone: `010-${suffix.slice(0, 4).padEnd(4, "0")}-3001`,
            role: "TENANT",
            status: "ACTIVE",
            createdAt: now
          }
        ],
        rooms: [
          {
            id: roomId,
            buildingName: "프로젝션 빌라",
            roomNo: "802호",
            address: "서울시 성동구 DB로 8"
          }
        ],
        tenantRooms: {
          [tenantId]: roomId
        },
        vendors: [],
        vendorInvites: [],
        tenantInvites: [],
        attachments: [],
        floorPlans: [],
        moveInChecklist: [],
        aiFeedback: [],
        intakeSessions: [
          {
            id: sessionId,
            tenantId,
            roomId,
            sourceChannel: "REALTIME_CHAT",
            status: "ACTIVE",
            draft: {
              title: "싱크대 누수 상담",
              summary: "싱크대 하부에서 물이 떨어집니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 2,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.72,
              reasons: ["사진과 위치 확인 필요"],
              recommendedAction: "하부장 내부 사진을 추가로 확인하세요.",
              contextHints: [],
              nextQuestions: ["언제부터 발생했나요?"],
              tenantGuidance: ["전기 콘센트 주변이면 사용을 중단하세요."],
              photoAnalysis: {
                attachmentUrls: [],
                previousAttachmentUrls: [],
                candidates: [],
                comparisonStatus: "비교 어려움",
                summary: "사진 없음",
                evidence: [],
                recommendedRetake: false
              },
              intakeSlots: [
                {
                  key: "symptom",
                  label: "증상",
                  status: "COLLECTED",
                  value: "싱크대 하부에서 물이 떨어집니다.",
                  evidence: "세입자 증상을 확인했습니다."
                },
                {
                  key: "location",
                  label: "위치",
                  status: "COLLECTED",
                  value: "싱크대",
                  evidence: "싱크대 위치를 확인했습니다."
                },
                {
                  key: "occurrence",
                  label: "발생 시점",
                  status: "NEEDS_INFO",
                  evidence: "언제부터 발생했는지 아직 모릅니다.",
                  action: "언제 시작됐고 지금도 계속되는지 알려주세요."
                },
                {
                  key: "risk",
                  label: "위험 여부",
                  status: "NEEDS_INFO",
                  evidence: "안전 위험 여부를 확인해야 합니다.",
                  action: "전기, 가스, 침수, 문 잠김 같은 안전 위험이 있는지 알려주세요."
                },
                {
                  key: "photo",
                  label: "사진",
                  status: "NEEDS_INFO",
                  evidence: "사진이 있으면 관리자 판단이 빨라집니다.",
                  action: "문제 부위 근접 사진과 공간 전체 사진을 올려주세요."
                },
                {
                  key: "visitTime",
                  label: "방문 가능 시간",
                  status: "NEEDS_INFO",
                  evidence: "방문 가능 시간이 필요합니다.",
                  action: "관리자나 업체가 확인할 수 있는 시간대를 알려주세요."
                }
              ],
              requiredInfo: ["발생 시점"],
              photoRequested: true,
              readyToFinalize: false,
              duplicateCandidates: []
            },
            messages: [
              {
                id: messageId,
                sessionId,
                sender: "TENANT",
                messageText: "싱크대 아래에서 물이 떨어져요.",
                attachmentUrls: [],
                inputMode: "CHAT",
                createdAt: now
              }
            ],
            complaintId,
            ticketId,
            createdAt: now,
            updatedAt: now
          }
        ],
        complaints: [
          {
            id: complaintId,
            tenantId,
            roomId,
            ticketId,
            sourceChannel: "REALTIME_CHAT",
            title: "싱크대 하부 누수",
            description: "싱크대 아래에서 물이 떨어집니다.",
            location: "주방 싱크대",
            status: "SUBMITTED",
            createdAt: now,
            updatedAt: now
          }
        ],
        analyses: {
          [ticketId]: {
            summary: "싱크대 하부 누수 확인 필요",
            category: "하자",
            detailCategory: "누수",
            priority: 2,
            responsibilityHint: "판단 어려움",
            confidenceScore: 0.72,
            reasons: ["세입자 설명 기반"],
            recommendedAction: "사진 확인 후 업체 배정 여부를 판단하세요."
          }
        },
        tickets: [
          {
            id: ticketId,
            complaintId,
            tenantId,
            roomId,
            sourceChannel: "REALTIME_CHAT",
            category: "하자",
            priority: 2,
            status: "RECEIVED",
            responsibilityHint: "판단 어려움",
            aiSummary: "싱크대 하부 누수 확인 필요",
            createdAt: now,
            updatedAt: now
          }
        ],
        repairs: [],
        messages: [],
        history: []
      };

      try {
        await projector.persist(store);

        const [user, room, tenantRoom, session, message, complaint, ticket, analysis] =
          await Promise.all([
          prisma.userAccount.findUnique({ where: { id: tenantId } }),
          prisma.room.findUnique({ where: { id: roomId } }),
          prisma.tenantRoom.findUnique({ where: { tenantId_roomId: { tenantId, roomId } } }),
          prisma.intakeSession.findUnique({ where: { id: sessionId } }),
          prisma.intakeMessage.findUnique({ where: { id: messageId } }),
          prisma.complaint.findUnique({ where: { id: complaintId } }),
          prisma.ticket.findUnique({ where: { id: ticketId } }),
          prisma.aiAnalysis.findUnique({ where: { ticketId } })
        ]);

        assert.equal(user?.email, `project-${suffix}@roomlog.test`);
        assert.equal(room?.buildingName, "프로젝션 빌라");
        assert.equal(tenantRoom?.tenantId, tenantId);
        assert.equal(session?.tenantId, tenantId);
        assert.equal(message?.messageText, "싱크대 아래에서 물이 떨어져요.");
        assert.equal(complaint?.ticketId, ticketId);
        assert.equal(ticket?.complaintId, complaintId);
        assert.equal(analysis?.summary, "싱크대 하부 누수 확인 필요");
      } finally {
        await prisma.intakeMessage.deleteMany({ where: { sessionId } });
        await prisma.intakeSession.deleteMany({ where: { id: sessionId } });
        await prisma.aiAnalysis.deleteMany({ where: { ticketId } });
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
        await prisma.complaint.deleteMany({ where: { id: complaintId } });
        await prisma.tenantRoom.deleteMany({ where: { tenantId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
        await prisma.userAccount.deleteMany({ where: { id: tenantId } });
        await projector.disconnect();
        await prisma.$disconnect();
      }
    }
  );

  it(
    "loads projected tenant, intake, complaint, ticket, and analysis state from Postgres",
    { skip: !databaseUrl },
    async () => {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      const prisma = new PrismaClient({ adapter });
      const suffix = Date.now().toString(36);
      const tenantId = `usr_load_${suffix}`;
      const roomId = `room_load_${suffix}`;
      const sessionId = `sess_load_${suffix}`;
      const messageId = `msg_load_${suffix}`;
      const complaintId = `cmp_load_${suffix}`;
      const ticketId = `tkt_load_${suffix}`;
      const projector = new PrismaStoreProjector(databaseUrl!);
      const now = new Date().toISOString();
      const store: Store = {
        users: [
          {
            id: tenantId,
            email: `load-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "로드 세입자",
            phone: `010-${suffix.slice(0, 4).padEnd(4, "0")}-5001`,
            role: "TENANT",
            status: "ACTIVE",
            createdAt: now
          }
        ],
        rooms: [
          {
            id: roomId,
            buildingName: "로드 빌라",
            roomNo: "501호",
            address: "서울시 성동구 로드로 5"
          }
        ],
        tenantRooms: {
          [tenantId]: roomId
        },
        vendors: [],
        vendorInvites: [],
        tenantInvites: [],
        attachments: [],
        floorPlans: [],
        moveInChecklist: [],
        aiFeedback: [],
        intakeSessions: [
          {
            id: sessionId,
            tenantId,
            roomId,
            sourceChannel: "CALLBOT",
            status: "FINALIZED",
            draft: {
              title: "콜봇 누수 상담",
              summary: "전화로 접수된 천장 누수입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.81,
              reasons: ["천장에서 물이 계속 떨어짐"],
              recommendedAction: "사진 수신 후 긴급 점검하세요.",
              contextHints: [],
              nextQuestions: [],
              tenantGuidance: ["전기 설비 근처 물은 만지지 마세요."],
              photoAnalysis: {
                attachmentUrls: [],
                previousAttachmentUrls: [],
                candidates: [],
                comparisonStatus: "추가 사진 필요",
                summary: "통화 접수라 사진이 아직 없습니다.",
                evidence: ["콜봇 전사"],
                recommendedRetake: true
              },
              intakeSlots: [],
              requiredInfo: ["사진"],
              photoRequested: true,
              readyToFinalize: false,
              duplicateCandidates: []
            },
            messages: [
              {
                id: messageId,
                sessionId,
                sender: "TENANT",
                messageText: "전화라 사진은 아직 못 보냈고 천장에서 물이 떨어집니다.",
                transcriptText: "전화라 사진은 아직 못 보냈고 천장에서 물이 떨어집니다.",
                attachmentUrls: [],
                inputMode: "VOICE",
                realtimeEventId: `evt_load_${suffix}`,
                createdAt: now
              }
            ],
            complaintId,
            ticketId,
            finalizedAt: now,
            createdAt: now,
            updatedAt: now
          }
        ],
        complaints: [
          {
            id: complaintId,
            tenantId,
            roomId,
            ticketId,
            sourceChannel: "CALLBOT",
            title: "501호 천장 누수",
            description: "전화로 접수된 천장 누수입니다.",
            location: "501호 천장",
            availableTimes: "오늘 저녁",
            status: "SUBMITTED",
            createdAt: now,
            updatedAt: now
          }
        ],
        analyses: {
          [ticketId]: {
            summary: "콜봇 천장 누수 접수",
            category: "하자",
            detailCategory: "누수",
            priority: 1,
            responsibilityHint: "판단 어려움",
            confidenceScore: 0.81,
            reasons: ["콜봇 전사 기반"],
            recommendedAction: "사진 업로드 링크를 보내고 긴급 점검하세요.",
            photoAnalysis: {
              attachmentUrls: [],
              previousAttachmentUrls: [],
              candidates: ["누수"],
              comparisonStatus: "추가 사진 필요",
              summary: "사진 필요",
              evidence: ["사진 없음"],
              recommendedRetake: true
            }
          }
        },
        tickets: [
          {
            id: ticketId,
            complaintId,
            tenantId,
            roomId,
            sourceChannel: "CALLBOT",
            category: "하자",
            priority: 1,
            status: "ADDITIONAL_INFO_REQUESTED",
            responsibilityHint: "판단 어려움",
            aiSummary: "콜봇 천장 누수 접수",
            createdAt: now,
            updatedAt: now
          }
        ],
        repairs: [],
        messages: [],
        history: []
      };

      try {
        await projector.persist(store);

        const loaded = await projector.load();

        assert.ok(loaded);
        assert.equal(loaded.users.some((user) => user.id === tenantId), true);
        assert.equal(loaded.tenantRooms[tenantId], roomId);
        assert.equal(
          loaded.intakeSessions.find((session) => session.id === sessionId)?.messages[0]
            .realtimeEventId,
          `evt_load_${suffix}`
        );
        assert.equal(
          loaded.complaints.find((complaint) => complaint.id === complaintId)?.sourceChannel,
          "CALLBOT"
        );
        assert.equal(
          loaded.tickets.find((ticket) => ticket.id === ticketId)?.status,
          "ADDITIONAL_INFO_REQUESTED"
        );
        assert.equal(loaded.analyses[ticketId]?.photoAnalysis?.comparisonStatus, "추가 사진 필요");
      } finally {
        await prisma.intakeMessage.deleteMany({ where: { sessionId } });
        await prisma.intakeSession.deleteMany({ where: { id: sessionId } });
        await prisma.aiAnalysis.deleteMany({ where: { ticketId } });
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
        await prisma.complaint.deleteMany({ where: { id: complaintId } });
        await prisma.tenantRoom.deleteMany({ where: { tenantId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
        await prisma.userAccount.deleteMany({ where: { id: tenantId } });
        await projector.disconnect();
        await prisma.$disconnect();
      }
    }
  );

  it(
    "projects operational workflow state into Postgres tables",
    { skip: !databaseUrl },
    async () => {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      const prisma = new PrismaClient({ adapter });
      const suffix = Date.now().toString(36);
      const managerId = `usr_manager_${suffix}`;
      const tenantId = `usr_ops_tenant_${suffix}`;
      const vendorUserId = `usr_ops_vendor_${suffix}`;
      const roomId = `room_ops_${suffix}`;
      const vendorId = `ven_ops_${suffix}`;
      const vendorInviteId = `vinv_ops_${suffix}`;
      const tenantInviteId = `tinv_ops_${suffix}`;
      const attachmentId = `att_ops_${suffix}`;
      const checklistId = `mchk_ops_${suffix}`;
      const complaintId = `cmp_ops_${suffix}`;
      const ticketId = `tkt_ops_${suffix}`;
      const feedbackId = `afb_ops_${suffix}`;
      const repairId = `rep_ops_${suffix}`;
      const messageId = `msg_ops_${suffix}`;
      const historyId = `hst_ops_${suffix}`;
      const projector = new PrismaStoreProjector(databaseUrl!);
      const now = new Date().toISOString();
      const store: Store = {
        users: [
          {
            id: managerId,
            email: `ops-manager-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "운영 관리자",
            phone: `010-${suffix.slice(0, 4).padEnd(4, "0")}-4100`,
            role: "LANDLORD",
            status: "ACTIVE",
            createdAt: now
          },
          {
            id: tenantId,
            email: `ops-tenant-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "운영 세입자",
            phone: `010-${suffix.slice(0, 4).padEnd(4, "0")}-4101`,
            role: "TENANT",
            status: "ACTIVE",
            createdAt: now
          },
          {
            id: vendorUserId,
            email: `ops-vendor-${suffix}@roomlog.test`,
            passwordHash: "salt:hash",
            name: "운영 기사",
            phone: `010-${suffix.slice(0, 4).padEnd(4, "0")}-4102`,
            role: "VENDOR",
            status: "ACTIVE",
            createdAt: now
          }
        ],
        rooms: [
          {
            id: roomId,
            buildingName: "운영 빌라",
            roomNo: "901호",
            address: "서울시 성동구 운영로 9",
            landlordId: managerId
          }
        ],
        tenantRooms: {
          [tenantId]: roomId
        },
        vendors: [
          {
            id: vendorId,
            userId: vendorUserId,
            businessName: "운영 설비",
            contactPerson: "운영 기사",
            phone: "02-900-4102",
            serviceArea: "성동구",
            activeJobs: 1
          }
        ],
        vendorInvites: [
          {
            id: vendorInviteId,
            inviteToken: `vendor-token-${suffix}`,
            invitedByManagerId: managerId,
            email: `ops-vendor-invite-${suffix}@roomlog.test`,
            businessName: "초대 설비",
            contactPerson: "초대 기사",
            phone: "02-900-4103",
            serviceArea: "광진구",
            status: "PENDING",
            signupUrl: `/vendor?inviteToken=vendor-token-${suffix}`,
            createdAt: now
          }
        ],
        tenantInvites: [
          {
            id: tenantInviteId,
            inviteToken: `tenant-token-${suffix}`,
            invitedByManagerId: managerId,
            roomId,
            email: `ops-tenant-invite-${suffix}@roomlog.test`,
            tenantName: "초대 세입자",
            phone: "010-4103-4103",
            moveInDate: now,
            status: "PENDING",
            signupUrl: `/tenant?inviteToken=tenant-token-${suffix}`,
            createdAt: now
          }
        ],
        attachments: [
          {
            id: attachmentId,
            uploadedByUserId: tenantId,
            category: "COMPLAINT_PHOTO",
            fileName: "leak.jpg",
            fileUrl: "/uploads/leak.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 12345,
            createdAt: now
          }
        ],
        floorPlans: [],
        moveInChecklist: [
          {
            id: checklistId,
            tenantId,
            roomId,
            area: "주방",
            itemName: "싱크대 하부",
            memo: "입주 전 이상 없음",
            guidance: "기준 사진으로 보관하세요.",
            attachmentUrls: ["/uploads/baseline.jpg"],
            createdAt: now,
            updatedAt: now
          }
        ],
        aiFeedback: [
          {
            id: feedbackId,
            ticketId,
            complaintId,
            tenantId,
            target: "RESPONSIBILITY",
            targetLabel: "책임 판단",
            originalValue: "판단 어려움",
            reason: "입주 전 사진에는 이상이 없었습니다.",
            requestedAction: "관리자가 다시 확인해주세요.",
            attachmentUrls: ["/uploads/baseline.jpg"],
            status: "OPEN",
            createdAt: now,
            updatedAt: now
          }
        ],
        intakeSessions: [],
        complaints: [
          {
            id: complaintId,
            tenantId,
            roomId,
            ticketId,
            sourceChannel: "DIRECT_FORM",
            title: "싱크대 누수",
            description: "싱크대 하부 누수가 있습니다.",
            location: "주방",
            status: "VENDOR_ASSIGNED",
            createdAt: now,
            updatedAt: now
          }
        ],
        analyses: {
          [ticketId]: {
            summary: "싱크대 하부 누수",
            category: "하자",
            detailCategory: "누수",
            priority: 2,
            responsibilityHint: "판단 어려움",
            confidenceScore: 0.81,
            reasons: ["입주 전 사진 비교 필요"],
            recommendedAction: "설비 업체 방문 점검"
          }
        },
        tickets: [
          {
            id: ticketId,
            complaintId,
            tenantId,
            roomId,
            assignedVendorId: vendorId,
            sourceChannel: "DIRECT_FORM",
            category: "하자",
            priority: 2,
            status: "VENDOR_ASSIGNED",
            responsibilityHint: "판단 어려움",
            aiSummary: "싱크대 하부 누수",
            createdAt: now,
            updatedAt: now
          }
        ],
        repairs: [
          {
            id: repairId,
            ticketId,
            vendorId,
            status: "REQUESTED",
            title: "하자 처리 요청",
            description: "싱크대 하부 점검 요청",
            completionPhotoUrls: [],
            createdAt: now,
            updatedAt: now
          }
        ],
        messages: [
          {
            id: messageId,
            ticketId,
            complaintId,
            senderUserId: managerId,
            senderRole: "LANDLORD",
            messageText: "업체를 배정했습니다.",
            attachmentUrls: [],
            createdAt: now
          }
        ],
        history: [
          {
            id: historyId,
            ticketId,
            changedByUserId: managerId,
            fromStatus: "RECEIVED",
            toStatus: "VENDOR_ASSIGNED",
            note: "업체 배정",
            createdAt: now
          }
        ]
      };

      try {
        await projector.persist(store);

        const [
          vendorInvite,
          tenantInvite,
          attachment,
          checklist,
          feedback,
          repair,
          message,
          history
        ] = await Promise.all([
          prisma.vendorInvite.findUnique({ where: { id: vendorInviteId } }),
          prisma.tenantInvite.findUnique({ where: { id: tenantInviteId } }),
          prisma.attachment.findUnique({ where: { id: attachmentId } }),
          prisma.moveInChecklistItem.findUnique({ where: { id: checklistId } }),
          prisma.aiFeedback.findUnique({ where: { id: feedbackId } }),
          prisma.repairRequest.findUnique({ where: { id: repairId } }),
          prisma.ticketMessage.findUnique({ where: { id: messageId } }),
          prisma.statusHistory.findUnique({ where: { id: historyId } })
        ]);

        assert.equal(vendorInvite?.businessName, "초대 설비");
        assert.equal(tenantInvite?.tenantName, "초대 세입자");
        assert.equal(attachment?.fileUrl, "/uploads/leak.jpg");
        assert.equal(checklist?.itemName, "싱크대 하부");
        assert.equal(feedback?.target, "RESPONSIBILITY");
        assert.equal(repair?.vendorId, vendorId);
        assert.equal(message?.messageText, "업체를 배정했습니다.");
        assert.equal(history?.actorRole, "LANDLORD");
      } finally {
        await prisma.statusHistory.deleteMany({ where: { ticketId } });
        await prisma.ticketMessage.deleteMany({ where: { ticketId } });
        await prisma.repairRequest.deleteMany({ where: { ticketId } });
        await prisma.aiFeedback.deleteMany({ where: { ticketId } });
        await prisma.aiAnalysis.deleteMany({ where: { ticketId } });
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
        await prisma.complaint.deleteMany({ where: { id: complaintId } });
        await prisma.moveInChecklistItem.deleteMany({ where: { id: checklistId } });
        await prisma.attachment.deleteMany({ where: { id: attachmentId } });
        await prisma.tenantRoom.deleteMany({ where: { tenantId } });
        await prisma.vendorProfile.deleteMany({ where: { id: vendorId } });
        await prisma.vendorInvite.deleteMany({ where: { id: vendorInviteId } });
        await prisma.tenantInvite.deleteMany({ where: { id: tenantInviteId } });
        await prisma.room.deleteMany({ where: { id: roomId } });
        await prisma.userAccount.deleteMany({
          where: { id: { in: [managerId, tenantId, vendorUserId] } }
        });
        await projector.disconnect();
        await prisma.$disconnect();
      }
    }
  );
});
