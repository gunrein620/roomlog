"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@roomlog/ui";

type ManagerAgentCommandName =
  | "ticket.query"
  | "billing.summary"
  | "billing.send_dunning"
  | "messaging.draft_reply"
  | "messaging.send_reply";

type ManagerAgentCommandResult = {
  status: "executed" | "draft_only" | "blocked";
  domain: "ticket" | "billing" | "messaging" | "system";
  summary: string;
  data?: unknown;
  navigation?: {
    label: string;
    href: string;
  };
  requiresConfirmation?: boolean;
};

type ManagerRealtimeClientSecretResult = {
  mode: "openai" | "not_configured";
  sessionId: string;
  model: string;
  voice: string;
  instructions: string;
  warning?: string;
  clientSecret?: {
    value: string;
    expiresAt?: string;
  };
};

type ConsoleEntry = {
  id: string;
  role: "manager" | "agent" | "system";
  text: string;
  result?: ManagerAgentCommandResult;
};

type VoiceStatus = "idle" | "connecting" | "connected" | "not_configured" | "error";

const commandOptions: Array<{
  command: ManagerAgentCommandName;
  label: string;
  placeholder: string;
}> = [
  {
    command: "ticket.query",
    label: "티켓 처리",
    placeholder: "긴급도 1순위 중 업체 미배정 티켓 보여줘"
  },
  {
    command: "billing.summary",
    label: "청구 관리",
    placeholder: "이번 달 수납 현황 요약해줘"
  },
  {
    command: "billing.send_dunning",
    label: "연체 독촉 발송",
    placeholder: "411호 연체 독촉 메시지 바로 보내줘"
  },
  {
    command: "messaging.draft_reply",
    label: "소통 초안",
    placeholder: "사진을 더 요청하는 답장 초안 만들어줘"
  },
  {
    command: "messaging.send_reply",
    label: "소통 답장 발송",
    placeholder: "오늘 오후 4시에 공용 현관등 점검을 진행하겠습니다."
  }
];

