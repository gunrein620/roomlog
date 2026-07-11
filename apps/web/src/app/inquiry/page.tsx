import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "문의센터 | 집우집주 WOOZU",
  description: "보낸 문의와 받은 문의가 모두 채팅으로 이어집니다."
};

export default function InquiryPage() {
  return <HomeApp initialTab="inquiry" />;
}
