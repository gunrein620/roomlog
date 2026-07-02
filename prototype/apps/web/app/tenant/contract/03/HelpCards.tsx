"use client";

import { useState } from "react";
import type { ContractHelpNote } from "@roomlog/types";

// T-DOC-03 '알아두면 좋은 점' 카드 — 비적대·중립 톤. 각 카드 쉬운 설명 + 원문 보기 토글.
export function HelpCards({ notes }: { notes: ContractHelpNote[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {notes.map((note) => (
        <HelpCard key={note.clause} note={note} />
      ))}
    </div>
  );
}

function HelpCard({ note }: { note: ContractHelpNote }) {
  const [showSource, setShowSource] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 14,
        background: "var(--surface-container-lowest)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{note.clause}</div>
      <div style={{ fontSize: 12.5, color: "var(--on-surface-variant)", lineHeight: 1.55 }}>
        {note.plain}
      </div>
      {note.source && (
        <>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            style={{
              alignSelf: "flex-start",
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--primary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {showSource ? "원문 접기" : "원문 보기"}
          </button>
          {showSource && (
            <div
              style={{
                fontSize: 12,
                color: "var(--on-surface-variant)",
                lineHeight: 1.5,
                background: "var(--surface-container-low)",
                borderRadius: 6,
                padding: "8px 10px",
              }}
            >
              “{note.source}”
            </div>
          )}
        </>
      )}
    </div>
  );
}
