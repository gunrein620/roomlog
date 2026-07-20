import { serverFetch } from "@/lib/server-api";
import type { TradeListing } from "@/lib/listing-catalog";
import HomeApp from "./HomeApp";

// 홈(추천 피드) — 소비자 앱의 탭들은 각각 라우트(/map /saved /inquiry /my)로 진입하고,
// 같은 HomeApp을 initialTab만 달리해 렌더한다(2단계 탭 라우트 분리).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialTradeListings: TradeListing[] | null = null;

  try {
    const listings = await serverFetch<TradeListing[]>("/trade/listings/public");
    initialTradeListings = Array.isArray(listings) ? listings : null;
  } catch {
    initialTradeListings = null;
  }

  return (
    <HomeApp
      initialTab="home"
      initialTradeListings={initialTradeListings}
    />
  );
}
