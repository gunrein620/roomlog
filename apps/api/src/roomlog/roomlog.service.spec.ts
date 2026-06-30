import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService } from "./roomlog.service";

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedJwt(payload: Record<string, unknown>) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  const signature = createHmac("sha256", process.env.JWT_SECRET || "roomlog-local-dev-secret")
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

describe("RoomlogService", () => {
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
      assert.throws(
        () =>
          service.saveAttachment("tenant-demo", {
            buffer: Buffer.from("not an image"),
            originalName: "note.txt",
            mimeType: "text/plain",
            category: "COMPLAINT_PHOTO"
          }),
        /이미지/
      );
      assert.throws(
        () =>
          service.saveAttachment("tenant-demo", {
            buffer: Buffer.from("gif bytes"),
            originalName: "animated-leak.gif",
            mimeType: "image/gif",
            category: "COMPLAINT_PHOTO"
          }),
        /jpeg|png|webp|지원/
      );
      assert.throws(
        () =>
          service.saveAttachment("tenant-demo", {
            buffer: Buffer.from("not really a png"),
            originalName: "spoofed-leak.png",
            mimeType: "image/png",
            category: "COMPLAINT_PHOTO"
          }),
        /이미지 파일 형식|손상/
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
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
      const restartedProfile = restartedService.getMe(`Bearer ${restartedAuth.accessToken}`);

      assert.equal(restartedAuth.name, "지속 세입자");
      assert.equal(restartedProfile.room?.landlordId, undefined);
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

  it("seeds a 302 room sample ticket for local manager and vendor demos", () => {
    const service = new RoomlogService();
    const demoState = service.getDemoState();

    const room = demoState.rooms.find(
      (item) => item.buildingName === "룸로그 빌라" && item.roomNo === "302호"
    );

    assert.ok(room);
    assert.equal(room.landlordId, "landlord-demo");

    const managerTickets = service.listTicketsForManager("landlord-demo");
    const sampleTicket = managerTickets.find((ticket) => ticket.roomId === room.id);

    assert.ok(sampleTicket);
    assert.equal(sampleTicket.status, "VENDOR_ASSIGNED");
    assert.equal(sampleTicket.assignedVendor?.id, "vendor-demo");
    assert.match(sampleTicket.aiSummary, /302호|누수/);

    const vendorRepairs = service.listVendorRepairs("vendor-demo");
    const sampleRepair = vendorRepairs.find((repair) => repair.ticketId === sampleTicket.id);

    assert.ok(sampleRepair);
    assert.equal(sampleRepair.status, "REQUESTED");
    assert.match(sampleRepair.description, /302호|누수/);
  });

  it("backfills the 302 sample ticket into existing local demo snapshots", () => {
    const oldDemoService = new RoomlogService();
    const oldDemoState = oldDemoService.getDemoState();
    const oldDemoSnapshot = {
      ...oldDemoState,
      users: oldDemoState.users,
      rooms: oldDemoState.rooms.filter((room) => room.id !== "room-302"),
      tenantRooms: { "tenant-demo": "room-301" },
      vendors: oldDemoState.vendors.map((vendor) => ({ ...vendor, activeJobs: 0 })),
      complaints: [],
      analyses: {},
      tickets: [],
      repairs: [],
      messages: [],
      history: []
    };
    const service = new RoomlogService({
      seedDemoData: true,
      initialStore: oldDemoSnapshot
    } as any);

    const sampleTicket = service
      .listTicketsForManager("landlord-demo")
      .find((ticket) => ticket.room?.roomNo === "302호");
    const sampleRepair = service
      .listVendorRepairs("vendor-demo")
      .find((repair) => repair.ticket.room?.roomNo === "302호");

    assert.ok(sampleTicket);
    assert.equal(sampleTicket.assignedVendor?.id, "vendor-demo");
    assert.ok(sampleRepair);
    assert.equal(sampleRepair.status, "REQUESTED");
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
    assert.throws(
      () =>
        hydratedService.login({
          email: "tenant@roomlog.test",
          password: "password123!"
        }),
      /올바르지/
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

  it("starts intake threads with a greeting matched to the source channel", () => {
    const service = new RoomlogService();

    const chat = service.createIntakeSession("tenant-demo", { sourceChannel: "REALTIME_CHAT" });
    const voice = service.createIntakeSession("tenant-demo", { sourceChannel: "VOICE_CHAT" });
    const callbot = service.createIntakeSession("tenant-demo", { sourceChannel: "CALLBOT" });

    assert.equal(chat.session.messages[0].inputMode, "CHAT");
    assert.match(chat.session.messages[0].messageText, /AI 채팅 상담/);
    assert.match(chat.session.threadSummary.lastAssistantMessage, /AI 채팅 상담/);

    assert.equal(voice.session.messages[0].inputMode, "VOICE");
    assert.match(voice.session.messages[0].messageText, /AI 음성 상담/);
    assert.match(voice.session.messages[0].messageText, /차례로|한 번에 하나씩/);

    assert.equal(callbot.session.messages[0].inputMode, "VOICE");
    assert.match(callbot.session.messages[0].messageText, /Roomlog AI 콜봇/);
    assert.match(callbot.session.messages[0].messageText, /통화/);
    assert.match(callbot.session.messages[0].messageText, /차례로|한 번에 하나씩/);
  });

  it("reuses an empty active intake thread instead of creating duplicate mock-looking threads", () => {
    const service = new RoomlogService();
    const first = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT",
      reuseEmpty: true
    });
    const duplicate = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT",
      reuseEmpty: true
    });
    const voice = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "VOICE_CHAT"
    });

    assert.equal(duplicate.session.id, first.session.id);
    assert.equal((duplicate as { reused?: boolean }).reused, true);
    assert.notEqual(voice.session.id, first.session.id);
    assert.equal(
      service
        .listIntakeSessions("tenant-demo")
        .filter((session) => session.sourceChannel === "REALTIME_CHAT").length,
      1
    );
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

  it("includes current and baseline photo analysis in callbot Realtime instructions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      service.createMoveInChecklistItem("tenant-demo", {
        roomId: "room-301",
        area: "화장실",
        itemName: "천장",
        memo: "입주 전 천장 누수 흔적 없음",
        attachmentUrls: ["/api/files/baseline-bathroom-ceiling.jpg"]
      });
      const { session } = service.createIntakeSession("tenant-demo", {
        sourceChannel: "CALLBOT",
        roomId: "room-301"
      });

      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 물이 떨어지는 사진입니다. 오늘 저녁 8시 이후 방문 가능합니다.",
        attachmentUrls: ["/api/files/current-ceiling-leak.jpg"],
        inputMode: "VOICE"
      });

      const result = await service.createRealtimeClientSecret("tenant-demo", session.id, {
        purpose: "CALLBOT_INTAKE",
        voice: "marin"
      });

      assert.equal(result.mode, "not_configured");
      assert.match(result.instructions, /# 사진 분석 상태/);
      assert.match(result.instructions, /현재 첨부: \/api\/files\/current-ceiling-leak\.jpg/);
      assert.match(
        result.instructions,
        /이전\/기준 사진: \/api\/files\/baseline-bathroom-ceiling\.jpg/
      );
      assert.match(result.instructions, /비교 상태: 신규 발생 가능성/);
      assert.match(result.instructions, /문제 후보: 누수/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("includes same-room history and duplicate candidates in callbot Realtime instructions", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const previous = service.createComplaint("tenant-demo", {
        title: "과거 301호 화장실 천장 누수",
        description:
          "지난주에도 301호 화장실 천장에서 물이 떨어져 임시 보수 요청을 남겼습니다.",
        location: "301호 화장실",
        availableTimes: "평일 저녁"
      });
      const { session } = service.createIntakeSession("tenant-demo", {
        sourceChannel: "CALLBOT",
        roomId: "room-301"
      });

      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 다시 물이 떨어집니다. 바닥까지 젖고 있습니다.",
        inputMode: "VOICE"
      });

      const result = await service.createRealtimeClientSecret("tenant-demo", session.id, {
        purpose: "CALLBOT_INTAKE",
        voice: "marin"
      });

      assert.equal(result.mode, "not_configured");
      assert.match(result.instructions, /# 같은 호실 최근 관련 기록/);
      assert.match(result.instructions, /과거 301호 화장실 천장 누수/);
      assert.match(result.instructions, /지난주에도 301호 화장실 천장에서 물이 떨어져/);
      assert.match(result.instructions, /# 중복 가능 티켓/);
      assert.match(result.instructions, new RegExp(previous.ticket.id));
      assert.match(result.instructions, /같은 문제면 기존 티켓에 통화 내용을 추가/);
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

  it("lists the most recently updated intake thread first", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const firstThread = service.createIntakeSession("tenant-demo", {
      sourceChannel: "REALTIME_CHAT"
    });
    const secondThread = service.createIntakeSession("tenant-demo", {
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await service.sendIntakeMessage("tenant-demo", firstThread.session.id, {
        messageText:
          "301호 화장실 천장에서 물이 떨어지고 오늘 저녁 8시 이후 방문 가능합니다.",
        attachmentUrls: ["/api/files/recent-thread-leak.jpg"],
        inputMode: "CHAT"
      });

      const threads = service.listIntakeSessions("tenant-demo") as Array<any>;

      assert.equal(threads[0].id, firstThread.session.id);
      assert.equal(threads[1].id, secondThread.session.id);
      assert.equal(
        threads[0].threadSummary.updatedAt.localeCompare(threads[1].threadSummary.updatedAt) >= 0,
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("cancels an active intake thread without deleting its conversation history", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "실수로 시작한 상담입니다. 닫아주세요.",
        inputMode: "CHAT"
      });
      const cancelled = service.cancelIntakeSession("tenant-demo", session.id);
      const detail = service.getIntakeSession("tenant-demo", session.id);

      assert.equal(cancelled.session.status, "CANCELLED");
      assert.equal(cancelled.session.threadSummary.statusLabel, "취소됨");
      assert.equal(detail.messages.length >= 3, true);
      assert.equal(
        service
          .listIntakeSessions("tenant-demo")
          .some((thread) => thread.id === session.id && thread.status === "CANCELLED"),
        true
      );
      await assert.rejects(
        () =>
          service.sendIntakeMessage("tenant-demo", session.id, {
            messageText: "취소 후 이어쓰기",
            inputMode: "CHAT"
          }),
        /종료된 상담/
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

  it("records assistant-only realtime opening turns without generating a new intake draft", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 500 });
    }) as typeof fetch;

    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        assistantTranscript:
          "안녕하세요. Roomlog AI 콜봇입니다. 지금 상담 스레드에 통화 내용을 남기고 필요한 정보를 차례로 확인하겠습니다.",
        eventId: "resp_opening_assistant"
      });

      assert.equal(fetchCalls, 0);
      assert.equal(result.recordedMessages.length, 1);
      assert.equal(result.recordedMessages[0].sender, "AI_ASSISTANT");
      assert.equal(result.recordedMessages[0].realtimeEventId, "resp_opening_assistant");
      assert.match(result.recordedMessages[0].messageText, /Roomlog AI 콜봇/);
      assert.equal(result.session.draft.title, "상담 초안");
      assert.equal(result.session.draft.detailCategory, "확인 필요");
      assert.equal(result.session.draft.readyToFinalize, false);
      assert.equal(result.session.openaiPreviousResponseId, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("upgrades terse Realtime assistant transcripts using the structured intake draft", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 떨어지고 바닥에 물이 고입니다. 사진은 아직 못 보냈고 오늘 저녁 8시 이후 방문 가능합니다.",
        assistantTranscript: "네, 알겠습니다.",
        eventId: "evt_callbot_terse_assistant"
      });
      const assistantMessage = result.recordedMessages.find(
        (message) => message.sender === "AI_ASSISTANT"
      );

      assert.ok(assistantMessage, "expected an AI assistant message to be recorded");
      assert.notEqual(assistantMessage.messageText, "네, 알겠습니다.");
      assert.match(assistantMessage.messageText, /상담 스레드|같은 상담/);
      assert.match(assistantMessage.messageText, /누수|화장실|천장/);
      assert.match(assistantMessage.messageText, /긴급도 P1/);
      assert.match(assistantMessage.messageText, /사진|근접|전체/);
      assert.match(result.turnSummary.spokenReply, /상담 스레드|같은 상담/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("upgrades realtime assistant transcripts that omit urgent safety and photo context", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "CALLBOT"
    });

    try {
      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript:
          "301호 화장실 천장에서 물이 계속 떨어지고 전등 근처로 번지고 있습니다. 오늘 저녁 8시 이후 통화 가능합니다.",
        assistantTranscript:
          "내용 확인했습니다. 접수 내용을 정리해서 관리자에게 전달하겠습니다. 잠시만 기다려 주세요. 상담 내용을 저장해 두겠습니다.",
        eventId: "evt_callbot_generic_but_unsafe"
      });
      const assistantMessage = result.recordedMessages.find(
        (message) => message.sender === "AI_ASSISTANT"
      );

      assert.match(assistantMessage?.messageText ?? "", /전기|전등|스위치|콘센트/);
      assert.match(assistantMessage?.messageText ?? "", /만지지|안전/);
      assert.match(assistantMessage?.messageText ?? "", /사진|근접|전체/);
      assert.notEqual(
        assistantMessage?.messageText,
        "내용 확인했습니다. 접수 내용을 정리해서 관리자에게 전달하겠습니다. 잠시만 기다려 주세요. 상담 내용을 저장해 두겠습니다."
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
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

  it("asks multiple concrete intake questions in the chat reply when key slots are still open", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 화장실 천장에서 물이 계속 떨어집니다.",
        inputMode: "CHAT"
      });
      const questionSection =
        result.assistantMessage.messageText
          .split("다음으로 확인할 질문")[1]
          ?.split("접수 상태")[0] ?? "";
      const questionLines = questionSection
        .split("\n")
        .filter((line) => line.startsWith("- ") && /[?나요]|알려주|올려주/.test(line));

      assert.match(result.assistantMessage.messageText, /다음으로 확인할 질문/);
      assert.equal(questionLines.length >= 2, true);
      assert.equal(questionLines.some((line) => /전기|콘센트|조명|위험/.test(line)), true);
      assert.equal(questionLines.some((line) => /사진|근접|전체/.test(line)), true);
      assert.match(result.assistantMessage.messageText, /방문 가능 시간|방문 가능 시간대/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("keeps realtime photo actions on when one voice-turn photo still needs close-up and wide shots", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      sourceChannel: "CALLBOT"
    });

    try {
      service.createMoveInChecklistItem("tenant-demo", {
        roomId: "room-301",
        area: "화장실",
        itemName: "세면대",
        memo: "입주 시 세면대 파손 없음",
        attachmentUrls: ["/api/files/realtime-move-in-sink-clean.png"]
      });

      const result = await service.recordRealtimeTurn("tenant-demo", session.id, {
        userTranscript: "301호 화장실 세면대가 깨진 사진을 보냈습니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: ["/api/files/realtime-current-sink-close.png"],
        eventId: "evt_realtime_one_photo_needs_retake"
      });

      assert.equal(result.session.draft.photoAnalysis.recommendedRetake, true);
      assert.equal(result.turnSummary.requiresPhoto, true);
      assert.match(result.turnSummary.statusLabel, /사진/);
      assert.equal(
        result.turnSummary.nextQuestions.some((question) => /근접 사진|공간 전체/.test(question)),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
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
      assert.match(ticketText, /AI 상담 인계 요약/);
      assert.match(ticketText, /콜봇/);
      assert.match(ticketText, /긴급도 P1/);
      assert.match(ticketText, /사진 상태/);

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
      assert.match(String(capturedBody?.instructions), /바로 답변 예시/);
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

  it("uses the documented latest Responses model when chat model env is not set", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalChatModel = process.env.OPENAI_CHAT_MODEL;
    const originalReasoningEffort = process.env.OPENAI_CHAT_REASONING_EFFORT;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    let capturedBody: Record<string, unknown> | undefined;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    delete process.env.OPENAI_CHAT_MODEL;
    delete process.env.OPENAI_CHAT_REASONING_EFFORT;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage:
              "현재 상담 스레드에 내용을 저장하고 관리자에게 전달할 접수 초안을 만들겠습니다. 누수 위치와 사진, 방문 가능 시간을 함께 확인할게요.",
            draft: {
              title: "301호 화장실 천장 누수",
              summary: "301호 화장실 천장에서 물이 떨어지는 상담입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.8,
              reasons: ["천장 누수"],
              recommendedAction: "관리자 확인 필요",
              requiredInfo: ["사진"],
              photoRequested: true,
              readyToFinalize: false,
              location: "301호 화장실"
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
        messageText: "화장실 천장에서 물이 떨어져요.",
        inputMode: "CHAT"
      });

      assert.equal(capturedBody?.model, "gpt-5.5");
      assert.deepEqual(capturedBody?.reasoning, { effort: "medium" });
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
      if (originalReasoningEffort) {
        process.env.OPENAI_CHAT_REASONING_EFFORT = originalReasoningEffort;
      } else {
        delete process.env.OPENAI_CHAT_REASONING_EFFORT;
      }
    }
  });

  it("lets operations tune OpenAI Responses reasoning effort with a safe allowlist", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalReasoningEffort = process.env.OPENAI_CHAT_REASONING_EFFORT;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const highEffort = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const invalidEffort = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const capturedBodies: Record<string, unknown>[] = [];

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            assistantMessage:
              "현재 상담 스레드에 저장하고 관리자에게 전달할 접수 초안을 정리하겠습니다. 필요한 사진과 방문 가능 시간을 이어서 확인할게요.",
            draft: {
              title: "301호 화장실 천장 누수",
              summary: "301호 화장실 천장에서 물이 떨어지는 상담입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.8,
              reasons: ["천장 누수"],
              recommendedAction: "관리자 확인 필요",
              requiredInfo: ["사진"],
              photoRequested: true,
              readyToFinalize: false,
              location: "301호 화장실"
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
      process.env.OPENAI_CHAT_REASONING_EFFORT = "high";
      await service.sendIntakeMessage("tenant-demo", highEffort.session.id, {
        messageText: "화장실 천장에서 물이 떨어지고 전등 근처라 걱정됩니다.",
        inputMode: "CHAT"
      });

      process.env.OPENAI_CHAT_REASONING_EFFORT = "turbo";
      await service.sendIntakeMessage("tenant-demo", invalidEffort.session.id, {
        messageText: "방문은 토요일 오전 가능합니다.",
        inputMode: "CHAT"
      });

      assert.deepEqual(capturedBodies[0].reasoning, { effort: "high" });
      assert.deepEqual(capturedBodies[1].reasoning, { effort: "medium" });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (originalReasoningEffort) {
        process.env.OPENAI_CHAT_REASONING_EFFORT = originalReasoningEffort;
      } else {
        delete process.env.OPENAI_CHAT_REASONING_EFFORT;
      }
    }
  });

  it("falls back quickly when the OpenAI Responses request exceeds the configured timeout", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalTimeout = process.env.OPENAI_CHAT_TIMEOUT_MS;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    let capturedSignal: AbortSignal | undefined;
    let aborted = false;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_CHAT_TIMEOUT_MS = "1";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined;

      if (!capturedSignal) {
        throw new Error("OpenAI request did not include an abort signal");
      }

      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          aborted = true;
          reject(capturedSignal?.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 관리비 청구 금액이 계약서와 달라서 확인 요청드립니다.",
        inputMode: "CHAT"
      });

      assert.ok(capturedSignal, "expected OpenAI request to receive an abort signal");
      assert.equal(aborted, true);
      assert.equal(result.session.draft.category, "납부");
      assert.equal(result.session.draft.detailCategory, "관리비 청구");
      assert.match(result.assistantMessage.messageText, /상담 스레드|접수 초안/);
      assert.doesNotMatch(
        result.assistantMessage.messageText,
        /OpenAI|로컬 안전 지침|fallback|실패/
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      if (originalTimeout) {
        process.env.OPENAI_CHAT_TIMEOUT_MS = originalTimeout;
      } else {
        delete process.env.OPENAI_CHAT_TIMEOUT_MS;
      }
    }
  });

  it("hides legacy OpenAI fallback internals when presenting stored intake threads", () => {
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const storedSession = (service as any).store.intakeSessions.find(
      (item: { id: string }) => item.id === session.id
    );

    storedSession.messages.push({
      id: "imsg-legacy-fallback-copy",
      sessionId: session.id,
      sender: "AI_ASSISTANT",
      messageText:
        "OpenAI 상담 생성에 일시적으로 연결하지 못해 로컬 안전 지침으로 먼저 정리합니다. 접수 초안이 준비되었습니다. 이 상담 스레드의 내용을 관리자에게 전달할 수 있습니다.",
      attachmentUrls: [],
      inputMode: "CHAT",
      createdAt: new Date().toISOString()
    });
    storedSession.updatedAt = new Date().toISOString();

    const listed = service.listIntakeSessions("tenant-demo").find((item) => item.id === session.id);
    const detail = service.getIntakeSession("tenant-demo", session.id);
    const assistantMessage = detail.messages.at(-1)?.messageText ?? "";

    assert.ok(listed);
    assert.doesNotMatch(listed.threadSummary.lastAssistantMessage, /OpenAI|로컬 안전 지침|fallback|실패/);
    assert.doesNotMatch(assistantMessage, /OpenAI|로컬 안전 지침|fallback|실패/);
    assert.match(assistantMessage, /접수 초안|상담 스레드|관리자/);
  });

  it("chains OpenAI Responses within one intake thread without leaking across threads", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalChatModel = process.env.OPENAI_CHAT_MODEL;
    const originalFetch = globalThis.fetch;
    const service = new RoomlogService();
    const first = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const second = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const capturedBodies: Record<string, unknown>[] = [];
    const responseIds = ["resp_thread_first_1", "resp_thread_first_2", "resp_thread_second_1"];

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_CHAT_MODEL = "gpt-5.5";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const responseId = responseIds[capturedBodies.length - 1];

      return new Response(
        JSON.stringify({
          id: responseId,
          output_text: JSON.stringify({
            assistantMessage:
              "이 상담 스레드에 이어서 저장하고, 관리자에게 넘길 접수 초안을 최신 상태로 정리하겠습니다.",
            draft: {
              title: "301호 화장실 누수",
              summary: "301호 화장실에서 물이 새는 상담입니다.",
              category: "하자",
              detailCategory: "누수",
              priority: 1,
              responsibilityHint: "판단 어려움",
              confidenceScore: 0.8,
              reasons: ["누수 상담"],
              recommendedAction: "관리자 확인 필요",
              requiredInfo: ["사진"],
              photoRequested: true,
              readyToFinalize: false,
              location: "301호 화장실"
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
      await service.sendIntakeMessage("tenant-demo", first.session.id, {
        messageText: "화장실 천장에서 물이 떨어집니다.",
        inputMode: "CHAT"
      });
      await service.sendIntakeMessage("tenant-demo", first.session.id, {
        messageText: "방금 찍은 사진도 올릴게요.",
        inputMode: "CHAT",
        attachmentUrls: ["/uploads/thread-first.jpg"]
      });
      await service.sendIntakeMessage("tenant-demo", second.session.id, {
        messageText: "현관 도어락이 잠기지 않습니다.",
        inputMode: "CHAT"
      });

      assert.equal(capturedBodies[0].previous_response_id, undefined);
      assert.equal(capturedBodies[1].previous_response_id, "resp_thread_first_1");
      assert.equal(capturedBodies[2].previous_response_id, undefined);
      assert.equal(
        (service.getIntakeSession("tenant-demo", first.session.id) as any).openaiPreviousResponseId,
        "resp_thread_first_2"
      );
      assert.equal(
        (service.getIntakeSession("tenant-demo", second.session.id) as any).openaiPreviousResponseId,
        "resp_thread_second_1"
      );
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

  it("upgrades OpenAI replies that repeat photo quick replies after a tenant defers photos", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.OPENAI_API_KEY;

    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 오늘 오전부터 물이 떨어지고 있습니다. 안전 위험은 없고 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });

      process.env.OPENAI_API_KEY = "sk-test-roomlog";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              assistantMessage:
                "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요.\n다음으로 확인할 질문\n- 문제 부위 근접 사진 1장과 공간 전체가 보이는 사진 1장을 올려주실 수 있나요?\n  바로 답변 예시: 근접 사진과 전체 사진을 올릴게요 / 지금은 어렵고 저녁에 올릴게요\n접수 상태\n- 접수 확정 가능: 내용이 맞으면 관리자 티켓으로 전달할 수 있습니다.",
              draft: {
                title: "301호 화장실 누수",
                summary:
                  "301호 화장실 천장에서 누수가 발생했고 세입자가 사진은 저녁에 올리겠다고 답했습니다.",
                category: "하자",
                detailCategory: "누수",
                priority: 2,
                responsibilityHint: "임대인 책임 가능성",
                confidenceScore: 0.82,
                reasons: ["천장 누수", "사진 제출 예정"],
                recommendedAction: "사진 제출 후 관리자 검토를 진행하세요.",
                contextHints: [],
                nextQuestions: [
                  "문제 부위 근접 사진 1장과 공간 전체가 보이는 사진 1장을 올려주실 수 있나요?"
                ],
                tenantGuidance: [
                  "사진은 문제 부위 근접 사진과 공간 전체 사진을 함께 올리면 관리자가 더 빨리 판단할 수 있습니다."
                ],
                photoAnalysis: {
                  attachmentUrls: [],
                  previousAttachmentUrls: [],
                  candidates: ["누수"],
                  comparisonStatus: "추가 사진 필요",
                  summary: "누수 여부를 확인할 수 있는 사진이 필요합니다.",
                  evidence: ["사진 제출 예정"],
                  recommendedRetake: false
                },
                intakeSlots: [],
                requiredInfo: [],
                photoRequested: true,
                readyToFinalize: true,
                location: "301호 화장실",
                occurredAt: "오늘 오전",
                availableTimes: "오늘 저녁 7시 이후"
              }
            })
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )) as typeof fetch;

      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "지금은 어렵고 저녁에 올릴게요.",
        inputMode: "CHAT"
      });

      assert.match(result.assistantMessage.messageText, /저녁[^.\n]*(사진|올리|올릴|올려|업로드)/);
      assert.doesNotMatch(result.assistantMessage.messageText, /바로 답변 예시/);
      assert.doesNotMatch(result.assistantMessage.messageText, /올릴라고|올릴게요 지금|예정라고/);
      assert.match(result.assistantMessage.messageText, /같은 상담 스레드|이어.*저장/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("upgrades generic OpenAI intake openings with thread-specific context", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;

    try {
      process.env.OPENAI_API_KEY = "sk-test-roomlog";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              assistantMessage:
                "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요.\n제가 이해한 내용\n- 301호 화장실 천장에서 물이 떨어지고 전등 근처라 안전 확인이 필요합니다.\n지금 할 일\n- 전등 스위치 주변은 만지지 말아주세요.\n필요한 사진\n- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올려주세요.\n접수 상태\n- 접수 확정 가능: 내용이 맞으면 관리자 티켓으로 전달할 수 있습니다.",
              draft: {
                title: "301호 화장실 천장 누수",
                summary:
                  "301호 화장실 천장에서 물이 떨어지고 전등 근처라 안전 확인이 필요합니다.",
                category: "하자",
                detailCategory: "누수",
                priority: 1,
                responsibilityHint: "임대인 책임 가능성",
                confidenceScore: 0.88,
                reasons: ["천장 누수", "전등 근처 안전 위험"],
                recommendedAction: "전기 주변 접촉을 피하고 관리자가 긴급 확인하세요.",
                contextHints: [],
                nextQuestions: [],
                tenantGuidance: ["전등 스위치 주변은 만지지 말아주세요."],
                photoAnalysis: {
                  attachmentUrls: [],
                  previousAttachmentUrls: [],
                  candidates: ["누수"],
                  comparisonStatus: "추가 사진 필요",
                  summary: "누수 위치와 확산 범위 확인 사진이 필요합니다.",
                  evidence: [],
                  recommendedRetake: false
                },
                intakeSlots: [],
                requiredInfo: [],
                photoRequested: true,
                readyToFinalize: true,
                location: "301호 화장실 천장",
                occurredAt: "오늘",
                availableTimes: "오늘 저녁 8시 이후"
              }
            })
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )) as typeof fetch;

      const service = new RoomlogService();
      const { session } = service.createIntakeSession("tenant-demo", {
        roomId: "room-301",
        sourceChannel: "REALTIME_CHAT"
      });
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 천장에서 물이 떨어지고 전등 근처라 무섭습니다. 오늘 저녁 8시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const openingLine = result.assistantMessage.messageText.split("\n")[0];

      assert.match(openingLine, /301호|화장실|천장|누수|전등|위험/);
      assert.doesNotMatch(openingLine, /^확인할게요\.|^접수 초안이 준비되었습니다/);
      assert.doesNotMatch(openingLine, /누수은|하자은|문의은|곰팡이은/);
      assert.match(result.assistantMessage.messageText, /상담 스레드|관리자|티켓/);
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
      const openingLine = reply.split("\n")[0];

      assert.match(openingLine, /301호|화장실|천장|누수|전등|위험/);
      assert.doesNotMatch(openingLine, /^접수 초안이 준비되었습니다|^확인할게요\./);
      assert.doesNotMatch(openingLine, /누수은|하자은|문의은|곰팡이은/);
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

  it("understands weekday visit times from short tenant follow-up answers", async () => {
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
          "301호 욕실 세면대 수전이 어제부터 헐거워졌고 위험한 상황은 없습니다.",
        attachmentUrls: ["/uploads/faucet-loose.jpg"],
        inputMode: "CHAT"
      });

      assert.equal(first.session.draft.availableTimes, undefined);
      assert.equal(first.session.draft.readyToFinalize, false);
      assert.equal(first.session.draft.requiredInfo.includes("방문 가능 시간"), true);
      assert.equal(
        first.session.draft.nextQuestions.some((question) => /방문 가능 시간|시간대/.test(question)),
        true
      );

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "토요일 오전 가능합니다.",
        inputMode: "CHAT"
      });
      const visitSlot = second.session.draft.intakeSlots.find(
        (slot) => slot.key === "visitTime"
      );

      assert.equal(second.session.draft.availableTimes, "토요일 오전");
      assert.equal(second.session.draft.requiredInfo.includes("방문 가능 시간"), false);
      assert.equal(visitSlot?.status, "COLLECTED");
      assert.equal(visitSlot?.value, "토요일 오전");
      assert.match(second.assistantMessage.messageText, /토요일 오전/);
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

  it("rejects OpenAI intake drafts that drift into unsupported same-room history", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 변기통이 깨져서 사용하기 어렵습니다. 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });

      process.env.OPENAI_API_KEY = "sk-test-roomlog";
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              assistantMessage:
                "침실 에어컨 누수로 보입니다. 에어컨 본체와 배관 사진을 올려주세요.",
              draft: {
                title: "301호 침실 에어컨 누수",
                summary:
                  "정글빌라 301호에서 침실 침대 위로 에어컨 물이 새는 누수가 확인되었습니다.",
                category: "설비",
                detailCategory: "에어컨 누수",
                priority: 2,
                responsibilityHint: "임대인 책임 가능성",
                confidenceScore: 0.91,
                reasons: ["같은 호실 에어컨 누수 이력"],
                recommendedAction: "에어컨 배수 점검을 요청하세요.",
                requiredInfo: ["사진"],
                photoRequested: true,
                readyToFinalize: false,
                location: "침실 에어컨 / 침대 위",
                occurredAt: "",
                availableTimes: "오늘 저녁"
              }
            })
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )) as typeof fetch;

      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "변기통이 깨진 부분에서 물이 새고 있나요?\n답변: 네, 확인해서 답변하겠습니다.",
        inputMode: "CHAT"
      });

      const draftText = [
        result.session.draft.title,
        result.session.draft.summary,
        result.session.draft.detailCategory,
        result.session.draft.location,
        result.assistantMessage.messageText
      ].join(" ");

      assert.doesNotMatch(draftText, /에어컨|침실|배관/);
      assert.match(draftText, /화장실|변기|누수|설비/);
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
    const attachment = service.saveAttachment("tenant-demo", {
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

  it("asks for close-up and wide photos even when baseline photos exist", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      service.createMoveInChecklistItem("tenant-demo", {
        roomId: "room-301",
        area: "화장실",
        itemName: "세면대",
        memo: "입주 시 세면대 파손 없음",
        attachmentUrls: ["/api/files/move-in-sink-clean.png"]
      });

      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText: "301호 화장실 세면대가 깨진 사진입니다. 오늘 저녁 방문 가능합니다.",
        attachmentUrls: ["/api/files/current-sink-damage-close.png"],
        inputMode: "CHAT"
      });
      const photoAnalysis = result.session.draft.photoAnalysis;

      assert.equal(photoAnalysis.comparisonStatus, "신규 발생 가능성");
      assert.equal(photoAnalysis.recommendedRetake, true);
      assert.match(photoAnalysis.evidence.join("\n"), /근접|전체|사진/);
      assert.match(result.assistantMessage.messageText, /근접 사진|공간 전체/);
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

  it("keeps fallback payment disputes out of repair photo and visit collection", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 관리비 청구 금액이 계약서와 달라서 확인 요청드립니다.",
        inputMode: "CHAT"
      });
      const draft = result.session.draft;
      const reply = result.assistantMessage.messageText;

      assert.equal(draft.category, "납부");
      assert.equal(draft.detailCategory, "관리비 청구");
      assert.equal(draft.priority, 4);
      assert.equal(draft.photoRequested, false);
      assert.equal(draft.readyToFinalize, true);
      assert.deepEqual(draft.requiredInfo, []);
      assert.equal(draft.intakeSlots.find((slot) => slot.key === "photo")?.status, "OPTIONAL");
      assert.equal(draft.intakeSlots.find((slot) => slot.key === "visitTime")?.status, "OPTIONAL");
      assert.doesNotMatch(reply, /문제 부위 근접 사진|공간 전체 사진|방문 가능 시간|전기|가스|침수/);
      assert.match(reply, /관리비|청구|계약서/);

      const finalized = service.finalizeIntakeSession("tenant-demo", session.id);

      assert.equal(finalized.ticket.category, "관리비 청구");
      assert.match(finalized.ticket.aiSummary, /관리비|청구|계약서/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("keeps fallback contract questions as general inquiries instead of repair work", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 계약 갱신 조건과 특약 내용을 확인하고 싶습니다.",
        inputMode: "CHAT"
      });
      const draft = result.session.draft;
      const reply = result.assistantMessage.messageText;

      assert.equal(draft.category, "계약");
      assert.equal(draft.detailCategory, "계약 갱신");
      assert.equal(draft.priority, 4);
      assert.equal(draft.photoRequested, false);
      assert.equal(draft.readyToFinalize, true);
      assert.doesNotMatch(draft.recommendedAction, /업체 배정|수리|문제 부위 사진/);
      assert.doesNotMatch(reply, /문제 부위 근접 사진|공간 전체 사진|방문 가능 시간|전기|가스|침수/);
      assert.match(reply, /계약|갱신|특약/);

      const finalized = service.finalizeIntakeSession("tenant-demo", session.id);

      assert.equal(finalized.ticket.priority, 4);
      assert.equal(finalized.ticket.category, "계약 갱신");
      assert.match(finalized.analysis.recommendedAction, /계약|특약|관리자/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("handles fallback upstairs noise complaints without turning them into repair intake", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "301호 윗집에서 밤마다 뛰는 소리랑 발망치가 심해서 잠을 못 잡니다.",
        inputMode: "CHAT"
      });
      const draft = result.session.draft;
      const reply = result.assistantMessage.messageText;

      assert.equal(draft.category, "소음");
      assert.equal(draft.detailCategory, "층간소음");
      assert.equal(draft.priority, 2);
      assert.equal(draft.photoRequested, false);
      assert.equal(draft.readyToFinalize, true);
      assert.doesNotMatch(reply, /문제 부위 근접 사진|공간 전체 사진|방문 가능 시간|전기|가스|침수/);
      assert.match(reply, /층간소음|소음|밤|반복|녹음|기록/);

      const finalized = service.finalizeIntakeSession("tenant-demo", session.id);

      assert.equal(finalized.ticket.category, "층간소음");
      assert.match(finalized.ticket.aiSummary, /층간소음|소음|밤|발망치/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
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

  it("caps same-room context shown to tenants to the latest three related records", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      for (const index of [1, 2, 3, 4]) {
        const past = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

        await service.sendIntakeMessage("tenant-demo", past.session.id, {
          messageText: `지난 ${index}번째 301호 화장실 천장에서 물이 떨어져 조치했습니다. 오늘 저녁 7시 이후 방문 가능합니다.`,
          inputMode: "CHAT"
        });
        service.finalizeIntakeSession("tenant-demo", past.session.id, {
          confirmedTitle: `지난 ${index}번째 301호 화장실 누수`,
          confirmedSummary: `지난 ${index}번째 301호 화장실 천장 누수 처리 기록입니다.`,
          confirmedLocation: "301호 화장실",
          availableTimes: "오늘 저녁 7시 이후"
        });
      }

      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText: "오늘 다시 301호 화장실 천장에서 물이 떨어져요. 오늘 저녁 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const contextText = result.session.draft.contextHints.join("\n");

      assert.doesNotMatch(contextText, /4건/);
      assert.match(contextText, /최근 3건/);
      assert.equal(
        result.session.draft.contextHints.filter((hint) => hint.startsWith("최근 관련 기록")).length,
        3
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("keeps same-room context hints compact when prior summaries include AI reply sections", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const past = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const priorAssistantLikeSummary = [
      "접수 초안이 준비되었습니다. 이 상담 스레드의 내용을 아래처럼 정리했습니다.",
      "제가 이해한 내용",
      "- 301호 화장실 천장 누수로 당일 확인이 필요합니다.",
      "관리자 참고 맥락",
      "- 같은 호실에 누수 관련 과거 기록이 있습니다.",
      "다음으로 확인할 질문",
      "- 물이 지금도 떨어지고 있나요?",
      "접수 상태",
      "- 접수 확정 가능: 내용이 맞으면 관리자 티켓으로 전달할 수 있습니다."
    ].join("\n");

    try {
      await service.sendIntakeMessage("tenant-demo", past.session.id, {
        messageText:
          "지난번 301호 화장실 천장에서 물이 떨어졌고 전기 근처는 아니며 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      service.finalizeIntakeSession("tenant-demo", past.session.id, {
        confirmedTitle: "지난 301호 화장실 누수",
        confirmedSummary: priorAssistantLikeSummary,
        confirmedLocation: "301호 화장실",
        availableTimes: "오늘 저녁 7시 이후"
      });
      const current = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
      const result = await service.sendIntakeMessage("tenant-demo", current.session.id, {
        messageText: "오늘 다시 301호 화장실 천장에서 물이 새는 것 같아요.",
        inputMode: "CHAT"
      });
      const contextText = result.session.draft.contextHints.join("\n");
      const questionSectionCount =
        result.assistantMessage.messageText.match(/다음으로 확인할 질문/g)?.length ?? 0;

      assert.equal(questionSectionCount, 1);
      assert.match(contextText, /최근 관련 기록/);
      assert.doesNotMatch(
        contextText,
        /접수 초안이 준비되었습니다|확인할게요\.|다음으로 확인할 질문|접수 상태|관리자 참고 맥락/
      );
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
      assert.match(result.assistantMessage.messageText, /바로 답변 예시/);
      assert.match(
        result.assistantMessage.messageText,
        /지금도 떨어지고|전기 주변|오늘 저녁/
      );
      assert.doesNotMatch(result.assistantMessage.messageText, /필요 정보:/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("does not turn its own safety follow-up questions into fake gas guidance", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실이 좀 이상해요.",
        inputMode: "CHAT"
      });
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "물이 새는 것 같아요.",
        inputMode: "CHAT"
      });
      const reply = result.assistantMessage.messageText;

      assert.match(reply, /누수|물|사진|방문/);
      assert.doesNotMatch(reply, /가스 냄새|창문을 열어 환기|불꽃|라이터|119|가스 안전 신고/);
      assert.equal(result.session.draft.requiredInfo.includes("발생 시점"), true);
      assert.equal(
        result.session.draft.nextQuestions.some((question) =>
          /언제부터|시작|지금도|계속/.test(question)
        ),
        true
      );
      assert.equal(
        result.session.draft.tenantGuidance.some((guide) => /가스 냄새|가스 안전/.test(guide)),
        false
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("asks problem-detail follow-up questions before scheduling a visit", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", {
      roomId: "room-301",
      sourceChannel: "REALTIME_CHAT"
    });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실이 좀 이상해요.",
        inputMode: "CHAT"
      });
      const visibleQuestionSection =
        result.assistantMessage.messageText
          .split("다음으로 확인할 질문")[1]
          ?.split("접수 상태")[0] ?? "";
      const visibleQuestions = visibleQuestionSection
        .split("\n")
        .map((line) => line.trim().replace(/^- /, ""))
        .filter(Boolean);
      const visitIndex = visibleQuestions.findIndex((question) => /방문|시간/.test(question));
      const occurrenceIndex = visibleQuestions.findIndex((question) =>
        /언제부터|시작|계속|지금도/.test(question)
      );
      const riskIndex = visibleQuestions.findIndex((question) =>
        /전기|가스|침수|잠김|위험|안전/.test(question)
      );

      assert.equal(visibleQuestions.length >= 3, true);
      assert.equal(occurrenceIndex, 0);
      assert.equal(riskIndex > occurrenceIndex, true);
      assert.equal(visitIndex > riskIndex, true);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("surfaces multiple prioritized fallback questions while preserving the draft queue", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실 천장에서 물이 떨어지고 바닥이 젖었어요.",
        inputMode: "CHAT"
      });
      const visibleQuestionSection =
        result.assistantMessage.messageText
          .split("다음으로 확인할 질문")[1]
          ?.split("접수 상태")[0] ?? "";
      const visibleQuestions = visibleQuestionSection
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("- "));

      assert.equal(result.session.draft.nextQuestions.length >= 2, true);
      assert.equal(visibleQuestions.length >= 2, true);
      assert.equal(visibleQuestions.length <= 3, true);
      assert.equal(
        visibleQuestions.some((question) =>
          /물이 지금도|전기|콘센트|조명|위험|안전|떨어지고/.test(question)
        ),
        true
      );
      assert.equal(
        visibleQuestions.some((question) => /사진|근접|전체/.test(question)),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("treats photo-only intake turns as evidence, not as a collected symptom", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const result = await service.sendIntakeMessage("tenant-demo", session.id, {
        attachmentUrls: ["/api/files/photo-only-ceiling.jpg"],
        inputMode: "CHAT"
      });
      const slots = Object.fromEntries(
        result.session.draft.intakeSlots.map((slot) => [slot.key, slot])
      );

      assert.equal(slots.photo.status, "COLLECTED");
      assert.equal(slots.symptom.status, "NEEDS_INFO");
      assert.equal(result.session.draft.requiredInfo.includes("증상"), true);
      assert.match(result.assistantMessage.messageText, /현재 첨부 사진 1건/);
      assert.match(result.assistantMessage.messageText, /어떤 문제|증상|공간|부위/);
      assert.doesNotMatch(result.assistantMessage.messageText, /접수 확정 가능/);
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

  it("uses the previous AI question to understand short tenant follow-up answers", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const first = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "화장실 세면대 수전 손잡이가 헐거워졌습니다. 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const firstSlots = Object.fromEntries(
        first.session.draft.intakeSlots.map((slot) => [slot.key, slot])
      );

      assert.equal(firstSlots.risk.status, "NEEDS_INFO");
      assert.match(first.assistantMessage.messageText, /위험|전기|가스|침수|문 잠김|안전/);

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "어제부터요. 없어요.",
        inputMode: "CHAT"
      });
      const secondSlots = Object.fromEntries(
        second.session.draft.intakeSlots.map((slot) => [slot.key, slot])
      );

      assert.equal(secondSlots.occurrence.status, "COLLECTED");
      assert.equal(secondSlots.risk.status, "COLLECTED");
      assert.match(secondSlots.risk.value ?? "", /위험 없음|없어요|없습니다/);
      assert.equal(second.session.draft.requiredInfo.includes("안전 위험 여부"), false);
      assert.equal(second.session.draft.readyToFinalize, true);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("lets tenants defer requested photos while keeping the intake ready for ticket handoff", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const first = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "어제부터 안방 벽지에 곰팡이가 생겼습니다. 오늘 저녁 방문 가능하고 위험한 상황은 없습니다.",
        inputMode: "CHAT"
      });

      assert.equal(first.session.draft.photoRequested, true);
      assert.equal(first.session.draft.requiredInfo.includes("문제 부위 사진"), true);

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "사진은 지금 못 올려요. 퇴근 후에 올리겠습니다.",
        inputMode: "CHAT"
      });

      assert.equal(second.session.draft.photoRequested, true);
      assert.equal(second.session.draft.requiredInfo.includes("문제 부위 사진"), false);
      assert.equal(second.session.draft.readyToFinalize, true);
      assert.match(second.assistantMessage.messageText, /접수 확정 가능|사진/);

      const finalized = service.finalizeIntakeSession("tenant-demo", session.id);
      const detail = service.getComplaintDetail("tenant-demo", finalized.complaint.id);

      assert.equal(finalized.ticket.status, "ADDITIONAL_INFO_REQUESTED");
      assert.match(finalized.analysis.recommendedAction, /사진|추가/);
      assert.equal(
        detail.messages.some((message) => /사진 업로드 요청/.test(message.messageText)),
        true
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });

  it("classifies wall and floor surface damage as photo-backed defect intake", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const wallThread = service.createIntakeSession("tenant-demo", { roomId: "room-301" });
    const floorThread = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      const wall = await service.sendIntakeMessage("tenant-demo", wallThread.session.id, {
        messageText:
          "안방 벽지가 어제부터 찢어지고 들떴습니다. 위험한 상황은 없고 토요일 오전 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const floor = await service.sendIntakeMessage("tenant-demo", floorThread.session.id, {
        messageText:
          "거실 장판이 들뜨고 바닥 일부가 긁혔습니다. 어제 발견했고 위험한 상황은 없고 일요일 오후 방문 가능합니다.",
        inputMode: "CHAT"
      });

      assert.equal(wall.session.draft.category, "하자");
      assert.equal(wall.session.draft.detailCategory, "벽지");
      assert.equal(wall.session.draft.priority, 3);
      assert.equal(wall.session.draft.photoRequested, true);
      assert.equal(wall.session.draft.requiredInfo.includes("문제 부위 사진"), true);
      assert.equal(wall.session.draft.photoAnalysis.candidates.includes("벽지 훼손"), true);
      assert.match(wall.assistantMessage.messageText, /벽지|근접 사진|공간 전체/);

      assert.equal(floor.session.draft.category, "하자");
      assert.equal(floor.session.draft.detailCategory, "바닥");
      assert.equal(floor.session.draft.priority, 3);
      assert.equal(floor.session.draft.photoRequested, true);
      assert.equal(floor.session.draft.requiredInfo.includes("문제 부위 사진"), true);
      assert.equal(floor.session.draft.photoAnalysis.candidates.includes("바닥 손상"), true);
      assert.match(floor.assistantMessage.messageText, /바닥|장판|근접 사진|공간 전체/);
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  it("keeps a fixture damage subject when a later answer mentions leaking water", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const { session } = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

    try {
      await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText:
          "301호 화장실 변기통이 파손됐고 금이 가서 사용하기 어렵습니다. 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });

      const second = await service.sendIntakeMessage("tenant-demo", session.id, {
        messageText: "네, 깨진 부분에서 물도 새고 있고 바닥이 젖었습니다. 위험한 상황은 없어요.",
        inputMode: "CHAT"
      });

      assert.match(second.session.draft.title, /변기/);
      assert.match(second.session.draft.title, /파손/);
      assert.match(second.session.draft.title, /누수/);
      assert.equal(second.session.draft.photoRequested, true);
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

  it("issues signed JWT access tokens with expiry and rejects expired tokens", () => {
    const service = new RoomlogService({ seedDemoData: false } as any);
    const auth = service.signup({
      email: "jwt-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "JWT 세입자",
      phone: "010-4444-7787",
      role: "TENANT",
      buildingName: "JWT 빌라",
      roomNo: "801호",
      address: "서울시 성동구 토큰로 8"
    } as any);
    const parts = auth.accessToken.split(".");

    assert.equal(parts.length, 3);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    assert.deepEqual(header, { alg: "HS256", typ: "JWT" });
    assert.equal(payload.sub, auth.userId);
    assert.equal(payload.role, "TENANT");
    assert.equal(payload.email, "jwt-tenant@roomlog.test");
    assert.equal(typeof payload.iat, "number");
    assert.equal(typeof payload.exp, "number");
    assert.equal(payload.exp > payload.iat, true);
    assert.equal(service.getUserFromToken(`Bearer ${auth.accessToken}`).id, auth.userId);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = signedJwt({
      sub: auth.userId,
      role: "TENANT",
      email: "jwt-tenant@roomlog.test",
      iat: nowSeconds - 7200,
      exp: nowSeconds - 3600
    });

    assert.throws(() => service.getUserFromToken(`Bearer ${expiredToken}`), /만료/);
  });

  it("normalizes login email casing and whitespace like signup", () => {
    const service = new RoomlogService({ seedDemoData: false } as any);
    const signupAuth = service.signup({
      email: "normalized-login@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "로그인 세입자",
      phone: "010-4444-7789",
      role: "TENANT",
      buildingName: "로그인 빌라",
      roomNo: "901호",
      address: "서울시 성동구 로그인로 9"
    } as any);

    const loginAuth = service.login({
      email: "  NORMALIZED-LOGIN@ROOMLOG.TEST  ",
      password: "password123!"
    });

    assert.equal(loginAuth.userId, signupAuth.userId);
    assert.equal(loginAuth.role, "TENANT");
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
    assert.equal(tenantProfile.room?.landlordId, undefined);
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

  it("does not let manager signup claim an existing direct tenant room without an invite", () => {
    const service = new RoomlogService();
    const tenantAuth = service.signup({
      email: "direct-room-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "직접 가입 세입자",
      phone: "010-4444-3101",
      role: "TENANT",
      buildingName: "직접 가입 빌라",
      roomNo: "301호",
      address: "서울시 성동구 직접로 3"
    } as any);
    const tenantComplaint = service.createComplaint(tenantAuth.userId, {
      title: "직접 가입 세입자 누수",
      description: "초대 없이 가입한 세입자의 화장실 누수 기록입니다.",
      location: "301호 화장실",
      availableTimes: "오늘 저녁"
    });
    const managerAuth = service.signup({
      email: "direct-room-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "나중 가입 관리자",
      phone: "010-4444-1101",
      role: "LANDLORD",
      buildingName: "직접 가입 빌라",
      roomNo: "301호",
      address: "서울시 성동구 직접로 3"
    } as any);

    assert.equal(
      service.listTicketsForManager(managerAuth.userId).some(
        (ticket) => ticket.id === tenantComplaint.ticket.id
      ),
      false
    );
    assert.throws(
      () => service.getTicketDetailForManager(managerAuth.userId, tenantComplaint.ticket.id),
      /권한|담당 호실/
    );
  });

  it("does not let direct tenant signup claim an existing managed room without an invite", () => {
    const service = new RoomlogService();
    const managerAuth = service.signup({
      email: "managed-room-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "관리 호실 관리자",
      phone: "010-4444-1111",
      role: "LANDLORD",
      buildingName: "관리중 빌라",
      roomNo: "801호",
      address: "서울시 성동구 관리중로 8"
    } as any);
    const managerProfile = service.getMe(`Bearer ${managerAuth.accessToken}`);

    assert.equal(managerProfile.managedRooms?.[0].landlordId, managerAuth.userId);
    assert.throws(
      () =>
        service.signup({
          email: "managed-room-direct-tenant@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "초대 없는 세입자",
          phone: "010-4444-3111",
          role: "TENANT",
          buildingName: "관리중 빌라",
          roomNo: "801호",
          address: "서울시 성동구 관리중로 8"
        } as any),
      /초대|관리자/
    );
  });

  it("links an existing tenant account and its room records when accepting a manager invite", () => {
    const service = new RoomlogService({ seedDemoData: false } as any);
    const tenantAuth = service.signup({
      email: "existing-invited-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "기존 세입자",
      phone: "010-4444-3300",
      role: "TENANT",
      buildingName: "기존 임시 빌라",
      roomNo: "909호",
      address: "서울시 성동구 기존로 9"
    } as any);
    const oldTenantProfile = service.getMe(`Bearer ${tenantAuth.accessToken}`);
    const complaintResult = service.createComplaint(tenantAuth.userId, {
      title: "기존 가입 후 접수한 세면대 누수",
      description: "초대 전에 세면대 아래에서 물이 떨어진다고 접수했습니다.",
      location: "909호 화장실 세면대"
    });
    service.createMoveInChecklistItem(tenantAuth.userId, {
      area: "화장실",
      itemName: "세면대",
      memo: "초대 전 등록한 입주 전 기준 사진",
      attachmentUrls: ["/uploads/existing-move-in-sink.jpg"]
    });
    const existingSession = service.createIntakeSession(tenantAuth.userId, {});

    const managerAuth = service.signup({
      email: "existing-link-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "기존 연결 관리자",
      phone: "010-4444-1300",
      role: "LANDLORD",
      buildingName: "관리자 정식 빌라",
      roomNo: "909호",
      address: "서울시 성동구 관리로 9"
    } as any);
    const managerProfile = service.getMe(`Bearer ${managerAuth.accessToken}`);
    const managerRoomId = managerProfile.managedRooms?.[0].id;

    assert.ok(oldTenantProfile.roomId);
    assert.ok(managerRoomId);
    assert.notEqual(oldTenantProfile.roomId, managerRoomId);

    const invite = service.createTenantInvite(managerAuth.userId, {
      roomId: managerRoomId,
      email: "existing-invited-tenant@roomlog.test",
      tenantName: "기존 세입자",
      phone: "010-4444-3300",
      moveInDate: "2026-07-03"
    });
    const linkedAuth = service.signup({
      email: "existing-invited-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "기존 세입자",
      phone: "010-4444-3300",
      role: "TENANT",
      inviteToken: invite.inviteToken
    } as any);
    const linkedProfile = service.getMe(`Bearer ${linkedAuth.accessToken}`);
    const managerTicket = service.getTicketDetailForManager(
      managerAuth.userId,
      complaintResult.ticket.id
    );
    const managerChecklist = service.listManagerMoveInChecklist(managerAuth.userId, managerRoomId);
    const managerTimeline = service.getManagerRoomTimeline(managerAuth.userId, managerRoomId);
    const invites = service.listTenantInvites(managerAuth.userId);

    assert.equal(linkedAuth.userId, tenantAuth.userId);
    assert.equal(linkedProfile.roomId, managerRoomId);
    assert.equal(managerTicket.room?.id, managerRoomId);
    assert.equal(managerChecklist[0]?.memo, "초대 전 등록한 입주 전 기준 사진");
    assert.ok(
      managerTimeline.some((entry) => entry.ticketId === complaintResult.ticket.id),
      "manager timeline should include the tenant's existing complaint"
    );
    assert.ok(
      managerTimeline.some((entry) => entry.sessionId === existingSession.session.id),
      "manager timeline should include the tenant's existing intake session"
    );
    assert.equal(invites[0].status, "ACCEPTED");
    assert.equal(invites[0].acceptedByUserId, tenantAuth.userId);
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

    assert.equal(tenantInvite.signupUrl, `/?inviteToken=${tenantInvite.inviteToken}`);
    assert.equal(vendorInvite.signupUrl, `/?inviteToken=${vendorInvite.inviteToken}`);

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

  it("rejects vendor invite signup when locked contact information does not match", () => {
    const service = new RoomlogService();
    const managerAuth = service.signup({
      email: "vendor-lock-manager@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "업체 초대 관리자",
      phone: "010-4444-1210",
      role: "LANDLORD",
      buildingName: "업체 잠금 하우스",
      roomNo: "901호",
      address: "서울시 성동구 업체로 9"
    } as any);
    const invite = service.createVendorInvite(managerAuth.userId, {
      email: "locked-vendor@roomlog.test",
      businessName: "잠금 설비",
      contactPerson: "잠금 기사",
      phone: "010-4444-9210",
      serviceArea: "성동구"
    });

    assert.throws(
      () =>
        service.signup({
          email: "locked-vendor@roomlog.test",
          password: "password123!",
          passwordConfirm: "password123!",
          name: "잠금 기사",
          phone: "010-0000-9210",
          role: "VENDOR",
          inviteToken: invite.inviteToken
        } as any),
      /휴대폰/
    );
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
    const handoffMessage = finalized.ticket.messages.find(
      (message) =>
        message.senderRole === "SYSTEM" &&
        message.senderUserId === "roomlog-ai" &&
        message.messageText.includes("AI 상담 인계 요약")
    );
    assert.ok(handoffMessage, "expected finalized ticket timeline to include an AI handoff note");
    assert.match(handoffMessage.messageText, /상담 스레드/);
    assert.match(handoffMessage.messageText, /화장실|누수/);
    assert.match(handoffMessage.messageText, /긴급도 P1/);
    assert.match(handoffMessage.messageText, /방문 가능 시간/);
    assert.match(handoffMessage.messageText, /사진/);
    const tenantMessageWithPhoto = finalized.ticket.messages.find((message) =>
      message.attachmentUrls.includes("/uploads/leak-305.jpg")
    );
    assert.ok(tenantMessageWithPhoto, "expected finalized ticket timeline to keep photo URLs");
    assert.equal(tenantMessageWithPhoto.messageText.includes("첨부:"), false);

    const managerDetail = service.getTicketDetailForManager("landlord-demo", finalized.ticket.id);
    assert.equal(managerDetail.intakeHandoff?.sessionId, first.session.id);
    assert.equal(managerDetail.intakeHandoff?.channelLabel, "AI 채팅");
    assert.match(managerDetail.intakeHandoff?.statusNote ?? "", /상담 스레드|메시지/);
    assert.match(managerDetail.intakeHandoff?.summary ?? "", /화장실|누수/);
    assert.match(managerDetail.intakeHandoff?.lastTenantMessage ?? "", /305호 화장실/);
    assert.match(managerDetail.intakeHandoff?.lastAssistantMessage ?? "", /접수|관리자|사진/);
    assert.equal(managerDetail.intakeHandoff?.photoCount, 1);
    assert.deepEqual(managerDetail.intakeHandoff?.attachmentUrls, ["/uploads/leak-305.jpg"]);

    assert.equal(service.getIntakeSession("tenant-demo", first.session.id).status, "FINALIZED");
    assert.equal(service.getIntakeSession("tenant-demo", second.session.id).status, "ACTIVE");
  });

  it("acknowledges deferred photo plans instead of repeating the same photo prompt", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const service = new RoomlogService();
      const session = service.createIntakeSession("tenant-demo", { roomId: "room-301" });

      await service.sendIntakeMessage("tenant-demo", session.session.id, {
        messageText:
          "301호 화장실 천장에서 오늘 오전부터 물이 떨어지고 있습니다. 안전 위험은 없고 오늘 저녁 7시 이후 방문 가능합니다.",
        inputMode: "CHAT"
      });
      const followup = await service.sendIntakeMessage("tenant-demo", session.session.id, {
        messageText: "지금은 어렵고 저녁에 올릴게요.",
        inputMode: "CHAT"
      });

      assert.match(
        followup.assistantMessage.messageText,
        /저녁[^.\n]*(사진|올리|올릴|올려|업로드)|사진[^.\n]*(저녁|올리기로|올릴|나중)/
      );
      assert.match(followup.assistantMessage.messageText, /같은 상담 스레드|이어.*저장/);
      assert.doesNotMatch(followup.assistantMessage.messageText, /바로 답변 예시/);
      assert.doesNotMatch(followup.assistantMessage.messageText, /올릴라고|올릴게요 지금|예정라고/);
      assert.equal(
        followup.session.draft.requiredInfo.includes("문제 부위 사진"),
        false
      );
    } finally {
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
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
      existingDetail.messages.some(
        (message) =>
          message.senderRole === "SYSTEM" &&
          message.senderUserId === "roomlog-ai" &&
          /AI 상담 인계 요약/.test(message.messageText) &&
          /상담 스레드/.test(message.messageText) &&
          /긴급도 P1/.test(message.messageText)
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
    const otherManagerProfile = service.getMe(`Bearer ${otherManager.accessToken}`);
    const otherRoomId = otherManagerProfile.managedRooms?.[0].id;

    assert.ok(otherRoomId);
    const otherTenantInvite = service.createTenantInvite(otherManager.userId, {
      roomId: otherRoomId,
      email: "other-tenant@roomlog.test",
      tenantName: "외부 세입자",
      phone: "010-6666-3001",
      moveInDate: "2026-07-01"
    });
    const otherTenant = service.signup({
      email: "other-tenant@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "외부 세입자",
      phone: "010-6666-3001",
      role: "TENANT",
      inviteToken: otherTenantInvite.inviteToken
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
      phone: "010-6666-7777",
      role: "VENDOR",
      inviteToken: otherInvite.inviteToken
    } as any);

    const vendorMessage = service.addVendorRepairMessage("vendor-demo", repair.id, {
      messageText: "방문 전 누수 차단 밸브 위치를 확인해주세요.",
      attachmentUrls: ["/api/files/vendor-before-visit.jpg"]
    });
    const managerDetail = service.getTicketDetailForManager("landlord-demo", ticket.id);
    const vendorDetail = service.getVendorRepair("vendor-demo", repair.id);

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
    assert.equal(
      vendorDetail.ticket.messages.some(
        (message) =>
          message.senderRole === "VENDOR" &&
          message.attachmentUrls.includes("/api/files/vendor-before-visit.jpg")
      ),
      true
    );
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
});
