import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "세입자 | 집우집주 WOOZU",
  description: "계약, 관리비, 수리요청, 집주인 채팅을 한 화면에서 확인합니다."
};

export default function LivingPage() {
  return <HomeApp initialTab="living" />;
}
