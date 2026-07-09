import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "마이페이지 | 집우집주 WOOZU",
  description: "방 찾기, 내놓은 집, 사는 집을 한 계정에서 이어갑니다."
};

export default function MyPage() {
  return <HomeApp initialTab="mypage" />;
}
