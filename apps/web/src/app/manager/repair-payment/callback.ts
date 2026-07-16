import {
  markerForRepairPaymentOrder,
  resolveRepairPaymentFailure,
  resolveRepairPaymentSuccess,
  type RepairPaymentCallbackParams,
  type RepairPaymentFailureDependencies,
  type RepairPaymentSuccessDependencies,
} from "../../../lib/repair-payment-callback";
import { normalizeManagerReturnPath } from "../../../lib/credit-return-path";

export { markerForRepairPaymentOrder };

export function resolveManagerRepairPaymentSuccess(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentSuccessDependencies,
): Promise<string> {
  return resolveRepairPaymentSuccess(
    params,
    dependencies,
    normalizeManagerReturnPath,
  );
}

export function resolveManagerRepairPaymentFailure(
  params: RepairPaymentCallbackParams,
  dependencies: RepairPaymentFailureDependencies,
): Promise<string> {
  return resolveRepairPaymentFailure(
    params,
    dependencies,
    normalizeManagerReturnPath,
  );
}
