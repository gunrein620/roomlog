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
          demo={result.source === "DEMO"}
          actions={<ManagerVendorRegistrationDialog disabled={result.source === "DEMO"} />}
        />
        <VendorSection
          title={`${activeVendors.length}개 업체`}
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
