import type { ManagerAgentCommandInput } from "@roomlog/types";

export type ManagerRealtimeActivity = "idle" | "listening" | "responding";

export type ManagerRealtimeParsedEvent =
  | { kind: "ignored" }
  | { kind: "error"; message: string }
  | { kind: "activity"; activity: ManagerRealtimeActivity }
  | {
      kind: "transcript";
      role: "user" | "assistant";
      content: string;
    }
  | {
      kind: "command";
      callId: string;
      input: ManagerAgentCommandInput;
    };

export function parseManagerRealtimeEvent(rawEvent: string): ManagerRealtimeParsedEvent {
  let event: Record<string, unknown>;

  try {
    const parsed = JSON.parse(rawEvent);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "ignored" };
    }
    event = parsed as Record<string, unknown>;
  } catch {
    return { kind: "ignored" };
  }

  const type = stringValue(event.type);

  if (type === "error") {
    const error = event.error;
    const message =
      error && typeof error === "object" && !Array.isArray(error)
        ? stringValue((error as Record<string, unknown>).message)
        : "";
    return { kind: "error", message: message || "알 수 없는 Realtime 오류" };
  }

  if (type === "input_audio_buffer.speech_started") {
    return { kind: "activity", activity: "listening" };
  }

  if (type === "response.created") {
    return { kind: "activity", activity: "responding" };
  }

  if (type === "response.done" || type === "input_audio_buffer.speech_stopped") {
    return { kind: "activity", activity: "idle" };
  }

  const transcript = stringValue(event.transcript).trim();
  if (type === "conversation.item.input_audio_transcription.completed" && transcript) {
    return { kind: "transcript", role: "user", content: transcript };
  }

  if (
    (type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done") &&
    transcript
  ) {
    return { kind: "transcript", role: "assistant", content: transcript };
  }

  const callId = stringValue(event.call_id);
  if (type === "response.function_call_arguments.done" && callId) {
    return {
      kind: "command",
      callId,
      input: parseCommandInput(stringValue(event.arguments)),
    };
  }

  return { kind: "ignored" };
}

export function closeManagerRealtimeResources(resources: {
  channel?: { close(): void } | null;
  peer?: { close(): void } | null;
  stream?: { getTracks(): Array<{ stop(): void }> } | null;
}) {
  resources.channel?.close();
  resources.peer?.close();
  for (const track of resources.stream?.getTracks() ?? []) track.stop();
}

function parseCommandInput(argumentsText: string): ManagerAgentCommandInput {
  let args: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(argumentsText || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    args = {};
  }

  return {
    command: stringValue(args.command),
    ...optionalValue("text", args.text),
    ...optionalValue("billId", args.billId),
    ...optionalValue("channel", args.channel),
    ...optionalValue("threadId", args.threadId),
    ...optionalValue("body", args.body),
    ...optionalValue("title", args.title),
    ...optionalValue("target", args.target),
  };
}

function optionalValue<
  Key extends "text" | "billId" | "channel" | "threadId" | "body" | "title" | "target"
>(
  key: Key,
  value: unknown,
): Partial<Record<Key, string>> {
  const normalized = stringValue(value);
  return normalized ? { [key]: normalized } as Partial<Record<Key, string>> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
