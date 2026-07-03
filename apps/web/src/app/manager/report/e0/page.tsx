import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Card } from "@roomlog/ui";
import { LinkButton, PageStack, ScreenHeader } from "../_components";

export default function Page() {
  return (
    <PageStack>
      <ScreenHeader eyebrow="M-RPT-E0" title="로드·생성 오류" subtitle="마지막 화면으로 다시 시도하거나 허브로 돌아갑니다." />
      <Card style={{ display: "grid", gap: "var(--space-md)", maxWidth: 680 }}>
        <div style={{ lineHeight: "var(--lh-body)" }}>
          일부 원천 데이터 또는 생성 결과를 불러오지 못했습니다. 가능하면 이미 저장된 리포트와 데모 폴백을 보여주고, 생성·내보내기 확정은 재시도 후 진행합니다.
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]}>다시 시도</LinkButton>
          <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]} variant="secondary">허브로</LinkButton>
        </div>
      </Card>
    </PageStack>
  );
}

