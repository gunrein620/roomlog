import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";
import { ErrorState, LinkButton, VendorPageStack, VendorScreenHeader } from "../_components";

export default function VendorMgmtErrorPage() {
  return (
    <VendorPageStack>
      <VendorScreenHeader eyebrow="업체 관리" title="요청을 완료하지 못했습니다" description="업체 정보는 변경되지 않았습니다." />
      <ErrorState message="잠시 후 다시 시도하거나 내 업체 목록으로 돌아가 주세요." />
      <div><LinkButton href={MANAGER_VENDOR_MGMT_PATHS.vendors}>내 업체로 돌아가기</LinkButton></div>
    </VendorPageStack>
  );
}
