import { getManagerCreditWorkspace } from "@/lib/vendor-credit-api";
import {
  ErrorState,
  VendorPageStack,
} from "../_components";
import { CreditWorkspace } from "./CreditWorkspace";
import { toCreditWorkspaceView } from "./view-model";

export default async function ManagerCreditWorkspacePage() {
  try {
    const result = toCreditWorkspaceView(await getManagerCreditWorkspace());
    return (
      <VendorPageStack>
        <CreditWorkspace initialResult={result} />
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <ErrorState
          title="크레딧 정보를 불러오지 못했습니다"
          message={error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
        />
      </VendorPageStack>
    );
  }
}
