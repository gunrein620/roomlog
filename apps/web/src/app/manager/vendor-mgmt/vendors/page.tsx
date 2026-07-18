import { listManagerVendors } from "@/lib/vendor-mgmt-api";
import {
  EmptyState,
  ErrorState,
  ManagerVendorTable,
  VendorPageStack,
  VendorScreenHeader,
  VendorSection,
} from "../_components";
import { ManagerVendorRegistrationDialog } from "./ManagerVendorRegistrationDialog";

type SearchParams = Promise<{ query?: string; trade?: string }>;

export default async function ManagerVendorsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = await searchParams;
  try {
    const result = await listManagerVendors({
      query: filters.query,
      trade: filters.trade,
    });
    const activeVendors = result.data.filter((vendor) => vendor.status === "ACTIVE");
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="협력업체"
          title="내 업체"
          description="운영팀이 검증한 업체 중 직접 등록한 협력업체와 진행 중인 작업을 관리합니다. 업체 원장 정보는 이 화면에서 수정하지 않습니다."
          demo={result.source === "DEMO"}
          actions={<ManagerVendorRegistrationDialog disabled={result.source === "DEMO"} />}
        />
        <VendorSection
          title={`${activeVendors.length}개 업체`}
          description="계정 연결과 운영 검증이 모두 완료된 업체만 하자 작업에 배정할 수 있습니다."
        >
          {activeVendors.length > 0 ? (
            <ManagerVendorTable
              vendors={activeVendors}
            />
          ) : (
            <EmptyState title="등록한 업체가 없습니다" description="업체 등록 버튼에서 협력업체 정보를 등록해 주세요." />
          )}
        </VendorSection>
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <VendorScreenHeader eyebrow="협력업체" title="내 업체" description="등록한 업체를 불러옵니다." />
        <ErrorState message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."} />
      </VendorPageStack>
    );
  }
}
