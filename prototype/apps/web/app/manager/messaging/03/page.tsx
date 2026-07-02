import type { AnnouncementDelivery } from "@roomlog/types";
import { DEMO_MANAGER_RESULT_ID, getAnnouncementResult } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import {
  Badge,
  Card,
  CATEGORY_LABEL,
  LinkButton,
  MetaRow,
  NoticeCard,
  STATE_LABEL,
  ScreenHeader,
  formatDateTime,
  gridStyle,
  sectionTitleStyle,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const result = await getAnnouncementResult(id ?? DEMO_MANAGER_RESULT_ID);
  const isUrgent = result.category === "urgent";
  const unconfirmed = result.deliveries.filter((delivery) => delivery.state !== "confirmed" || delivery.failed);

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-03"
        title="발송 결과 · 읽음/확인"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>}
      />

      <Card style={{ marginBottom: "var(--space-lg)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <Badge emphasis={isUrgent}>{CATEGORY_LABEL[result.category]}</Badge>
          <Badge>v{result.version}</Badge>
          <Badge>{formatDateTime(result.sentAt)}</Badge>
        </div>
        <div style={{ fontSize: "var(--fs-title)", fontWeight: 800 }}>{result.title}</div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: "var(--space-lg)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <section>
            <div style={sectionTitleStyle}>읽음≠확인 enum 현황</div>
            <div style={gridStyle}>
              <Metric label="전체" value={result.counts.total} />
              <Metric label="읽음" value={result.counts.read} />
              <Metric label="확인" value={result.counts.confirmed} />
              <Metric label="미확인" value={result.counts.unconfirmed} />
              <Metric label="실패" value={result.counts.failed} />
            </div>
          </section>

          <Card>
            <div style={sectionTitleStyle}>미확인 세대</div>
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {unconfirmed.map((delivery) => (
                <DeliveryRow key={`${delivery.unitId}-${delivery.tenantName}`} delivery={delivery} canOpen={isUrgent} />
              ))}
            </div>
          </Card>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <Card>
            <div style={sectionTitleStyle}>발송 이력 · 버전</div>
            <MetaRow label="현재 버전" value={`v${result.version}`} />
            <MetaRow label="발송 시각" value={formatDateTime(result.sentAt)} />
            <MetaRow label="확인 게이트" value={result.confirmRequired ? "긴급 적용" : "없음"} />
          </Card>
          {isUrgent ? (
            <>
              <NoticeCard title="긴급 한정 재발송" emphasis>
                미확인 수신자는 재산정 후 M-MSG-02 발송 게이트를 다시 거칩니다.
              </NoticeCard>
              <LinkButton href={`${MANAGER_MESSAGING_ROUTES["M-MSG-02"]}?id=draft_urgent_water&resend=${result.announcementId}`}>
                미확인 재발송
              </LinkButton>
            </>
          ) : (
            <NoticeCard title="일반 공지는 조회만">
              생활·행사 공지는 미확인 추격이나 재발송 CTA를 제공하지 않습니다.
            </NoticeCard>
          )}
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ minHeight: 94 }}>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{label}</div>
      <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-title)", fontWeight: 900 }}>{value}</div>
    </Card>
  );
}

function DeliveryRow({ delivery, canOpen }: { delivery: AnnouncementDelivery; canOpen: boolean }) {
  const body = (
    <div
      style={{
        minHeight: 52,
        display: "grid",
        gridTemplateColumns: "84px 1fr auto",
        alignItems: "center",
        gap: "var(--space-sm)",
        borderBottom: "1px solid var(--border)",
        color: "var(--on-surface)",
      }}
    >
      <strong>{delivery.unitId}호</strong>
      <span>{delivery.tenantName}</span>
      <Badge emphasis={delivery.failed}>{delivery.failed ? "실패" : STATE_LABEL[delivery.state]}</Badge>
    </div>
  );

  return canOpen ? (
    <a href={`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?unitId=${delivery.unitId}`} style={{ color: "inherit", textDecoration: "none" }}>
      {body}
    </a>
  ) : (
    body
  );
}
