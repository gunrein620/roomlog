import assert from "node:assert/strict";
import test from "node:test";
import { toManagerListingRows, type TradeListing } from "./manager-listing-model";

const listings: TradeListing[] = [
  {
    id: "mine-monthly",
    ownerId: "owner-1",
    title: "성수 햇살 원룸",
    location: "서울 성동구 성수동",
    detailAddress: "101호",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    status: "노출중",
    images: ["/listing-studio.jpg"],
    floorPlan: { rooms: [] },
    createdAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "other-owner",
    ownerId: "owner-2",
    title: "다른 집주인 매물",
    location: "서울 강남구",
    tradeType: "전세",
    depositManwon: 30000,
    monthlyRentManwon: 0,
    status: "노출중",
    images: [],
    createdAt: "2026-07-11T00:00:00.000Z",
  },
];

test("maps only the signed-in landlord listings to manager rows", () => {
  assert.deepEqual(toManagerListingRows(listings, "owner-1"), [
    {
      id: "mine-monthly",
      title: "성수 햇살 원룸",
      address: "서울 성동구 성수동 101호",
      priceLabel: "월세 1,000/65",
      statusLabel: "노출중",
      coverImage: "/listing-studio.jpg",
      photoCount: 1,
      has3D: true,
      createdAt: "2026-07-12T00:00:00.000Z",
    },
  ]);
});
