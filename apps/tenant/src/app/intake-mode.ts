export type IntakeMode = "CHAT" | "VOICE" | "CALLBOT";
export type IntakeMessageInputMode = "CHAT" | "VOICE";
export type IntakeSourceChannel = "REALTIME_CHAT" | "VOICE_CHAT" | "CALLBOT";
export type RealtimePurpose = "TENANT_INTAKE" | "CALLBOT_INTAKE";

export type IntakeModeOption = {
  mode: IntakeMode;
  label: string;
  sourceChannel: IntakeSourceChannel;
  realtimePurpose: RealtimePurpose;
  startStatus: string;
  realtimeLabel: string;
  idleStatus: string;
  connectLabel: string;
};

export const intakeModeOptions: IntakeModeOption[] = [
  {
    mode: "CHAT",
    label: "채팅",
    sourceChannel: "REALTIME_CHAT",
    realtimePurpose: "TENANT_INTAKE",
    startStatus: "채팅 상담 스레드가 시작되었습니다.",
    realtimeLabel: "AI 채팅 상담",
    idleStatus: "AI 채팅 상담 대기",
    connectLabel: "음성으로 이어가기"
  },
  {
    mode: "VOICE",
    label: "음성",
    sourceChannel: "VOICE_CHAT",
    realtimePurpose: "TENANT_INTAKE",
    startStatus: "음성 상담 스레드가 시작되었습니다.",
    realtimeLabel: "AI 음성 상담",
    idleStatus: "AI 음성 상담 대기",
    connectLabel: "음성 상담 연결"
  },
  {
    mode: "CALLBOT",
    label: "콜봇",
    sourceChannel: "CALLBOT",
    realtimePurpose: "CALLBOT_INTAKE",
    startStatus: "콜봇 통화 스레드가 시작되었습니다.",
    realtimeLabel: "AI 콜봇 통화",
    idleStatus: "AI 콜봇 통화 대기",
    connectLabel: "콜봇 통화 연결"
  }
];

export function intakeModeConfig(mode: IntakeMode) {
  return intakeModeOptions.find((option) => option.mode === mode) ?? intakeModeOptions[0];
}

export function intakeSessionPayload(mode: IntakeMode) {
  return {
    sourceChannel: intakeModeConfig(mode).sourceChannel,
    reuseEmpty: true
  };
}

export function realtimePurposeForMode(mode: IntakeMode) {
  return intakeModeConfig(mode).realtimePurpose;
}

export function realtimePurposeForSourceChannel(sourceChannel: string) {
  return sourceChannel === "CALLBOT" ? "CALLBOT_INTAKE" : "TENANT_INTAKE";
}

export function intakeModeForSourceChannel(sourceChannel: string): IntakeMode {
  if (sourceChannel === "CALLBOT") {
    return "CALLBOT";
  }

  if (sourceChannel === "VOICE_CHAT") {
    return "VOICE";
  }

  return "CHAT";
}

export function messageInputModeForMode(mode: IntakeMode): IntakeMessageInputMode {
  return mode === "CHAT" ? "CHAT" : "VOICE";
}

export function idleRealtimeStatusForMode(mode: IntakeMode) {
  return intakeModeConfig(mode).idleStatus;
}

export function realtimeOpeningPromptForMode(mode: IntakeMode) {
  if (mode === "CALLBOT") {
    return "Roomlog AI 콜봇입니다. 통화가 연결되면 짧게 인사하고, 증상·위치·안전 여부·사진 가능 여부·방문 가능 시간을 한 번에 하나씩 확인하세요.";
  }

  if (mode === "VOICE") {
    return "Roomlog AI 음성 상담입니다. 연결되면 짧게 인사하고, 증상·위치·안전 여부·사진 가능 여부·방문 가능 시간을 한 번에 하나씩 확인하세요.";
  }

  return "Roomlog AI 채팅 상담에서 음성으로 이어졌습니다. 연결되면 짧게 인사하고, 부족한 접수 정보를 한 번에 하나씩 확인하세요.";
}

export function realtimeOpeningPromptForSourceChannel(sourceChannel: string) {
  return realtimeOpeningPromptForMode(intakeModeForSourceChannel(sourceChannel));
}
