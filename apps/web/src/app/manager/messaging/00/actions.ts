"use server";

import { redirect } from "next/navigation";
import { startManagerConversation } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";

export interface StartConversationActionState {
  error?: string;
}

export async function startManagerConversationAction(
  _previous: StartConversationActionState,
  formData: FormData,
): Promise<StartConversationActionState> {
  const roomId = String(formData.get("roomId") ?? "").trim();
  const tenantId = String(formData.get("tenantId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!roomId || !tenantId) {
    return { error: "대화할 계약 세입자를 선택해주세요." };
  }
  if (!body) {
    return { error: "첫 메시지를 입력해주세요." };
  }

  let thread;
  try {
    thread = await startManagerConversation({ roomId, tenantId, body });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }

    return {
      error: error instanceof ApiError
        ? error.message
        : "대화 시작 서버에 연결할 수 없습니다.",
    };
  }

  redirect(`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?id=${encodeURIComponent(thread.id)}`);
}
