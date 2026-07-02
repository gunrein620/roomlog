import { redirect } from "next/navigation";
import { MANAGER_COST_START } from "@/lib/cost-nav";

export default function Page() {
  redirect(MANAGER_COST_START);
}
