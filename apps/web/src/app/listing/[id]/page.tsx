import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiUrl } from "@/lib/api-url";
import {
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

// 비슷한 매물 기능은 팀 결정으로 제거(2026-07-18) — 점수 함수는 git 히스토리 참조.

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

  return (
    <main className="app-canvas">
      {/* 도면 유무와 무관하게 같은 무대 레이아웃(1200 카드) — 스테이지 콘텐츠만 3D↔사진 */}
      <div className="service-frame detail-service-frame detail-frame-wide" aria-label="집우집주 매물 상세">
        <ListingDetailRoute listing={resolved.listing} isOwner={isOwner} />
      </div>
    </main>
  );
}
