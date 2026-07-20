import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  managerRealtimeCommandDisposition,
  managerPushToTalkEnabled,
  managerRealtimeStatusLabel,
  microphoneErrorMessage,
  setManagerAudioTracksEnabled,
} from "./useManagerRealtimeSession";

describe("manager realtime session labels", () => {
  it("shows listening and responding activity for connected calls", () => {
    assert.equal(managerRealtimeStatusLabel("connected", "idle"), "연결됨");
    assert.equal(managerRealtimeStatusLabel("connected", "listening"), "듣는 중");
    assert.equal(managerRealtimeStatusLabel("connected", "responding"), "AI 응답 중");
  });

  it("turns microphone errors into actionable Korean guidance", () => {
    assert.match(microphoneErrorMessage("NotAllowedError"), /마이크 권한이 거부/);
    assert.match(microphoneErrorMessage("NotFoundError"), /마이크 장치/);
    assert.match(microphoneErrorMessage("NotReadableError"), /다른 앱/);
  });

  it("keeps microphone tracks muted until push-to-talk starts", () => {
    const tracks = [{ enabled: true }, { enabled: true }];
    const stream = { getAudioTracks: () => tracks };

    assert.equal(setManagerAudioTracksEnabled(stream, false), false);
    assert.deepEqual(tracks.map((track) => track.enabled), [false, false]);

    assert.equal(setManagerAudioTracksEnabled(stream, true), true);
    assert.deepEqual(tracks.map((track) => track.enabled), [true, true]);
  });

  it("allows push-to-talk transmission only for a connected session", () => {
    assert.equal(managerPushToTalkEnabled("connected"), true);
    assert.equal(managerPushToTalkEnabled("connecting"), false);
    assert.equal(managerPushToTalkEnabled("idle"), false);
    assert.equal(managerPushToTalkEnabled("error"), false);
  });

  it("confirms an existing dunning action instead of preparing it again", () => {
    const pendingAction = {
      id: "copilot-action-1",
      kind: "billing.send_dunning" as const,
      summary: "103호 7월분 독촉 발송",
    };

    assert.deepEqual(
      managerRealtimeCommandDisposition(pendingAction, {
        command: "billing.send_dunning",
        text: "진행해.",
      }),
      { kind: "confirm_pending", actionId: "copilot-action-1" },
    );
    // Realtime에서는 function_call 이벤트가 사용자 음성 전사 완료보다 먼저 올 수 있다.
    // 이미 보류된 독촉이 있을 때 같은 독촉 도구를 다시 호출하면 기존 건 승인으로 본다.
    assert.deepEqual(
      managerRealtimeCommandDisposition(pendingAction, {
        command: "billing.send_dunning",
        text: "103호 월세 독촉 보내",
      }),
      { kind: "confirm_pending", actionId: "copilot-action-1" },
    );
    assert.deepEqual(
      managerRealtimeCommandDisposition(null, {
        command: "billing.send_dunning",
        text: "103호 월세 독촉 보내",
      }),
      { kind: "prepare_dunning" },
    );
    assert.deepEqual(
      managerRealtimeCommandDisposition(null, {
        command: "messaging.send_reply",
        text: "102호 미납 월세 독촉 문자 보내줘",
      }),
      { kind: "prepare_dunning" },
    );
  });

  it("persists a voice announcement before confirming the same action", () => {
    const input = {
      command: "messaging.send_announcement",
      target: "관리자 세입자 플로어 테스트 2 102호",
      title: "에어컨 설치 안내",
      body: "오늘 에어컨 설치 작업이 진행됩니다.",
    };

    assert.deepEqual(
      managerRealtimeCommandDisposition(null, input),
      { kind: "prepare_announcement" },
    );
    assert.deepEqual(
      managerRealtimeCommandDisposition(
        {
          id: "announcement-1",
          kind: "messaging.send_announcement",
          summary: "102호 에어컨 설치 안내",
        },
        input,
      ),
      { kind: "confirm_pending", actionId: "announcement-1" },
    );
  });
});
