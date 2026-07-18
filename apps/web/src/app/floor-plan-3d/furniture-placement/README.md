# furniture-placement

3D floor-plan editor furniture placement boundary.

This folder owns:

- fallback furniture catalog data for the client
- curated IKEA crawl seed used when `/api/furniture-catalog` is empty
- catalog kind/model normalization
- placed furniture ownership rules for landlord options and resident designs

Current IKEA source:

`roomlog-ikea-crawl/roomlog-ikea-crawl/data/furniture-crawl/ikea/*.json`

The crawl has 700 items across `bed`, `dining-table`, `chair`, `sofa`, `desk`, `drawer`, and `wardrobe`. The client seed intentionally keeps only a small curated set so the page does not bundle the full crawl. When the database import path is ready, the full dataset should flow through `/api/furniture-catalog` and reuse the normalization in `catalog.ts`.

## GLB asset catalog and S3

The placement drawer loads `catalog.json` first. It contains the Korean display name,
logical placement category, IKEA product image URL, source page, GLB path, and actual
dimensions for each asset. The drawer uses the catalog categories directly rather than
the raw source folders.

Asset layout is the same locally and in S3/CloudFront:

```text
furniture/
  catalog.json
  appliance/*.glb
  bathroom/*.glb
  ...
```

For production, set `NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL` to the public prefix, such
as `https://cdn.example.com/furniture/`, at image build time. The bucket/CloudFront
behavior must allow browser `GET` and CORS for the application origin. Run
`scripts/sync-furniture-assets-to-s3.ps1` to preserve the folder layout and upload the
GLBs plus `catalog.json`; use `-DryRun` first.
