"use client";

import { useActionState } from "react";
import { Button } from "@roomlog/ui";
import {
  sendAnnouncementAction,
  type SendAnnouncementActionState,
} from "./actions";

const initialState: SendAnnouncementActionState = {};

export function AnnouncementSendForm({
  draftId,
  canSend,
}: {
  draftId: string;
  canSend: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    sendAnnouncementAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="draftId" value={draftId} />
      {state.error ? (
        <div
          role="alert"
          style={{
            marginBottom: "var(--space-sm)",
            padding: "var(--space-sm)",
            borderRadius: "var(--radius-sm)",
            background: "var(--error-container)",
            color: "var(--on-error-container)",
            fontSize: "var(--fs-caption)",
            lineHeight: 1.5,
          }}
        >
          {state.error}
        </div>
      ) : null}
      <Button type="submit" fullWidth disabled={!canSend || pending}>
        {pending ? "발송 중..." : "승인하고 발송"}
      </Button>
    </form>
  );
}
