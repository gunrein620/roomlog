import { PhoneFrame } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { hasHousingCapability } from "@/lib/vendor-activation";
import { hasCapability } from "@/lib/unified-login";
import { VendorEntryActions } from "../VendorEntryActions";
import { VendorActivationFlow } from "./VendorActivationFlow";

export const dynamic = "force-dynamic";

export default async function VendorActivationPage() {
  const user = await getUser();
  const dedicatedAccountRequired = user ? hasHousingCapability(user) : false;

  if (user && !dedicatedAccountRequired && hasCapability(user, "VENDOR")) {
    redirect("/vendor/job/00");
  }

  return (
    <PhoneFrame label={<span>업체 계정 등록</span>}>
      {!user ? (
        <VendorEntryActions mode="activation-auth-required" />
      ) : dedicatedAccountRequired ? (
        <VendorEntryActions
          mode="dedicated-account-required"
          viewerName={user.name}
          logoutReturnTo="/vendor/activate"
        />
      ) : (
        <VendorActivationFlow viewerName={user.name} />
      )}
    </PhoneFrame>
  );
}
