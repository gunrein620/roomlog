import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";

export default async function ManagerBillingLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD", "/manager/billing");

  return children;
}
