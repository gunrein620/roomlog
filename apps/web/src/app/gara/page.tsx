import type { Metadata } from "next";
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
    <main
      style={{
        minHeight: "100dvh",
        padding: "var(--space-xl)",
        background: "var(--surface)",
      }}
    >
      <GaraPayoutWorkspace
        vendors={vendors}
        initialBalance={creditResult.data.balance}
        demo={vendorsResult.source === "DEMO" || creditResult.source === "DEMO"}
      />
    </main>
  );
}
