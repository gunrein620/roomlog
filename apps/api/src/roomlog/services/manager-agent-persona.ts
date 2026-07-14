import type { RealtimeClientSecretInput } from "../roomlog.types";

export type ManagerAgentToolDefinition = {
  type: "function";
  name: "run_manager_agent_command";
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatCompletionToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const managerAgentBaseInstructions = [
  "당신은 룸로그 관리인 운영 에이전트입니다.",
  "관리인이 티켓 처리, 청구 관리, 소통 업무를 음성 또는 텍스트로 빠르게 조회하고 조작하도록 돕습니다.",
  "실행은 반드시 run_manager_agent_command 도구로 서버 allowlist를 통과한 명령만 사용합니다.",
  "티켓 처리에서는 조건 조회와 다음 확인 지점 제안을 우선합니다.",
  "청구 관리에서는 요약, 수납률, 미납 현황을 설명하고, 관리인이 명시적으로 요청한 연체 독촉 발송은 billing.send_dunning 명령으로만 실행합니다.",
  "billing.send_dunning은 청구 전용 채널이며 항상 확인 카드로 보류한 뒤 관리인이 승인해야 발송합니다. 납부 신고 또는 미연결 입금이 있으면 발송을 차단하고 입금 확인을 안내합니다.",
  "소통에서는 목록 조회, 답장 초안, 일반 답장 발송을 처리할 수 있고, 금전 독촉이나 공지 발송은 소통 채널로 보내지 않습니다.",
  "사용자가 위험한 실행을 요청하면 차단 사유와 필요한 확인 단계를 짧게 안내합니다."
];

const managerAgentChatInstructions = [
  "채팅 화면에서는 billing.send_dunning과 messaging.send_reply 발송류 명령을 즉시 실행하지 말고, 보류 액션으로 만든 뒤 사용자 확인 후 실행합니다.",
  "답변은 간결한 한국어 텍스트로 작성합니다. 마크다운 목록은 허용하지만 음성 통화처럼 말하는 표현은 쓰지 않습니다."
];

export function buildManagerAgentInstructions(options: {
  surface: "voice" | "chat";
  custom?: string;
}): string {
  const customInstructions = options.custom?.trim();
  const base = options.surface === "chat"
    ? [...managerAgentBaseInstructions, ...managerAgentChatInstructions]
    : managerAgentBaseInstructions;
  const instructions = base.join("\n");

  return customInstructions ? `${instructions}\n\n추가 지시:\n${customInstructions}` : instructions;
}

export function buildManagerRealtimeInstructions(input: RealtimeClientSecretInput) {
  return buildManagerAgentInstructions({
    surface: "voice",
    custom: input.instructions
  });
}

export function managerAgentToolDefinitions(): ManagerAgentToolDefinition[] {
  return [
    {
      type: "function",
      name: "run_manager_agent_command",
      description:
        "룸로그 관리인 업무 명령을 서버 allowlist로 실행합니다. 티켓 조회, 청구 요약, 청구 전용 독촉 발송, 소통 조회, 답장 초안, 일반 답장 발송만 안전하게 처리합니다.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            enum: [
              "ticket.query",
              "billing.summary",
              "billing.send_dunning",
              "messaging.list_threads",
              "messaging.draft_reply",
              "messaging.send_reply"
            ],
            description: "실행할 관리인 업무 명령"
          },
          text: {
            type: "string",
            description: "사용자의 자연어 요청 또는 조회 조건"
          },
          billId: {
            type: "string",
            description: "독촉을 준비할 청구서 id. 없으면 자연어의 임차인·호실·청구월로 찾고, 대상이 여러 건이면 선택을 요청합니다."
          },
          channel: {
            type: "string",
            description: "독촉 발송 채널. 없으면 청구서의 기본 독촉 채널을 사용합니다."
          },
          threadId: {
            type: "string",
            description: "답장을 보낼 메시징 스레드 id. 없으면 관리인이 접근 가능한 최신 스레드를 사용합니다."
          },
          body: {
            type: "string",
            description: "AI가 준비했거나 관리인이 수정한 발송 문구"
          }
        },
        required: ["command"]
      }
    }
  ];
}

export function toRealtimeTools(
  definitions: ManagerAgentToolDefinition[] = managerAgentToolDefinitions()
): Array<Record<string, unknown>> {
  return definitions.map((tool) => ({
    type: tool.type,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

export function toChatCompletionTools(
  definitions: ManagerAgentToolDefinition[] = managerAgentToolDefinitions()
): ChatCompletionToolDefinition[] {
  return definitions.map((tool) => ({
    type: tool.type,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}
