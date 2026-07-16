"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VendorEstimateDraftInput } from "@roomlog/types";
import {
  saveVendorEstimateDraft,
  scheduleVendorWorkflowJob,
  startVendorWorkflowJob,
  submitVendorCompletionReport,
  submitVendorEstimate,
  toSeoulVendorScheduleIso,
  uploadVendorCompletionPhoto,
} from "@/lib/vendor-workflow-api";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("필수 입력값을 확인해 주세요.");
  }
  return value.trim();
}

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(formData: FormData, key: string, label: string) {
  const value = Number(required(formData, key));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}을 확인해 주세요.`);
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 160)
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function errorHref(route: string, repairId: string, error: unknown) {
  const separator = withId(route, repairId).includes("?") ? "&" : "?";
  return `${withId(route, repairId)}${separator}error=${encodeURIComponent(errorMessage(error))}`;
}

function estimateInput(formData: FormData): VendorEstimateDraftInput {
  const responseType = required(formData, "responseType");
  if (responseType === "DECLINED") {
    return { responseType, declineReason: required(formData, "declineReason") };
  }
  if (responseType === "VISIT_REQUIRED") {
    return {
      responseType,
      visitAvailableAt: toSeoulVendorScheduleIso(required(formData, "visitAvailableAt")),
      workDescription: required(formData, "workDescription"),
    };
  }
  if (responseType !== "FIXED_ESTIMATE") throw new Error("회신 유형을 확인해 주세요.");

  const lineItems: Extract<VendorEstimateDraftInput, { responseType: "FIXED_ESTIMATE" }>["lineItems"] = [];
  for (const suffix of ["1", "2"]) {
    const description = optional(formData, `lineDescription${suffix}`);
    const rawAmount = optional(formData, `lineAmount${suffix}`);
    if (!description && !rawAmount) continue;
    if (!description) throw new Error("견적 항목명을 입력해 주세요.");
    const unitAmount = Number(rawAmount);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error("견적 항목 금액을 확인해 주세요.");
    }
    lineItems.push({
      category: suffix === "1" ? "MATERIAL" : "LABOR",
      description,
      quantity: 1,
      unitAmount,
    });
  }
  if (lineItems.length === 0) throw new Error("견적 항목을 한 개 이상 입력해 주세요.");
  return {
    responseType,
    workDescription: required(formData, "workDescription"),
    estimatedDurationMinutes: positiveNumber(formData, "estimatedDurationMinutes", "예상 작업 시간"),
    lineItems,
  };
}

export async function saveEstimateAction(formData: FormData) {
  const repairId = required(formData, "repairId");
  const intent = optional(formData, "intent") || "SAVE";
  try {
    const estimate = await saveVendorEstimateDraft(
      repairId,
      estimateInput(formData),
      optional(formData, "estimateId") || undefined,
    );
    if (intent === "SUBMIT") {
      await submitVendorEstimate(repairId, estimate.id);
      revalidatePath(withId(ROUTES["V-JOB-03"], repairId));
      redirect(withId(ROUTES["V-JOB-03"], repairId));
    }
    revalidatePath(withId(ROUTES["V-JOB-02"], repairId));
    redirect(`${withId(ROUTES["V-JOB-02"], repairId)}&saved=1`);
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect(errorHref(ROUTES["V-JOB-02"], repairId, error));
  }
}

export async function scheduleJobAction(formData: FormData) {
  const repairId = required(formData, "repairId");
  try {
    await scheduleVendorWorkflowJob(repairId, {
      scheduledAt: toSeoulVendorScheduleIso(required(formData, "scheduledAt")),
    });
    revalidatePath(withId(ROUTES["V-JOB-05"], repairId));
    redirect(withId(ROUTES["V-JOB-05"], repairId));
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect(errorHref(ROUTES["V-JOB-04"], repairId, error));
  }
}

export async function startJobAction(formData: FormData) {
  const repairId = required(formData, "repairId");
  try {
    await startVendorWorkflowJob(repairId);
    revalidatePath(withId(ROUTES["V-JOB-06"], repairId));
    redirect(withId(ROUTES["V-JOB-06"], repairId));
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect(errorHref(ROUTES["V-JOB-05"], repairId, error));
  }
}

export async function submitCompletionAction(formData: FormData) {
  const repairId = required(formData, "repairId");
  try {
    const files = formData.getAll("photos").filter(
      (value): value is File => value instanceof File && value.size > 0,
    );
    if (files.length === 0) throw new Error("완료 사진을 한 장 이상 첨부해 주세요.");
    if (files.length > 6) throw new Error("완료 사진은 최대 6장까지 첨부할 수 있습니다.");
    const uploaded = [] as Array<{ attachmentId: string }>;
    for (const file of files) {
      uploaded.push(await uploadVendorCompletionPhoto(repairId, file));
    }
    await submitVendorCompletionReport(repairId, {
      workSummary: required(formData, "workSummary"),
      completedAt: new Date().toISOString(),
      attachmentIds: uploaded.map(({ attachmentId }) => attachmentId),
      submissionKey: randomUUID(),
    });
    revalidatePath(withId(ROUTES["V-JOB-03"], repairId));
    redirect(`${withId(ROUTES["V-JOB-03"], repairId)}&reported=1`);
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    redirect(errorHref(ROUTES["V-JOB-06"], repairId, error));
  }
}
