"use client";

import { useEffect, useRef } from "react";
import type { TicketThreadMessage } from "@roomlog/types";
import { Button, Card } from "@roomlog/ui";
import { ManagerMutationForm } from "../../../_components/ManagerMutationForm";
import type { ManagerMutationAction } from "../../../_components/manager-mutation-state";
import { managerTicketMessageSenderLabel } from "../../_components/ticket-manager-ui";

function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ManagerTicketChat({
  ticketId,
  messages,
  action,
}: {
  ticketId: string;
  messages: TicketThreadMessage[];
  action: ManagerMutationAction;
}) {
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages.length]);

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div>
        <div style={{ fontWeight: 700 }}>진행 메시지</div>
        <div
          style={{
            marginTop: "var(--space-xs)",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
          }}
        >
          세입자·업체와 방문 시간과 준비사항을 바로 조율합니다.
        </div>
      </div>

      <div
        ref={threadRef}
        aria-label="티켓 진행 메시지"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
          maxHeight: "calc(var(--touch-target) * 7)",
          overflowY: "auto",
          padding: "var(--space-xs)",
          scrollBehavior: "smooth",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
            아직 진행 메시지가 없습니다.
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderRole === "LANDLORD";
            return (
              <div
                key={message.id}
                style={{
                  alignSelf: mine ? "flex-end" : "stretch",
                  width: mine ? "88%" : "100%",
                  boxSizing: "border-box",
                  padding: "var(--space-sm)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  background: mine
                    ? "var(--primary-container)"
                    : "var(--surface-container)",
                  color: mine
                    ? "var(--on-primary-container)"
                    : "var(--on-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-sm)",
                    fontSize: "var(--fs-caption)",
                    fontWeight: 700,
                  }}
                >
                  <span>{managerTicketMessageSenderLabel(message.senderRole)}</span>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </div>
                <p
                  style={{
                    margin: "var(--space-xs) 0 0",
                    whiteSpace: "pre-wrap",
                    lineHeight: "var(--lh-body)",
                  }}
                >
                  {message.messageText}
                </p>
              </div>
            );
          })
        )}
      </div>

      <ManagerMutationForm action={action}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <label
            htmlFor="manager-ticket-message"
            style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}
          >
            새 메시지
          </label>
          <textarea
            id="manager-ticket-message"
            name="messageText"
            required
            maxLength={1000}
            rows={3}
            placeholder="세입자와 업체에 전달할 내용을 입력하세요."
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              padding: "var(--space-sm)",
              border: "1px solid var(--input-border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-container-lowest)",
              color: "var(--on-surface)",
              font: "inherit",
              lineHeight: "var(--lh-body)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit">보내기</Button>
          </div>
        </div>
      </ManagerMutationForm>
    </Card>
  );
}
