import { redirect } from "next/navigation";

// M-HOME-02(임대 현황 리포트) 콘텐츠는 00 페이지의 #report 섹션으로 통합됨.
export default function Page() {
  redirect("/manager/home/00#report");
}
