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

// ownerId는 직접등록(TRADE-) 매물에만 있다 — "관리/수정" 버튼 노출 판정(isListingOwner)에 넘긴다.
async function resolveListing(listingNo: string): Promise<{ listing: Listing; ownerId?: string } | null> {
  if (listingNo.startsWith(TRADE_LISTING_NO_PREFIX)) {
    const tradeId = listingNo.slice(TRADE_LISTING_NO_PREFIX.length);
    try {
      const response = await fetch(apiUrl("/trade/listings"), { cache: "no-store" });
      if (!response.ok) return null;
      const all = (await response.json()) as TradeListing[];
      const found = all.find((item) => item.id === tradeId);
      return found ? { listing: tradeListingToCard(found), ownerId: found.ownerId } : null;
    } catch {
      return null;
    }
  }

  const listing = findDemoListing(listingNo);
  return listing ? { listing } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const resolved = await resolveListing(decodeURIComponent(id));

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
  const resolved = await resolveListing(decodeURIComponent(id));

  if (!resolved) {
    notFound();
  }

  const isOwner = await isListingOwner(resolved.ownerId);

  return (
    <main className="app-canvas">
      <div className="service-frame detail-service-frame" aria-label="집우집주 매물 상세">
        <ListingDetailRoute listing={resolved.listing} isOwner={isOwner} />
      </div>
    </main>
  );
}
