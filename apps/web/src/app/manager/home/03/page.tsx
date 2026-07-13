import { redirect } from "next/navigation";

// M-HOME-03(전체 건물 관리) 콘텐츠는 00 페이지의 #buildings 섹션으로 통합됨.
export default function Page() {
  redirect("/manager/home/00#buildings");
}
