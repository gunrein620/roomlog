"use client";

// 세입자 AI 생활 도우미 세션 훅 — 목업이던 패널을 실제 민원 intake 백엔드에 연결한다.
// 텍스트: intake 세션 메시지 턴(OpenAI Responses, 키 없으면 로컬 폴백 초안).
// 음성: OpenAI Realtime WebRTC + Push to Talk(버튼을 누른 동안만 마이크 전달, 관리자 비서와 동일 UX)
//       — 턴 전사를 같은 세션에 기록한다.
// 접수 준비(readyToFinalize)가 되면 finalize로 실제 민원/티켓을 생성한다.
import { useEffect, useRef, useState } from "react";
import {
  createTenantIntakeSession,
  createTenantRealtimeClientSecret,
  finalizeTenantIntakeSession,
  recordTenantRealtimeTurn,
  sendTenantIntakeMessage,
  type TenantIntakeSession,
} from "@/lib/tenant-intake-api";
import {
  emptyRealtimeTurnState,
  type RealtimeEventPayload,
  type RealtimeTurnState,
} from "../../tenant/realtime-events";
import {
  beginRealtimeTurnPersist,
  completeRealtimeTurnPersist,
  emptyRealtimePersistState,
  type RealtimePersistState,
} from "../../tenant/realtime-persist";
import {
  applyTenantVoiceEvent,
  tenantVoiceStatusLabel,
  type TenantVoiceActivity,
  type TenantVoiceConnectionState,
} from "./tenant-ai-voice";

export type TenantAiChatMessage = {
  id: string;
  sender: "assistant" | "tenant" | "system" | "receipt";
  text: string;
};

const TENANT_AI_GREETING =
  "안녕하세요! 우주(Woo-zu) AI 어시스턴트입니다. 생활 중 불편한 점을 알려주시면 정리해서 관리자에게 접수까지 도와드릴게요.";

