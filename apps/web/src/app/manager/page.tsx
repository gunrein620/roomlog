import { redirect } from "next/navigation";

// 관리인 진입 인덱스 → 관리인 홈으로. 거대 뷰 셸은 은퇴(1-E).
export default function ManagerIndex() {
  redirect("/manager/home/00");
}