export function ManagerRealtimeConsole() {
  const [activeCommand, setActiveCommand] = useState<ManagerAgentCommandName>("ticket.query");
  const [chatText, setChatText] = useState("");
  const [pendingText, setPendingText] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [session, setSession] = useState<ManagerRealtimeClientSecretResult | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([
    {
      id: "initial",
      role: "agent",
      text: "처리할 일을 대화로 입력하세요. 티켓 조회, 청구 요약, 청구 전용 연체 독촉 발송, 소통 답장 초안과 일반 답장 발송을 실행할 수 있습니다."
    }
  ]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      closeVoiceResources();
    };
  }, []);

  const activeOption = commandOptions.find((option) => option.command === activeCommand) ?? commandOptions[0];

  function appendEntry(entry: Omit<ConsoleEntry, "id">) {
    setEntries((current) => [
      ...current,
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    ]);
  }

  async function requestRealtimeClientSecret() {
    const response = await fetch("/api/manager/agent/realtime/client-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ voice: "marin" })
    });
    const body = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(body?.message || "Realtime 세션을 준비하지 못했습니다.");
    }

    return body as ManagerRealtimeClientSecretResult;
  }

  async function runManagerCommand(input: {
    command: string;
    text?: string;
    billId?: string;
    channel?: string;
    threadId?: string;
    body?: string;
  }): Promise<ManagerAgentCommandResult> {
    const response = await fetch("/api/manager/agent/realtime/command", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input)
    });
    const body = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(body?.message || "명령을 실행하지 못했습니다.");
    }

    return body as ManagerAgentCommandResult;
  }

  async function submitAgentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = chatText.trim();

    if (!trimmedText) {
      appendEntry({ role: "system", text: "AI agent에게 전달할 내용을 입력해주세요." });
      return;
    }

    const inferredCommand = agentMessageToCommand(trimmedText, activeCommand);
    setActiveCommand(inferredCommand);
    setPendingText(true);
    appendEntry({ role: "manager", text: trimmedText });
    setChatText("");

    try {
      const result = await runManagerCommand({
        command: inferredCommand,
        text: trimmedText,
        body: inferredCommand === "messaging.draft_reply" || inferredCommand === "messaging.send_reply" ? trimmedText : undefined
      });
      appendEntry({ role: "agent", text: result.summary, result });
    } catch (error) {
      appendEntry({
        role: "system",
        text: error instanceof Error ? error.message : "명령 실행 중 오류가 발생했습니다."
      });
    } finally {
      setPendingText(false);
    }
  }

  async function connectVoice() {
    if (voiceStatus === "connecting" || voiceStatus === "connected") {
      return;
    }

    setVoiceStatus("connecting");

    try {
      const nextSession = await requestRealtimeClientSecret();
      setSession(nextSession);

      if (nextSession.mode !== "openai" || !nextSession.clientSecret?.value) {
        setVoiceStatus("not_configured");
        appendEntry({
          role: "system",
          text: nextSession.warning || "OPENAI_API_KEY가 없어 음성 연결은 비활성화되어 있습니다."
        });
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저에서 마이크 권한을 사용할 수 없습니다.");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      audioRef.current = remoteAudio;
      peer.ontrack = (trackEvent) => {
        remoteAudio.srcObject = trackEvent.streams[0];
        void remoteAudio.play().catch(() => undefined);
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const dataChannel = peer.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        setVoiceStatus("connected");
        appendEntry({
          role: "system",
          text: "음성 연결이 열렸습니다. 관리인 업무를 말하면 서버 allowlist로 실행합니다."
        });
      };
      dataChannel.onmessage = (messageEvent) => {
        void handleRealtimeEvent(dataChannel, String(messageEvent.data));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nextSession.clientSecret.value}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      });

      if (!realtimeResponse.ok) {
        const errorText = await realtimeResponse.text().catch(() => "");
        throw new Error(
          `Realtime SDP 교환 실패 (${realtimeResponse.status})${errorText ? `: ${errorText.slice(0, 240)}` : ""}`
        );
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await realtimeResponse.text()
      });
    } catch (error) {
      disconnectVoice();
      setVoiceStatus("error");
      appendEntry({
        role: "system",
        text: error instanceof Error ? error.message : "음성 연결 중 오류가 발생했습니다."
      });
    }
  }

  async function handleRealtimeEvent(dataChannel: RTCDataChannel, rawEvent: string) {
    const event = JSON.parse(rawEvent) as {
      type?: string;
      call_id?: string;
      arguments?: string;
      delta?: string;
      transcript?: string;
    };

    if (event.type === "response.function_call_arguments.done" && event.call_id) {
      const args = JSON.parse(event.arguments || "{}") as {
        command?: string;
        text?: string;
        billId?: string;
        channel?: string;
        threadId?: string;
        body?: string;
      };
      const result = await runManagerCommand({
        command: args.command || "",
        text: args.text,
        billId: args.billId,
        channel: args.channel,
        threadId: args.threadId,
        body: args.body
      });
      appendEntry({ role: "agent", text: result.summary, result });
      dataChannel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: event.call_id,
            output: JSON.stringify(result)
          }
        })
      );
      dataChannel.send(JSON.stringify({ type: "response.create" }));
      return;
    }

    if (event.type === "response.audio_transcript.done" && event.transcript) {
      appendEntry({ role: "agent", text: event.transcript });
    }
  }

  function disconnectVoice() {
    closeVoiceResources();
    setVoiceStatus((current) => (current === "connected" || current === "connecting" ? "idle" : current));
  }

  function closeVoiceResources() {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioRef.current = null;
  }

  return (
    <Card style={{ display: "grid", gap: "var(--space-lg)", background: "var(--surface-container-high)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-lg)", alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>OpenAI Realtime</Badge>
            <Badge>{voiceStatusLabel(voiceStatus)}</Badge>
            <Badge>관리인 확인 게이트</Badge>
          </div>
          <h1 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
            실시간 AI 운영 에이전트
          </h1>
          <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            음성 연결 또는 텍스트 명령으로 티켓 처리, 청구 관리, 소통 작업을 한 화면에서 진행합니다.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "end" }}>
          <Button type="button" onClick={connectVoice} disabled={voiceStatus === "connecting" || voiceStatus === "connected"}>
            음성 연결
          </Button>
          <Button type="button" variant="secondary" onClick={disconnectVoice} disabled={voiceStatus !== "connected"}>
            연결 종료
          </Button>
        </div>
      </div>

      <section style={agentChatShellStyle} aria-label="AI agent 채팅">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>AI agent와 대화</strong>
            <p style={{ margin: "var(--space-xs) 0 0", color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              자연어로 요청하면 가장 가까운 작업으로 분류해 실행합니다.
            </p>
          </div>
          <Badge>{activeOption.label}</Badge>
        </div>

        <div role="list" aria-label="빠른 작업 선택" style={quickActionListStyle}>
          {commandOptions.map((option) => {
            const active = option.command === activeCommand;
            return (
              <button
                key={option.command}
                type="button"
                onClick={() => {
                  setActiveCommand(option.command);
                  setChatText((current) => current || option.placeholder);
                }}
                style={{
                  ...quickActionButtonStyle,
                  background: active ? "var(--primary)" : "var(--surface-container-lowest)",
                  color: active ? "var(--on-primary)" : "var(--on-surface)",
                  border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)"
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div role="log" aria-live="polite" style={agentChatTranscriptStyle}>
          {entries.map((entry) => {
            const mine = entry.role === "manager";
            return (
              <div key={entry.id} style={{ ...chatRowStyle, justifyItems: mine ? "end" : "start" }}>
                <div
                  style={{
                    ...chatBubbleStyle,
                    background: mine ? "var(--primary)" : "var(--surface-container)",
                    color: mine ? "var(--on-primary)" : "var(--on-surface)"
                  }}
                >
                  <span style={chatRoleStyle}>{roleLabel(entry.role)}</span>
                  <span style={{ lineHeight: "var(--lh-body)" }}>{entry.text}</span>
                  {entry.result?.navigation ? (
                    <a href={entry.result.navigation.href} style={navigationLinkStyle}>
                      {entry.result.navigation.label}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={submitAgentMessage} style={chatFormStyle}>
          <label style={chatInputLabelStyle}>
            <span>대화 입력</span>
            <textarea
              value={chatText}
              onChange={(event) => setChatText(event.target.value)}
              rows={2}
              placeholder="AI agent에게 처리할 일을 입력하세요"
              style={chatInputStyle}
            />
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <Button type="submit" disabled={pendingText}>
              {pendingText ? "처리 중" : "전송"}
            </Button>
          </div>
        </form>
      </section>

      {session ? (
        <p style={{ margin: 0, color: "var(--on-surface-variant)", fontSize: "var(--fs-small)", lineHeight: "var(--lh-body)" }}>
          세션 {session.sessionId} · 모델 {session.model} · 음성 {session.voice}
        </p>
      ) : null}
    </Card>
  );
}

function agentMessageToCommand(message: string, fallback: ManagerAgentCommandName): ManagerAgentCommandName {
  const normalized = message.toLowerCase();

  if (/send_dunning|dunning|독촉|연체/.test(normalized)) return "billing.send_dunning";
  if (/초안|draft/.test(normalized)) return "messaging.draft_reply";
  if (/답장|메시지|문자|소통|보내|발송/.test(normalized)) return "messaging.send_reply";
  if (/청구|수납|입금|관리비|미납|월세|보증금/.test(normalized)) return "billing.summary";
  if (/티켓|민원|하자|수리|에어컨|세면대|누수|업체|긴급/.test(normalized)) return "ticket.query";

  return fallback;
}

function voiceStatusLabel(status: VoiceStatus) {
  if (status === "connecting") return "연결 중";
  if (status === "connected") return "음성 연결됨";
  if (status === "not_configured") return "API 키 필요";
  if (status === "error") return "연결 오류";
  return "음성 대기";
}

function roleLabel(role: ConsoleEntry["role"]) {
  if (role === "manager") return "관리인";
  if (role === "agent") return "에이전트";
  return "시스템";
}

const agentChatShellStyle = {
  display: "grid",
  gap: "var(--space-md)",
  padding: "var(--space-md)",
  borderRadius: "var(--radius)",
  border: "1.5px solid var(--outline-variant)",
  background: "var(--surface)"
} as const;

const quickActionListStyle = {
  display: "flex",
  gap: "var(--space-xs)",
  flexWrap: "wrap"
} as const;

const quickActionButtonStyle = {
  minHeight: 36,
  padding: "0 var(--space-md)",
  borderRadius: "var(--radius-btn)",
  fontWeight: 800,
  cursor: "pointer"
} as const;

const agentChatTranscriptStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  minHeight: 260,
  maxHeight: 420,
  overflow: "auto",
  padding: "var(--space-md)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)"
} as const;

const chatRowStyle = {
  display: "grid"
} as const;

const chatBubbleStyle = {
  maxWidth: "min(78ch, 88%)",
  display: "grid",
  gap: "var(--space-xs)",
  padding: "var(--space-sm) var(--space-md)",
  borderRadius: "var(--radius-md)"
} as const;

const chatRoleStyle = {
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  opacity: 0.76
} as const;

const chatFormStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "var(--space-sm)",
  alignItems: "center",
} as const;

const chatInputLabelStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  fontWeight: 800
} as const;

const chatInputStyle = {
  width: "100%",
  minHeight: 72,
  borderRadius: "var(--radius-md)",
  border: "1.5px solid var(--outline-variant)",
  background: "var(--surface)",
  color: "var(--on-surface)",
  padding: "var(--space-sm)",
  font: "inherit",
  resize: "vertical"
} as const;

const navigationLinkStyle = {
  color: "var(--primary)",
  fontWeight: 800,
  textDecoration: "none"
} as const;
