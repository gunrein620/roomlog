import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { Card, LinkButton, NoticeCard, ScreenHeader } from "../_components";

type SearchParams = Promise<{ from?: string; kind?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { from, kind } = await searchParams;
  const retryHref = from && from.startsWith("/manager/messaging/") ? from : MANAGER_MESSAGING_ROUTES["M-MSG-00"];
  const label = kind === "voice" ? "음성 실패" : kind === "send" ? "발송 실패" : "로드 실패";

  return (
    <>
      <ScreenHeader eyebrow="M-MSG-E0" title="오류 복구" />
      <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <BadgeLine>{label}</BadgeLine>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: 800 }}>작업을 완료하지 못했어요</div>
          <div style={{ color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
            작성 중인 초안과 확인 상태를 보존합니다. 중복 발송을 막기 위해 승인 게이트를 다시 확인한 뒤 재시도하세요.
          </div>
        </Card>
        <NoticeCard title="복구 원칙" emphasis>
          발송 실패는 자동 재발송하지 않습니다. 다시 시도는 직전 화면으로 돌아가고, 허브에서는 목록을 다시 불러옵니다.
        </NoticeCard>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href={retryHref}>다시 시도</LinkButton>
          <LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>
        </div>
      </div>
    </>
  );
}

function BadgeLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex" }}>
      <span
        style={{
          display: "inline-flex",
          borderRadius: "var(--radius-full)",
          border: "1.5px solid var(--primary)",
          padding: "4px 12px",
          fontSize: "var(--fs-caption)",
          fontWeight: 700,
        }}
      >
        {children}
      </span>
    </div>
  );
}
