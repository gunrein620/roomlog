import type { FurnitureCatalogItem } from "../room-model/types";

// Curated from roomlog-ikea-crawl/roomlog-ikea-crawl/data/furniture-crawl/ikea/*.json.
// Keep this seed small for the client fallback path; the full 700-item crawl belongs in the API/DB import path.
export const IKEA_FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    brand: "IKEA",
    category: "어린이 싱글침대",
    color: "#cbd5e1",
    furniture_id: "ikea-bed-20411232",
    imageUrls: [
      "https://www.ikea.com/kr/ko/images/products/vitval-loft-bed-frame-white-light-grey__0688128_pe722324_s5.jpg"
    ],
    length: [970, 1950, 2070],
    modelUrl: "/furniture-models/bed-queen.glb",
    name: "VITVAL 비트발 로프트침대프레임",
    price: 299000,
    source: "ikea-bed",
    sourceUrl: "https://www.ikea.com/kr/ko/p/vitval-loft-bed-frame-white-light-grey-20411232/",
    thumbnailUrl:
      "https://www.ikea.com/kr/ko/images/products/vitval-loft-bed-frame-white-light-grey__0688128_pe722324_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "6인용 식탁",
    color: "#d8b26e",
    furniture_id: "ikea-dining-table-60449266",
    imageUrls: [
      "https://www.ikea.com/kr/ko/images/products/voxloev-dining-table-light-bamboo__0997396_pe822660_s5.jpg"
    ],
    length: [900, 750, 1800],
    modelUrl: "/furniture-models/table-moon.glb",
    name: "VOXLÖV 복슬뢰브 식탁",
    price: 399000,
    source: "ikea-dining-table",
    sourceUrl: "https://www.ikea.com/kr/ko/p/voxloev-dining-table-light-bamboo-60449266/",
    thumbnailUrl:
      "https://www.ikea.com/kr/ko/images/products/voxloev-dining-table-light-bamboo__0997396_pe822660_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "식탁의자",
    color: "#c7a56a",
    furniture_id: "ikea-chair-10449264",
    imageUrls: ["https://www.ikea.com/kr/ko/images/products/voxloev-chair-light-bamboo__0948161_pe798889_s5.jpg"],
    length: [430, 850, 530],
    modelUrl: "/furniture-models/chair-kevi.glb",
    name: "VOXLÖV 복슬뢰브 의자",
    price: 129000,
    source: "ikea-chair",
    sourceUrl: "https://www.ikea.com/kr/ko/p/voxloev-chair-light-bamboo-10449264/",
    thumbnailUrl: "https://www.ikea.com/kr/ko/images/products/voxloev-chair-light-bamboo__0948161_pe798889_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "3인 좌석 소파베드",
    color: "#687387",
    furniture_id: "ikea-sofa-09491249",
    imageUrls: [
      "https://www.ikea.com/kr/ko/images/products/vretstorp-3-seat-sofa-bed-hakebo-dark-grey__1155328_pe886560_s5.jpg"
    ],
    length: [2440, 910, 960],
    modelUrl: "/furniture-models/sofa-couch.glb",
    name: "VRETSTORP 브렛스토르프 3인용 소파베드",
    price: 749000,
    source: "ikea-sofa",
    sourceUrl: "https://www.ikea.com/kr/ko/p/vretstorp-3-seat-sofa-bed-hakebo-dark-grey-s09491249/",
    thumbnailUrl:
      "https://www.ikea.com/kr/ko/images/products/vretstorp-3-seat-sofa-bed-hakebo-dark-grey__1155328_pe886560_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "게임용책상",
    color: "#e4d4b4",
    furniture_id: "ikea-desk-80586399",
    imageUrls: [
      "https://www.ikea.com/kr/ko/images/products/utvisning-gaming-desk-with-shelf-ash-effect-white__1336684_pe947435_s5.jpg"
    ],
    length: [1200, 740, 600],
    modelUrl: "/furniture-models/table-moon.glb",
    name: "UTVISNING 우트비스닝 게이밍책상+선반",
    price: 149000,
    source: "ikea-desk",
    sourceUrl: "https://www.ikea.com/kr/ko/p/utvisning-gaming-desk-with-shelf-ash-effect-white-80586399/",
    thumbnailUrl:
      "https://www.ikea.com/kr/ko/images/products/utvisning-gaming-desk-with-shelf-ash-effect-white__1336684_pe947435_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "서랍장",
    color: "#f8fafc",
    furniture_id: "ikea-drawer-10483248",
    imageUrls: [
      "https://www.ikea.com/kr/ko/images/products/vihals-chest-of-6-drawers-white-anchor-unlock-function__1112060_pe871093_s5.jpg"
    ],
    length: [700, 1200, 470],
    modelUrl: "/furniture-models/wardrobe-cabinet.glb",
    name: "VIHALS 비할스 6칸서랍장",
    price: 219000,
    source: "ikea-drawer",
    sourceUrl: "https://www.ikea.com/kr/ko/p/vihals-chest-of-6-drawers-white-anchor-unlock-function-10483248/",
    thumbnailUrl:
      "https://www.ikea.com/kr/ko/images/products/vihals-chest-of-6-drawers-white-anchor-unlock-function__1112060_pe871093_s5.jpg"
  },
  {
    brand: "IKEA",
    category: "단독형 옷장",
    color: "#a8b3bf",
    furniture_id: "ikea-wardrobe-30347617",
    imageUrls: ["https://www.ikea.com/kr/ko/images/products/visthus-wardrobe-grey-white__0592302_pe674454_s5.jpg"],
    length: [1220, 2160, 590],
    modelUrl: "/furniture-models/wardrobe-cabinet.glb",
    name: "VISTHUS 비스투스 옷장",
    price: 459000,
    source: "ikea-wardrobe",
    sourceUrl: "https://www.ikea.com/kr/ko/p/visthus-wardrobe-grey-white-30347617/",
    thumbnailUrl: "https://www.ikea.com/kr/ko/images/products/visthus-wardrobe-grey-white__0592302_pe674454_s5.jpg"
  }
];
