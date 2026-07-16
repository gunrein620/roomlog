import { safeVendorReturnPath } from "../../lib/vendor-activation";
import { unifiedLoginPath } from "../../lib/unified-login";

/**
 * Vendor activation starts from a normal SEEKER identity. VENDOR capability is
 * granted only after the server-owned activation claim succeeds.
 */
export function vendorActivationAuthPaths(returnTo?: string | null) {
  const safeReturnTo = safeVendorReturnPath(returnTo);
  return {
    login: unifiedLoginPath(undefined, safeReturnTo),
    signup: `/signup?role=SEEKER&redirectTo=${encodeURIComponent(safeReturnTo)}`
  };
}
