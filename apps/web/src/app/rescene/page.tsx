import { ManagerShell } from "@roomlog/ui";
import type { ResceneVendorActivation } from "@roomlog/types";
import { requireUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-api";
import { ResceneVendorIssuer } from "./ResceneVendorIssuer";

export const dynamic = "force-dynamic";

export default async function RescenePage() {
  await requireUser(undefined, "/rescene");
  const initialItems = await serverFetch<ResceneVendorActivation[]>(
    "/auth/vendor-activations/rescene"
  );

  return (
    <ManagerShell
      title="임시 업체 등록"
      context="로컬 프로토타입용 업체 원장·등록 키 발급"
    >
      <ResceneVendorIssuer initialItems={initialItems} />
    </ManagerShell>
  );
}
