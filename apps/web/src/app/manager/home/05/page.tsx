import { redirect } from "next/navigation";

// M-HOME-05(건물·호실 등록 / CSV)는 미사용 기능으로 제거됨 — 옛 링크·북마크는 대시보드로 보낸다.
export default function Page() {
  redirect("/manager/home/00");
}
