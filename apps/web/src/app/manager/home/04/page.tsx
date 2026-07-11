import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";
import { ManagerHomeShell } from "../_components";

const rooms = [
  { room: "201", state: "긴급민원", issue: "누수 확인", person: "계약자 표시", tone: "정밀 검토" },
  { room: "202", state: "미납", issue: "입금 확인 대기", person: "계약자 표시", tone: "주의" },
  { room: "301", state: "공실", issue: "청소 완료", person: "입주자 없음", tone: "양호" },
  { room: "302", state: "계약만료", issue: "D-14", person: "계약자 표시", tone: "주의" },
  { room: "401", state: "정상", issue: "이슈 없음", person: "계약자 표시", tone: "양호" },
  { room: "402", state: "민원 진행", issue: "방문 일정 조율", person: "계약자 표시", tone: "주의" },
];

export default function Page() {
  return (
    <ManagerHomeShell title="건물 상세" context="관리 중인 집 · 건물 상세" demo>
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: "var(--space-sm) 0", fontSize: "var(--fs-title)" }}>연남 스테이</h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)" }}>서울 마포구 동교로 · 리스크 정밀 검토</p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <LinkButton href={MHOME_ROUTES["M-HOME-05"]}>호실 등록/CSV</LinkButton>
            <Badge>건물 편집 · 인스크린</Badge>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          {[
            ["수납률", "확인 중"],
            ["공실", "1호"],
            ["연체", "2건"],
            ["진행중 민원", "3건"],
          ].map(([label, value]) => (
            <Card key={label}>
              <div style={captionStyle}>{label}</div>
              <div style={{ marginTop: "var(--space-md)", fontSize: "var(--fs-title)", fontWeight: 800 }}>{value}</div>
            </Card>
          ))}
        </section>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center", marginBottom: "var(--space-md)" }}>
            <strong>호실 그리드 · 이슈 우선</strong>
            <Badge>실명은 종속 표기</Badge>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-md)" }}>
            {rooms.map((room) => (
              <Link key={room.room} href={`${MANAGER_CROSS.contract}?return_to=M-HOME-04&building_id=yeonnam&room_id=${room.room}`} style={linkReset}>
                <Card style={{ minHeight: 142, display: "flex", flexDirection: "column", gap: "var(--space-sm)", border: room.tone === "정밀 검토" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                    <strong>{room.room}호</strong>
                    <Badge emphasis={room.tone === "정밀 검토"}>{room.state}</Badge>
                  </div>
                  <div style={{ fontWeight: 800 }}>{room.issue}</div>
                  <div style={{ marginTop: "auto", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{room.person}</div>
                </Card>
              </Link>
            ))}
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-md)" }}>
          <ActionCard href={MANAGER_CROSS.ticketDash} title="건물 민원" body="진행 중 민원과 긴급도 확인" />
          <ActionCard href={`${MANAGER_CROSS.billing}/collection`} title="건물 수납" body="청구·입금 확인으로 이동" />
          <ActionCard href={MHOME_ROUTES["M-HOME-02"]} title="리포트" body="기간별 지표와 차트 보기" />
        </div>
      </div>
    </ManagerHomeShell>
  );
}

function ActionCard({ href, title, body }: { href: string; title: string; body: string }) {
  return <Link href={href} style={linkReset}><Card><strong>{title}</strong><div style={{ marginTop: "var(--space-sm)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{body}</div></Card></Link>;
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ minHeight: "var(--touch-target)", padding: "0 var(--space-lg)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", background: "var(--primary)", color: "var(--on-primary)", textDecoration: "none", fontWeight: 800 }}>{children}</Link>;
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 700 } as const;
