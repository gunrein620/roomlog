import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { tokenSecret } from "../roomlog-support";
import type {
  AnnouncementTranslationRequest,
  AnnouncementTranslationResponse
} from "../roomlog.types";
import { ANNOUNCEMENT_LANGUAGES, announcementSourceHash } from "./roomlog-announcement-support";

export class RoomlogAnnouncementTranslationService {
  async translate(
    managerId: string,
    input: AnnouncementTranslationRequest
  ): Promise<AnnouncementTranslationResponse> {
    const title = input.title?.trim();
    const body = input.body?.trim();
    const language = ANNOUNCEMENT_LANGUAGES.find((item) => item.lang === input.targetLang);

    if (!language) {
      throw new BadRequestException("지원하지 않는 번역 언어입니다.");
    }
    if (!title || !body) {
      throw new BadRequestException("번역할 공지 제목과 내용을 입력해주세요.");
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException("공지 자동 번역을 사용할 수 없습니다.");
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier(managerId, input.targetLang)
        },
        body: JSON.stringify({
          model:
            process.env.OPENAI_TRANSLATION_MODEL ||
            process.env.OPENAI_CHAT_MODEL ||
            "gpt-5.4-mini",
          instructions: [
            `Translate the Korean property-management notice into ${language.promptName}.`,
            "Preserve numbers, dates, times, names, urgency, and factual meaning exactly.",
            "Do not add responsibility, promises, causes, or safety claims not present in the source."
          ].join(" "),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({ title, body })
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "roomlog_announcement_translation",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  body: { type: "string" }
                },
                required: ["title", "body"]
              }
            }
          }
        })
      });
    } catch {
      throw new BadGatewayException("공지 자동 번역에 실패했습니다.");
    }

    if (!response.ok) {
      throw new BadGatewayException("공지 자동 번역에 실패했습니다.");
    }

    try {
      const payload = (await response.json()) as Record<string, unknown>;
      const parsed = JSON.parse(this.extractResponseText(payload)) as {
        title?: unknown;
        body?: unknown;
      };
      const translatedTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
      const translatedBody = typeof parsed.body === "string" ? parsed.body.trim() : "";

      if (!translatedTitle || !translatedBody) {
        throw new Error("empty translation");
      }

      return {
        lang: language.lang,
        langLabel: language.label,
        title: translatedTitle,
        body: translatedBody,
        reviewed: false,
        sourceHash: announcementSourceHash(title, body)
      };
    } catch {
      throw new BadGatewayException("공지 자동 번역 응답을 확인할 수 없습니다.");
    }
  }

  private extractResponseText(payload: Record<string, unknown>): string {
    if (typeof payload.output_text === "string") {
      return payload.output_text;
    }

    const output = Array.isArray(payload.output) ? payload.output : [];
    return output
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const content = Array.isArray((item as { content?: unknown }).content)
          ? ((item as { content: unknown[] }).content)
          : [];
        return content.map((part) => {
          if (!part || typeof part !== "object") return "";
          return typeof (part as { text?: unknown }).text === "string"
            ? String((part as { text: string }).text)
            : "";
        });
      })
      .filter(Boolean)
      .join("\n");
  }

  private safetyIdentifier(managerId: string, lang: string): string {
    return createHash("sha256")
      .update(`roomlog:announcement:${managerId}:${lang}:${tokenSecret}`)
      .digest("hex");
  }
}
