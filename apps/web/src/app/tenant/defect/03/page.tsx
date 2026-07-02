import Link from "next/link";
import { ROUTES } from "@/lib/nav";

// T-DEF-03 · AI 분석 중 (로딩)
// VLM 하자 탐지·긴급도·책임 가능성 분석 진행 안내. 주 액션 없음(시스템 진행) · 보조 취소(→02).
// system 전이(완료→04 / 실패→E0)는 데모용 링크로 노출.

const steps = ["사진 인식", "종합", "책임 가능성 추정"] as const;

export default function Page() {
  return (
    <>
      <style>{`@keyframes tdefBlink{0%,100%{opacity:.3}50%{opacity:1}}`}</style>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          padding: "30px 22px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 0.2, 0.4].map((delay) => (
            <span
              key={delay}
              style={{
                width: 11,
                height: 11,
                borderRadius: "var(--radius-full)",
                background: "var(--primary)",
                animation: `tdefBlink 1.2s infinite ${delay}s`,
              }}
            />
          ))}
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>사진을 분석하고 있어요</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 6 }}>
            예상 소요 · 약 10초
          </div>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          {steps.map((label, i) => {
            const active = i === 0; // 현재 단계 강조
            return (
              <div
                key={label}
                style={{ display: "flex", alignItems: "center", gap: 10, opacity: active ? 1 : 0.45 }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    border: `1.5px solid ${active ? "var(--primary)" : "var(--outline-variant)"}`,
                    borderRadius: "var(--radius-full)",
                    background: active ? "var(--surface-container-high)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: active ? "var(--on-surface)" : "var(--on-surface-variant)",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    color: active ? "var(--on-surface)" : "var(--on-surface-variant)",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
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
        <Link
          href={ROUTES["T-DEF-02"]}
          style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            height: "var(--touch-target)",
            alignItems: "center",
            justifyContent: "center",
            border: "1.5px solid var(--primary)",
            background: "transparent",
            color: "var(--primary)",
            borderRadius: "var(--radius-btn)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          취소
        </Link>

        {/* system 전이 — 데모 노출(실제로는 분석 완료/실패에 따라 자동) */}
        <div
          style={{
            display: "flex",
            gap: 7,
            borderTop: "1px dashed var(--border)",
            paddingTop: 8,
          }}
        >
          {(
            [
              { href: ROUTES["T-DEF-04"], label: "완료 → 04 (데모)" },
              { href: ROUTES["T-DEF-E0"], label: "실패 → E0 (데모)" },
            ] as const
          ).map((x) => (
            <Link
              key={x.href}
              href={x.href}
              style={{
                flex: 1,
                padding: 8,
                border: "1px dashed var(--outline)",
                background: "var(--surface-container-low)",
                borderRadius: 8,
                fontSize: 11,
                color: "var(--on-surface-variant)",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {x.label}
            </Link>
          ))}
        </div>
      </footer>
    </>
  );
}
