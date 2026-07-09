import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "매물등록 | 집우집주 WOOZU",
  description: "사진과 3D 도면을 연결해 매물을 등록하고 문의를 채팅으로 이어갑니다."
};

export default function SellPage() {
  return <HomeApp initialTab="sell" />;
}
