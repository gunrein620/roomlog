import Link from "next/link";
import { Badge, Card, ManagerShell } from "@roomlog/ui";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";

const settings = [
  { title: "프로필", body: "워크스페이스 이름, 관리자 표시명", href: MHOME_ROUTES["M-HOME-06"] },
  { title: "알림", body: "긴급민원, 미납, 확인필요, 계약만료 배지", href: MHOME_ROUTES["M-HOME-06"] },
  { title: "담당자/권한", body: "건물 담당자와 권한 범위", href: MHOME_ROUTES["M-HOME-06"] },
  { title: "보관·삭제 정책", body: "계약·청구·민원 기록 보관", href: MANAGER_CROSS.contract },
  { title: "업체 주소록 관리", body: "수리 업체와 정산 연락처", href: "/manager/vendor" },
  { title: "앱 정보", body: "PWA 버전과 접근성 안내", href: MHOME_ROUTES["M-HOME-06"] },
];

export default function Page() {
  return (
    <ManagerShell title="설정" context="관리 중인 집" nav={<HomeNav />}>
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header>
          <h1 style={{ margin: "var(--space-sm) 0", fontSize: "var(--fs-title)" }}>설정</h1>
          <p style={{ margin: 0, color: "var(--on-surface-variant)" }}>
            프로필, 알림, 권한, 보관 정책으로 이동합니다.
          </p>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          {settings.map((item) => (
            <Link key={item.title} href={item.href} style={linkReset}>
              <Card style={{ minHeight: 128, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)" }}>
                  <strong>{item.title}</strong>
                  <Badge>{item.href === MHOME_ROUTES["M-HOME-06"] ? "인스크린" : "이동"}</Badge>
                </div>
                <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-caption)" }}>{item.body}</div>
              </Card>
            </Link>
          ))}
        </section>
      </div>
    </ManagerShell>
  );
}

function HomeNav() {
  return <nav aria-label="관리인 자산현황" style={{ display: "grid", gap: "var(--space-sm)" }}>{[["홈", MHOME_ROUTES["M-HOME-00"]], ["소통", MANAGER_CROSS.messaging], ["설정", MHOME_ROUTES["M-HOME-06"]]].map(([label, href]) => <Link key={href} href={href} style={{ ...navLinkStyle, border: label === "설정" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>{label}</Link>)}</nav>;
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
const navLinkStyle = { minHeight: 42, display: "flex", alignItems: "center", padding: "0 var(--space-md)", borderRadius: "var(--radius)", color: "var(--on-surface)", textDecoration: "none", fontWeight: 800, background: "var(--surface-container-lowest)" } as const;
