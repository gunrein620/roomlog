import type { Metadata } from "next";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { getManagerCreditAccount } from "@/lib/vendor-credit-api";
import { listManagerVendors } from "@/lib/vendor-mgmt-api";
import { requireUser } from "@/lib/session";
import { GaraPayoutWorkspace } from "./GaraPayoutWorkspace";

export const metadata: Metadata = {
  title: "Gara | 룸로그",
};

export const dynamic = "force-dynamic";

export default async function GaraPage() {
  await requireUser("LANDLORD", "/gara");
  const [vendorsResult, creditResult] = await Promise.all([
    listManagerVendors(),
    getManagerCreditAccount(),
  ]);
  const vendors = vendorsResult.data.filter((vendor) => vendor.status === "ACTIVE");

  return (
    <ManagerAppShell
      title="Gara 지급 요청"
      context="등록한 업체에 대해 관리자 크레딧을 차감하고 지급 요청을 생성합니다."
    >
      <GaraPayoutWorkspace
        vendors={vendors}
        initialBalance={creditResult.data.balance}
        demo={vendorsResult.source === "DEMO" || creditResult.source === "DEMO"}
      />
    </ManagerAppShell>
  );
}
