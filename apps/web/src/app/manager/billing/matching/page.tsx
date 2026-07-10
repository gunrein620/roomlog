import { getManagerDashboard, getManagerDeposits } from "@/lib/billing-manager-api";
import { BillingShell, routes } from "../_components";
import { ManagerTransactionLedger } from "./ManagerTransactionLedger";

export default async function Page() {
  const [data, dashboard] = await Promise.all([getManagerDeposits(), getManagerDashboard()]);

  return (
    <BillingShell title="입출금 내역" active={routes.matching}>
      <ManagerTransactionLedger
        bills={[...dashboard.bills, ...data.paymentReports]}
        deposits={[...data.deposits, ...data.orphanDeposits, ...data.mismatchDeposits]}
      />
    </BillingShell>
  );
}
