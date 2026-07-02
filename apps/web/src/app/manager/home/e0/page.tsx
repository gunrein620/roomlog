import Link from "next/link";
import { Badge, Card, ManagerShell } from "@roomlog/ui";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";

export default function Page() {
  return (
    <ManagerShell title="로드 오류" context="워크스페이스">
      <div style={{ minHeight: "calc(100vh - var(--header-height) - var(--space-xl) * 2)", display: "grid", placeItems: "center" }}>
        <Card style={{ width: "min(560px, 100%)", display: "grid", gap: "var(--space-lg)", textAlign: "center" }}>
          <div>
            <Badge emphasis>M-HOME-E0</Badge>
            <h1 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-title)" }}>자산현황을 불러오지 못했습니다</h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              네트워크 또는 원천 세트 응답을 확인한 뒤 직전 화면을 다시 시도할 수 있습니다.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Link href={MHOME_ROUTES["M-HOME-00"]} style={primaryLink}>다시 시도</Link>
            <Link href={MHOME_ROUTES["M-HOME-00"]} style={secondaryLink}>대시보드로</Link>
          </div>
        </Card>
      </div>
    </ManagerShell>
  );
}

const primaryLink = { minHeight: "var(--touch-target)", padding: "0 var(--space-lg)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", background: "var(--primary)", color: "var(--on-primary)", textDecoration: "none", fontWeight: 800 } as const;
const secondaryLink = { minHeight: "var(--touch-target)", padding: "0 var(--space-lg)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", border: "1.5px solid var(--primary)", color: "var(--primary)", textDecoration: "none", fontWeight: 800 } as const;
