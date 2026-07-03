import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// 임차인 진입 인덱스 → 로그인된 세입자만 루트 세입자 마이페이지로 보낸다.
export default async function TenantIndex() {
  await requireUser("/tenant/login?redirectTo=%2F%3Frole%3Dtenant%26tab%3Dmypage", "TENANT");
  redirect("/?role=tenant&tab=mypage");
}
