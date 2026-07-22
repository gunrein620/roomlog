// three.js는 SSR 대상이 아니다 — 클라 전용 동적 로드(ssr:false)는 tour-viewer-client에서 처리한다.
// (레포의 서버/클라 경계 함정은 CLAUDE.md '서버/클라 경계 함정' 참고.)

import TourViewerClient from "./tour-viewer-client";
import TourTuningPanel from "./tour-tuning-panel";
import { apiUrl } from "@/lib/api-url";
import { isListingOwner } from "@/lib/listing-ownership";

type SplatTourPageProps = {
  searchParams?: Promise<{
    tune?: string | string[];
    asset?: string | string[];
  }>;
};

/**
 * ?asset=<id>의 "현재 시점을 기본으로 저장" 버튼 노출 여부 — 자산 → 매물 → ownerId 경로로
 * 서버에서 판정한다(listing/[id]/page.tsx의 isOwner 판정과 같은 패턴). 자산 조회(GET /splat-assets/:id)는
 * 공개 엔드포인트라 소유자·주소는 안 새지만 listingId는 내려온다 — 그걸로 매물 목록에서 ownerId를 찾는다.
 * 어느 단계든 실패하면(자산 없음/매물 미연결/네트워크 오류) 비소유자로 안전 폴백한다 — 버튼을
 * 숨기는 쪽으로 fail-closed. 실제 쓰기 게이트는 어차피 서버(splat-asset.controller PATCH :id/spawn-view)가
 * assertAssetOwner로 다시 강제하므로, 여기 판정이 틀려도 데이터는 안전하다.
 */
async function resolveSpawnViewOwnership(assetId: string | undefined): Promise<boolean> {
  if (!assetId) return false;

  try {
    const assetRes = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(assetId)}`), { cache: "no-store" });
    if (!assetRes.ok) return false;
    const asset = (await assetRes.json()) as { listingId?: string | null };
    if (!asset.listingId) return false;

    const listingsRes = await fetch(apiUrl("/trade/listings"), { cache: "no-store" });
    if (!listingsRes.ok) return false;
    const listings = (await listingsRes.json()) as unknown;
    const listing = Array.isArray(listings)
      ? (listings as { id: string; ownerId?: string }[]).find((item) => item.id === asset.listingId)
      : undefined;

    return isListingOwner(listing?.ownerId);
  } catch {
    return false;
  }
}

export default async function SplatTourPage({ searchParams }: SplatTourPageProps) {
  const params = await searchParams;
  const tuneParam = params?.tune;
  const shouldRenderTuningPanel = Array.isArray(tuneParam) ? tuneParam.includes("1") : tuneParam === "1";
  const assetParam = params?.asset;
  const assetId = Array.isArray(assetParam) ? assetParam[0] : assetParam;
  const isOwner = await resolveSpawnViewOwnership(assetId);

  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: 24,
        background: "var(--canvas)",
        color: "var(--ink)"
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, color: "var(--blue)" }}>ROOMLOG 3D</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>원격 매물 3D 투어</h1>
      </header>
      <TourViewerClient isOwner={isOwner} />
      {shouldRenderTuningPanel ? <TourTuningPanel /> : null}
    </main>
  );
}
