"use client";

import { useState } from "react";
import type { VendorJobEstimateView } from "@roomlog/types";
import { Button, Card, Input } from "@roomlog/ui";
import { saveEstimateAction } from "../actions";
import { labelStyle, mutedStyle } from "../_components";

type ResponseType = "FIXED_ESTIMATE" | "VISIT_REQUIRED" | "DECLINED";

const estimateDetailPlaceholder =
  "예: 출장비 5만원, 작업비 10만원, 자재비 10만원\n배수로가 막혀서 해당 부분 제거하고 새 부품으로 교체했습니다.";

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

const compactLabelStyle = {
  ...labelStyle,
  display: "block",
  marginBottom: 4,
} as const;

function parsedAmount(value: string) {
  const amount = Number(value.trim());
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function won(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function toSeoulDateTimeLocal(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  const localValue = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue) ? localValue : undefined;
}

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
  const [amountInput, setAmountInput] = useState(() =>
    estimate?.totalAmount ? String(estimate.totalAmount) : "",
  );
  const totalAmount = parsedAmount(amountInput);

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
          <div style={labelStyle}>견적</div>
          <label>
            <span style={compactLabelStyle}>견적 금액(원)</span>
            <Input
              name="totalAmount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="예: 250000"
              disabled={readOnly}
              required
            />
          </label>
          <div
            aria-live="polite"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: 12,
              borderRadius: "var(--radius-md)",
              background: "var(--primary-container)",
              color: "var(--on-primary-container)",
            }}
          >
            <strong>총 견적</strong>
            <strong>{won(totalAmount)}</strong>
          </div>
          <label>
            <span style={compactLabelStyle}>견적 내용</span>
            <textarea
              name="workDescription"
              placeholder={estimateDetailPlaceholder}
              defaultValue={estimate?.workDescription}
              disabled={readOnly}
              required
              style={{ ...fieldStyle, minHeight: 160 }}
            />
          </label>
          <p style={{ ...mutedStyle, margin: 0 }}>
            금액 구성(출장비·작업비·자재비)과 작업 내용을 한 칸에 자유롭게 적어 주세요.
          </p>
        </Card>
      ) : null}

      {responseType === "VISIT_REQUIRED" ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>방문 가능 일정</div>
          <Input
            name="visitAvailableAt"
            type="datetime-local"
            defaultValue={toSeoulDateTimeLocal(estimate?.visitAvailableAt)}
            disabled={readOnly}
          />
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
