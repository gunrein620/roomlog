"use server";

import { redirect } from "next/navigation";
import type { Urgency } from "@roomlog/types";
import { createDefectComplaint } from "@/lib/defect-api";
import { requireUser } from "@/lib/session";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createDefectComplaintAction(formData: FormData) {
  await requireUser("TENANT", "/tenant/defect/01");
  const content = formString(formData, "content");
  const location = formString(formData, "location");
  const occurredAtInput = formString(formData, "occurredAt");
  const recurring = formString(formData, "recurring");
  const availableTimes = formString(formData, "availableTimes");
  const urgencyInput = formString(formData, "urgency");
  const urgency = urgencyInput ? Number(urgencyInput) : undefined;

  if (!content) throw new Error("하자 내용을 입력해 주세요.");
  if (!location) throw new Error("발생 위치를 입력해 주세요.");
  if (!occurredAtInput || Number.isNaN(new Date(occurredAtInput).getTime())) {
    throw new Error("발생 시점을 확인해 주세요.");
  }
  if (urgency !== undefined && ![1, 2, 3, 4].includes(urgency)) {
    throw new Error("긴급도는 1부터 4 사이로 선택해 주세요.");
  }

  const result = await createDefectComplaint({
    title: content.slice(0, 80),
    description: [
      content,
      recurring === "yes" ? "같은 문제가 반복해서 발생합니다." : undefined,
    ].filter(Boolean).join("\n"),
    location,
    occurredAt: new Date(occurredAtInput).toISOString(),
    availableTimes: availableTimes || undefined,
    urgency: urgency as Urgency | undefined,
  });

  redirect(`/tenant/defect/02?id=${encodeURIComponent(result.complaint.id)}`);
}
