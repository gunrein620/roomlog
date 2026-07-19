"use client";

import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ManagerCopilotPendingAction } from "@roomlog/types";

export interface ManagerAssistantActionCardProps {
  action: ManagerCopilotPendingAction;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onReviseDunning?: (messageText: string, channel: string) => void | Promise<void>;
}

export function ManagerAssistantActionCard({
  action,
  busy = false,
  onConfirm,
  onCancel,
  onReviseDunning,
}: ManagerAssistantActionCardProps) {
  const preview = action.dunningPreview;
  const confirmLabel = action.kind === "billing.send_dunning" ? "독촉 발송" : "메시지 발송";
  const [editing, setEditing] = useState(false);
  const [messageText, setMessageText] = useState(preview?.messageText ?? "");

  useEffect(() => {
    setEditing(false);
    setMessageText(preview?.messageText ?? "");
  }, [action.id, preview?.messageText]);

  async function applyRevision() {
    const normalized = messageText.trim();
    if (!preview || !onReviseDunning || !normalized || busy) return;
    await onReviseDunning(normalized, preview.channel);
  }

  return (
    <section className="manager-assistant-action-card" aria-label="AI 비서 발송 확인">
      <div className="manager-assistant-action-card__heading">
        <span className="manager-assistant-action-card__eyebrow">발송 전 확인</span>
        <strong className="manager-assistant-action-card__title">{action.summary}</strong>
      </div>

      {preview ? (
        <>
          <dl className="manager-assistant-action-card__detail-grid">
            <Detail
              label="대상"
              value={`${preview.buildingName ? `${preview.buildingName} · ` : ""}${preview.unitId}호 · ${preview.tenantName}`}
            />
            <Detail label="청구월" value={preview.billingMonth} />
            <Detail label="미납금" value={`${preview.unpaidAmount.toLocaleString("ko-KR")}원`} />
            <Detail label="납부기한" value={preview.dueDate} />
            <Detail label="경과" value={`${preview.daysOverdue}일`} />
            <Detail label="채널" value={preview.channel} />
          </dl>

          <label className="manager-assistant-action-card__message-field">
            <span>발송 문구</span>
            {editing ? (
              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                disabled={busy}
                rows={5}
                className="manager-assistant-action-card__message-editor"
              />
            ) : (
              <span className="manager-assistant-action-card__message-preview">{preview.messageText}</span>
            )}
          </label>
        </>
      ) : null}

      <div className="manager-assistant-action-card__actions">
        {editing ? (
          <>
            <button
              type="button"
              onClick={applyRevision}
              disabled={busy || !messageText.trim()}
              className="manager-assistant-action-card__button manager-assistant-action-card__button--primary"
            >
              <Check size={16} aria-hidden="true" />
              수정 내용 반영
            </button>
            <button
              type="button"
              onClick={() => {
                setMessageText(preview?.messageText ?? "");
                setEditing(false);
              }}
              disabled={busy}
              className="manager-assistant-action-card__button manager-assistant-action-card__button--secondary"
            >
              편집 취소
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="manager-assistant-action-card__button manager-assistant-action-card__button--primary"
            >
              <Check size={16} aria-hidden="true" />
              {confirmLabel}
            </button>
            {preview && onReviseDunning ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="manager-assistant-action-card__button manager-assistant-action-card__button--secondary"
              >
                <Pencil size={16} aria-hidden="true" />
                내용 수정
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="manager-assistant-action-card__button manager-assistant-action-card__button--secondary"
            >
              <X size={16} aria-hidden="true" />
              취소
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="manager-assistant-action-card__detail">
      <dt className="manager-assistant-action-card__detail-label">{label}</dt>
      <dd className="manager-assistant-action-card__detail-value">{value}</dd>
    </div>
  );
}
