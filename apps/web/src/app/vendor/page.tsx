import { PhoneFrame } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { hasHousingCapability } from "@/lib/vendor-activation";
import { hasCapability } from "@/lib/unified-login";
import { VendorEntryActions } from "./VendorEntryActions";

export const dynamic = "force-dynamic";

export default async function VendorIndex() {
  const user = await getUser();
  const dedicatedAccountRequired = Boolean(user && hasHousingCapability(user));

  if (!dedicatedAccountRequired && user && hasCapability(user, "VENDOR")) {
    redirect("/vendor/job/00");
  }

  return (
    <PhoneFrame label={<span>업체 작업</span>}>
      {dedicatedAccountRequired && user ? (
        <VendorEntryActions
          mode="dedicated-account-required"
          viewerName={user.name}
          logoutReturnTo="/vendor"
        />
      ) : (
        <VendorEntryActions mode="entry" />
      )}
    </PhoneFrame>
  );
}
