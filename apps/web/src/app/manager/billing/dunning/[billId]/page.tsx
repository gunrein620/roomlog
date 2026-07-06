import { redirect } from "next/navigation";
import { Button, Card } from "@roomlog/ui";
import { getManagerDunning, sendManagerDunning } from "@/lib/billing-manager-api";
import {
  BillingShell,
  DisabledAction,
  Grid,
  GuardBanner,
  MetricCard,
  PageStack,
  Section,
  TextButtonLink,
  formFieldStyle,
  routes,
  won,
} from "../../_components";

type Params = Promise<{ billId: string }>;
type SearchParams = Promise<{ id?: string }>;

async function sendDunningAction(formData: FormData) {
  "use server";

  const billId = String(formData.get("billId") ?? "");
  const text = String(formData.get("text") ?? "");
  const channel = String(formData.get("channel") ?? "");
  const sent = billId && text && channel ? await sendManagerDunning(billId, { text, channel }) : false;
  redirect(`${routes.dunning(billId)}&send=${sent ? "ok" : "failed"}`);
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ billId }, { id }] = await Promise.all([params, searchParams]);
  const targetBillId = id || billId;
  const draft = await getManagerDunning(targetBillId);

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

        <form action={sendDunningAction} style={{ display: "contents" }}>
          <input type="hidden" name="billId" value={draft.billId} />
          <input type="hidden" name="channel" value={draft.channel} />
          <Section title="AI 독촉문 초안 편집">
            <Card>
              <textarea
                name="text"
                defaultValue={draft.draftText}
                disabled={draft.guard.blocked}
                style={{
                  ...formFieldStyle,
                  width: "100%",
                  minHeight: 240,
                  padding: "var(--space-md)",
                  lineHeight: "var(--lh-body)",
                  resize: "vertical",
                  whiteSpace: "pre-wrap",
                }}
              />
            </Card>
          </Section>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
            <Button type="button" variant="secondary" disabled>
              초안 다시 생성
            </Button>
            {draft.guard.blocked ? (
              <DisabledAction>가드 해소 후 수정·승인 발송</DisabledAction>
            ) : (
              <Button type="submit">수정 후 관리인 승인 발송</Button>
            )}
          </div>
        </form>
      </PageStack>
    </BillingShell>
  );
}
