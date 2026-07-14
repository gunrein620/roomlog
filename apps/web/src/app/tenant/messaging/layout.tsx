import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("TENANT");
  return children;
}
