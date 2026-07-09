import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// 관리인 진입 인덱스 → 로그인된 임대인만 루트 임대인 마이페이지로 보낸다.
export default async function ManagerIndex() {
  await requireUser("LANDLORD", "/sell");
  redirect("/sell");
}
