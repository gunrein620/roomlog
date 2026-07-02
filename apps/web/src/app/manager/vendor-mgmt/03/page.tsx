import { Input, ManagerShell } from "@roomlog/ui";
import { getVendorDetail, listVendorDuplicateCandidates } from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import {
  LinkButton,
  ManagerVendorMgmtNav,
  MetaRow,
  NoticeCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  tradeLabel,
  tradeOptions,
  vendorHref,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const [detail, duplicates] = await Promise.all([
    id ? getVendorDetail(id) : Promise.resolve(undefined),
    listVendorDuplicateCandidates(),
  ]);
  const vendor = detail?.vendor;
  const cancelHref = vendor ? vendorHref("M-VEND-01", vendor.id) : MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"];

  return (
    <ManagerShell title="업체 등록/편집" context="M-VEND-03 · 보조 등록" nav={<ManagerVendorMgmtNav />}>
      <PageStack>
        <ScreenHeader
          eyebrow="M-VEND-03"
          title={vendor ? `${vendor.name} 편집` : "업체 등록"}
          desc="신규 업체의 주 경로는 M-DASH-04 배정 순간 인라인 등록입니다. 이 화면은 독립 보조 경로입니다."
          actions={<LinkButton href={cancelHref} variant="ghost">취소</LinkButton>}
        />

        <section style={grid2Style}>
          <Section title="업체 정보">
            <div style={{ display: "grid", gap: "var(--space-md)" }}>
              <Input aria-label="업체명" placeholder="업체명" defaultValue={vendor?.name ?? ""} readOnly />
              <Input aria-label="담당자" placeholder="담당자" defaultValue={vendor?.contactPerson ?? ""} readOnly />
              <Input aria-label="전화" placeholder="연락처" defaultValue={vendor?.phone ?? ""} readOnly />
              <Input aria-label="주소" placeholder="주소" defaultValue={vendor?.address ?? ""} readOnly />
              <Input aria-label="메모" placeholder="메모" defaultValue={vendor?.memo ?? ""} readOnly />
            </div>
          </Section>

          <Section title="상태·분야">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <MetaRow label="vendor_id" value={vendor?.id ?? "저장 시 생성"} />
              <MetaRow label="상태" value={vendor ? "활성/비활성/폐업 중 선택" : "활성"} />
              <MetaRow label="선택 분야" value={vendor ? vendor.trades.map((trade) => tradeLabel[trade]).join(", ") : "분야 선택"} />
              <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
                {tradeOptions.map((trade) => (
                  <LinkButton key={trade} href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-03"]} variant="ghost">
                    {tradeLabel[trade]}
                  </LinkButton>
                ))}
              </div>
            </div>
          </Section>
        </section>

        <Section title="중복 탐지">
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {duplicates.map((candidate) => (
              <MetaRow
                key={`${candidate.vendorId}-${candidate.reason}`}
                label={candidate.reason === "same_phone" ? "같은 연락처" : "같은 이름"}
                value={`${candidate.name} (${candidate.vendorId})`}
              />
            ))}
          </div>
        </Section>

        <NoticeCard title="개인정보 고지" emphasis>
          연락처와 주소는 관리인 전용이며 임차인에게 노출하지 않습니다. 성과 입력, 배정 선호, 자동출동 설정은 이 화면 범위가 아닙니다.
        </NoticeCard>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href={cancelHref} variant="ghost">취소</LinkButton>
          <LinkButton href={vendor ? vendorHref("M-VEND-01", vendor.id) : MANAGER_VENDOR_MGMT_ROUTES["M-VEND-01"]}>저장</LinkButton>
        </div>
      </PageStack>
    </ManagerShell>
  );
}
