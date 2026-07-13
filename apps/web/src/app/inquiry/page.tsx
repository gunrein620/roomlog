import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "채팅 | 집우집주 WOOZU",
  description: "매물을 보고 연락한 사람들과의 채팅이 모두 여기에 모입니다."
};

export default function InquiryPage() {
  return <HomeApp initialTab="inquiry" />;
}
