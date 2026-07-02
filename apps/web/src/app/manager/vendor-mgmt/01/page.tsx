import { Badge, ManagerShell } from "@roomlog/ui";
import { getVendorDetail } from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import {
  JobRows,
  LinkButton,
  ManagerVendorMgmtNav,
  MetaRow,
  NoticeCard,
  PageStack,
  RatingGuard,
  ScreenHeader,
  Section,
  StatusBadge,
  Trades,
  grid2Style,
  mutedStyle,
  perfSummary,
  vendorHref,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const { vendor, jobs, perf } = await getVendorDetail(id);

  return (
    <ManagerShell title="업체 상세" context="M-VEND-01 · 관리인 전용" nav={<ManagerVendorMgmtNav />}>
      <PageStack>
        <ScreenHeader
          eyebrow="M-VEND-01"
          title={vendor.name}
          desc="연락처와 주소는 관리인 전용이며 임차인에게 노출하지 않습니다. 거래 이력은 호실을 마스킹해 표시합니다."
          actions={
            <>
              <LinkButton href={vendorHref("M-VEND-02", vendor.id)}>성과 보기</LinkButton>
              <LinkButton href={MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"]} variant="ghost">주소록</LinkButton>
            </>
          }
        />

        <section style={grid2Style}>
          <Section title="기본 정보">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                <StatusBadge status={vendor.status} />
                {vendor.isNew ? <Badge emphasis>신규</Badge> : null}
                <span style={mutedStyle}>{vendor.source === "auto" ? "완료 수리 자동 누적" : "직접 추가"}</span>
              </div>
              <Trades trades={vendor.trades} />
              <MetaRow label="담당자" value={vendor.contactPerson ?? "미입력"} />
              <MetaRow label="전화" value={vendor.phone ?? "미입력"} />
              <MetaRow label="주소" value={vendor.address ?? "미입력"} />
              <MetaRow label="메모" value={vendor.memo ?? "없음"} />
            </div>
          </Section>

          <Section title="성과 요약">
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <MetaRow label="표시" value={<RatingGuard perf={perf} />} />
              <MetaRow label="커버리지" value={perf ? `${perf.ratedCount}/${perf.completedCount}` : "0/0"} />
              <MetaRow label="요약" value={perfSummary(perf)} />
              <NoticeCard title="소표본 가드">
                min_n 미만이면 별점 수치를 숨기고 거래 건수만 보여줍니다. 만족도 입력은 M-DASH-04 완료 확인 직후에만 소유합니다.
              </NoticeCard>
            </div>
          </Section>
        </section>

        <Section
          title="거래 이력"
          action={<LinkButton href={vendorHref("M-VEND-03", vendor.id)} variant="secondary">정보 편집</LinkButton>}
        >
          <JobRows jobs={jobs} />
        </Section>

        <NoticeCard title="개인정보 경계" emphasis>
          연락처·주소는 관리인 전용입니다. ticket_id와 vendor_job_id를 분리하고 호실은 공개 비대칭이 생기지 않도록 마스킹합니다.
        </NoticeCard>
      </PageStack>
    </ManagerShell>
  );
}
