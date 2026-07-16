"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ManagerAgentCommandInput,
  ManagerAgentCommandResult,
  ManagerAssistantConnectionState,
  ManagerAssistantTranscriptEntry,
  ManagerCopilotChatResponse,
} from "@roomlog/types";
import { requestManagerCopilotChat } from "../../../lib/manager-copilot-api";
import {
  closeManagerRealtimeResources,
  parseManagerRealtimeEvent,
  type ManagerRealtimeActivity,
} from "./manager-realtime-events";

type ManagerRealtimeClientSecretResult = {
  mode: "openai" | "not_configured";
  sessionId: string;
  model: string;
  voice: string;
  warning?: string;
  clientSecret?: { value: string; expiresAt?: string };
};

export interface ManagerRealtimeSessionOptions {
  appendEntry(entry: ManagerAssistantTranscriptEntry): void;
  applyCopilotResponse(response: ManagerCopilotChatResponse): void;
  initialBillId?: string;
}

type ManagerAudioStream = {
  getAudioTracks(): Array<{ enabled: boolean }>;
};

export function useManagerRealtimeSession(options: ManagerRealtimeSessionOptions) {
  const [status, setStatus] = useState<ManagerAssistantConnectionState>("idle");
  const [activity, setActivity] = useState<ManagerRealtimeActivity>("idle");
  const [isTalking, setIsTalking] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<ManagerRealtimeClientSecretResult | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => closeResources, []);

  function appendMessage(role: "user" | "assistant" | "system", content: string) {
    options.appendEntry({
      id: createRealtimeEntryId(),
      kind: "message",
      role,
      content,
    });
  }

  async function connect() {
    if (status === "connecting" || status === "connected") return;
    setStatus("connecting");
    setActivity("idle");

    try {
      const stream = await requestMicrophone();
      setManagerAudioTracksEnabled(stream, false);
      streamRef.current = stream;
      const nextSession = await requestRealtimeClientSecret();
      setSessionMeta(nextSession);

      if (nextSession.mode !== "openai" || !nextSession.clientSecret?.value) {
        closeResources();
        setIsTalking(false);
        setStatus("not_configured");
        appendMessage(
          "system",
          nextSession.warning || "OPENAI_API_KEY가 없어 음성 연결은 비활성화되어 있습니다.",
        );
        return;
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      audioRef.current = remoteAudio;
      peer.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
        void remoteAudio.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState !== "failed") return;
        closeResources();
        setIsTalking(false);
        setStatus("error");
        setActivity("idle");
        appendMessage("system", "음성 연결이 끊어졌습니다. 다시 통화를 시작해 주세요.");
      };

      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        setStatus("connected");
        appendMessage("system", "음성 연결이 열렸습니다. 처리할 관리 업무를 말씀해 주세요.");
      };
      channel.onmessage = (event) => {
        void handleRealtimeEvent(channel, String(event.data));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nextSession.clientSecret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Realtime 연결에 실패했습니다 (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        );
      }

      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      closeResources();
      setIsTalking(false);
      setStatus("error");
      setActivity("idle");
      appendMessage(
        "system",
        error instanceof Error ? error.message : "음성 연결 중 오류가 발생했습니다.",
      );
    }
  }

  function disconnect() {
    closeResources();
    setIsTalking(false);
    setStatus("idle");
    setActivity("idle");
  }

  function startTalking() {
    if (!managerPushToTalkEnabled(status) || !streamRef.current) return;
    setManagerAudioTracksEnabled(streamRef.current, true);
    setIsTalking(true);
  }

  function stopTalking() {
    setManagerAudioTracksEnabled(streamRef.current, false);
    setIsTalking(false);
  }

  async function handleRealtimeEvent(channel: RTCDataChannel, rawEvent: string) {
    const event = parseManagerRealtimeEvent(rawEvent);
    if (event.kind === "ignored") return;
    if (event.kind === "activity") {
      setActivity(event.activity);
      return;
    }
    if (event.kind === "error") {
      appendMessage("system", `Realtime 오류: ${event.message}`);
      return;
    }
    if (event.kind === "transcript") {
      appendMessage(event.role, event.content);
      return;
    }

    const result = await executeCommand(event.input);
    channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: event.callId,
        output: JSON.stringify(result),
      },
    }));
    channel.send(JSON.stringify({ type: "response.create" }));
  }

  async function executeCommand(input: ManagerAgentCommandInput): Promise<ManagerAgentCommandResult> {
    try {
      if (input.command === "billing.send_dunning") {
        const response = await requestManagerCopilotChat({
          messages: [],
          intent: {
            type: "billing.send_dunning",
            source: "assistant",
            billId: input.billId || options.initialBillId,
            prompt: input.text,
            channel: input.channel,
            messageText: input.body,
          },
        });
        options.applyCopilotResponse(response);
        return {
          status: response.pendingAction ? "draft_only" : "blocked",
          domain: "billing",
          summary: response.reply,
          requiresConfirmation: Boolean(response.pendingAction),
        };
      }

      const response = await fetch("/api/manager/agent/realtime/command", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(responseMessage(body) || "명령을 실행하지 못했습니다.");
      const result = body as ManagerAgentCommandResult;
      appendMessage("assistant", result.summary);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "명령 실행 중 오류가 발생했습니다.";
      appendMessage("system", message);
      return { status: "blocked", domain: "system", summary: message };
    }
  }

  function closeResources() {
    setManagerAudioTracksEnabled(streamRef.current, false);
    closeManagerRealtimeResources({
      channel: channelRef.current,
      peer: peerRef.current,
      stream: streamRef.current,
    });
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    audioRef.current = null;
  }

  return {
    status,
    activity,
    isTalking,
    statusLabel: managerRealtimeStatusLabel(status, activity),
    sessionMeta,
    connect,
    disconnect,
    startTalking,
    stopTalking,
  };
}

