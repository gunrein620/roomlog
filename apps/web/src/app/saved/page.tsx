import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "관심목록 | 집우집주 WOOZU",
  description: "찜한 매물과 저장 조건을 한곳에서 비교하세요."
};

export default function SavedPage() {
  return <HomeApp initialTab="saved" />;
}
