import { redirect } from "next/navigation";

// 수리업체 진입 인덱스 → V-JOB 첫 화면으로. 거대 뷰 셸은 은퇴(1-E).
export default function VendorIndex() {
  redirect("/vendor/job/00");
}
