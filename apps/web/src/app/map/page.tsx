import type { Metadata } from "next";
import HomeApp from "../HomeApp";

export const metadata: Metadata = {
  title: "지도로 방 찾기 | 집우집주 WOOZU",
  description: "지도에서 시세·안전·3D 가능 매물을 한눈에 확인하세요."
};

export default function MapPage() {
  return <HomeApp initialTab="map" />;
}
