"use client";

import { useState } from "react";
import type { VendorJobEstimateView } from "@roomlog/types";
import { Button, Card, Input } from "@roomlog/ui";
import { saveEstimateAction } from "../actions";
import { labelStyle, mutedStyle } from "../_components";

type ResponseType = "FIXED_ESTIMATE" | "VISIT_REQUIRED" | "DECLINED";

const fieldStyle = {
  width: "100%",
  minHeight: 88,
  boxSizing: "border-box",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--input-text)",
  font: "inherit",
  padding: 12,
  resize: "vertical",
} as const;

export function EstimateResponseForm({
  repairId,
  estimate,
  readOnly,
}: {
  repairId: string;
  estimate?: VendorJobEstimateView;
  readOnly: boolean;
}) {
  const [responseType, setResponseType] = useState<ResponseType>(
    estimate?.status === "VISIT_SCHEDULED"
      ? "FIXED_ESTIMATE"
      : estimate?.responseType ?? "FIXED_ESTIMATE",
  );
  const first = estimate?.lineItems[0];
  const second = estimate?.lineItems[1];

  return (
    <form action={saveEstimateAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="repairId" value={repairId} />
      {estimate?.status === "DRAFT" ? (
        <input type="hidden" name="estimateId" value={estimate.id} />
      ) : null}
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={labelStyle}>회신 방식</div>
        {([
          ["FIXED_ESTIMATE", "고정 견적", "금액과 작업 범위를 바로 제안합니다."],
          ["VISIT_REQUIRED", "방문 필요", "현장 확인이 먼저 필요한 작업입니다."],
          ["DECLINED", "진행 불가", "수행할 수 없는 이유를 전달합니다."],
        ] as const).map(([value, title, description]) => (
          <label
            key={value}
            style={{
              display: "flex",
              alignItems: "start",
              gap: 10,
              padding: 11,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: readOnly ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="radio"
              name="responseType"
              value={value}
              checked={responseType === value}
              onChange={() => setResponseType(value)}
              disabled={readOnly}
            />
            <span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
              <span style={mutedStyle}>{description}</span>
            </span>
          </label>
        ))}
      </Card>

      {responseType === "FIXED_ESTIMATE" ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>견적 항목</div>
          <Input name="lineDescription1" placeholder="자재 또는 부품" defaultValue={first?.description} disabled={readOnly} />
          <Input name="lineAmount1" type="number" min="1" placeholder="항목 금액" defaultValue={first?.unitAmount} disabled={readOnly} />
          <Input name="lineDescription2" placeholder="작업비" defaultValue={second?.description} disabled={readOnly} />
          <Input name="lineAmount2" type="number" min="1" placeholder="항목 금액" defaultValue={second?.unitAmount} disabled={readOnly} />
          <Input
            name="estimatedDurationMinutes"
            type="number"
            min="1"
            placeholder="예상 작업 시간(분)"
            defaultValue={estimate?.estimatedDurationMinutes ?? 60}
            disabled={readOnly}
          />
          <textarea
            name="workDescription"
            placeholder="작업 범위와 포함 내용을 적어 주세요."
            defaultValue={estimate?.workDescription}
            disabled={readOnly}
            style={fieldStyle}
          />
        </Card>
      ) : null}

      {responseType === "VISIT_REQUIRED" ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>방문 가능 일정</div>
          <Input name="visitAvailableAt" type="datetime-local" disabled={readOnly} />
          <textarea
            name="workDescription"
            placeholder="현장에서 확인할 항목을 적어 주세요."
            defaultValue={estimate?.workDescription}
            disabled={readOnly}
            style={fieldStyle}
          />
        </Card>
      ) : null}

      {responseType === "DECLINED" ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>진행 불가 사유</div>
          <textarea
            name="declineReason"
            placeholder="관리자가 다른 업체를 찾을 수 있도록 이유를 알려 주세요."
            defaultValue={estimate?.declineReason}
            disabled={readOnly}
            style={fieldStyle}
          />
        </Card>
      ) : null}

      <Button type="submit" name="intent" value="SUBMIT" fullWidth disabled={readOnly}>
        견적 제출
      </Button>
      <Button type="submit" name="intent" value="SAVE" fullWidth variant="secondary" disabled={readOnly}>
        임시 저장
      </Button>
      <p style={{ ...mutedStyle, margin: 0, textAlign: "center" }}>
        제출 후에는 관리자 검토가 시작되며, 수정 요청이 오면 새 버전으로 다시 제출합니다.
      </p>
    </form>
  );
}
