"use server";

import { redirect } from "next/navigation";
import { sendAnnouncementDraft } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";

export interface SendAnnouncementActionState {
  error?: string;
}

export async function sendAnnouncementAction(
  _previousState: SendAnnouncementActionState,
  formData: FormData,
): Promise<SendAnnouncementActionState> {
  const draftId = String(formData.get("draftId") ?? "").trim();

  if (!draftId) {
    return { error: "발송할 공지 초안을 찾을 수 없습니다." };
  }

  let result;
  try {
    result = await sendAnnouncementDraft(draftId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }

    return {
      error:
        error instanceof ApiError
          ? error.message
          : "공지 발송 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  redirect(
    `${MANAGER_MESSAGING_ROUTES["M-MSG-03"]}?id=${encodeURIComponent(result.announcementId)}`,
  );
}
