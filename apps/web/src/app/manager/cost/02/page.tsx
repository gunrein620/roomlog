import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import { confirmReceiptOcr, getReceiptOcr } from "@/lib/cost-api";
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

type SearchParams = Promise<{ id?: string }>;

export const dynamic = "force-dynamic";

async function confirmOcrAction(formData: FormData) {
  "use server";

  const ocrId = String(formData.get("ocrId") ?? "");
  const cost = await confirmReceiptOcr(ocrId);
  redirect(`${MANAGER_COST_ROUTES["M-COST-03"]}?id=${encodeURIComponent(cost.id)}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const ocr = await getReceiptOcr(id);
  const needsReview = Object.values(ocr.fields).filter((field) => field?.needsReview).length;
  const total = ocr.lineItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-02"
        title="영수증 OCR 검토"
        desc="추출값을 확인하고 비용 원장에 확정합니다. 확인이 필요한 필드는 미검증 라벨로 남겨 추후 정정할 수 있습니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-01"]} variant="ghost">뒤로</LinkButton>}
      />

      <section style={grid2Style}>
        <Card style={{ minHeight: 320, display: "grid", alignContent: "center", textAlign: "center", background: "var(--surface-container-high)" }}>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>원본 영수증 미리보기</div>
          <div style={{ marginTop: "var(--space-sm)", color: "var(--on-surface-variant)" }}>
            업로드 원본은 여기에서 확인하고, 비용 원장에는 오른쪽 추출값만 반영됩니다.
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
            <div style={mutedSmallStyle}>분류가 불확실해도 미검증 라벨로 확정할 수 있습니다.</div>
          </div>
          <span style={{ fontWeight: 850 }}>{Math.round((ocr.typeConfidence ?? 0) * 100)}%</span>
        </div>
      </Section>

      <Section title="항목 분할">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={rowStyle}>
            <div>
              <div style={{ fontWeight: 850 }}>기본: 전체 1건으로 확정</div>
              <div style={mutedSmallStyle}>후속 OCR 고도화 전까지는 한 영수증을 한 원장 항목으로 확정합니다.</div>
            </div>
            <span>{won(total)}</span>
          </div>
          {ocr.lineItems.map((item) => (
            <div key={`${item.label}-${item.amount}`} style={rowStyle}>
              <span>{item.label}</span>
              <span>{won(item.amount)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="관리비 공개 원칙">
        <div style={rowStyle}>
          <div>
            <div style={{ fontWeight: 850 }}>관리비는 기본 공개</div>
            <div style={mutedSmallStyle}>비공개 예외가 있으면 관리비 공개 화면에서 항목별로 숨김 처리합니다.</div>
          </div>
          <span style={{ fontWeight: 850 }}>예외 허용</span>
        </div>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">나중에</LinkButton>
        <form action={confirmOcrAction}>
          <input type="hidden" name="ocrId" value={ocr.id} />
          <button type="submit" style={submitButtonStyle}>미검증 라벨로 확정</button>
        </form>
      </div>
    </PageStack>
  );
}

const submitButtonStyle = {
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-lg)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
