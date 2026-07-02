"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";

// T-DOC-01 · 계약서 업로드 (+동의 게이트)
// OCR·저장 동의 체크 전 primary 비활성(결제급 마찰). 업체 전달 동의는 전달 시점에 분리.
// 뒤로 → 00. 파일 선택은 스텁(기능 미구현), 분석 실패 → E0.

const groupLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

// OCR·저장 동의 항목 (무엇을·왜·보관기간 — 항목별 체크)
const CONSENT_ITEMS = [
  { key: "ocr", text: "계약서 이미지를 OCR로 분석합니다 (핵심 값 추출용)" },
  { key: "store", text: "추출값과 원본을 암호화 보관합니다 (정산·분쟁 대비 · 종료 후 5년)" },
] as const;

export default function Page() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [fileAdded, setFileAdded] = useState(false);

  const allConsented = CONSENT_ITEMS.every((i) => checked[i.key]);
  const canUpload = fileAdded && allConsented;

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={CONTRACT_ROUTES["T-DOC-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>계약서 등록</div>
        <div style={{ width: 34 }} />
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
        {/* ① 파일 선택 (사진 여러 장/PDF) — 스텁 */}
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={groupLabel}>파일</div>
          <button
            type="button"
            onClick={() => setFileAdded((v) => !v)}
            style={{
              height: 96,
              border: fileAdded
                ? "1.5px solid var(--primary)"
                : "1.5px dashed var(--outline-variant)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-container-low)",
              color: "var(--on-surface-variant)",
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 22 }}>{fileAdded ? "📄" : "＋"}</span>
            {fileAdded ? "계약서 1건 첨부됨 (탭하여 제거)" : "사진 여러 장 또는 PDF 선택"}
          </button>
        </section>

        {/* ② 동의 게이트 카드 — OCR·저장만 (전달 동의는 분리) */}
        <section
          style={{
            border: "1.5px solid var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--surface-container-low)",
          }}
        >
          <div style={groupLabel}>동의 (필수)</div>
          {CONSENT_ITEMS.map((item) => (
            <label
              key={item.key}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={!!checked[item.key]}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
                style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--primary)" }}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{item.text}</span>
            </label>
          ))}
        </section>

        {/* ③ 마스킹 안내 */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--on-surface-variant)",
            background: "var(--surface-container-lowest)",
          }}
        >
          상세주소·계좌번호는 기본 가림 처리돼요. 필요할 때만 단계적으로 열 수 있어요.
        </div>

        {/* ④ 업체 전달 동의 분리 고지 */}
        <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
          업체 전달이 필요할 경우, <b>전달 시점에 별도 동의</b>를 받습니다. 지금은 업로드·분석만
          진행돼요.
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {canUpload ? (
          <Link
            href={CONTRACT_ROUTES["T-DOC-02"]}
            style={{ textDecoration: "none", display: "block" }}
          >
            <Button fullWidth>동의하고 업로드</Button>
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
            동의하고 업로드
          </Button>
        )}
        <Link
          href={CONTRACT_ROUTES["T-DOC-04"]}
          style={{
            alignSelf: "center",
            padding: 4,
            fontSize: 12,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
          }}
        >
          약관·보관정책
        </Link>
      </footer>
    </>
  );
}
