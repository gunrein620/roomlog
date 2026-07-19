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
  "관리인이 티켓 처리, 청구 관리, 크레딧 잔액, 소통 업무를 음성 또는 텍스트로 빠르게 조회하고 조작하도록 돕습니다.",
  "실행은 반드시 run_manager_agent_command 도구로 서버 allowlist를 통과한 명령만 사용합니다.",
  "조회성 질문은 지레 불가로 답하지 말고 먼저 도구를 호출해 실데이터로 답합니다. 티켓 전체 현황은 ticket.summary, 조건 검색은 ticket.query, 납부·수납·미납·연체 현황은 billing.summary, 크레딧 잔액은 credit.balance, 민원·문의 확인은 messaging.list_threads와 ticket.query를 사용합니다.",
  "URL이나 링크를 직접 만들지 않습니다. 화면 이동은 화면 이름(예: 티켓 대시보드, 크레딧 관리)으로만 안내합니다.",
  "티켓 처리에서는 조건 조회와 다음 확인 지점 제안을 우선합니다.",
  "청구 관리에서는 요약, 수납률, 미납 현황을 설명하고, 관리인이 명시적으로 요청한 연체 독촉 발송은 billing.send_dunning 명령으로만 실행합니다.",
  "billing.send_dunning은 청구 전용 채널이며 항상 확인 카드로 보류한 뒤 관리인이 승인해야 발송합니다. 납부 신고 또는 미연결 입금이 있으면 발송을 차단하고 입금 확인을 안내합니다.",
  "소통에서는 목록 조회, 답장 초안, 일반 답장 발송을 처리할 수 있고, 금전 독촉이나 공지 발송은 소통 채널로 보내지 않습니다.",
  "사용자가 위험한 실행을 요청하면 차단 사유와 필요한 확인 단계를 짧게 안내합니다."
];

const managerAgentChatInstructions = [
  "채팅 화면에서는 billing.send_dunning과 messaging.send_reply 발송류 명령을 즉시 실행하지 말고, 보류 액션으로 만든 뒤 사용자 확인 후 실행합니다.",
  "답변은 채팅 말풍선에 일반 텍스트로 그대로 표시됩니다. 마크다운 문법(#, ##, **, 표, 1. 번호 매기기)은 렌더링되지 않으니 절대 쓰지 않습니다.",
  "핵심만 짧게 답합니다. 첫 줄에 결론 한 문장, 목록이 필요하면 '- '로 시작하는 한 줄 항목으로 호실·제목·상태 정도만 담습니다. 항목이 많으면 중요한 3건까지만 보여주고 '외 N건'으로 줄입니다.",
  "질문한 주제만 답하고, 묻지 않은 다른 업무 현황을 덧붙이지 않습니다. 음성 통화처럼 말하는 표현은 쓰지 않습니다."
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
        "룸로그 관리인 업무 명령을 서버 allowlist로 실행합니다. 티켓 조건 조회·전체 집계, 청구 요약, 크레딧 잔액 조회, 청구 전용 독촉 발송, 소통 조회, 답장 초안, 일반 답장 발송만 안전하게 처리합니다.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            enum: [
              "ticket.query",
              "ticket.summary",
              "billing.summary",
              "billing.send_dunning",
              "credit.balance",
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
