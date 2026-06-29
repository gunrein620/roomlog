import "dotenv/config";

import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const TRANSIENT_OPENAI_STATUSES = new Set([502, 503, 504]);

export const REALTIME_INSTRUCTIONS = `너는 임대관리팀의 AI 상담원이다. 한국어로 자연스럽고 짧게 말한다.
사용자는 입주민이다. 사용자가 하자를 말하면 친절하게 증상을 좁혀 묻고, 필요한 경우 사진을 요청한다.

핵심 시나리오:
- 사용자가 "에어컨에 문제가 있어요"라고 하면 냄새, 작동불량, 누수, 소음 중 무엇인지 물어본다.
- 사용자가 냄새 문제라고 하면 에어컨 필터와 송풍구 사진을 요청한다.
- 사진이 오면 확정적으로 단정하지 말고 "사진상 필터 오염 가능성이 보여요"처럼 가능성으로 말한다.
- 이후 계약 특약을 확인하겠다고 말하고 check_contract_clause tool을 호출한다.
- 계약상 임대인 유지보수 항목이면 하자 접수를 진행하겠다고 말하고 create_defect_ticket tool을 호출한다.
- 그 다음 request_vendor_quote tool을 호출해서 청소 제휴업체에 접수했다고 안내한다.
- 사용자가 업체 견적이 도착했다는 시스템 이벤트를 받으면, 결제/배정/방문예정 내용을 요약해서 입주민에게 안내한다.

중요한 말투:
- 너무 길게 설명하지 않는다.
- 한 번에 질문은 1~2개만 한다.
- 법적 책임소재를 확정하지 않는다.
- "가능성이 있어요", "관리자 확인 후 최종 안내드릴게요" 같은 안전한 표현을 사용한다.
- 입주민이 불편해한 점에 먼저 공감한다.

금지:
- 집주인 책임 또는 입주민 책임을 단정하지 말 것.
- 실제 결제가 완료됐다고 임의로 말하지 말 것. tool 또는 시스템 이벤트 결과가 있을 때만 말할 것.
- 사진만 보고 100% 원인을 확정하지 말 것.`;

export function getRealtimeTools() {
  return [
    {
      type: "function",
      name: "check_contract_clause",
      description: "계약서/특약에서 특정 하자 카테고리의 유지보수 책임 기준을 조회한다.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          unit_id: { type: "string", description: "세대 식별자. 데모 기본값은 A-302." },
          category: { type: "string", description: "하자 카테고리." },
          issue_summary: { type: "string", description: "입주민이 말한 증상 요약." },
        },
        required: ["unit_id", "category", "issue_summary"],
      },
    },
    {
      type: "function",
      name: "create_defect_ticket",
      description: "입주민 하자 접수 티켓을 생성한다.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          unit_id: { type: "string", description: "세대 식별자. 데모 기본값은 A-302." },
          category: { type: "string", description: "하자 카테고리." },
          issue_summary: { type: "string", description: "하자 내용 요약." },
          urgency: { type: "string", description: "긴급도. 예: low, normal, high." },
          has_photo: { type: "boolean", description: "입주민이 사진을 제공했는지 여부." },
        },
        required: ["unit_id", "category", "issue_summary", "urgency", "has_photo"],
      },
    },
    {
      type: "function",
      name: "request_vendor_quote",
      description: "제휴업체에 하자 내용과 사진 정보를 전달하고 견적 요청을 보낸다.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          ticket_id: { type: "string", description: "하자 티켓 ID." },
          vendor_type: { type: "string", description: "제휴업체 유형." },
          issue_summary: { type: "string", description: "업체에 전달할 하자 내용 요약." },
          has_photo: { type: "boolean", description: "사진 첨부 여부." },
        },
        required: ["ticket_id", "vendor_type", "issue_summary", "has_photo"],
      },
    },
  ];
}

export function buildSessionConfig(env = process.env) {
  return {
    type: "realtime",
    model: env.REALTIME_MODEL || "gpt-realtime-2",
    output_modalities: ["audio"],
    audio: {
      output: {
        voice: env.REALTIME_VOICE || "marin",
      },
      input: {
        turn_detection: {
          type: "semantic_vad",
        },
      },
    },
    tool_choice: "auto",
    instructions: REALTIME_INSTRUCTIONS,
    tools: getRealtimeTools(),
  };
}

