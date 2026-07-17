"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitResponsibilityFeedback } from "@/lib/defect-api";
import { createTenantThread } from "@/lib/messaging-api";
import { requireUser } from "@/lib/session";
import {
  tenantLandlordThreadHref,
  tenantLandlordThreadInput,
} from "@/lib/tenant-landlord-conversation";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function submitResponsibilityFeedbackAction(formData: FormData) {
  const complaintId = formString(formData, "complaintId");
  const reason = formString(formData, "reason");
  await requireUser("TENANT", `/tenant/defect/11?id=${encodeURIComponent(complaintId)}`);

  if (!complaintId) throw new Error("신고를 확인해 주세요.");
  if (!reason) throw new Error("책임 판단 이의제기 사유를 입력해 주세요.");

  await submitResponsibilityFeedback(complaintId, {
    reason,
    requestedAction: "관리자가 책임 판단 근거를 다시 검토해 주세요.",
  });
  const detailPath = `/tenant/defect/11?id=${encodeURIComponent(complaintId)}`;
  revalidatePath(detailPath);
  redirect(`${detailPath}&appealed=1`);
}

export async function openManagerConversationAction(formData: FormData) {
  const roomId = formString(formData, "roomId") || undefined;
  await requireUser("TENANT", "/tenant/defect/11");
  const thread = await createTenantThread(tenantLandlordThreadInput("", roomId));
  redirect(tenantLandlordThreadHref(thread.id));
}