export function useTenantAiAssistant({
  roomId,
  onComplaintFiled,
}: {
  roomId?: string;
  onComplaintFiled?: () => void;
}) {
  const [messages, setMessages] = useState<TenantAiChatMessage[]>([
    { id: "tenant-ai-welcome", sender: "assistant", text: TENANT_AI_GREETING },
  ]);
  const [busy, setBusy] = useState(false);
  const [readyToFinalize, setReadyToFinalize] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<TenantVoiceConnectionState>("idle");
  const [voiceActivity, setVoiceActivity] = useState<TenantVoiceActivity>("idle");
  const [isTalking, setIsTalking] = useState(false);

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const sessionIdRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<TenantIntakeSession> | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnStateRef = useRef<RealtimeTurnState>(emptyRealtimeTurnState());
  const persistStateRef = useRef<RealtimePersistState>(emptyRealtimePersistState());

  // 화면 이탈/탭 숨김 시 송신을 끊는다 — 관리자 비서(ManagerAssistantLauncher)와 동일한 안전장치.
  useEffect(() => {
    const stopTalkingNow = () => stopTalking();
    const stopTalkingWhenHidden = () => {
      if (document.hidden) stopTalkingNow();
    };

    window.addEventListener("blur", stopTalkingNow);
    document.addEventListener("visibilitychange", stopTalkingWhenHidden);
    return () => {
      window.removeEventListener("blur", stopTalkingNow);
      document.removeEventListener("visibilitychange", stopTalkingWhenHidden);
      closeVoiceResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function appendMessage(sender: TenantAiChatMessage["sender"], text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { id: createMessageId(), sender, text: trimmed },
    ]);
  }

  function appendError(error: unknown, fallback: string) {
    appendMessage("system", error instanceof Error ? error.message : fallback);
  }

  function applySessionDraft(session: TenantIntakeSession) {
    setReadyToFinalize(session.status === "ACTIVE" && session.draft.readyToFinalize);
  }

  // 세션은 텍스트·음성이 공유한다. 이미 있으면 재사용, 없으면 생성 후 백엔드 인사말을 이어붙인다.
  async function ensureSession(): Promise<TenantIntakeSession> {
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const promise = (async () => {
      const session = await createTenantIntakeSession(roomIdRef.current);
      sessionIdRef.current = session.id;
      for (const message of session.messages) {
        if (message.sender === "AI_ASSISTANT") {
          appendMessage("assistant", message.messageText);
        }
      }
      applySessionDraft(session);
      return session;
    })();

    sessionPromiseRef.current = promise;
    try {
      return await promise;
    } catch (error) {
      sessionPromiseRef.current = null;
      throw error;
    }
  }

  async function startTextSession() {
    if (sessionPromiseRef.current) return;
    setBusy(true);
    try {
      await ensureSession();
    } catch (error) {
      appendError(error, "AI 상담을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitText(content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed || busy) return false;

    appendMessage("tenant", trimmed);
    setBusy(true);
    try {
      const session = await ensureSession();
      const result = await sendTenantIntakeMessage(session.id, trimmed);
      appendMessage("assistant", result.assistantMessage.messageText);
      applySessionDraft(result.session);
      return true;
    } catch (error) {
      appendError(error, "AI 응답을 받지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // 접수: 세션 초안을 실제 민원/티켓으로 확정한다. 이후 대화는 새 세션으로 시작한다.
  async function finalizeComplaint(): Promise<boolean> {
    const sessionId = sessionIdRef.current;
    if (!sessionId || busy) return false;

    setBusy(true);
    try {
      const result = await finalizeTenantIntakeSession(sessionId);
      const title = result.complaint?.title;
      appendMessage(
        "receipt",
        title
          ? `접수 완료 · ${title} — 처리 상태는 민원/하자 이력에서 확인할 수 있어요.`
          : "접수 완료 · 처리 상태는 민원/하자 이력에서 확인할 수 있어요.",
      );
      sessionIdRef.current = null;
      sessionPromiseRef.current = null;
      setReadyToFinalize(false);
      onComplaintFiled?.();
      return true;
    } catch (error) {
      appendError(error, "민원 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function connectVoice() {
    if (voiceStatus === "connecting" || voiceStatus === "connected") return;
    setVoiceStatus("connecting");
    setVoiceActivity("idle");

    try {
      const session = await ensureSession();
      const stream = await requestMicrophone();
      setAudioTracksEnabled(stream, false);
      streamRef.current = stream;

      const secret = await createTenantRealtimeClientSecret(session.id);
      if (secret.mode !== "openai" || !secret.clientSecret?.value) {
        closeVoiceResources();
        setIsTalking(false);
        setVoiceStatus("not_configured");
        appendMessage(
          "system",
          secret.warning || "서버에 AI 키가 없어 음성 상담은 사용할 수 없습니다. 텍스트 상담을 이용해 주세요.",
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
        closeVoiceResources();
        setIsTalking(false);
        setVoiceStatus("error");
        setVoiceActivity("idle");
        appendMessage("system", "음성 연결이 끊어졌습니다. 다시 통화를 시작해 주세요.");
      };

      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        turnStateRef.current = emptyRealtimeTurnState();
        persistStateRef.current = emptyRealtimePersistState();
        setVoiceStatus("connected");
        appendMessage("system", "음성 연결이 열렸습니다. 불편한 점을 편하게 말씀해 주세요.");
      };
      channel.onmessage = (event) => {
        handleVoiceEvent(session.id, String(event.data));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.clientSecret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `음성 상담 연결에 실패했습니다 (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        );
      }

      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      closeVoiceResources();
      setIsTalking(false);
      setVoiceStatus("error");
      setVoiceActivity("idle");
      appendError(error, "음성 연결 중 오류가 발생했습니다.");
    }
  }

  function disconnectVoice() {
    closeVoiceResources();
    setIsTalking(false);
    setVoiceStatus("idle");
    setVoiceActivity("idle");
  }

  // Push to Talk — 버튼을 누르고 있는 동안만 마이크 트랙을 살린다(관리자 비서와 동일).
  function startTalking() {
    if (voiceStatus !== "connected" || !streamRef.current) return;
    setAudioTracksEnabled(streamRef.current, true);
    setIsTalking(true);
  }

  function stopTalking() {
    setAudioTracksEnabled(streamRef.current, false);
    setIsTalking(false);
  }

  function handleVoiceEvent(sessionId: string, rawEvent: string) {
    let payload: RealtimeEventPayload;
    try {
      payload = JSON.parse(rawEvent) as RealtimeEventPayload;
    } catch {
      return;
    }

    if (payload.type === "error") {
      appendMessage("system", "음성 상담 처리 중 오류가 발생했습니다.");
      return;
    }

    const update = applyTenantVoiceEvent(turnStateRef.current, payload);
    turnStateRef.current = update.state;

    if (update.activity) setVoiceActivity(update.activity);
    if (update.tenantTranscript) appendMessage("tenant", update.tenantTranscript);
    if (update.assistantTranscript) appendMessage("assistant", update.assistantTranscript);
    if (update.flush) {
      void persistVoiceTurn(sessionId, update.flush);
    }
  }

  // 완료된 음성 턴을 서버 intake 세션에 기록해 초안(접수 준비 여부)을 갱신한다.
  async function persistVoiceTurn(
    sessionId: string,
    flush: { eventId: string; userTranscript: string; assistantTranscript: string },
  ) {
    const begin = beginRealtimeTurnPersist(persistStateRef.current, flush.eventId);
    persistStateRef.current = begin.state;
    if (!begin.shouldPersist) return;

    let succeeded = false;
    try {
      const result = await recordTenantRealtimeTurn(sessionId, {
        userTranscript: flush.userTranscript,
        assistantTranscript: flush.assistantTranscript,
        eventId: flush.eventId,
      });
      applySessionDraft(result.session);
      succeeded = true;
    } catch {
      // 전사 기록 실패 — 다음 턴에서 재시도되며, 대화 자체는 이어진다.
    } finally {
      persistStateRef.current = completeRealtimeTurnPersist(
        persistStateRef.current,
        flush.eventId,
        succeeded,
      );
    }
  }

  function closeVoiceResources() {
    setAudioTracksEnabled(streamRef.current, false);
    try {
      channelRef.current?.close();
    } catch {
      // 이미 닫힌 채널
    }
    try {
      peerRef.current?.close();
    } catch {
      // 이미 닫힌 피어
    }
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    audioRef.current = null;
  }

  return {
    messages,
    busy,
    readyToFinalize,
    startTextSession,
    submitText,
    finalizeComplaint,
    voice: {
      status: voiceStatus,
      activity: voiceActivity,
      isTalking,
      statusLabel: tenantVoiceStatusLabel(voiceStatus, voiceActivity),
      connect: connectVoice,
      disconnect: disconnectVoice,
      startTalking,
      stopTalking,
    },
  };
}

function createMessageId() {
  return `tenant-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setAudioTracksEnabled(stream: MediaStream | null, enabled: boolean) {
  for (const track of stream?.getAudioTracks() ?? []) track.enabled = enabled;
}

async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저에서 마이크를 사용할 수 없습니다. HTTPS와 최신 브라우저인지 확인해 주세요.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      throw new Error("마이크 권한이 거부되어 음성 상담을 시작할 수 없습니다. 사이트 설정에서 마이크를 허용해 주세요.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new Error("사용 가능한 마이크 장치를 찾지 못했습니다. 연결 상태를 확인해 주세요.");
    }
    throw new Error(`마이크를 여는 중 오류가 발생했습니다${name ? ` (${name})` : ""}. 다시 시도해 주세요.`);
  }
}

export type TenantAiAssistantController = ReturnType<typeof useTenantAiAssistant>;
