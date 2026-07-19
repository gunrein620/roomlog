import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { RoomlogService } from "../roomlog.service";
import {
  buildManagerAgentInstructions,
  toChatCompletionTools
} from "./manager-agent-persona";

const expectedVoiceInstructions = [
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
].join("\n");

const expectedRealtimeTools = [
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

function chatCompletion(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

function responsesText(outputText: string) {
  return new Response(JSON.stringify({ output_text: outputText }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}

function hasPaymentThread(service: RoomlogService, tenantId: string, billId: string) {
  return service
    .listTenantMessagingThreads(tenantId)
    .some((thread) => thread.context === "payment" && thread.contextRef === billId);
}

describe("manager copilot chat domain", () => {
  it("keeps manager realtime voice instructions and tool schema unchanged after extraction", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const result = await service.createManagerRealtimeClientSecret("landlord-demo", {
        voice: "marin"
      });

      assert.equal(result.instructions, expectedVoiceInstructions);
      assert.deepEqual(result.tools, expectedRealtimeTools);
      assert.equal(buildManagerAgentInstructions({ surface: "voice" }), expectedVoiceInstructions);
      assert.deepEqual(
        toChatCompletionTools(),
        [
          {
            type: "function",
            function: {
              name: expectedRealtimeTools[0].name,
              description: expectedRealtimeTools[0].description,
              parameters: expectedRealtimeTools[0].parameters
            }
          }
        ]
      );
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("executes lookup tools and feeds the result back into Chat Completions", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalCopilotModel = process.env.OPENAI_COPILOT_MODEL;
    const originalFetch = globalThis.fetch;
    const chatBodies: any[] = [];
    let responseCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    process.env.OPENAI_COPILOT_MODEL = "gpt-test-copilot";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));

      if (url === "https://api.openai.com/v1/chat/completions") {
        const headers = new Headers(init?.headers);
        chatBodies.push(body);
        assert.equal(headers.get("Authorization"), "Bearer sk-test-roomlog");
        assert.ok(headers.get("OpenAI-Safety-Identifier"));

        if (chatBodies.length === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_lookup",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "billing.summary",
                    text: "이번 달 수납 현황 알려줘"
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "이번 달 청구 요약입니다."
        });
      }

      if (url === "https://api.openai.com/v1/responses") {
        responseCalls += 1;
        return responsesText("이번 달 청구 요약입니다.");
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [
          { role: "assistant", content: "무엇을 도와드릴까요?" },
          { role: "user", content: "이번 달 수납 현황 알려줘" }
        ]
      });

      assert.equal(result.mode, "openai");
      assert.equal(result.reply, "이번 달 청구 요약입니다.");
      assert.equal(responseCalls, 0);
      assert.equal(chatBodies[0].model, "gpt-test-copilot");
      assert.match(chatBodies[0].messages[0].content, /보류 액션/);
      assert.equal(chatBodies[0].messages.at(-1).content, "이번 달 수납 현황 알려줘");
      assert.equal(chatBodies[0].tools[0].function.name, "run_manager_agent_command");
      const toolMessage = chatBodies[1].messages.find((message: any) => message.role === "tool");
      assert.match(toolMessage.content, /billing/);
      assert.match(toolMessage.content, /이번 달 청구 \d+건/);
      assert.match(toolMessage.content, /"data"/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
      if (originalCopilotModel) process.env.OPENAI_COPILOT_MODEL = originalCopilotModel;
      else delete process.env.OPENAI_COPILOT_MODEL;
    }
  });

  it("returns a pending action for send tools without executing the send", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const billId = "bill-demo-overdue-411";
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "billing.send_dunning",
                    text: "411호 독촉 보내줘",
                    channel: "SMS",
                    body: "미납 안내드립니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "발송 전에 확인이 필요합니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), false);

      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "411호 독촉 보내줘" }]
      });

      assert.equal(result.mode, "openai");
      assert.equal(result.reply, "발송 전에 확인이 필요합니다.");
      assert.equal(result.pendingAction?.kind, "billing.send_dunning");
      assert.match(result.pendingAction?.summary ?? "", /정예린/);
      assert.match(result.pendingAction?.summary ?? "", /정글빌라 411호/);
      assert.match(result.pendingAction?.summary ?? "", /월분 청구/);
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("prepares and confirms an explicit dunning intent without depending on the AI window or model", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();
    const billId = "bill-demo-overdue-411";

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        intent: {
          type: "billing.send_dunning",
          source: "overdue",
          billId,
          prompt: "411호 연체 독촉 문구를 준비해줘",
          messageText: "납부기한이 지난 청구가 있어 안내드립니다."
        }
      });

      assert.equal(pending.mode, "openai");
      assert.equal(pending.pendingAction?.kind, "billing.send_dunning");
      assert.equal(pending.pendingAction?.dunningPreview?.billId, billId);
      assert.equal(pending.pendingAction?.dunningPreview?.unitId, "411");
      assert.equal(pending.pendingAction?.dunningPreview?.billingMonth.length, 7);
      assert.match(pending.pendingAction?.dunningPreview?.messageText ?? "", /납부기한/);
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), false);
      assert.ok(pending.pendingAction?.id);

      const confirmed = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        confirmActionId: pending.pendingAction?.id
      });

      assert.equal(confirmed.receipts?.[0]?.kind, "billing.send_dunning");
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), true);
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("blocks an explicit dunning intent while a payment report or unmatched deposit needs review", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        intent: {
          type: "billing.send_dunning",
          source: "overdue",
          billId: "bill-demo-guarded",
          prompt: "301호 독촉 보내줘"
        }
      });

      assert.equal(result.mode, "openai");
      assert.equal(result.pendingAction, undefined);
      assert.match(result.reply, /납부 신고|미연결 입금/);
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("cancels a pending dunning action so it cannot be confirmed later", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        intent: {
          type: "billing.send_dunning",
          source: "overdue",
          billId: "bill-demo-overdue-411"
        }
      });
      assert.ok(pending.pendingAction?.id);

      const cancelled = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        cancelActionId: pending.pendingAction.id
      });

      assert.match(cancelled.reply, /취소/);
      assert.equal(cancelled.pendingAction, undefined);
      await assert.rejects(
        () =>
          service.chatManagerCopilot("landlord-demo", {
            messages: [],
            confirmActionId: pending.pendingAction?.id
          }),
        /보류 액션/
      );
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("confirms a pending send action and returns execution receipts", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const billId = "bill-demo-overdue-411";
    let chatCalls = 0;
    let responseCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "billing.send_dunning",
                    billId,
                    channel: "SMS",
                    body: "미납 안내드립니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "발송 전에 확인이 필요합니다."
        });
      }

      if (url === "https://api.openai.com/v1/responses") {
        responseCalls += 1;
        return responsesText("411호 독촉 발송을 완료했습니다.");
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "411호 독촉 보내줘" }]
      });
      assert.ok(pending.pendingAction?.id);
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), false);

      const confirmed = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        confirmActionId: pending.pendingAction.id
      });

      assert.equal(confirmed.mode, "openai");
      assert.match(confirmed.reply, /확인했습니다/);
      assert.equal(confirmed.receipts?.[0]?.kind, "billing.send_dunning");
      assert.match(confirmed.receipts?.[0]?.summary ?? "", /정예린/);
      assert.match(confirmed.receipts?.[0]?.summary ?? "", /정글빌라 411호/);
      assert.equal(hasPaymentThread(service, "tenant-billing-411", billId), true);
      assert.equal(chatCalls, 2);
      assert.equal(responseCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("rejects confirmation of another manager's pending action", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "messaging.send_reply",
                    threadId: "mth_demo_general",
                    body: "확인했습니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "답장 발송 전에 확인이 필요합니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "임차인에게 확인 답장 보내줘" }]
      });
      assert.ok(pending.pendingAction?.id);

      await assert.rejects(
        () =>
          service.chatManagerCopilot("other-landlord", {
            messages: [],
            confirmActionId: pending.pendingAction?.id
          }),
        /보류 액션/
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("throws BadGateway when OpenAI Chat Completions returns non-2xx", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        return new Response("bad upstream", { status: 502 });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          service.chatManagerCopilot("landlord-demo", {
            messages: [{ role: "user", content: "이번 달 수납 현황 알려줘" }]
          }),
        /OpenAI Copilot 채팅 호출 실패 \(502\): bad upstream/
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("feeds blocked tool output when tool arguments are not valid JSON", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const chatBodies: any[] = [];
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;
        chatBodies.push(JSON.parse(String(init?.body)));

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_bad_json",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: "{not-json"
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "도구 인자를 다시 확인해주세요."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "확인해줘" }]
      });

      assert.equal(result.reply, "도구 인자를 다시 확인해주세요.");
      const toolMessage = chatBodies[1].messages.find((message: any) => message.role === "tool");
      assert.match(toolMessage.content, /blocked/);
      assert.match(toolMessage.content, /도구 인자를 해석할 수 없습니다/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("sends only the latest 12 user and assistant messages to OpenAI", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const chatBodies: any[] = [];
    const messages = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${index}`
    }));

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatBodies.push(JSON.parse(String(init?.body)));

        return chatCompletion({
          content: "최근 메시지만 봤습니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", { messages });

      assert.equal(result.reply, "최근 메시지만 봤습니다.");
      assert.equal(chatBodies[0].messages.length, 13);
      assert.deepEqual(
        chatBodies[0].messages.slice(1).map((message: any) => message.content),
        messages.slice(-12).map((message) => message.content)
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("returns fallbackReply when tool loops hit the four-iteration ceiling", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        return chatCompletion({
          content: null,
          tool_calls: [
            {
              id: `call_loop_${chatCalls}`,
              type: "function",
              function: {
                name: "run_manager_agent_command",
                arguments: JSON.stringify({
                  command: "billing.summary",
                  text: "수납 현황"
                })
              }
            }
          ]
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "계속 도구만 호출해" }]
      });

      assert.equal(chatCalls, 4);
      assert.equal(result.reply, "요청을 처리했지만 답변 문장을 만들지 못했습니다. 다시 한 번 요청해주세요.");
      assert.equal(result.pendingAction, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("feeds blocked output for unsupported tool names", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const chatBodies: any[] = [];
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;
        chatBodies.push(JSON.parse(String(init?.body)));

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_unknown",
                type: "function",
                function: {
                  name: "unknown_tool",
                  arguments: "{}"
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "지원하지 않는 도구입니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "이 도구 써줘" }]
      });

      assert.equal(result.reply, "지원하지 않는 도구입니다.");
      const toolMessage = chatBodies[1].messages.find((message: any) => message.role === "tool");
      assert.match(toolMessage.content, /blocked/);
      assert.match(toolMessage.content, /지원하지 않는 도구 호출입니다/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("re-registers a pending action without receipts when confirmation is blocked", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_blocked_confirm",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "messaging.send_reply",
                    threadId: "mth_demo_general",
                    body: "미납 독촉 메시지입니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "답장 발송 전에 확인이 필요합니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "임차인에게 독촉 답장 보내줘" }]
      });
      assert.ok(pending.pendingAction?.id);

      const blocked = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        confirmActionId: pending.pendingAction.id
      });

      assert.match(blocked.reply, /허용되지 않은 명령/);
      assert.equal(blocked.receipts, undefined);
      assert.equal(blocked.pendingAction?.id, pending.pendingAction.id);

      const blockedAgain = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        confirmActionId: pending.pendingAction.id
      });

      assert.match(blockedAgain.reply, /허용되지 않은 명령/);
      assert.equal(blockedAgain.receipts, undefined);
      assert.equal(blockedAgain.pendingAction?.id, pending.pendingAction.id);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("drops older pending send actions when a turn creates multiple sends", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const chatBodies: any[] = [];
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;
        chatBodies.push(JSON.parse(String(init?.body)));

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_first_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "messaging.send_reply",
                    threadId: "mth_demo_general",
                    body: "첫 번째 답장입니다."
                  })
                }
              },
              {
                id: "call_second_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "messaging.send_reply",
                    threadId: "mth_demo_general",
                    body: "두 번째 답장입니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "마지막 발송만 확인해주세요."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "답장 두 개 보내줘" }]
      });
      const toolMessages = chatBodies[1].messages.filter((message: any) => message.role === "tool");
      const firstPendingId = JSON.parse(toolMessages[0].content).pendingActionId;
      const secondPendingId = JSON.parse(toolMessages[1].content).pendingActionId;

      assert.notEqual(firstPendingId, secondPendingId);
      assert.equal(result.pendingAction?.id, secondPendingId);
      await assert.rejects(
        () =>
          service.chatManagerCopilot("landlord-demo", {
            messages: [],
            confirmActionId: firstPendingId
          }),
        /보류 액션/
      );

      const confirmed = await service.chatManagerCopilot("landlord-demo", {
        messages: [],
        confirmActionId: secondPendingId
      });

      assert.equal(confirmed.receipts?.[0]?.kind, "messaging.send_reply");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("uses a distinct error message for expired pending actions", async () => {
    const service = new RoomlogService();
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const originalDateNow = Date.now;
    const createdAtMs = originalDateNow();
    let chatCalls = 0;

    process.env.OPENAI_API_KEY = "sk-test-roomlog";
    globalThis.fetch = (async (input) => {
      const url = String(input);

      if (url === "https://api.openai.com/v1/chat/completions") {
        chatCalls += 1;

        if (chatCalls === 1) {
          return chatCompletion({
            content: null,
            tool_calls: [
              {
                id: "call_expiring_send",
                type: "function",
                function: {
                  name: "run_manager_agent_command",
                  arguments: JSON.stringify({
                    command: "messaging.send_reply",
                    threadId: "mth_demo_general",
                    body: "확인했습니다."
                  })
                }
              }
            ]
          });
        }

        return chatCompletion({
          content: "답장 발송 전에 확인이 필요합니다."
        });
      }

      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const pending = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "확인 답장 보내줘" }]
      });
      assert.ok(pending.pendingAction?.id);

      Date.now = () => createdAtMs + 11 * 60 * 1000;

      await assert.rejects(
        () =>
          service.chatManagerCopilot("landlord-demo", {
            messages: [],
            confirmActionId: pending.pendingAction?.id
          }),
        /확인 시간이 지났습니다. 다시 요청해주세요./
      );
    } finally {
      Date.now = originalDateNow;
      globalThis.fetch = originalFetch;
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("returns not_configured when OPENAI_API_KEY is missing", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const service = new RoomlogService();

    try {
      const result = await service.chatManagerCopilot("landlord-demo", {
        messages: [{ role: "user", content: "오늘 처리할 일 알려줘" }]
      });

      assert.equal(result.mode, "not_configured");
      assert.match(result.reply, /OPENAI_API_KEY/);
    } finally {
      if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});
