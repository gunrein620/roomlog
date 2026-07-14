import { getManagerDeposits } from "@/lib/billing-manager-api";
import { BillingShell, routes } from "../_components";
import { ManagerTransactionLedger } from "./ManagerTransactionLedger";

export default async function Page() {
  const data = await getManagerDeposits();

  return (
    <BillingShell title="입출금 내역" active={routes.matching}>
      <ManagerTransactionLedger ledgerData={data.ledger} />
    </BillingShell>
  );
}
