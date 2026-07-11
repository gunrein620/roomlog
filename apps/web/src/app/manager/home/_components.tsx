import type { ReactNode } from "react";
import { Badge } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";

export function ManagerHomeShell({
  title,
  context,
  demo = false,
  children,
}: {
  title: ReactNode;
  context?: ReactNode;
  demo?: boolean;
  children: ReactNode;
}) {
  const renderedTitle = demo ? (
    <span className="manager-demo-title">
      <span>{title}</span>
      <Badge>데모</Badge>
    </span>
  ) : title;

  return <ManagerAppShell title={renderedTitle} context={context}>{children}</ManagerAppShell>;
}
