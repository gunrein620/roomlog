import { redirect } from "next/navigation";

// 임차인 진입 인덱스 → 하자 홈(레퍼런스 도메인)으로. 거대 뷰 셸은 은퇴(1-E).
export default function TenantIndex() {
  redirect("/tenant/defect/00");
}