export function buildClientSecretRequestBody(env = process.env) {
  return {
    session: buildSessionConfig(env),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function summarizeOpenAIError({ status, statusText, contentType, body, requestId, elapsedMs }) {
  const prefix = `OpenAI Realtime API request failed (${status} ${statusText})`;
  const meta = `request ${requestId}, elapsed ${elapsedMs}ms`;

  if (contentType?.includes("text/html") || body.trim().startsWith("<!DOCTYPE html")) {
    return `${prefix}\n${meta}\nOpenAI returned an HTML error page. This is usually a transient gateway/upstream issue. Please try 상담 시작 again.`;
  }

  const compactBody = body.trim().replace(/\s+/g, " ");
  const bodyPreview = compactBody.length > 900 ? `${compactBody.slice(0, 900)}...` : compactBody;
  return bodyPreview ? `${prefix}\n${meta}\n${bodyPreview}` : `${prefix}\n${meta}`;
}

async function postRealtimeCall({ sdp, sessionConfig, apiKey, requestId, attempt }) {
  const formData = new FormData();
  formData.set("sdp", sdp);
  formData.set("session", sessionConfig);

  const startedAt = Date.now();
  console.log(
    `[${requestId}] /session attempt ${attempt}: posting SDP (${sdp.length} chars) to OpenAI model ${JSON.parse(sessionConfig).model}`,
  );

  const response = await fetch(OPENAI_REALTIME_CALLS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Safety-Identifier": "realtime-defect-demo-user",
    },
    body: formData,
  });

  const body = await response.text();
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[${requestId}] /session attempt ${attempt}: OpenAI responded ${response.status} ${response.statusText} in ${elapsedMs}ms (${response.headers.get("content-type") || "no content-type"})`,
  );

  return {
    response,
    body,
    elapsedMs,
    contentType: response.headers.get("content-type") || "",
  };
}

export function createApp({ apiKey = process.env.OPENAI_API_KEY, env = process.env } = {}) {
  const app = express();

  app.use(express.text({ type: ["application/sdp", "text/plain"] }));
  app.use(express.static(join(__dirname, "public")));

  app.post("/session", async (req, res) => {
    if (!apiKey) {
      res.status(500).type("text/plain").send("OPENAI_API_KEY is missing on the server.");
      return;
    }

    if (typeof req.body !== "string" || req.body.trim().length === 0) {
      res.status(400).type("text/plain").send("Missing SDP offer in request body.");
      return;
    }

    const requestId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionConfig = JSON.stringify(buildSessionConfig(env));

    try {
      let result = await postRealtimeCall({
        sdp: req.body,
        sessionConfig,
        apiKey,
        requestId,
        attempt: 1,
      });

      if (!result.response.ok && TRANSIENT_OPENAI_STATUSES.has(result.response.status)) {
        console.warn(`[${requestId}] transient OpenAI ${result.response.status}; retrying once`);
        await wait(900);
        result = await postRealtimeCall({
          sdp: req.body,
          sessionConfig,
          apiKey,
          requestId,
          attempt: 2,
        });
      }

      if (!result.response.ok) {
        const message = summarizeOpenAIError({
          status: result.response.status,
          statusText: result.response.statusText,
          contentType: result.contentType,
          body: result.body,
          requestId,
          elapsedMs: result.elapsedMs,
        });
        console.error(`[${requestId}] ${message}\nRaw OpenAI body:\n${result.body}`);
        res.status(result.response.status).type("text/plain").send(message);
        return;
      }

      console.log(`[${requestId}] /session success: returning SDP answer (${result.body.length} chars)`);
      res.type("application/sdp").send(result.body);
    } catch (error) {
      const message = `OpenAI Realtime API request failed before an SDP answer was received: ${error.message}`;
      console.error(message, error);
      res.status(500).type("text/plain").send(message);
    }
  });

  app.get("/token", async (req, res) => {
    if (!apiKey) {
      res.status(500).json({ error: "OPENAI_API_KEY is missing on the server." });
      return;
    }

    const requestId = `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    console.log(`[${requestId}] /token: creating Realtime ephemeral client secret`);

    try {
      const openaiResponse = await fetch(OPENAI_CLIENT_SECRETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": "realtime-defect-demo-user",
        },
        body: JSON.stringify(buildClientSecretRequestBody(env)),
      });

      const responseText = await openaiResponse.text();
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[${requestId}] /token: OpenAI responded ${openaiResponse.status} ${openaiResponse.statusText} in ${elapsedMs}ms`,
      );

      if (!openaiResponse.ok) {
        const message = summarizeOpenAIError({
          status: openaiResponse.status,
          statusText: openaiResponse.statusText,
          contentType: openaiResponse.headers.get("content-type") || "",
          body: responseText,
          requestId,
          elapsedMs,
        });
        console.error(`[${requestId}] ${message}\nRaw OpenAI body:\n${responseText}`);
        res.status(openaiResponse.status).json({ error: message });
        return;
      }

      res.type("application/json").send(responseText);
    } catch (error) {
      const message = `OpenAI Realtime client secret request failed: ${error.message}`;
      console.error(`[${requestId}] ${message}`, error);
      res.status(500).json({ error: message });
    }
  });

  return app;
}

export function startServer() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is missing. Copy .env.example to .env and set OPENAI_API_KEY.");
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Realtime defect consultation demo listening on http://localhost:${PORT}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
