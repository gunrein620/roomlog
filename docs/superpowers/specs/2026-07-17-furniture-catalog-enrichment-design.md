# Furniture Catalog Enrichment Design

## Goal

Make every locally served GLB selectable with a Korean display name, one of the approved logical categories, an IKEA product URL, and a thumbnail URL when the source cache has one.

## Source and output

- Read GLB dimensions and paths from `runtime-assets/furniture-glb-dataset/manifest.json`.
- Read product-image associations from `E:\furniture-glb\_source-metadata\thumbnail-cache.json`.
- Write the enriched fields back into the runtime manifest that the RoomLog web route already serves.
- Keep GLB paths and original source folder categories intact; enrich each item with separate catalog fields rather than moving or renaming binaries.

## Item contract

Each enriched item keeps `relativePath` and `sizeMm` and gains:

```json
{
  "catalogCategory": "electronics",
  "catalogCategoryLabel": "전자기기",
  "displayNameKo": "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크",
  "sourceUrl": "https://www.ikea.com/kr/ko/p/nordmaerke-wireless-charger-white-cork-60478070/",
  "thumbnailUrl": "https://...jpg",
  "imageUrls": ["https://...jpg"]
}
```

`thumbnailUrl` is the single reliable product image from the existing cache. The very large scraped image arrays are deliberately not copied into the runtime manifest.

## Categories

The user-facing categories are `소파·의자`, `테이블·책상`, `침실`, `수납`, `주방·다이닝`, `욕실·세탁`, `조명`, `데코`, and `야외`; `전자기기` is retained for non-furniture products such as chargers and speakers. Product parts, household consumables, and duplicate variants remain in the source dataset but are marked as excluded from the placement catalog.

## Korean names

The builder uses exact names fetched from each official IKEA Korea product page and caches them by Korean product URL. If a request cannot be resolved, it emits an explicit Korean fallback label and records the unresolved product URL for a later retry instead of silently retaining the English filename.

## Web integration

`glb-dataset-catalog.ts` must prefer `displayNameKo`, `catalogCategoryLabel`, `thumbnailUrl`, `imageUrls`, and `sourceUrl` when present, while retaining its current fallback behavior for older manifests.
