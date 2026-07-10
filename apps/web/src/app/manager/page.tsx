import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ManagerIndex() {
  await requireUser("LANDLORD", "/manager/home/00");
  redirect("/manager/home/00");
}
