import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  Card,
  ContractShell,
  LinkButton,
  PageStack,
  Section,
} from "../_components";

export default function Page() {
  return (
    <ContractShell id="M-DOC-E0" title="로드 오류">
      <PageStack>
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
            계약 정보를 불러오지 못했습니다
          </h1>
          <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            필터와 직전 경로를 유지한 채 다시 시도할 수 있습니다. 계속 실패하면 대시보드로 돌아가 검토 큐를 확인합니다.
          </p>
        </Card>

        <Section title="복구 옵션">
          <Card style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-00"]}>다시 시도</LinkButton>
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-00"]} variant="secondary">대시보드로</LinkButton>
          </Card>
        </Section>
      </PageStack>
    </ContractShell>
  );
}
