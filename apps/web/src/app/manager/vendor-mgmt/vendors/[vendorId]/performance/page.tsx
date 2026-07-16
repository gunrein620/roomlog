import { getManagerVendorDetail, getManagerVendorPerformance } from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";
import {
  ErrorState,
  JobTable,
  LinkButton,
  MetricGrid,
  VendorPageStack,
  VendorScreenHeader,
  VendorSection,
  formatDate,
  formatWon,
} from "../../../_components";

type Params = Promise<{ vendorId: string }>;

export default async function ManagerVendorPerformancePage({ params }: { params: Params }) {
  const { vendorId } = await params;
  try {
    const [detailResult, performanceResult] = await Promise.all([
      getManagerVendorDetail(vendorId),
      getManagerVendorPerformance(vendorId),
    ]);
    const { vendor, jobs } = detailResult.data;
    const performance = performanceResult.data;
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="업체 성과"
          title={`${vendor.catalog.businessName} 수치 성과`}
          description="완료된 작업에서 집계한 응답 속도와 승인 금액만 보여줍니다. AI 평가 문구나 근거 없는 별점은 만들지 않습니다."
          demo={detailResult.source === "DEMO" || performanceResult.source === "DEMO"}
          actions={<LinkButton href={MANAGER_VENDOR_MGMT_PATHS.vendor(vendor.vendorId)} secondary>업체 상세</LinkButton>}
        />
        <MetricGrid metrics={[
          { label: "완료 작업", value: `${performance.completedCount}건` },
          { label: "견적 응답 중앙값", value: performance.medianEstimateResponseHours === undefined ? "자료 부족" : `${performance.medianEstimateResponseHours}시간` },
          { label: "평균 승인 금액", value: formatWon(performance.averageApprovedAmount) },
          { label: "최근 집계", value: formatDate(performance.updatedAt) },
        ]} />
        <VendorSection title="성과 근거 작업" description="현재 관리자의 작업만 표시하며 내부 식별자를 성과 설명으로 노출하지 않습니다.">
          <JobTable jobs={jobs} />
        </VendorSection>
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <VendorScreenHeader eyebrow="업체 성과" title="수치 성과" description="업체의 작업 성과를 확인합니다." />
        <ErrorState message={error instanceof Error ? error.message : "성과를 불러오지 못했습니다."} />
      </VendorPageStack>
    );
  }
}
