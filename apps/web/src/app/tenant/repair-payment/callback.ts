import {
  markerForRepairPaymentOrder,
  resolveRepairPaymentFailure,
  resolveRepairPaymentSuccess,
  type RepairPaymentCallbackParams,
  type RepairPaymentFailureDependencies,
  type RepairPaymentSuccessDependencies,
} from "../../../lib/repair-payment-callback";
import { normalizeTenantRepairPaymentReturnPath } from "../../../lib/tenant-repair-payment-return-path";

export { markerForRepairPaymentOrder };

function withoutInternalOrderMarker(target: string): string {
  const parsed = new URL(target, "https://roomlog.invalid");
  parsed.searchParams.delete("repairPaymentOrderId");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export async function resolveTenantRepairPaymentSuccess(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentSuccessDependencies,
): Promise<string> {
  return withoutInternalOrderMarker(await resolveRepairPaymentSuccess(
    params,
    dependencies,
    normalizeTenantRepairPaymentReturnPath,
  ));
}

export async function resolveTenantRepairPaymentFailure(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentFailureDependencies,
): Promise<string> {
  return withoutInternalOrderMarker(await resolveRepairPaymentFailure(
    params,
    dependencies,
    normalizeTenantRepairPaymentReturnPath,
  ));
}
