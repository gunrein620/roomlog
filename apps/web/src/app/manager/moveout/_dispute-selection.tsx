"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Dispute } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";

const statusLabel: Record<Dispute["status"], string> = {
  received: "접수",
  reviewing: "검토중",
  answered: "관리자 응답",
  confirmed: "임차인 확인",
  re_disputed: "재이의",
  resolved: "해소",
};

export function DisputeSelectionList({
  disputes,
  moveoutId,
  selectedDisputeId,
}: {
  disputes: Dispute[];
  moveoutId: string;
  selectedDisputeId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectDispute(disputeId: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("id", moveoutId);
    query.set("selectedDisputeId", disputeId);
    query.delete("sent");
    query.delete("error");
    router.push(`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?${query.toString()}`);
  }

  if (disputes.length === 0) {
    return <Card style={{ color: "var(--on-surface-variant)" }}>처리할 이의가 없습니다.</Card>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {disputes.map((dispute) => {
        const selected = dispute.id === selectedDisputeId;

        return (
          <label
            key={dispute.id}
            style={{
              ...selectionCardStyle,
              border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: selected ? "var(--surface-container-high)" : "var(--surface-container-lowest)",
            }}
          >
            <input
              type="checkbox"
              name="selectedDisputeId"
              value={dispute.id}
              checked={dispute.id === selectedDisputeId}
              onChange={(event) => {
                if (event.target.checked) {
                  selectDispute(dispute.id);
                }
              }}
              style={checkboxStyle}
            />
            <span style={contentStyle}>
              <span style={titleRowStyle}>
                <span style={{ fontWeight: 850 }}>{dispute.targetLabel}</span>
                <span style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Badge emphasis={dispute.status !== "resolved" && dispute.status !== "confirmed"}>
                    {statusLabel[dispute.status]}
                  </Badge>
                  <Badge emphasis={dispute.slaBreached}>
                    {dispute.slaBreached ? "SLA 경과" : `SLA ${dispute.slaDeadline.slice(0, 10)}`}
                  </Badge>
                </span>
              </span>
              <span style={reasonStyle}>{dispute.reason}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const selectionCardStyle = {
  minHeight: "calc(var(--touch-target) * 1.45)",
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: "var(--space-sm)",
  alignItems: "center",
  borderRadius: "var(--radius-md)",
  padding: "var(--card-padding)",
  cursor: "pointer",
} as const;

const checkboxStyle = {
  width: 24,
  height: 24,
  accentColor: "var(--primary)",
} as const;

const contentStyle = {
  minWidth: 0,
  display: "grid",
  gap: "var(--space-xs)",
} as const;

const titleRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-md)",
  flexWrap: "wrap",
} as const;

const reasonStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
} as const;
