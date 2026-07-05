import { redirect } from "next/navigation";
import { Button, Input } from "@roomlog/ui";
import { createAnnouncementDraft, DEMO_MANAGER_DRAFT_ID, getAnnouncementDraft } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  CATEGORY_LABEL,
  LinkButton,
  MetaRow,
  NoticeCard,
  SCOPE_LABEL,
  ScreenHeader,
  gridStyle,
  sectionTitleStyle,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; source?: string; actionType?: "dunning" | "notice"; unitIds?: string; billIds?: string; periodLabel?: string; note?: string; title?: string }>;

type ReportFollowUpPrefill = Awaited<SearchParams>;

async function createDraftAction(formData: FormData) {
  "use server";

  const category = String(formData.get("category") ?? "life") as "urgent" | "life" | "event";
  const scope = String(formData.get("scope") ?? "all") as "all" | "building" | "unit";
  const targetLabel = String(formData.get("targetLabel") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const confirmRequired = formData.get("confirmRequired") === "on";

  try {
    const draft = await createAnnouncementDraft({
      category,
      scope,
      targetLabel: targetLabel || SCOPE_LABEL[scope],
      title,
      body,
      confirmRequired,
    });

    redirect(`${MANAGER_MESSAGING_ROUTES["M-MSG-02"]}?id=${encodeURIComponent(draft.id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    throw error;
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id, source, actionType, unitIds, billIds, periodLabel, note, title } = await searchParams;
  const draft = await getAnnouncementDraft(id ?? DEMO_MANAGER_DRAFT_ID);
  const visibleDraft = applyReportFollowUpPrefill(draft, { source, actionType, unitIds, billIds, periodLabel, note, title });

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-01"
        title="공지 작성"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>}
      />

      <form
        action={createDraftAction}
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "var(--space-lg)", alignItems: "start" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>카테고리</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
              {(["urgent", "life", "event"] as const).map((category) => (
                <label key={category} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer" }}>
                  <input type="radio" name="category" value={category} defaultChecked={visibleDraft.category === category} />
                  <Badge emphasis={visibleDraft.category === category}>{CATEGORY_LABEL[category]}</Badge>
                </label>
              ))}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "var(--fs-caption)" }}>
              <input type="checkbox" name="confirmRequired" defaultChecked={visibleDraft.confirmRequired} />
              확인 게이트 필요
            </label>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>타깃</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
              {(["all", "building", "unit"] as const).map((scope) => (
                <label key={scope} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer" }}>
                  <input type="radio" name="scope" value={scope} defaultChecked={visibleDraft.scope === scope} />
                  <Badge emphasis={visibleDraft.scope === scope}>{SCOPE_LABEL[scope]}</Badge>
                </label>
              ))}
            </div>
            <Input name="targetLabel" aria-label="공지 타깃" defaultValue={visibleDraft.targetLabel} />
            <NoticeCard title="D20 타깃 가드">
              미납 세대 옵션은 없습니다. 연체·독촉은 M-BILL-05 단일 채널에서만 처리합니다.
            </NoticeCard>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>주제 → AI 초안</div>
            <Input name="title" aria-label="공지 주제" defaultValue={visibleDraft.title} required />
            <textarea
              name="body"
              aria-label="공지 본문"
              defaultValue={visibleDraft.body}
              required
              style={{
                minHeight: 190,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-lg)",
                lineHeight: 1.6,
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Button type="submit">임시 저장</Button>
              <Button type="submit" variant="secondary">검토하고 발송으로</Button>
            </div>
          </Card>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <NoticeCard title="발송은 다음 화면에서만" emphasis>
            이 화면은 작성과 저장까지만 담당합니다. 자동 발송 없이 검토 게이트를 거칩니다.
          </NoticeCard>
          {visibleDraft.category === "urgent" ? (
            <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <div style={sectionTitleStyle}>긴급 다국어 검수 템플릿</div>
              <div style={gridStyle}>
                {(visibleDraft.translations ?? []).map((translation) => (
                  <Card key={translation.lang} style={{ background: "var(--surface-container)" }}>
                    <Badge emphasis={translation.reviewed}>{translation.langLabel} 검수</Badge>
                    <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>{translation.title}</div>
                    <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {translation.body}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          ) : (
            <NoticeCard title="번역 안내">
              일반 공지는 선택 언어와 원문 토글을 제공합니다. 긴급만 주요 언어 검수 템플릿이 강제됩니다.
            </NoticeCard>
          )}
          <MetaRow label="저장 후 이동" value="발송 전 검토" />
          <Button type="submit" fullWidth>
            검토하고 발송으로
          </Button>
        </aside>
      </form>
    </>
  );
}

function applyReportFollowUpPrefill(
  draft: Awaited<ReturnType<typeof getAnnouncementDraft>>,
  prefill: ReportFollowUpPrefill
) {
  if (prefill.source !== "report") {
    return draft;
  }

  const units = splitQueryList(prefill.unitIds);
  const bills = splitQueryList(prefill.billIds);

  return {
    ...draft,
    category: "life" as const,
    scope: units.length ? "unit" as const : "building" as const,
    targetLabel: units.length ? units.map((unit) => `${unit}호`).join(", ") : draft.targetLabel,
    title: prefill.title?.trim() || `${prefill.periodLabel?.trim() || "리포트"} 후속 조치`,
    body: reportFollowUpBody(prefill, units, bills),
    confirmRequired: true,
  };
}

function reportFollowUpBody(prefill: ReportFollowUpPrefill, units: string[], bills: string[]) {
  return [
    `${prefill.periodLabel?.trim() || "리포트"} 기준 리포트 후속 조치입니다.`,
    units.length ? `대상 호실: ${units.join(", ")}` : undefined,
    bills.length ? `청구건: ${bills.join(", ")}` : undefined,
    prefill.note?.trim(),
    "발송 전 원본 행을 다시 대조하세요.",
    prefill.actionType === "dunning" ? "납부/독촉 실행은 M-BILL 원본 행 대조 후 단일 채널에서 확정하세요." : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function splitQueryList(value?: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
