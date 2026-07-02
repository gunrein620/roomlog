import { Button, Card } from "@roomlog/ui";
import { getManagerDunning } from "@/lib/billing-manager-api";
import {
  BillingShell,
  DisabledAction,
  Grid,
  GuardBanner,
  MetricCard,
  PageStack,
  Section,
  TextButtonLink,
  routes,
  won,
} from "../../_components";

export default async function Page({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const draft = await getManagerDunning(billId);

  return (
    <BillingShell title="독촉문 작성·발송" active={routes.overdue}>
      <PageStack>
        <Section
          title={`${draft.unitId}호 · ${draft.tenantName}`}
          action={<TextButtonLink href={routes.overdue} variant="secondary">연체 관리로</TextButtonLink>}
        >
          <Grid columns={3}>
            <MetricCard label="미납액" value={won(draft.unpaidAmount)} />
            <MetricCard label="발송 채널" value={draft.channel} note="단일 채널" />
            <MetricCard label="승인 상태" value={draft.guard.blocked ? "차단" : "승인 가능"} note="관리인 수정 후 발송" />
          </Grid>
        </Section>

        <GuardBanner
          blocked={draft.guard.blocked}
          hasConfirming={draft.guard.hasConfirming}
          hasOrphan={draft.guard.hasOrphan}
        />

        <Section title="AI 독촉문 초안 편집">
          <Card>
            <div
              style={{
                minHeight: 240,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-md)",
                lineHeight: "var(--lh-body)",
                color: "var(--on-surface)",
                background: "var(--surface-container-lowest)",
                whiteSpace: "pre-wrap",
              }}
            >
              {draft.draftText}
            </div>
          </Card>
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
          <Button variant="secondary">초안 다시 생성</Button>
          {draft.guard.blocked ? (
            <DisabledAction>가드 해소 후 수정·승인 발송</DisabledAction>
          ) : (
            <Button>수정 후 관리인 승인 발송</Button>
          )}
        </div>
      </PageStack>
    </BillingShell>
  );
}
