import { Card } from "@roomlog/ui";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import { LinkButton, PageStack, ScreenHeader, Section, grid3Style, mutedSmallStyle } from "../_components";

export default function Page() {
  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-E0"
        title="로드 오류"
        desc="퇴실·정산 검토 데이터 로드 실패 시 직전 경로로 다시 시도하거나 대시보드로 복구합니다."
      />

      <section style={grid3Style}>
        {[
          ["대시보드 로드 실패", "만료 예정 호실과 SLA 카운트를 불러오지 못했습니다."],
          ["리포트 근거 실패", "입주전 비교, 하자, 수리, 납부 근거를 다시 요청합니다."],
          ["정산안 로드 실패", "검토 게이트와 이의 enum을 확인하지 못했습니다."],
        ].map(([title, desc]) => (
          <Card key={title} style={{ minHeight: 132 }}>
            <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>{title}</div>
            <div style={{ marginTop: "var(--space-sm)", ...mutedSmallStyle }}>{desc}</div>
          </Card>
        ))}
      </section>

      <Section title="복구">
        <Card style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-01"]} variant="secondary">다시 시도</LinkButton>
          <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-00"]}>대시보드로</LinkButton>
        </Card>
      </Section>
    </PageStack>
  );
}
