import { Card } from "@roomlog/ui";
import { getReceiptOcr } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  LinkButton,
  OcrFieldRows,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  mutedSmallStyle,
  rowStyle,
  typeLabel,
  won,
} from "../_components";

export default async function Page() {
  const ocr = await getReceiptOcr();
  const needsReview = Object.values(ocr.fields).filter((field) => field?.needsReview).length;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-02"
        title="OCR 경량 검토"
        desc="신뢰 필드는 자동 통과하고, 확인 필요 필드만 펼쳐 최소 노동으로 확정합니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-01"]} variant="ghost">뒤로</LinkButton>}
      />

      <section style={grid2Style}>
        <Card style={{ minHeight: 320, display: "grid", alignContent: "center", textAlign: "center", background: "var(--surface-container-high)" }}>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>원본 영수증 미리보기</div>
          <div style={{ marginTop: "var(--space-sm)", color: "var(--on-surface-variant)" }}>
            구겨진 감열지여도 확인 필요 필드만 보정합니다.
          </div>
        </Card>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <div>
            <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>추출 필드</div>
            <div style={mutedSmallStyle}>확인 필요 {needsReview}개 · 나머지는 자동 통과</div>
          </div>
          <OcrFieldRows ocr={ocr} />
        </Card>
      </section>

      <Section title="유형 분류">
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 850 }}>AI 제안: {ocr.suggestedType ? typeLabel[ocr.suggestedType] : "미정"}</div>
            <div style={mutedSmallStyle}>불확실하면 이 화면에서만 선택합니다. 업로드 단계에는 출처 힌트를 두지 않습니다.</div>
          </div>
          <span style={{ fontWeight: 850 }}>{Math.round((ocr.typeConfidence ?? 0) * 100)}%</span>
        </div>
      </Section>

      <Section title="다중 항목 분할">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={rowStyle}>
            <div>
              <div style={{ fontWeight: 850 }}>기본: 전체 1건으로 확정</div>
              <div style={mutedSmallStyle}>혼재 영수증도 먼저 진행 가능하게 둡니다.</div>
            </div>
            <span>{won(ocr.lineItems.reduce((sum, item) => sum + item.amount, 0))}</span>
          </div>
          {ocr.lineItems.map((item) => (
            <div key={`${item.label}-${item.amount}`} style={rowStyle}>
              <span>{item.label}</span>
              <span>{won(item.amount)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="관리비 공개">
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 850 }}>관리비면 기본 공개</div>
            <div style={mutedSmallStyle}>예외로 비공개할 수 있지만 임차인에게 숨김 N건은 고지됩니다.</div>
          </div>
          <span style={{ fontWeight: 850 }}>opt-out</span>
        </div>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">나중에</LinkButton>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-03"]}>미검증 라벨로 확정</LinkButton>
      </div>
    </PageStack>
  );
}
