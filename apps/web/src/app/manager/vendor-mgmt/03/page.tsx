import { redirect } from "next/navigation";
import { legacyVendorMgmtRedirect } from "@/lib/vendor-mgmt-nav";

export default function LegacyVendorEditorPage() {
  redirect(legacyVendorMgmtRedirect("03", {}));
}