export function managerPushToTalkEnabled(status: ManagerAssistantConnectionState) {
  return status === "connected";
}

export function setManagerAudioTracksEnabled(
  stream: ManagerAudioStream | null,
  enabled: boolean,
) {
  for (const track of stream?.getAudioTracks() ?? []) track.enabled = enabled;
  return enabled;
}

export function managerRealtimeStatusLabel(
  status: ManagerAssistantConnectionState,
  activity: ManagerRealtimeActivity,
) {
  if (status === "connecting") return "연결 중";
  if (status === "not_configured") return "API 키 필요";
  if (status === "error") return "연결 오류";
  if (status !== "connected") return "연결 준비";
  if (activity === "listening") return "듣는 중";
  if (activity === "responding") return "AI 응답 중";
  return "연결됨";
}

export function microphoneErrorMessage(name: string) {
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "마이크 권한이 거부되어 음성 연결을 시작할 수 없습니다. 사이트 설정에서 마이크를 허용해 주세요.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "사용 가능한 마이크 장치를 찾지 못했습니다. 연결 상태를 확인해 주세요.";
  }
  if (name === "NotReadableError") {
    return "다른 앱이 마이크를 사용 중입니다. 통화나 녹음 앱을 종료한 뒤 다시 시도해 주세요.";
  }
  return `마이크를 여는 중 오류가 발생했습니다${name ? ` (${name})` : ""}. 다시 시도해 주세요.`;
}

async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저에서 마이크를 사용할 수 없습니다. HTTPS와 최신 브라우저인지 확인해 주세요.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new Error(microphoneErrorMessage(error instanceof DOMException ? error.name : ""));
  }
}

async function requestRealtimeClientSecret(): Promise<ManagerRealtimeClientSecretResult> {
  const response = await fetch("/api/manager/agent/realtime/client-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ voice: "marin" }),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(responseMessage(body) || "Realtime 세션을 준비하지 못했습니다.");
  }
  return body as ManagerRealtimeClientSecretResult;
}

function responseMessage(body: unknown) {
  if (!body || typeof body !== "object" || !("message" in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function createRealtimeEntryId() {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ManagerRealtimeSessionController = ReturnType<typeof useManagerRealtimeSession>;
