import { redirect } from "next/navigation";
import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";

export default function LegacyVendorEditorPage() {
  redirect(MANAGER_VENDOR_MGMT_PATHS.vendors);
}
