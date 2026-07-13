import { redirect } from "next/navigation";

// M-HOME-05(건물·호실 등록 / CSV) 콘텐츠는 00 페이지의 #register 섹션으로 통합됨.
export default function Page() {
  redirect("/manager/home/00#register");
}
