// 임대인(landlord)의 "내 매물 × 3D 자산" 집계 로직 — 상단 벨 알림과 내 매물 페이지가 공유한다.
// 데이터 소스: GET /api/trade/listings?mine=1(내 매물) + 매물별 listSplatAssetsByListing(대표 자산).
// Notification 모델을 두지 않고, 자산 상태에서 "조치 필요"를 파생한다(UPLOADED=정합 필요, FAILED=재업로드).
import type { SplatAssetStatus } from "@roomlog/types";
import type { WheretoputWall3D } from "../app/floor-plan-3d/room-model/types";
import type { TradeListing } from "./listing-catalog";
import { listSplatAssetsByListing } from "./splat-asset-api";

export type OwnerListingAsset = { assetId: string; status: SplatAssetStatus };

// 매물당 자산이 여럿일 수 있어 대표 하나만 고른다 — "정합 필요(UPLOADED)"가 가장 시급하고,
// 실패·제작 중이 그다음, 이미 정합 완료(REGISTERED)는 가장 낮은 우선순위.
const LISTING_ASSET_PRIORITY: Record<SplatAssetStatus, number> = {
  UPLOADED: 4,
  FAILED: 3,
  PROCESSING: 2,
  REGISTERED: 1
};

export function pickListingSplatAsset(
  assets: { id: string; status: SplatAssetStatus }[]
): OwnerListingAsset | null {
  const best = assets.reduce<{ id: string; status: SplatAssetStatus } | null>((chosen, asset) => {
    if (!chosen) return asset;
    return LISTING_ASSET_PRIORITY[asset.status] > LISTING_ASSET_PRIORITY[chosen.status] ? asset : chosen;
  }, null);
  return best ? { assetId: best.id, status: best.status } : null;
}

/**
 * 내 매물 목록(서버 진실). null = 불러오지 못함(비로그인/오류) → 호출측은 기존 상태를 유지한다.
 * [] = 정상 응답이나 매물이 없음. 이 둘을 구분해야 일시 오류에 목록이 깜빡이며 비워지지 않는다.
 */
export async function fetchOwnerListings(): Promise<TradeListing[] | null> {
  try {
    // ?mine=1 — 내 매물만(서버 소유자 스코프). 비로그인이면 res.ok=false → null.
    const res = await fetch("/api/trade/listings?mine=1", { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = (await res.json()) as unknown;
    return Array.isArray(parsed) ? (parsed as TradeListing[]) : null;
  } catch {
    return null;
  }
}

export interface OwnerListingAssets {
  listings: TradeListing[];
  assetByListing: Record<string, OwnerListingAsset>;
}

/**
 * 내 매물 + 매물별 대표 3D 자산. 개인 임대인(1~5채) 스케일이라 매물당 자산 조회를 병렬로 돌린다.
 * null = 목록을 불러오지 못함(호출측은 기존 상태 유지).
 */
export async function fetchOwnerListingAssets(): Promise<OwnerListingAssets | null> {
  const listings = await fetchOwnerListings();
  if (listings === null) return null;
  if (listings.length === 0) return { listings, assetByListing: {} };

  const entries = await Promise.all(
    listings.map(async (listing) => {
      try {
        const assets = await listSplatAssetsByListing(listing.id);
        return [listing.id, pickListingSplatAsset(assets)] as const;
      } catch {
        return [listing.id, null] as const;
      }
    })
  );

  const assetByListing = Object.fromEntries(
    entries.filter((entry): entry is [string, OwnerListingAsset] => entry[1] !== null)
  );
  return { listings, assetByListing };
}

// 벨이 노출하는 "조치 필요" 항목 — 정합 대기(UPLOADED)와 제작 실패(FAILED)만. 제작 중/완료는 알림 대상이 아니다.
export type OwnerTourActionKind = "UPLOADED" | "FAILED";

export interface OwnerTourAction {
  listingId: string;
  title: string;
  assetId: string;
  status: OwnerTourActionKind;
}

/** 매물별 대표 자산에서 조치 필요 항목만 추린다(벨 목록·배지 카운트의 소스). */
export function deriveOwnerTourActions({ listings, assetByListing }: OwnerListingAssets): OwnerTourAction[] {
  const actions: OwnerTourAction[] = [];
  for (const listing of listings) {
    const asset = assetByListing[listing.id];
    if (!asset) continue;
    if (asset.status === "UPLOADED" || asset.status === "FAILED") {
      actions.push({ listingId: listing.id, title: listing.title, assetId: asset.assetId, status: asset.status });
    }
  }
  return actions;
}

// register 픽 화면의 도면 소스 우선순위 결정.
// - 자산에 이미 서버 도면(floorPlanId)이 연결돼 있으면 그 연결을 존중한다(매물 스냅샷으로 덮지 않음).
// - 아니면 매물 임베드 도면(walls3D) 스냅샷을 픽 도면으로 자동 세팅(listing-db) — localStorage보다 우선.
// - 둘 다 없으면 기존(localStorage/placeholder)을 유지한다.
export type RegisterPlanDecision =
  | { source: "asset-linked"; planServerId: string }
  | { source: "listing-db"; walls: WheretoputWall3D[] }
  | { source: "keep" };

export function resolveRegisterPlanSource(
  asset: { floorPlanId?: string | null; listingId?: string | null },
  listingWalls: WheretoputWall3D[]
): RegisterPlanDecision {
  if (asset.floorPlanId) return { source: "asset-linked", planServerId: asset.floorPlanId };
  if (listingWalls.length > 0) return { source: "listing-db", walls: listingWalls };
  return { source: "keep" };
}
