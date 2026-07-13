import { redirect } from "next/navigation";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";

export default function Page() {
  redirect(MANAGER_CONTRACT_ROUTES["M-DOC-02"]);
}
