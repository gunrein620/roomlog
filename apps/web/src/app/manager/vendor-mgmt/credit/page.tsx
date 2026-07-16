import { getManagerCreditWorkspace } from "@/lib/vendor-credit-api";
import {
  ErrorState,
  VendorPageStack,
  VendorScreenHeader,
} from "../_components";
import { CreditWorkspace } from "./CreditWorkspace";
import { toCreditWorkspaceView } from "./view-model";

export default async function ManagerCreditWorkspacePage() {
  try {
    const result = toCreditWorkspaceView(await getManagerCreditWorkspace());
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="업체 정산"
          title="크레딧·결제"
          description="업체 지급에 사용할 크레딧과 자동결제 기준, 지급 요청 및 거래 이력을 한곳에서 관리합니다."
          demo={result.source === "DEMO"}
        />
        <CreditWorkspace initialResult={result} />
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="업체 정산"
          title="크레딧·결제"
          description="크레딧과 업체 지급 정보를 불러옵니다."
        />
        <ErrorState
          title="크레딧 정보를 불러오지 못했습니다"
          message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
        />
      </VendorPageStack>
    );
  }
}
