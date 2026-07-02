import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { routeFor } from "@/lib/nav";

// T-DEF-05 · 업체 전달 정보 동의 — 임차인책임 경로의 필수 관문.
// 동의 체크는 인터랙션 목(서버 컴포넌트라 실제 토글 없음) — 이미 동의한 상태로 정적 표시.

const primaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

const secondaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "transparent",
  color: "var(--primary)",
  border: "1.5px solid var(--primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

const sectionLabelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: "var(--space-sm)",
} as const;

const SHARED_INFO = ["하자 사진", "증상 요약", "방문 가능 시간", "대략적 위치"];
const WITHHELD_INFO = ["상세 주소", "연락처", "계약서"];

export default function Page() {
  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href={routeFor("T-DEF-04")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>업체 연결 동의</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <div>
          <div style={sectionLabelStyle}>업체에 전달되는 정보</div>
          <Card style={{ padding: 0 }}>
            {SHARED_INFO.map((label, i) => (
              <div
                key={label}
                style={{
                  padding: "var(--space-md) var(--card-padding)",
                  borderBottom: i < SHARED_INFO.length - 1 ? "1px solid var(--border)" : "none",
                  fontSize: "var(--fs-body)",
                }}
              >
                ＋ {label}
              </div>
            ))}
          </Card>
        </div>

        <div>
          <div style={sectionLabelStyle}>전달되지 않는 정보</div>
          <Card style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
            {WITHHELD_INFO.map((label) => (
              <Badge key={label} style={{ textDecoration: "line-through", color: "var(--on-surface-variant)" }}>
                {label}
              </Badge>
            ))}
          </Card>
        </div>

        <Card style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <span
            style={{
              width: 22,
              height: 22,
              flex: "none",
              border: "1.5px solid var(--primary)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ✓
          </span>
          <span style={{ fontSize: "var(--fs-body)" }}>위 정보 전달에 동의합니다</span>
        </Card>
      </div>

      <div
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        <Link href={routeFor("T-DEF-06")} style={primaryLinkStyle}>
          동의하고 업체 연결
        </Link>
        <Link href={routeFor("T-DEF-04")} style={secondaryLinkStyle}>
          취소
        </Link>
      </div>
    </>
  );
}
