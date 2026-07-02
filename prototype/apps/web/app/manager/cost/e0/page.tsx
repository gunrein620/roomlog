import { Card } from "@roomlog/ui";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import { LinkButton, PageStack, ScreenHeader, Section, grid3Style, mutedSmallStyle } from "../_components";

export default function Page() {
  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-E0"
        title="로드·OCR 오류"
        desc="로드, OCR, 업로드 실패 시 직전 경로로 복귀하거나 증빙 없음 수동 입력으로 원장 구분을 유지합니다."
      />

      <section style={grid3Style}>
        {[
          ["로드 실패", "원장 또는 큐 데이터를 불러오지 못했습니다."],
          ["OCR 저신뢰", "자동 통과가 어려운 필드만 확인 필요로 남깁니다."],
          ["업로드 실패", "파일을 다시 첨부하거나 수동 입력으로 계속합니다."],
        ].map(([title, desc]) => (
          <Card key={title} style={{ minHeight: 132 }}>
            <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>{title}</div>
            <div style={{ marginTop: "var(--space-sm)", ...mutedSmallStyle }}>{desc}</div>
          </Card>
        ))}
      </section>

      <Section title="복구">
        <Card style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href={MANAGER_COST_ROUTES["M-COST-01"]} variant="secondary">다시 시도</LinkButton>
          <LinkButton href={MANAGER_COST_ROUTES["M-COST-02"]} variant="ghost">수동 입력</LinkButton>
          <LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]}>원장으로</LinkButton>
        </Card>
      </Section>
    </PageStack>
  );
}
