"use client";

import { useState } from "react";
import type { ContractPrivacy, DeletionState } from "@roomlog/types";
import { Badge, Button } from "@roomlog/ui";

// T-DOC-04 본문 상호작용 — 마스킹 토글 · 전달 동의 철회 · 삭제 요청 게이트(SLA 고지).
// 정직 표기: 삭제는 3상태(완료/제한 보관/불가). 종료 전 삭제 비활성.

const DELETION_RESULT_LABEL: Record<DeletionState, string> = {
  none: "",
  requested: "삭제 요청 접수됨 — 처리 대기",
  completed: "삭제 완료",
  limited: "제한 보관 (보관 예외 항목 유지)",
  denied: "삭제 불가 (법정 보관 기간)",
};

const sectionLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export function PrivacyPanel({ privacy }: { privacy: ContractPrivacy }) {
  const [masking, setMasking] = useState(privacy.maskingEnabled);
  const [forwarding, setForwarding] = useState(privacy.forwardingConsent);
  const [deletion, setDeletion] = useState<DeletionState>(privacy.deletion);
  const [gateOpen, setGateOpen] = useState(false);

  return (
    <>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ① 마스킹 토글 */}
        <section>
          <div style={sectionLabel}>마스킹</div>
          <ToggleRow
            label="상세주소·계좌·연락처 가리기"
            on={masking}
            onToggle={() => setMasking((v) => !v)}
          />
        </section>

        {/* ② 보관기간 정책 — 무엇이·왜·언제까지 (정직 고지) */}
        <section>
          <div style={sectionLabel}>보관 항목·기간</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {privacy.retention.map((r) => (
              <div
                key={r.label}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  background: "var(--surface-container-lowest)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>
                  {r.reason} · <b>{r.until}</b>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ③ 업체 전달 동의 현황·철회 */}
        <section>
          <div style={sectionLabel}>업체 전달 동의</div>
          <ToggleRow
            label={forwarding ? "전달 동의 중 (탭하여 철회)" : "전달 동의 없음"}
            on={forwarding}
            onToggle={() => setForwarding((v) => !v)}
          />
        </section>

        {/* ④ 삭제 요청 영역 (종료 전 비활성) */}
        <section>
          <div style={sectionLabel}>계약서 삭제</div>
          {deletion !== "none" ? (
            <div
              style={{
                border: "1.5px solid var(--outline)",
                borderRadius: "var(--radius-md)",
                padding: 12,
                background: "var(--surface-container-high)",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              {DELETION_RESULT_LABEL[deletion]}
            </div>
          ) : privacy.deletable ? (
            gateOpen ? (
              /* 인-스크린 확인 게이트: 보관 예외 고지 → 제출, 처리 SLA */
              <div
                style={{
                  border: "1.5px solid var(--primary)",
                  borderRadius: "var(--radius-md)",
                  padding: 13,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: "var(--surface-container-low)",
                }}
              >
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  일부 항목은 정산·분쟁 대비로 <b>제한 보관</b>될 수 있어요. 삭제 결과는 완료 /
                  제한 보관 / 불가 중 하나로 정직하게 안내되며,{" "}
                  {privacy.deletionSlaHours ?? 72}시간 내 처리해요.
                </div>
                <Button fullWidth onClick={() => setDeletion("requested")}>
                  삭제 요청 제출
                </Button>
                <button
                  type="button"
                  onClick={() => setGateOpen(false)}
                  style={{
                    fontSize: 12,
                    color: "var(--on-surface-variant)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
              </div>
            ) : (
              <Button fullWidth onClick={() => setGateOpen(true)}>
                계약서 삭제 요청
              </Button>
            )
          ) : (
            <div
              style={{
                border: "1px dashed var(--outline-variant)",
                borderRadius: "var(--radius-md)",
                padding: 12,
                fontSize: 12,
                color: "var(--on-surface-variant)",
                lineHeight: 1.5,
              }}
            >
              계약이 종료된 후에 삭제를 요청할 수 있어요. 현재는 계약 유효 기간이에요.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-container-lowest)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <Badge emphasis={on} style={{ fontSize: 11 }}>
        {on ? "켜짐" : "꺼짐"}
      </Badge>
    </button>
  );
}
