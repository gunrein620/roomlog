"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ManagerMessagingRecipient } from "@roomlog/types";
import { Button } from "@roomlog/ui";
import {
  conversationRecipientKey,
  findConversationRecipient,
  recipientsForBuilding,
} from "@/lib/manager-conversation-state";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import {
  startManagerConversationAction,
  type StartConversationActionState,
} from "./actions";

const initialActionState: StartConversationActionState = {};

const fieldStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const controlStyle = {
  width: "100%",
  minHeight: "var(--touch-target)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  padding: "0 var(--space-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  font: "inherit",
} as const;

export function NewConversationForm({
  recipients,
  initialBuilding,
}: {
  recipients: ManagerMessagingRecipient[];
  initialBuilding: string;
}) {
  const firstBuilding = recipients.some((recipient) => recipient.buildingName === initialBuilding)
    ? initialBuilding
    : recipients[0]?.buildingName ?? "";
  const firstRecipient = recipientsForBuilding(recipients, firstBuilding)[0];
  const [selectedBuilding, setSelectedBuilding] = useState(firstBuilding);
  const [selectedKey, setSelectedKey] = useState(
    firstRecipient ? conversationRecipientKey(firstRecipient) : "",
  );
  const [state, formAction, pending] = useActionState(
    startManagerConversationAction,
    initialActionState,
  );
  const buildings = Array.from(new Set(recipients.map((recipient) => recipient.buildingName)));
  const availableRecipients = recipientsForBuilding(recipients, selectedBuilding);
  const selectedRecipient = findConversationRecipient(recipients, selectedKey);
  const selectedRecipientLabel = selectedRecipient
    ? `${selectedRecipient.buildingName} · ${selectedRecipient.unitId}호 · ${selectedRecipient.tenantName}`
    : "대상 없음";

  function changeBuilding(buildingName: string) {
    const nextRecipients = recipientsForBuilding(recipients, buildingName);
    setSelectedBuilding(buildingName);
    setSelectedKey(nextRecipients[0] ? conversationRecipientKey(nextRecipients[0]) : "");
  }

  if (recipients.length === 0) {
    return (
      <section
        className="manager-messaging-new-conversation"
        aria-label="새 대화"
        style={{
          color: "var(--on-surface-variant)",
        }}
      >
        <strong style={{ color: "var(--on-surface)" }}>새 대화</strong>
        <p style={{ marginBottom: 0 }}>계약 연결된 세입자가 없습니다.</p>
      </section>
    );
  }

  return (
    <section
      className="manager-messaging-new-conversation"
      aria-label="새 대화"
      style={{
        display: "grid",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: "var(--fs-body)", fontWeight: 900 }}>새 대화</h2>
        <p
          style={{
            margin: "var(--space-xs) 0 0",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
            lineHeight: 1.5,
          }}
        >
          계약 연결된 세입자에게 바로 일반 대화를 시작합니다.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-sm)" }}>
        <label style={fieldStyle}>
          계약 건물
          <select
            aria-label="새 대화 계약 건물"
            value={selectedBuilding}
            onChange={(event) => changeBuilding(event.target.value)}
            style={controlStyle}
          >
            {buildings.map((building) => (
              <option key={building} value={building}>
                {building}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          호실 · 세입자
          <select
            aria-label="새 대화 계약 세입자"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
            style={controlStyle}
          >
            {availableRecipients.map((recipient) => {
              const key = conversationRecipientKey(recipient);
              return (
                <option key={key} value={key}>
                  {recipient.unitId}호 · {recipient.tenantName}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="manager-messaging-compose-summary" aria-live="polite">
        <span>선택 대상</span>
        <strong>{selectedRecipientLabel}</strong>
        <small>
          {selectedRecipient?.existingGeneralThreadId
            ? "기존 일반 대화가 있습니다."
            : "새 일반 대화를 시작합니다."}
        </small>
      </div>

      {selectedRecipient?.existingGeneralThreadId ? (
        <Link
          href={`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?id=${encodeURIComponent(selectedRecipient.existingGeneralThreadId)}`}
          style={{
            minHeight: "var(--touch-target)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-btn)",
            background: "var(--primary)",
            color: "var(--on-primary)",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          기존 대화 열기
        </Link>
      ) : (
        <form action={formAction} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <input type="hidden" name="roomId" value={selectedRecipient?.roomId ?? ""} />
          <input type="hidden" name="tenantId" value={selectedRecipient?.tenantId ?? ""} />
          <label style={fieldStyle}>
            첫 메시지
            <textarea
              name="body"
              aria-label="첫 메시지"
              placeholder="세입자에게 보낼 첫 메시지를 입력해주세요."
              required
              rows={2}
              style={{
                ...controlStyle,
                padding: "var(--space-md)",
                resize: "vertical",
              }}
            />
          </label>
          {state.error ? (
            <div role="alert" style={{ color: "var(--error)", fontSize: "var(--fs-caption)" }}>
              {state.error}
            </div>
          ) : null}
          <Button type="submit" disabled={pending || !selectedRecipient}>
            {pending ? "대화 시작 중..." : "대화 시작"}
          </Button>
        </form>
      )}
    </section>
  );
}
