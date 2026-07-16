import { redirect } from "next/navigation";
import { legacyVendorMgmtRedirect } from "@/lib/vendor-mgmt-nav";

type SearchParams = Promise<{ id?: string; vendorId?: string }>;

export default async function LegacyVendorPerformancePage({ searchParams }: { searchParams: SearchParams }) {
  redirect(legacyVendorMgmtRedirect("02", await searchParams));
}
