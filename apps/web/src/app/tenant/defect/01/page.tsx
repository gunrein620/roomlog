"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@roomlog/ui";
import { ROUTES } from "@/lib/nav";

// T-DEF-01 · 하자 신고 작성
// 챗봇형 접수 초안. 필수 그룹(내용·위치·시점) 완료 시 "다음: 사진 첨부"(→02 신규) 활성.
// 뒤로 → 00. 유형 수동 선택·콜봇 녹음은 미룬다.

const groupLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

const fieldLabel = { fontSize: 13, fontWeight: 600 } as const;

export default function Page() {
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [recurring, setRecurring] = useState<"yes" | "no" | null>(null);
  const [visitTime, setVisitTime] = useState("");

  const requiredDone =
    content.trim() !== "" && location.trim() !== "" && occurredAt.trim() !== "";

  // 챗봇 턴 진행률: 필수 3칸 중 채운 칸 비율 (고정 페이지 수 아님)
  const filled = [content, location, occurredAt].filter((v) => v.trim() !== "").length;

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link
            href={ROUTES["T-DEF-00"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            ‹ 뒤로
          </Link>
          <div style={{ fontSize: 14, fontWeight: 700 }}>하자 신고</div>
          <div style={{ width: 34 }} />
        </div>
        {/* 챗봇 턴 진행률 인디케이터 */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 70,
                height: 8,
                borderRadius: "var(--radius-full)",
                background: i < filled ? "var(--primary)" : "var(--outline-variant)",
              }}
            />
          ))}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 필수 그룹 */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--surface-container-low)",
          }}
        >
          <div style={groupLabel}>필수</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={fieldLabel}>① 어떤 하자인가요?</label>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="하자 내용 입력"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={fieldLabel}>② 어디에서 발생했나요?</label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="발생 위치 입력"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={fieldLabel}>③ 언제부터 그랬나요?</label>
            <Input
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              placeholder="발생 시점 입력"
            />
          </div>
        </section>

        {/* 선택 그룹 */}
        <section
          style={{
            border: "1px dashed var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={groupLabel}>선택</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ ...fieldLabel, color: "var(--on-surface-variant)" }}>
              ④ 반복해서 생기나요?
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["yes", "no"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRecurring(v)}
                  style={{
                    padding: "6px 14px",
                    border:
                      recurring === v
                        ? "1.5px solid var(--primary)"
                        : "1px solid var(--outline-variant)",
                    borderRadius: "var(--radius-full)",
                    fontSize: 12,
                    color: recurring === v ? "var(--on-surface)" : "var(--on-surface-variant)",
                    background: "var(--surface-container-lowest)",
                    cursor: "pointer",
                  }}
                >
                  {v === "yes" ? "네" : "아니요"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ ...fieldLabel, color: "var(--on-surface-variant)" }}>
              ⑤ 방문 가능한 시간은?
            </label>
            <Input
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
              placeholder="방문 가능 시간 (선택)"
            />
          </div>
        </section>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        {requiredDone ? (
          <Link href={ROUTES["T-DEF-02"]} style={{ textDecoration: "none", display: "block" }}>
            <Button fullWidth>다음: 사진 첨부</Button>
          </Link>
        ) : (
          <Button
            fullWidth
            disabled
            style={{
              background: "var(--surface-container-high)",
              color: "var(--on-surface-variant)",
              cursor: "not-allowed",
            }}
          >
            다음: 사진 첨부
          </Button>
        )}
      </footer>
    </>
  );
}
