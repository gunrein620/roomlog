"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@roomlog/ui";
import { ROUTES } from "@/lib/nav";

// T-DEF-02 · 사진 첨부 (3개 모드)
// 신규/재촬영 → "분석 요청"(→03) · 추가정보 → "추가 정보 제출"(→11, ticket 유지).
// 뒤로: 신규=01 / 추가정보·재촬영=11. 업로드 실패는 여기 인-스크린(분석오류 E0와 구분).

type Mode = "new" | "add" | "retake";

const MODE_LABEL: Record<Mode, string> = {
  new: "하자 사진 첨부",
  add: "추가 정보 제출",
  retake: "다시 촬영하기",
};

const guideTile = {
  width: "100%",
  height: 54,
  border: "1px solid var(--outline-variant)",
  borderRadius: 6,
  background: "var(--surface-container)",
} as const;

export default function Page() {
  const [mode, setMode] = useState<Mode>("new");
  // 첨부 사진 목(mock): 촬영 가이드에 맞춰 2장 시작, + 타일로 추가.
  const [photos, setPhotos] = useState<number[]>([1, 2]);

  const isAnalyze = mode === "new" || mode === "retake";
  const backHref = mode === "new" ? ROUTES["T-DEF-01"] : ROUTES["T-DEF-11"];
  const primaryHref = isAnalyze ? ROUTES["T-DEF-03"] : ROUTES["T-DEF-11"];
  const primaryLabel = isAnalyze ? "분석 요청" : "추가 정보 제출";

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Link
          href={backHref}
          style={{
            fontSize: 13,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
            marginTop: 2,
          }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>사진 첨부</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            {MODE_LABEL[mode]}
          </div>
          {mode === "add" && (
            <div style={{ fontSize: 10, color: "var(--on-surface-variant)", marginTop: 3 }}>
              연결된 신고 유지
            </div>
          )}
        </div>
        <div style={{ width: 34 }} />
      </header>

      {/* 모드 전환 */}
      <div style={{ flex: "none", display: "flex", padding: "8px 14px 0" }}>
        {(["new", "add", "retake"] as const).map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: "8px 4px",
              border: "1px solid var(--outline-variant)",
              borderLeft: i === 0 ? undefined : "none",
              borderTopLeftRadius: i === 0 ? 8 : 0,
              borderBottomLeftRadius: i === 0 ? 8 : 0,
              borderTopRightRadius: i === 2 ? 8 : 0,
              borderBottomRightRadius: i === 2 ? 8 : 0,
              background:
                mode === m ? "var(--surface-container-high)" : "var(--surface-container-lowest)",
              fontSize: 11,
              fontWeight: 600,
              color: mode === m ? "var(--on-surface)" : "var(--on-surface-variant)",
              cursor: "pointer",
            }}
          >
            {m === "new" ? "신규" : m === "add" ? "추가정보" : "재촬영"}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 촬영 가이드 */}
        <div
          style={{
            border: "1px solid var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>촬영 가이드</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={guideTile} />
              <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>정면·전체 1장</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              <div style={guideTile} />
              <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>확대 1장</span>
            </div>
          </div>
        </div>

        {/* 첨부 그리드 */}
        <div>
          <div
            style={{
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginBottom: 8,
            }}
          >
            첨부한 사진
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {photos.map((p) => (
              <div
                key={p}
                style={{
                  aspectRatio: "1",
                  border: "1px solid var(--outline-variant)",
                  borderRadius: 8,
                  background: "var(--surface-container)",
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => setPhotos((prev) => [...prev, (prev.at(-1) ?? 0) + 1])}
              aria-label="사진 추가"
              style={{
                aspectRatio: "1",
                border: "1.5px dashed var(--outline)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                color: "var(--on-surface-variant)",
                background: "var(--surface-container-lowest)",
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link href={primaryHref} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>{primaryLabel}</Button>
        </Link>
      </footer>
    </>
  );
}
