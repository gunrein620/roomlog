import { getReportCreateData } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Badge, Card } from "@roomlog/ui";
import { Grid, LinkButton, PageStack, ScreenHeader, Section, formatDateTime } from "../_components";

export const dynamic = "force-dynamic";

const sections = ["납부 현황", "민원·처리", "지출·수리비", "호실·공실", "실시간 지표", "계약 변동", "장기 리스크", "임대인 메모", "다음 조치"];

export default async function Page() {
  const { recipients, recentReport } = await getReportCreateData();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-01"
        title="새 리포트 생성"
        subtitle="기간·범위·섹션·임대인 수신자를 정해 생성 시점 스냅샷을 만듭니다."
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]} variant="secondary">허브로</LinkButton>}
      />

      <Grid>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>기간</h2>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge>주간</Badge>
            <Badge emphasis>월간</Badge>
            <Badge>분기</Badge>
          </div>
          <div style={mutedStyle}>{recentReport.periodLabel} 기준으로 미리보기 중입니다.</div>
        </Card>

        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>담당 스코프</h2>
          <div style={{ fontWeight: 850 }}>{recentReport.scope.buildingName}</div>
          <div style={mutedStyle}>조회·목록·드릴다운·내보내기는 서버 담당 건물 범위로 제한합니다.</div>
        </Card>

        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>보고 수신자</h2>
          {recipients.map((recipient) => (
            <div key={recipient.id} style={rowStyle}>
              <span>{recipient.name}</span>
              <Badge emphasis={recipient.delivery === "external"}>{recipient.delivery === "external" ? "외부 전달" : "계정 전달"}</Badge>
            </div>
          ))}
        </Card>
      </Grid>

      <Section title="포함 섹션">
        <Grid min={180}>
          {sections.map((section) => (
            <Card key={section} style={{ minHeight: 72, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <span style={{ fontWeight: 800 }}>{section}</span>
              <Badge>포함</Badge>
            </Card>
          ))}
        </Grid>
      </Section>

      <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center", background: "var(--surface-container-high)" }}>
        <div>
          <div style={{ fontWeight: 850 }}>기준시점 미리보기</div>
          <div style={mutedStyle}>{formatDateTime(recentReport.snapshotAt)} 시점 원본 기준으로 생성합니다. 리포트 미납액은 스냅샷이며, 독촉은 M-BILL에서 실시간 대조합니다.</div>
        </div>
        <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-02"]}>리포트 생성</LinkButton>
      </Card>
    </PageStack>
  );
}

const cardTitleStyle = { margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 850 } as const;
const mutedStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;
const rowStyle = { display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center", padding: "var(--space-sm) 0", borderBottom: "1px solid var(--border)" } as const;
