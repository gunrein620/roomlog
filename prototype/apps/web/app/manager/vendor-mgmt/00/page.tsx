import { Input, ManagerShell } from "@roomlog/ui";
import { listVendors } from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import {
  LinkButton,
  ManagerVendorMgmtNav,
  NoticeCard,
  PageStack,
  ScreenHeader,
  Section,
  VendorRows,
  tradeLabel,
  tradeOptions,
} from "../_components";

type SearchParams = Promise<{ q?: string; trade?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { q, trade } = await searchParams;
  const vendors = await listVendors({ q, trade: trade as never, sort: "trade_recent" });

  return (
    <ManagerShell title="업체 주소록" context="M-VEND-00 · 자동 누적 read" nav={<ManagerVendorMgmtNav />}>
      <PageStack>
        <ScreenHeader
          eyebrow="M-VEND-00"
          title="업체 주소록"
          desc="완료된 수리에서 자동 누적된 업체를 분야와 최근 사용 기준으로 찾습니다. 목록에는 별점을 노출하지 않습니다."
          actions={<LinkButton href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-03"]} variant="secondary">업체 직접 추가</LinkButton>}
        />

        <Section title="검색·필터">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 180px 220px", gap: "var(--space-md)" }}>
            <Input aria-label="업체 검색" placeholder="업체명, 연락처, 담당자 검색" defaultValue={q ?? ""} readOnly />
            <Input aria-label="분야 필터" value={trade && trade in tradeLabel ? tradeLabel[trade as keyof typeof tradeLabel] : "전체 분야"} readOnly />
            <Input aria-label="정렬" value="분야 매칭·최근 사용" readOnly />
          </div>
          <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
            <LinkButton href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"]} variant="ghost">전체</LinkButton>
            {tradeOptions.slice(0, 5).map((option) => (
              <LinkButton key={option} href={`${MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"]}?trade=${option}`} variant="ghost">
                {tradeLabel[option]}
              </LinkButton>
            ))}
          </div>
        </Section>

        {vendors.length > 0 ? (
          <Section title="업체 목록">
            <VendorRows vendors={vendors} />
          </Section>
        ) : (
          <NoticeCard title="주소록이 비어 있어요" emphasis>
            완료된 수리에서 업체가 자동 등록돼요. 지금 추가도 가능하지만, 본체는 수리 완료 이력에서 누적되는 read 뷰입니다.
          </NoticeCard>
        )}

        <NoticeCard title="공정성 가드">
          신규 업체는 같은 행 높이로 목록에 섞고 '신규' 배지만 표시합니다. 성과순 정렬과 목록 별점은 제공하지 않습니다.
        </NoticeCard>
      </PageStack>
    </ManagerShell>
  );
}
