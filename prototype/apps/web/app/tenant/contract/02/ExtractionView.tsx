"use client";

import { useState } from "react";
import type { ContractExtraction, ExtractionGroup, ExtractionItem } from "@roomlog/types";
import { Badge } from "@roomlog/ui";

// T-DOC-02 본문 상호작용 — 3그룹 접기 + 항목별 `근거 보기` + 마스킹 단계 공개.
// 서버 page가 추출을 fetch해서 넘기고, 여기서 펼침/근거/마스킹 상태만 관리(클라이언트).

const GROUP_LABEL: Record<ExtractionGroup, string> = {
  money: "돈 (보증금·월세·관리비·계좌)",
  term: "기간 (계약·연장·주소)",
  responsibility: "책임 (원상복구·수선)",
};

const GROUP_ORDER: ExtractionGroup[] = ["money", "term", "responsibility"];

export function ExtractionView({ extraction }: { extraction: ContractExtraction }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {GROUP_ORDER.map((group) => {
        const items = extraction.items.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return <GroupSection key={group} group={group} items={items} />;
      })}
    </div>
  );
}

function GroupSection({ group, items }: { group: ExtractionGroup; items: ExtractionItem[] }) {
  const [open, setOpen] = useState(false);
  const needsCheckCount = items.filter((i) => i.needsCheck).length;

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface-container-lowest)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "13px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{GROUP_LABEL[group]}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {needsCheckCount > 0 && (
            <Badge style={{ fontSize: 11 }}>확인 필요 {needsCheckCount}</Badge>
          )}
          <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((item) => (
            <ItemRow key={item.label} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function ItemRow({ item }: { item: ExtractionItem }) {
  const [revealed, setRevealed] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const displayValue = item.masked && !revealed ? item.value : item.value;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--on-surface-variant)" }}>{item.label}</span>
        {item.needsCheck && <Badge style={{ fontSize: 11 }}>확인 필요</Badge>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{displayValue}</span>
        {item.masked && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            style={{
              fontSize: 11,
              color: "var(--primary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {revealed ? "가리기" : "단계 공개"}
          </button>
        )}
      </div>
      {item.masked && !revealed && (
        <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
          민감정보 · 기본 마스킹
        </div>
      )}

      {item.evidence && (
        <>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
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
            {showEvidence ? "근거 접기" : "근거 보기"}
          </button>
          {showEvidence && (
            <div
              style={{
                fontSize: 12,
                color: "var(--on-surface-variant)",
                lineHeight: 1.5,
                borderLeft: "2px solid var(--outline-variant)",
                paddingLeft: 10,
                background: "var(--surface-container-low)",
                borderRadius: 4,
                padding: "8px 10px",
              }}
            >
              “{item.evidence}”
            </div>
          )}
        </>
      )}
    </div>
  );
}
