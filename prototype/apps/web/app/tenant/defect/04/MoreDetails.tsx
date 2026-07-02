"use client";

import { useState } from "react";

// T-DEF-04 더보기(접기) — 근거·입주 전 비교·이의제기·신뢰도. 1차 핵심 3개 아래로 미룸.
// D27: 입주 기록 없으면 '공백 ≠ 책임 추정' 중립 안내 + 임대인 입증책임 유지.

const rowStyle = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  color: "var(--on-surface-variant)",
} as const;

export function MoreDetails({
  reasoning,
  confidence,
  moveinComparisonAvailable,
}: {
  reasoning: string[];
  confidence: number;
  moveinComparisonAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid var(--outline-variant)",
          borderRadius: 8,
          background: "var(--surface-container-lowest)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--on-surface-variant)",
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        {open ? "간단히 보기" : "근거·신뢰도 더보기"}
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <div style={rowStyle}>
            <div style={{ fontWeight: 700, color: "var(--on-surface)", marginBottom: 6 }}>근거 후보</div>
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              {reasoning.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          {/* 입주 전 사진 비교 — 있을 때만. 없으면 중립 안내(공백 ≠ 책임 추정). */}
          {moveinComparisonAvailable ? (
            <div style={rowStyle}>
              <div style={{ fontWeight: 700, color: "var(--on-surface)", marginBottom: 4 }}>
                입주 전 사진 비교
              </div>
              입주 기록과 대조한 결과를 함께 확인할 수 있어요.
            </div>
          ) : (
            <div style={rowStyle}>
              <div style={{ fontWeight: 700, color: "var(--on-surface)", marginBottom: 4 }}>
                입주 전 기록 없음
              </div>
              입주 기록이 없어 직접 비교는 못 해요. 기록이 없다고 해서 책임이 인정되는 것은 아니며,
              입증 책임은 임대인에게 있어요.
            </div>
          )}

          <div style={rowStyle}>
            <div style={{ fontWeight: 700, color: "var(--on-surface)", marginBottom: 4 }}>이의제기</div>
            책임 판단에 동의하기 어렵다면 관리자 검토를 요청할 수 있어요.
          </div>

          <div style={rowStyle}>
            <div style={{ fontWeight: 700, color: "var(--on-surface)", marginBottom: 4 }}>모델 신뢰도</div>
            약 {Math.round(confidence * 100)}% · AI 추정이며 확정이 아니에요.
          </div>
        </div>
      )}
    </div>
  );
}
