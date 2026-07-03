import type { ReactNode } from "react";
import { ReportShell } from "./_components";

export default function ManagerReportLayout({ children }: { children: ReactNode }) {
  return <ReportShell>{children}</ReportShell>;
}

