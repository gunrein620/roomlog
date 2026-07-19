import type { Metadata } from "next";
import type { GaraVendorCreditPublicView } from "@roomlog/types";
import { serverFetch } from "@/lib/server-api";
import { GaraPayoutWorkspace } from "./GaraPayoutWorkspace";

export const metadata: Metadata = {
  title: "Gara | 룸로그",
};

export const dynamic = "force-dynamic";

async function listGaraVendorCredits() {
  return serverFetch<GaraVendorCreditPublicView[]>("/gara/vendors");
}

export default async function GaraPage() {
  const vendors = await listGaraVendorCredits();

  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "var(--space-xl)",
        background: "var(--surface)",
      }}
    >
      <GaraPayoutWorkspace vendors={vendors} />
    </main>
  );
}
