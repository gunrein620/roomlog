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
