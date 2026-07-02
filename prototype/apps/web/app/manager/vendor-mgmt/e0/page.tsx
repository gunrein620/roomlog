import { ManagerShell } from "@roomlog/ui";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import {
  LinkButton,
  ManagerVendorMgmtNav,
  NoticeCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
} from "../_components";

type SearchParams = Promise<{ kind?: string; from?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { kind, from } = await searchParams;
  const retryHref = from && from.startsWith("/manager/vendor-mgmt/")
    ? from
    : MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"];

  return (
    <ManagerShell title="빈 상태 / 오류" context="M-VEND-E0 · 복구" nav={<ManagerVendorMgmtNav />}>
      <PageStack>
        <ScreenHeader eyebrow="M-VEND-E0" title="빈 상태 / 로드 오류" />

        <section style={grid2Style}>
          <NoticeCard title="빈 주소록" emphasis={kind !== "error"}>
            완료된 수리에서 업체가 자동 등록돼요. 지금 직접 추가도 가능하지만, 주소록의 본체는 자동 누적 read 뷰입니다.
          </NoticeCard>
          <NoticeCard title="로드 실패" emphasis={kind === "error"}>
            필터와 검색어는 유지한 채 다시 시도합니다. 실패 상태에서도 신규 업체를 별도 격리 섹션으로 분리하지 않습니다.
          </NoticeCard>
        </section>

        <Section title="복구">
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <LinkButton href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-03"]}>업체 직접 추가</LinkButton>
            <LinkButton href={retryHref} variant="secondary">다시 시도</LinkButton>
            <LinkButton href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"]} variant="ghost">주소록으로</LinkButton>
          </div>
        </Section>
      </PageStack>
    </ManagerShell>
  );
}
