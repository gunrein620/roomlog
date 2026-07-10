import Link from "next/link";
import { Card } from "@roomlog/ui";
import { normalizeManagerPrompt } from "@/lib/manager-assistant";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";
import { ManagerRealtimeConsole } from "./ManagerRealtimeConsole";

type SearchParams = Promise<{ prompt?: string }>;

const domains = [
  { label: "티켓 처리", href: MANAGER_CROSS.ticketDash, body: "긴급도, 사진 필요 여부, 업체 배정 후보를 확인합니다." },
  { label: "청구 관리", href: MANAGER_CROSS.billing, body: "수납 현황, 미납, 입금 확인 대기 건을 조회합니다." },
  { label: "소통", href: MANAGER_CROSS.messaging, body: "임차인 문의 맥락을 보고 답장 초안을 준비합니다." },
];

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { prompt = "" } = await searchParams;
  const initialPrompt = normalizeManagerPrompt(prompt);

  return (
    <div style={{ display: "grid", gap: "var(--space-xl)" }}>
      <ManagerRealtimeConsole initialPrompt={initialPrompt} />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-md)" }}>
        {domains.map((domain) => (
          <Link key={domain.label} href={domain.href} style={linkReset}>
            <Card style={{ minHeight: 156, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <strong>{domain.label}</strong>
              <span style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>{domain.body}</span>
              <span style={{ marginTop: "auto", color: "var(--primary)", fontWeight: 800 }}>원천 화면 열기</span>
            </Card>
          </Link>
        ))}
      </section>

      <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
        <strong>실행 원칙</strong>
        <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
          에이전트는 조회와 초안 생성을 먼저 수행하고, 발송·독촉·결제 확정처럼 돈과 권한이 얽힌 작업은 관리인 명시 확인 후에만 처리합니다.
        </p>
      </Card>
    </div>
  );
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
