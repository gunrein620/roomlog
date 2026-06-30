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
});
