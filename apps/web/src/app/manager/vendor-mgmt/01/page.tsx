import { redirect } from "next/navigation";
import { legacyVendorMgmtRedirect } from "@/lib/vendor-mgmt-nav";

type SearchParams = Promise<{ id?: string; vendorId?: string }>;

export default async function LegacyVendorDetailPage({ searchParams }: { searchParams: SearchParams }) {
  redirect(legacyVendorMgmtRedirect("01", await searchParams));
}
