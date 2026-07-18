import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import {
  demoListings,
  findDemoListing,
  tradeListingToCard,
  TRADE_LISTING_NO_PREFIX,
  type Listing,
  type TradeListing
} from "@/lib/listing-catalog";
import { isListingOwner } from "@/lib/listing-ownership";
import { ListingDetailRoute } from "./ListingDetailRoute";

// 매물 상세 라우트 — SPA 상태(selectedListing)로만 열리던 상세를 공유 가능한 URL로 분리(1단계).
// /listing/<listingNo>: 데모 매물은 카탈로그에서, 직접등록(TRADE-*)은 서버에서 찾는다.

export const dynamic = "force-dynamic";

// 직접등록 목록 조회는 실패해도 상세를 살린다 — 데모 매물 상세·비슷한 매물 폴백에 빈 배열이면 충분.
async function fetchTradeListings(): Promise<TradeListing[]> {
  try {
    const response = await fetch(apiUrl("/trade/listings"), { cache: "no-store" });
    if (!response.ok) return [];
    const all = (await response.json()) as TradeListing[];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

// ownerId는 직접등록(TRADE-) 매물에만 있다 — "관리/수정" 버튼 노출 판정(isListingOwner)에 넘긴다.
function resolveListing(
  listingNo: string,
  tradeListings: TradeListing[]
): { listing: Listing; ownerId?: string } | null {
  if (listingNo.startsWith(TRADE_LISTING_NO_PREFIX)) {
    const tradeId = listingNo.slice(TRADE_LISTING_NO_PREFIX.length);
    const found = tradeListings.find((item) => item.id === tradeId);
    return found ? { listing: tradeListingToCard(found), ownerId: found.ownerId } : null;
  }

  const listing = findDemoListing(listingNo);
  return listing ? { listing } : null;
}

function priceDealTone(price: string): string {
  if (price.startsWith("전세")) return "전세";
  if (price.startsWith("매매")) return "매매";
  return "월세"; // 월세·반전세 — 보증금/월세형은 같은 톤으로 묶는다
}

// 비슷한 매물 — 데모+직접등록 풀에서 거래유형(2점)·방 종류(1점) 일치 순으로 4장.
function pickSimilarListings(current: Listing, tradeListings: TradeListing[]): Listing[] {
  const pool: Listing[] = [...demoListings, ...tradeListings.map(tradeListingToCard)];
  const currentTone = priceDealTone(current.price);
  return pool
    .filter((item) => item.listingNo !== current.listingNo)
    .map((item) => ({
      item,
      score:
        (priceDealTone(item.price) === currentTone ? 2 : 0) + (item.roomType === current.roomType ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ item }) => item);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const resolved = resolveListing(decodeURIComponent(id), await fetchTradeListings());

  if (!resolved) {
    return { title: "매물을 찾을 수 없습니다 · 집우집주 WOOZU" };
  }

  const { listing } = resolved;

  return {
    title: `${listing.title} · ${listing.price} | 집우집주 WOOZU`,
    description: `${listing.location} · ${listing.spec} — ${listing.headline}`,
    openGraph: {
      title: `${listing.title} · ${listing.price}`,
      description: `${listing.location} · ${listing.headline}`,
      images: listing.image ? [{ url: listing.image }] : undefined
    }
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tradeListings = await fetchTradeListings();
  const resolved = resolveListing(decodeURIComponent(id), tradeListings);

  if (!resolved) {
    notFound();
  }

  const isOwner = await isListingOwner(resolved.ownerId);
  const similarListings = pickSimilarListings(resolved.listing, tradeListings);

  return (
    <main className="app-canvas">
      <div className="service-frame detail-service-frame" aria-label="집우집주 매물 상세">
        <ListingDetailRoute listing={resolved.listing} isOwner={isOwner} similarListings={similarListings} />
      </div>
    </main>
  );
}
