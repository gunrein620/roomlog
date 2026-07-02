import { Card } from "@roomlog/ui";
import { getDisclosureSetting } from "@/lib/cost-api";
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

export default async function Page() {
  const setting = await getDisclosureSetting();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-04"
        title="관리비 공개"
        desc="관리비는 기본 공개(opt-out)입니다. 비공개 예외가 있어도 숨김 건수는 임차인에게 고지합니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">원장으로</LinkButton>}
      />

      <section style={grid2Style}>
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>대상 범위</div>
          <div style={rowStyle}><span>월</span><span>{setting.month}</span></div>
          <div style={rowStyle}><span>범위</span><span>{setting.scope === "unit" ? `${setting.unitId}호` : "건물"}</span></div>
          <div style={rowStyle}><span>저장 방식</span><span>append-only</span></div>
        </Card>
        <DisclosurePreview setting={setting} />
      </section>

      <Section title="공개 상태 목록">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {setting.entries.map((entry) => (
            <div key={entry.costId} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 850 }}>{entry.item}</div>
                <div style={mutedSmallStyle}>
                  {entry.disclosure === "public" ? "기본 공개" : `비공개 사유: ${entry.privateReason ?? "사유 필요"}`}
                </div>
              </div>
              <span style={{ fontWeight: 850 }}>{won(entry.amount)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="청구와의 경계">
        <Card style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
          관리비 사용내역은 관리인이 쓴 돈의 공개 내역입니다. M-BILL 청구액은 임차인에게 받을
          돈이며, 두 수치는 호실·월 연결키로 묶되 같은 금액으로 표시하지 않습니다.
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-04"]} variant="secondary">미리보기</LinkButton>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]}>공개 설정 저장</LinkButton>
      </div>
    </PageStack>
  );
}
