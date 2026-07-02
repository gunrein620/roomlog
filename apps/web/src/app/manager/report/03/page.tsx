import { getReport, getReportDelivery } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Badge, Card } from "@roomlog/ui";
import { Grid, LinkButton, PageStack, ScreenHeader, Section, formatDateTime } from "../_components";

export default async function Page() {
  const [report, delivery] = await Promise.all([getReport(), getReportDelivery()]);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-03"
        title="임대인 보고·내보내기"
        subtitle={`${report.periodLabel} · ${delivery.recipient.name}`}
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-02"]} variant="secondary">상세로</LinkButton>}
      />

      <Grid>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>형식</h2>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge>PDF</Badge>
            <Badge>Excel</Badge>
            <Badge emphasis>링크 전달</Badge>
          </div>
        </Card>
        <Card style={{ display: "grid", gap: "var(--space-md)", border: "1.5px solid var(--primary)" }}>
          <h2 style={cardTitleStyle}>마스킹</h2>
          <Badge emphasis>{delivery.masked ? "외부 공유 마스킹 강제" : "재확인 게이트 필요"}</Badge>
          <div style={mutedStyle}>임차인 실명·계좌·연락처는 외부 공유 시 기본 포함하지 않습니다.</div>
        </Card>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>수신자</h2>
          <div style={{ fontWeight: 850 }}>{delivery.recipient.name}</div>
          <div style={mutedStyle}>{delivery.recipient.delivery === "external" ? "외부 전달" : "룸로그 계정 전달"}</div>
        </Card>
      </Grid>

      <Section title="권한·책임 확인">
        <Card style={{ lineHeight: "var(--lh-body)", background: "var(--surface-container-high)" }}>
          이 화면은 보고 전달과 내보내기 확정만 처리합니다. 독촉·공지 발송은 하지 않으며, 금액성 후속 조치는 M-BILL 원본 행 대조 뒤 확정합니다.
        </Card>
      </Section>

      <Section title="감사 로그">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {delivery.auditLog.map((entry) => (
            <Card key={`${entry.action}-${entry.at}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 850 }}>{entry.action}</div>
                <div style={mutedStyle}>{entry.actor} · {entry.detail}</div>
              </div>
              <Badge>{formatDateTime(entry.at)}</Badge>
            </Card>
          ))}
        </div>
      </Section>

      <Card style={{ display: "flex", justifyContent: "flex-end" }}>
        <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-02"]}>전달/내보내기 확정</LinkButton>
      </Card>
    </PageStack>
  );
}

const cardTitleStyle = { margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 850 } as const;
const mutedStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;

