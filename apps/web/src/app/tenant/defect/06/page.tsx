import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { routeFor } from "@/lib/nav";
import { DEMO_TICKET_ID, getRepair } from "@/lib/defect-api";

// T-DEF-06 · 업체 견적 — 임차인책임 경로. 견적 수락은 결제가 아니라 수리 진행(08)으로 이어진다.

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

function formatVisitTime(iso?: string) {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours() < 12 ? "오전" : "오후"}`;
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const repair = await getRepair(id);
  const hasVendor = Boolean(repair.vendorName);

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
          href={routeFor("T-DEF-05")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>업체 견적</div>
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
          <div style={sectionLabelStyle}>추천 업체</div>
          {hasVendor ? (
            <Card style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  flex: "none",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-container-high)",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{repair.vendorName}</div>
                <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                  응답 빠름 · 만족도 높은 협력업체
                </div>
              </div>
            </Card>
          ) : (
            <Card style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                현재 연결 가능한 업체가 없어요
              </div>
              <Link
                href={routeFor("T-DEF-09")}
                style={{ ...secondaryLinkStyle, alignSelf: "flex-start", width: "auto", height: "auto", padding: "var(--space-sm) var(--space-md)" }}
              >
                관리자에게 전달
              </Link>
            </Card>
          )}
        </div>

        {repair.quoteItems && repair.quoteItems.length > 0 && (
          <div>
            <div style={sectionLabelStyle}>견적</div>
            <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              {repair.quoteItems.map((item) => (
                <div
                  key={item.label}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}
                >
                  <span>{item.label}</span>
                  <span>{item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "var(--fs-body)",
                  fontWeight: 700,
                  borderTop: "1px dashed var(--border)",
                  paddingTop: "var(--space-sm)",
                }}
              >
                <span>예상 합계</span>
                <span>{(repair.quoteAmount ?? 0).toLocaleString()}원</span>
              </div>
            </Card>
          </div>
        )}

        <div>
          <div style={sectionLabelStyle}>방문 일정</div>
          <Badge emphasis style={{ fontWeight: 700, padding: "var(--space-sm) var(--space-md)" }}>
            {formatVisitTime(repair.scheduledAt)}
          </Badge>
        </div>
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
        {hasVendor ? (
          <Link href={routeFor("T-DEF-08")} style={primaryLinkStyle}>
            견적 수락 및 일정 확정
          </Link>
        ) : (
          <Link href={routeFor("T-DEF-09")} style={primaryLinkStyle}>
            관리자에게 전달
          </Link>
        )}
      </div>
    </>
  );
}
