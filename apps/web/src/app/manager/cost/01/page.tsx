import { Input } from "@roomlog/ui";
import { listReceipts } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  DisabledButton,
  LinkButton,
  PageStack,
  ReceiptList,
  ScreenHeader,
  Section,
  actionRowStyle,
  grid3Style,
  grid2Style,
  mutedSmallStyle,
  rowStyle,
} from "../_components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const receipts = await listReceipts();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-01"
        title="영수증 첨부·업로드"
        desc="메인은 결제·정산 흐름의 inline 첨부이고, 독립 업로드는 보조 진입입니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">원장으로</LinkButton>}
      />

      <Section title="소스">
        <div style={grid3Style}>
          {[
            ["폰 촬영", "현장에서 촬영 후 금액·유형 최소 확정까지 진행"],
            ["파일", "이미지 또는 PDF 영수증 첨부"],
            ["온라인 영수증", "전자 영수증 URL·파일 보관"],
          ].map(([title, desc]) => (
            <div key={title} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 850 }}>{title}</div>
                <div style={mutedSmallStyle}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="독립 업로드 보조 정보">
        <div style={grid2Style}>
          <Input aria-label="관련 호실" placeholder="관련 호실 선택(선택)" readOnly />
          <Input aria-label="온라인 영수증" placeholder="온라인 영수증 URL 또는 파일명" readOnly />
        </div>
      </Section>

      <Section title="중복 검사">
        <ReceiptList receipts={receipts} />
      </Section>

      <div style={actionRowStyle}>
        <DisabledButton>파일 선택</DisabledButton>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-02"]}>OCR 분석 시작</LinkButton>
      </div>
    </PageStack>
  );
}
