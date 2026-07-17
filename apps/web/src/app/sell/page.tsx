import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "매물등록 | 집우집주 WOOZU",
  description: "사진과 3D 도면을 연결해 매물을 등록하고 문의를 채팅으로 이어갑니다."
};

// 등록 폼(LandlordMyPage)이 useSearchParams(재구성 재큐잉 딥링크)를 쓰므로 정적 프리렌더 대상에서 제외.
// (예전엔 sell 탭이 로그인 가드 뒤라 프리렌더가 폼까지 내려가지 않아 우연히 통과했다.)
export const dynamic = "force-dynamic";

export default function SellPage() {
  return <HomeApp initialTab="sell" />;
}
