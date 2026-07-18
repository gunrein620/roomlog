"use client";

import { useRef, useState } from "react";
import type {
  VendorEstimateDraftLineItemCategory,
  VendorJobEstimateView,
} from "@roomlog/types";
import { Button, Card, Input } from "@roomlog/ui";
import { saveEstimateAction } from "../actions";
import { labelStyle, mutedStyle } from "../_components";

type ResponseType = "FIXED_ESTIMATE" | "VISIT_REQUIRED" | "DECLINED";
type EditableLineItem = {
  key: string;
  category: VendorEstimateDraftLineItemCategory;
  description: string;
  quantity: string;
  unitAmount: string;
};
type EditableLineItemField = "category" | "description" | "quantity" | "unitAmount";

const categoryOptions: Array<{
  value: VendorEstimateDraftLineItemCategory;
  label: string;
}> = [
  { value: "VISIT", label: "출장비" },
  { value: "LABOR", label: "작업비" },
  { value: "MATERIAL", label: "자재비" },
];

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

const selectStyle = {
  width: "100%",
  height: "var(--touch-target)",
  boxSizing: "border-box",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--input-text)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
  padding: "0 14px",
} as const;

function blankLineItem(key: string): EditableLineItem {
  return {
    key,
    category: "LABOR",
    description: "",
    quantity: "1",
    unitAmount: "",
  };
}

function amountFor(lineItem: EditableLineItem) {
  const quantity = Number(lineItem.quantity);
  const unitAmount = Number(lineItem.unitAmount);
  const amount = quantity * unitAmount;
  return Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    Number.isSafeInteger(unitAmount) &&
    unitAmount > 0 &&
    Number.isSafeInteger(amount)
    ? amount
    : 0;
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
  const nextLineItemKey = useRef(Math.max(1, estimate?.lineItems.length ?? 0));
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(() =>
    estimate?.lineItems.length
      ? estimate.lineItems.map((lineItem) => ({
          key: lineItem.id,
          category: lineItem.category === "LEGACY_TOTAL" ? "LABOR" : lineItem.category,
          description: lineItem.description,
          quantity: String(lineItem.quantity),
          unitAmount: String(lineItem.unitAmount),
        }))
      : [blankLineItem("new-0")],
  );
  const totalAmount = lineItems.reduce((sum, lineItem) => sum + amountFor(lineItem), 0);

  function updateLineItem<Field extends EditableLineItemField>(
    key: string,
    field: Field,
    value: EditableLineItem[Field],
  ) {
    setLineItems((current) =>
      current.map((lineItem) =>
        lineItem.key === key ? { ...lineItem, [field]: value } : lineItem,
      ),
    );
  }

  function addLineItem() {
    if (readOnly) return;
    const key = `new-${nextLineItemKey.current}`;
    nextLineItemKey.current += 1;
    setLineItems((current) => [...current, blankLineItem(key)]);
  }

  function removeLineItem(key: string) {
    if (readOnly) return;
    setLineItems((current) =>
      current.length > 1 ? current.filter((lineItem) => lineItem.key !== key) : current,
    );
  }

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
          {lineItems.map((lineItem, index) => (
            <div
              key={lineItem.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-container-low)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: "var(--fs-caption)" }}>항목 {index + 1}</strong>
                <span style={{ ...mutedStyle, fontWeight: 700 }}>항목 합계 {won(amountFor(lineItem))}</span>
              </div>
              <label>
                <span style={compactLabelStyle}>카테고리</span>
                <select
                  name="lineCategory"
                  value={lineItem.category}
                  onChange={(event) =>
                    updateLineItem(
                      lineItem.key,
                      "category",
                      event.target.value as VendorEstimateDraftLineItemCategory,
                    )
                  }
                  disabled={readOnly}
                  required
                  style={selectStyle}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={compactLabelStyle}>항목명</span>
                <Input
                  name="lineDescription"
                  value={lineItem.description}
                  onChange={(event) => updateLineItem(lineItem.key, "description", event.target.value)}
                  placeholder="예: 주방 수전 교체 작업"
                  disabled={readOnly}
                  required
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 1.3fr)", gap: 8 }}>
                <label>
                  <span style={compactLabelStyle}>수량</span>
                  <Input
                    name="lineQuantity"
                    type="number"
                    min="1"
                    step="1"
                    value={lineItem.quantity}
                    onChange={(event) => updateLineItem(lineItem.key, "quantity", event.target.value)}
                    disabled={readOnly}
                    required
                  />
                </label>
                <label>
                  <span style={compactLabelStyle}>단가(원)</span>
                  <Input
                    name="lineUnitAmount"
                    type="number"
                    min="1"
                    step="1"
                    value={lineItem.unitAmount}
                    onChange={(event) => updateLineItem(lineItem.key, "unitAmount", event.target.value)}
                    placeholder="금액"
                    disabled={readOnly}
                    required
                  />
                </label>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeLineItem(lineItem.key)}
                disabled={readOnly || lineItems.length === 1}
                style={{ alignSelf: "flex-end", height: "var(--control-compact-size)", padding: "0 8px" }}
              >
                항목 삭제
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" fullWidth onClick={addLineItem} disabled={readOnly}>
            항목 추가
          </Button>
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
            <span style={compactLabelStyle}>예상 작업 시간(분)</span>
            <Input
              name="estimatedDurationMinutes"
              type="number"
              min="1"
              step="1"
              placeholder="예상 작업 시간(분)"
              defaultValue={estimate?.estimatedDurationMinutes ?? 60}
              disabled={readOnly}
            />
          </label>
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
