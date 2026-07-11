"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type {
  AnnouncementDraft,
  AnnouncementDraftInput,
  AnnouncementTranslationRequest,
  AnnouncementTranslationResponse,
} from "@roomlog/types";
import {
  createAnnouncementDraft,
  translateAnnouncement,
  updateAnnouncementDraft,
} from "@/lib/messaging-manager-api";
import { ApiError } from "@/lib/server-api";

export interface SaveAnnouncementComposeInput {
  draftId?: string;
  draft: AnnouncementDraftInput;
}

function sourceHash(title: string, body: string): string {
  return createHash("sha256").update(`${title.trim()}\n${body.trim()}`).digest("hex");
}

function withCurrentSourceHashes(input: AnnouncementDraftInput): AnnouncementDraftInput {
  const currentHash = sourceHash(input.title, input.body);
  return {
    ...input,
    translations: input.translations.map((translation) => ({
      ...translation,
      sourceHash: currentHash,
    })),
  };
}

function handleAuthError(error: unknown): never {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    redirect("/manager/login");
  }
  throw error;
}

export async function saveAnnouncementComposeAction(
  input: SaveAnnouncementComposeInput,
): Promise<AnnouncementDraft> {
  const draft = withCurrentSourceHashes(input.draft);
  try {
    return input.draftId
      ? await updateAnnouncementDraft(input.draftId, draft)
      : await createAnnouncementDraft(draft);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function translateAnnouncementAction(
  input: AnnouncementTranslationRequest,
): Promise<AnnouncementTranslationResponse> {
  try {
    return await translateAnnouncement(input);
  } catch (error) {
    return handleAuthError(error);
  }
}
