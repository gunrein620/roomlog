"use client";

import { useActionState } from "react";
import type {
  ManagerReplyDraftResult,
  ManagerReplyIntent,
} from "@roomlog/types";
import { Button, Card } from "@roomlog/ui";
import {
  submitManagerReplyAction,
  type ManagerTicketReplyState,
} from "./actions";

const intentOptions: { value: ManagerReplyIntent; label: string }[] = [
  { value: "RECEIPT_ACK", label: "접수 확인" },
  { value: "REQUEST_PHOTO", label: "추가 사진 요청" },
  { value: "REQUEST_DETAILS", label: "상세 정보 요청" },
  { value: "SCHEDULE_VISIT", label: "방문 일정 조율" },
  { value: "ASSIGN_VENDOR_NOTICE", label: "업체 배정 안내" },
  { value: "COMPLETION_NOTICE", label: "완료 안내" },
];

const fieldStyle = {
  width: "100%",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
  padding: "var(--space-md)",
} as const;

export function ManagerTicketReplyForm({
  ticketId,
  initialDraft,
}: {
  ticketId: string;
  initialDraft: ManagerReplyDraftResult;
}) {
  const initialState: ManagerTicketReplyState = {
    draft: initialDraft,
    note: "",
    messageText: initialDraft.messageText,
    formKey: initialDraft.generatedAt,
  };
  const [state, formAction, pending] = useActionState(
    submitManagerReplyAction,
    initialState,
  );

  return (
    <form
      key={state.formKey}
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <span style={{ color: "var(--on-surface-variant)", fontWeight: 700 }}>
            답변 유형
          </span>
          <select name="intent" defaultValue={state.draft.intent} style={fieldStyle}>
            {intentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <span style={{ color: "var(--on-surface-variant)", fontWeight: 700 }}>
            관리자 메모
          </span>
          <input
            name="note"
            defaultValue={state.note}
            placeholder="초안에 반영할 내용을 입력하세요."
            style={fieldStyle}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <span style={{ color: "var(--on-surface-variant)", fontWeight: 700 }}>
            답변 내용
          </span>
          <textarea
            name="messageText"
            defaultValue={state.messageText}
            rows={12}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
          발송 채널: {state.draft.deliveryChannels.join(", ")}
        </div>
        {state.draft.warnings.map((warning) => (
          <div
            key={warning}
            style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}
          >
            {warning}
          </div>
        ))}
        {state.error ? (
          <div
            role="alert"
            style={{
              padding: "var(--space-sm)",
              borderRadius: "var(--radius-sm)",
              background: "var(--error-container)",
              color: "var(--on-error-container)",
            }}
          >
            {state.error}
          </div>
        ) : null}
      </Card>

      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <Button type="submit" name="operation" value="send" disabled={pending}>
          {pending ? "처리 중..." : "수정 후 발송"}
        </Button>
        <Button
          type="submit"
          name="operation"
          value="regenerate"
          variant="secondary"
          disabled={pending}
        >
          초안 다시 생성
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => window.history.back()}
          disabled={pending}
        >
          뒤로
        </Button>
      </div>
    </form>
  );
}
