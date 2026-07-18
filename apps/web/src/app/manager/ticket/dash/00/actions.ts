"use server";

import { revalidatePath } from "next/cache";
import {
  createManagerProxyIntake,
  type ManagerProxyIntakeInput,
} from "@/lib/ticket-manager-api";
import { ApiError, ApiPayloadError } from "@/lib/server-api";
import { requireUser } from "@/lib/session";

export type ProxyIntakeActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createManagerProxyIntakeAction(
  input: ManagerProxyIntakeInput,
): Promise<ProxyIntakeActionResult> {
  await requireUser("LANDLORD", "/manager/ticket/dash/00?view=management");

  try {
    await createManagerProxyIntake({
      ...input,
      roomId: input.roomId.trim(),
      tenantId: input.tenantId?.trim() || undefined,
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim(),
      occurredAt: input.occurredAt?.trim() || undefined,
      availableTimes: input.availableTimes?.trim() || undefined,
      attachmentUrls: input.attachmentUrls
        ?.map((url) => url.trim())
        .filter(Boolean),
    });
    revalidatePath("/manager/ticket/dash/00");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError || error instanceof ApiPayloadError) {
      return { ok: false, error: error.message };
    }
    console.error("[manager/proxy-intake] 접수 실패:", error);
    return { ok: false, error: "대리 접수를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
