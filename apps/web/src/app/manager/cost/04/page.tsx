import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import { getDisclosureSetting, updateCostDisclosure } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  DisclosurePreview,
  LinkButton,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  mutedSmallStyle,
  rowStyle,
  won,
} from "../_components";

export const dynamic = "force-dynamic";

async function updateDisclosureAction(formData: FormData) {
  "use server";

  const costId = String(formData.get("costId") ?? "");
  const disclosure = String(formData.get("disclosure") ?? "");

  if (disclosure !== "public" && disclosure !== "private") {
    throw new Error("Invalid disclosure state");
  }

  await updateCostDisclosure(costId, disclosure);
  redirect(MANAGER_COST_ROUTES["M-COST-04"]);
}

export default async function Page() {
  const setting = await getDisclosureSetting();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-04"
        title="관리비 공개"
        desc="관리비는 기본 공개입니다. 비공개 예외가 있으면 항목별로 숨기고, 세입자에게는 숨김 건수만 고지합니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">원장으로</LinkButton>}
      />

      <section style={grid2Style}>
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>저장 범위</div>
          <div style={rowStyle}><span>월</span><span>{setting.month}</span></div>
          <div style={rowStyle}><span>범위</span><span>{setting.scope === "unit" ? `${setting.unitId}호` : "건물"}</span></div>
          <div style={rowStyle}><span>저장 방식</span><span>append-only</span></div>
        </Card>
        <DisclosurePreview setting={setting} />
      </section>

      <Section title="공개 상태 목록">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {setting.entries.map((entry) => (
            <div key={entry.costId} style={{ ...rowStyle, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 850 }}>{entry.item}</div>
                <div style={mutedSmallStyle}>
                  {entry.disclosure === "public" ? "기본 공개" : `비공개 사유: ${entry.privateReason ?? "예외 처리"}`}
                </div>
              </div>
              <div style={{ display: "grid", gap: "var(--space-xs)", justifyItems: "end" }}>
                <span style={{ fontWeight: 850 }}>{won(entry.amount)}</span>
                <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <form action={updateDisclosureAction}>
                    <input type="hidden" name="costId" value={entry.costId} />
                    <input type="hidden" name="disclosure" value="public" />
                    <button type="submit" style={entry.disclosure === "public" ? activeButtonStyle : ghostButtonStyle}>공개</button>
                  </form>
                  <form action={updateDisclosureAction}>
                    <input type="hidden" name="costId" value={entry.costId} />
                    <input type="hidden" name="disclosure" value="private" />
                    <button type="submit" style={entry.disclosure === "private" ? activeButtonStyle : ghostButtonStyle}>비공개</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="청구·수납 경계">
        <Card style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
          이 화면은 관리비 지출 공개만 다룹니다. 세입자에게 청구하거나 납부 상태를 바꾸는 작업은 납부·청구 도메인에서 처리합니다.
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-04"]} variant="secondary">미리보기 새로고침</LinkButton>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]}>원장으로</LinkButton>
      </div>
    </PageStack>
  );
}

const activeButtonStyle = {
  minHeight: 36,
  padding: "0 var(--space-md)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButtonStyle = {
  minHeight: 36,
  padding: "0 var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
