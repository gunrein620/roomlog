import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
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

function setupManagerController() {
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
    title: "관리자 직접 처리 실시간 검증",
    description: "현관 수납장 경첩이 헐거워졌습니다.",
    location: "301호 현관",
  }).ticket;

  return {
    service,
    controller,
    broadcasts,
    ticket,
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

  it("identifies the ticket after a manager changes its lane", () => {
    const { controller, broadcasts, header, ticket } = setupManagerController();
    const clientRequestId = "lane-request-1";
    broadcasts.length = 0;

    controller.setManagerTicketLane(header, ticket.id, {
      lane: "processing",
      clientRequestId,
    });

    assert.deepEqual(broadcasts, [
      {
        event: "roomlog:activity",
        payload: {
          kind: "ticket",
          action: "lane_changed",
          ticketId: ticket.id,
          clientRequestId,
        },
      },
    ]);
  });

  it("broadcasts exactly once for a durable manager proxy intake and not for its idempotent retry", async () => {
    const { controller, broadcasts, header } = setupManagerController();
    const input = {
      roomId: "room-302",
      title: "관리자 대리 접수 실시간 검증",
      description: "세입자가 전화로 욕실 환풍기 고장을 알려왔습니다.",
      location: "302호 욕실",
      reportedVia: "phone" as const,
      clientRequestId: "proxy-controller-broadcast-1"
    };

    const result = await controller.createManagerProxyIntake(header, input);
    const retried = await controller.createManagerProxyIntake(header, input);

    assert.equal(result.created, true);
    assert.equal(result.shouldBroadcast, true);
    assert.equal(retried.created, false);
    assert.equal(retried.shouldBroadcast, false);
    assert.equal(retried.complaint.id, result.complaint.id);
    assert.equal(retried.ticket.id, result.ticket.id);
    assert.equal(result.complaint.sourceChannel, "MANAGER_PROXY");
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } }
    ]);
  });

  it("does not broadcast a failed proxy intake and durably retries the same clientRequestId", async () => {
    let persistenceAttempts = 0;
    let failedComplaintId: string | undefined;
    let failedTicketId: string | undefined;
    const projector = {
      async persist(snapshot: any) {
        const complaint = snapshot.complaints.find(
          (item: any) => item.clientRequestId === "proxy-controller-fail-once-1"
        );
        if (!complaint) return;
        persistenceAttempts += 1;
        failedComplaintId = complaint.id;
        failedTicketId = complaint.ticketId;
        if (persistenceAttempts === 1) {
          throw new Error("proxy controller persistence failed once");
        }
      }
    };
    const service = new RoomlogService({ storeProjector: projector as any });
    const broadcasts: BroadcastRecord[] = [];
    const realtime = {
      broadcast(event: string, payload: Record<string, unknown>) {
        broadcasts.push({ event, payload });
      }
    } as RealtimeGateway;
    const controller = new RoomlogController(service, realtime);
    const auth = service.login({
      email: "manager@roomlog.test",
      password: "password123!"
    });
    const header = `Bearer ${auth.accessToken}`;
    const input = {
      roomId: "room-302",
      title: "저장 실패 대리접수",
      description: "첫 projection 실패 후 같은 요청을 재시도합니다.",
      location: "302호 현관",
      reportedVia: "text" as const,
      clientRequestId: "proxy-controller-fail-once-1"
    };

    await assert.rejects(
      async () => controller.createManagerProxyIntake(header, input),
      /proxy controller persistence failed once/
    );
    assert.deepEqual(broadcasts, []);

    const recovered = await controller.createManagerProxyIntake(header, input);
    const retried = await controller.createManagerProxyIntake(header, input);
    assert.equal(recovered.created, false);
    assert.equal(recovered.shouldBroadcast, true);
    assert.equal(recovered.complaint.id, failedComplaintId);
    assert.equal(recovered.ticket.id, failedTicketId);
    assert.equal(retried.created, false);
    assert.equal(retried.shouldBroadcast, false);
    assert.equal(persistenceAttempts, 2);
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } }
    ]);
  });

  it("guards manager proxy-intake POST and room-list GET with LANDLORD role", async () => {
    const { controller, broadcasts, header } = setupTenantController();

    await assert.rejects(
      () =>
        controller.createManagerProxyIntake(header, {
          roomId: "room-301",
          title: "권한 없는 대리 접수",
          description: "세입자 토큰으로 관리자 대리 접수를 시도합니다.",
          location: "301호 현관",
          reportedVia: "text"
        }),
      (error: unknown) => error instanceof ForbiddenException
    );
    assert.throws(
      () => controller.listManagerProxyIntakeRooms(header),
      (error: unknown) => error instanceof ForbiddenException
    );
    assert.deepEqual(broadcasts, []);
  });

  it("broadcasts ticket activity after a manager finalizes responsibility", () => {
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
      title: "책임 확정 실시간 검증",
      description: "세면대 배수구 상태를 확인해 주세요.",
      location: "301호 욕실",
    }).ticket;

    broadcasts.length = 0;
    const result = controller.decideTicketResponsibility(
      `Bearer ${auth.accessToken}`,
      ticket.id,
      {
        responsibility: "LANDLORD",
        note: "노후 배관 문제로 확인했습니다.",
      },
    );

    assert.equal(result.responsibilityDecision?.responsibility, "LANDLORD");
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("broadcasts exactly one ticket activity for each direct handling mutation", async () => {
    const { controller, broadcasts, header, ticket } = setupManagerController();

    await controller.startDirectHandling(header, ticket.id, {
      note: "관리자가 교체용 경첩을 가지고 방문합니다.",
    });
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);

    broadcasts.length = 0;
    await controller.completeDirectHandling(header, ticket.id, {
      note: "경첩을 교체하고 정상 작동을 확인했습니다.",
    });
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("broadcasts exactly one ticket activity when direct handling is cancelled", async () => {
    const { controller, broadcasts, header, ticket } = setupManagerController();
    await controller.startDirectHandling(header, ticket.id, {
      note: "현장 확인을 시작합니다.",
    });
    broadcasts.length = 0;

    await controller.cancelDirectHandling(header, ticket.id, {
      reason: "전문 업체 점검이 필요합니다.",
    });

    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("waits for durable direct handling before broadcasting", async () => {
    const { service, controller, broadcasts, header, ticket } = setupManagerController();
    let release!: () => void;
    const durability = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = service.startDirectHandling.bind(service);
    (service as any).startDirectHandling = async (...args: Parameters<typeof original>) => {
      await durability;
      return original(...args);
    };

    const pending = controller.startDirectHandling(header, ticket.id, {
      note: "커밋 완료 뒤에만 알림을 보냅니다.",
    });
    await Promise.resolve();
    assert.deepEqual(broadcasts, []);

    release();
    await pending;
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("broadcasts the committed direct aggregate without a global reload or unrelated-store loss", async () => {
    const seed = new RoomlogService();
    const created = seed.createComplaint("tenant-demo", {
      title: "티켓 범위 reconciliation 검증",
      description: "전역 reload 없이 직접 처리를 반영합니다.",
      location: "301호 현관",
    });
    const initialStore = JSON.parse(JSON.stringify((seed as any).store));
    const committedAt = "2026-07-17T13:00:00.000Z";
    const committedTicket = {
      ...initialStore.tickets.find((ticket: any) => ticket.id === created.ticket.id),
      status: "REPAIR_IN_PROGRESS",
      directHandlingStartedAt: committedAt,
      directHandlingCompletedAt: undefined,
      directHandlingNote: "커밋된 직접 처리",
      updatedAt: committedAt,
    };
    const committedComplaint = {
      ...initialStore.complaints.find(
        (complaint: any) => complaint.id === created.complaint.id
      ),
      status: "REPAIR_IN_PROGRESS",
      updatedAt: committedAt,
    };
    const concurrentCost = {
      id: "cost-unrelated-concurrent",
      managerId: "landlord-demo",
      date: committedAt,
      item: "동시 발생한 무관 비용",
      amount: 1000,
      type: "other",
      scope: "building",
      status: "draft",
      verified: false,
      createdAt: committedAt,
      updatedAt: committedAt,
    };
    let service!: RoomlogService;
    let loadCalls = 0;
    const projector = {
      async persist() {},
      async load() {
        loadCalls += 1;
        throw new Error("global reload must not run after commit");
      },
      async startDirectHandling(command: any) {
        (service as any).store.costs.unshift(concurrentCost);
        return {
          ticket: committedTicket,
          complaint: committedComplaint,
          message: {
            id: "msg-committed-direct",
            ticketId: command.ticketId,
            complaintId: committedComplaint.id,
            senderUserId: command.managerId,
            senderRole: "LANDLORD",
            messageText: "관리자가 직접 처리를 시작했습니다 — 커밋된 직접 처리",
            attachmentUrls: [],
            createdAt: committedAt,
          },
          history: {
            id: "history-committed-direct",
            ticketId: command.ticketId,
            changedByUserId: command.managerId,
            fromStatus: "RECEIVED",
            toStatus: "REPAIR_IN_PROGRESS",
            note: "관리자 직접 처리 시작",
            createdAt: committedAt,
          },
        };
      },
      async completeDirectHandling() {
        throw new Error("not used");
      },
      async cancelDirectHandling() {
        throw new Error("not used");
      },
    };
    service = new RoomlogService({
      seedDemoData: false,
      initialStore,
      storeProjector: projector as any,
    });
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

    const result = await controller.startDirectHandling(
      `Bearer ${auth.accessToken}`,
      created.ticket.id,
      { note: "커밋된 직접 처리" }
    );

    assert.equal(loadCalls, 0);
    assert.equal(result.status, "REPAIR_IN_PROGRESS");
    assert.equal(result.directHandling?.startedAt, committedAt);
    assert.equal(
      result.messages.some((message: any) => message.id === "msg-committed-direct"),
      true
    );
    assert.equal(
      (service as any).store.costs.some(
        (cost: any) => cost.id === concurrentCost.id
      ),
      true
    );
    assert.deepEqual(broadcasts, [
      { event: "roomlog:activity", payload: { kind: "ticket" } },
    ]);
  });

  it("rejects malformed direct handling request bodies without broadcasting", async () => {
    const { controller, broadcasts, header, ticket } = setupManagerController();

    for (const body of [null, 42]) {
      await assert.rejects(
        async () => controller.startDirectHandling(header, ticket.id, body as any),
        /메모 형식|요청 형식|입력/
      );
    }
    assert.deepEqual(broadcasts, []);
  });

  it("rejects tenant direct handling without broadcasting", async () => {
    const { service, controller, broadcasts, ticket } = setupManagerController();
    const tenantAuth = service.login({
      email: "tenant@roomlog.test",
      password: "password123!",
    });

    await assert.rejects(
      async () =>
        controller.startDirectHandling(`Bearer ${tenantAuth.accessToken}`, ticket.id, {
          note: "세입자 권한으로 시작 시도",
        }),
      /권한|역할/
    );
    assert.deepEqual(broadcasts, []);
  });

  it("broadcasts exactly once for every tenant self-repair mutation", async () => {
    const service = new RoomlogService();
    const broadcasts: BroadcastRecord[] = [];
    const realtime = {
      broadcast(event: string, payload: Record<string, unknown>) {
        broadcasts.push({ event, payload });
      },
    } as RealtimeGateway;
    const vendorWorkflow = {
      async reviewTenantEstimate() { return { action: "review" }; },
      async confirmTenantEstimateVisit() { return { action: "visit" }; },
      async decideTenantCompletion() { return { action: "completion" }; },
    } as any;
    const tenantVendorConnection = {
      async confirm() { return { action: "connection" }; },
    } as any;
    const controller = new RoomlogController(
      service,
      realtime,
      undefined,
      vendorWorkflow,
      undefined,
      tenantVendorConnection
    );
    const auth = service.login({
      email: "tenant@roomlog.test",
      password: "password123!",
    });
    const header = `Bearer ${auth.accessToken}`;

    await controller.confirmTenantVendorConnection(header, "complaint-self", {} as any);
    await controller.reviewTenantVendorEstimate(header, "repair-self", "estimate-self", {} as any);
    await controller.confirmTenantVendorEstimateVisit(header, "repair-self", "estimate-self", {} as any);
    await controller.decideTenantVendorCompletion(header, "repair-self", {} as any);

    assert.deepEqual(broadcasts, Array.from({ length: 4 }, () => ({
      event: "roomlog:activity",
      payload: { kind: "ticket" },
    })));
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
