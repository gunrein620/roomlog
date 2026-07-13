import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";

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
  it("broadcasts one ticket activity after a direct complaint succeeds", () => {
    const { controller, broadcasts, header } = setupTenantController();

    controller.createComplaint(header, {
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
});
