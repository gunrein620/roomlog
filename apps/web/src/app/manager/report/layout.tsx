import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { ReportShell } from "./_components";

export const dynamic = "force-dynamic";

export default async function ManagerReportLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return <ReportShell>{children}</ReportShell>;
}
