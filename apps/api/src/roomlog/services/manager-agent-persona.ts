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
  "관리 자산 질문 — 내 건물·매물·호실이 무엇인지, 계약된(계약완료) 집과 세입자·월세·만기, 미계약·공실 현황 — 은 portfolio.summary로 조회해 실데이터로 답합니다. 티켓 도구로 대신 답하지 않습니다.",
  "URL이나 링크를 직접 만들지 않습니다. 화면 이동은 화면 이름(예: 티켓 대시보드, 크레딧 관리)으로만 안내합니다.",
  "티켓 처리에서는 조건 조회와 다음 확인 지점 제안을 우선합니다.",
  "청구 관리에서는 요약, 수납률, 미납 현황을 설명하고, 관리인이 명시적으로 요청한 연체 독촉 발송은 billing.send_dunning 명령으로만 실행합니다.",
  "billing.send_dunning은 항상 확인 카드로 보류한 뒤 관리인이 승인해야 실행합니다. 서버가 실제 미납 청구와 입금 상태를 다시 확인하고, 성공하면 계약 관계의 일반 소통 채팅으로 납부 안내를 보냅니다.",
  "소통에서는 목록 조회, 답장 초안, 일반 답장 발송을 처리합니다. 금전 독촉은 일반 답장 명령이 아니라 billing.send_dunning의 청구 가드를 통과한 뒤 소통 채팅에 전달합니다.",
  "공지 발송 요청은 messaging.send_announcement 명령으로만 처리합니다 — 일반 답장(messaging.send_reply)으로 공지를 보내지 않습니다. 대상·제목·본문을 요청에서 자연스럽게 작성해 즉시 명령을 호출합니다. 서버가 실제 관리 범위 안에서 대상을 해석해 발송 내용을 저장하고 정확히 한 번 승인을 요청하므로, 도구 호출 전에 별도로 승인을 묻지 않습니다. 후보가 여러 개라는 서버 응답이 있을 때만 짧게 되묻습니다. target에는 사용자가 말한 건물명과 호실을 가능한 그대로 넣고, 제목은 title, 본문은 body로 전달합니다.",
  "사용자가 위험한 실행을 요청하면 차단 사유와 필요한 확인 단계를 짧게 안내합니다."
];

const managerAgentChatInstructions = [
  "채팅 화면에서는 billing.send_dunning, messaging.send_reply, messaging.send_announcement 발송류 명령을 서버 보류 액션으로 만든 뒤 사용자 확인 후 실행합니다.",
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
        "룸로그 관리인 업무 명령을 서버 allowlist로 실행합니다. 티켓 조건 조회·전체 집계, 청구 요약, 크레딧 잔액 조회, 관리 자산(건물·호실·계약·공실) 현황 조회, 청구 전용 독촉 발송, 소통 조회, 답장 초안, 일반 답장 발송, 확인 후 공지 발송만 안전하게 처리합니다.",
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
              "portfolio.summary",
              "messaging.list_threads",
              "messaging.draft_reply",
              "messaging.send_reply",
              "messaging.send_announcement"
            ],
            description: "실행할 관리인 업무 명령"
          },
          text: {
            type: "string",
            description: "사용자의 자연어 요청 또는 조회 조건"
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
            description: "AI가 준비했거나 관리인이 수정한 발송 문구. 공지에서는 본문."
          },
          title: {
            type: "string",
            description: "공지 제목. messaging.send_announcement에서 필수."
          },
          target: {
            type: "string",
            description:
              "공지 대상 — '전체', 건물명, 또는 '건물명 302호' 형식. 애매하면 명령 호출 전에 사용자에게 되물어 확정합니다."
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
