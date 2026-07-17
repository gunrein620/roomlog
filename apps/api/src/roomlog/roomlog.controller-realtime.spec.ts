import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";
import { RoomlogTenantComplaintDraftDomain } from "./services/roomlog-tenant-complaint-draft.domain";

type BroadcastRecord = {
  event: string;
  payload: Record<string, unknown>;
};

function setupTenantController() {
  const service = new RoomlogService();
  const broadcasts: BroadcastRecord[] = [];
  const realtime = {
    broadcast(event: string, payload: Record<string, unknown>) {
      broadcasts.push({ event, payload });
    },
  } as RealtimeGateway;
  const controller = new RoomlogController(service, realtime);
  const auth = service.login({
    email: "tenant@roomlog.test",
    password: "password123!",
  });

  return {
    service,
    controller,
    broadcasts,
    header: `Bearer ${auth.accessToken}`,
  };
}

describe("roomlog complaint realtime activity", () => {
  it("broadcasts one ticket activity after a direct complaint succeeds", async () => {
    const { controller, broadcasts, header } = setupTenantController();

    await controller.createComplaint(header, {
      title: "실시간 목록 검증 누수",
      description: "세면대 아래에서 물이 새고 있습니다.",
      location: "301호 욕실",
      availableTimes: "오늘 오후",
    });

    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("broadcasts one ticket activity after a call complaint succeeds", () => {
    const { service, controller, broadcasts, header } = setupTenantController();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT",
    });

    controller.createComplaintFromCall(header, {
      callSessionId: session.id,
      transcriptText:
        "301호 화장실 천장에서 물이 계속 떨어지고 있습니다. 오늘 오후에 방문 가능합니다.",
      recordingUrl: "https://example.com/realtime-ticket.mp3",
    });

    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("broadcasts ticket activity after a manager marks a ticket read", () => {
    const service = new RoomlogService();
    const broadcasts: BroadcastRecord[] = [];
    const realtime = {
      broadcast(event: string, payload: Record<string, unknown>) {
        broadcasts.push({ event, payload });
      },
    } as RealtimeGateway;
    const controller = new RoomlogController(service, realtime);
    const auth = service.login({
      email: "manager@roomlog.test",
      password: "password123!",
    });
    const ticket = service.createComplaint("tenant-demo", {
      title: "관리인 읽음 실시간 검증",
      description: "싱크대 아래에서 물이 새고 있습니다.",
      location: "301호 주방",
    }).ticket;

    broadcasts.length = 0;
    controller.markManagerTicketRead(`Bearer ${auth.accessToken}`, ticket.id);

    assert.deepEqual(broadcasts, [
      {
        event: "roomlog:activity",
        payload: { kind: "ticket", action: "read" },
      },
    ]);
  });
});

describe("tenant complaint draft controller", () => {
  it("scopes get, save, and delete to the authenticated tenant", async () => {
    const service = new RoomlogService();
    const realtime = { broadcast() {} } as unknown as RealtimeGateway;
    const calls: Array<{ method: string; tenantId: string; roomId: string }> = [];
    const draftDomain = {
      async get(tenantId: string, roomId: string) {
        calls.push({ method: "get", tenantId, roomId });
        return null;
      },
      async save(tenantId: string, input: { roomId: string }) {
        calls.push({ method: "save", tenantId, roomId: input.roomId });
        return { id: "draft-1" };
      },
      async remove(tenantId: string, roomId: string) {
        calls.push({ method: "delete", tenantId, roomId });
        return { deleted: true };
      }
    } as unknown as RoomlogTenantComplaintDraftDomain;
    const controller = new RoomlogController(
      service,
      realtime,
      undefined,
      undefined,
      undefined,
      undefined,
      draftDomain
    );
    const auth = service.login({ email: "tenant@roomlog.test", password: "password123!" });
    const header = `Bearer ${auth.accessToken}`;

    assert.deepEqual(await controller.getTenantComplaintDraft(header, "room-301"), { draft: null });
    await controller.saveTenantComplaintDraft(header, {
      roomId: "room-301",
      category: "하자",
      title: "초안",
      occurredAt: null,
      description: "본문",
      attachmentUrls: []
    });
    await controller.deleteTenantComplaintDraft(header, "room-301");

    assert.deepEqual(calls, [
      { method: "get", tenantId: "tenant-demo", roomId: "room-301" },
      { method: "save", tenantId: "tenant-demo", roomId: "room-301" },
      { method: "delete", tenantId: "tenant-demo", roomId: "room-301" }
    ]);
  });

  it("awaits draft deletion after a complaint is created", async () => {
    const service = new RoomlogService();
    const realtime = { broadcast() {} } as unknown as RealtimeGateway;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    let deleteFinished = false;
    const draftDomain = {
      async assertRoomAccess() {},
      async remove(tenantId: string, roomId: string) {
        assert.equal(tenantId, "tenant-demo");
        assert.equal(roomId, "room-301");
        await deleteStarted;
        deleteFinished = true;
        return { deleted: true };
      }
    } as unknown as RoomlogTenantComplaintDraftDomain;
    const controller = new RoomlogController(
      service,
      realtime,
      undefined,
      undefined,
      undefined,
      undefined,
      draftDomain
    );
    const auth = service.login({ email: "tenant@roomlog.test", password: "password123!" });

    const creation = controller.createComplaint(`Bearer ${auth.accessToken}`, {
      roomId: "room-301",
      title: "초안 삭제 검증",
      description: "접수 후 초안을 삭제합니다.",
      location: "301호"
    });
    await Promise.resolve();
    assert.equal(deleteFinished, false);
    releaseDelete();
    await creation;
    assert.equal(deleteFinished, true);
  });

  it("retries a partial submission idempotently when draft deletion initially fails", async () => {
    const service = new RoomlogService();
    const realtime = { broadcast() {} } as unknown as RealtimeGateway;
    let deleteAttempts = 0;
    const draftDomain = {
      async assertRoomAccess() {},
      async remove() {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error("draft delete failed");
        return { deleted: true };
      }
    } as unknown as RoomlogTenantComplaintDraftDomain;
    const controller = new RoomlogController(
      service,
      realtime,
      undefined,
      undefined,
      undefined,
      undefined,
      draftDomain
    );
    const auth = service.login({ email: "tenant@roomlog.test", password: "password123!" });

    const input = {
        roomId: "room-301",
        clientRequestId: "submission-1",
        title: "삭제 실패 검증",
        description: "초안 삭제 실패를 성공으로 응답하지 않습니다.",
        location: "301호",
        attachmentUrls: ["/api/files/draft.jpg"]
    };

    await assert.rejects(
      controller.createComplaint(`Bearer ${auth.accessToken}`, input),
      /draft delete failed/
    );
    const retried = await controller.createComplaint(`Bearer ${auth.accessToken}`, input);

    assert.equal(service.listTenantComplaints("tenant-demo").filter((item) => item.title === input.title).length, 1);
    assert.equal(retried.complaint.messages[0]?.attachmentUrls[0], "/api/files/draft.jpg");
    assert.equal(deleteAttempts, 2);
    await assert.rejects(
      controller.createComplaint(`Bearer ${auth.accessToken}`, {
        ...input,
        title: "변경된 제목"
      }),
      /변경된 내용을 다시 사용할 수 없습니다/
    );
  });
});
