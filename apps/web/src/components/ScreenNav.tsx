import Link from "next/link";
import { routeFor } from "@/lib/nav";
import { TRANSITIONS } from "@/lib/transitions";

/**
 * 화면 하단 전이 네비 — nav-manifest의 목적지로 가는 next/link 목록.
 * 원 CTA 라벨을 그대로 노출하고, href는 lib/nav.ts의 ROUTES에서 온다.
 * 프레임 내부 버튼(FrameNav 위임)과 별개로, 소스에 명시된 확인 가능한 배선이다.
 */
export default function ScreenNav({ id }: { id: string }) {
  const items = TRANSITIONS[id] ?? [];
  if (items.length === 0) return null;

  return (
    <nav
      style={{
        width: 390,
        border: "1px solid #c4c7c7",
        borderRadius: 12,
        background: "#fff",
        padding: "12px 14px",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#8a8a8a",
          letterSpacing: ".04em",
          marginBottom: 8,
        }}
      >
        화면 전이 (nav-manifest)
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {items.map((t, i) => (
          <li key={`${t.label}-${i}`}>
            <Link
              href={routeFor(t.to)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                textDecoration: "none",
                border:
                  t.kind === "demo"
                    ? "1px dashed #b0b0b0"
                    : "1px solid #2b2b2b",
                background: t.kind === "demo" ? "#f6f3ee" : "#fff",
                color: "#1b1c19",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {t.label}
                {t.kind === "demo" && (
                  <span style={{ color: "#8a8a8a", fontWeight: 400 }}>
                    {" "}
                    · 다음(데모)
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, color: "#8a8a8a" }}>
                → {t.to}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
