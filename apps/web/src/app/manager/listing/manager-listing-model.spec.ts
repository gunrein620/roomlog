import assert from "node:assert/strict";
import test from "node:test";
import {
  groupListingsByBuilding,
  toManagerListingRow,
  toManagerListingRows,
  type ManagerListingRow,
  type TradeListing,
} from "./manager-listing-model";

const listings: TradeListing[] = [
  {
    id: "mine-monthly",
    ownerId: "owner-1",
    title: "성수 햇살 원룸",
    roomType: "원룸",
    location: "서울 성동구 성수동",
    detailAddress: "101호",
    buildingName: "햇살빌",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    status: "노출중",
    images: ["/listing-studio.jpg"],
    floorPlan: {
      walls3D: [{
        id: "wall-1",
        wall_id: 1,
        dimensions: { width: 3, height: 2.4, depth: 0.15 },
        position: [0, 1.2, 0],
        rotation: [0, 0, 0],
      }],
      furnitures: [],
    },
    description: "채광 좋은 원룸입니다.",
    createdAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "other-owner",
    ownerId: "owner-2",
    title: "다른 집주인 매물",
    roomType: "투룸",
    location: "서울 강남구",
    tradeType: "전세",
    depositManwon: 30000,
    monthlyRentManwon: 0,
    status: "노출중",
    images: [],
    description: "다른 매물",
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
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 성동구 성수동",
      detailAddress: "101호",
      buildingName: "햇살빌",
      description: "채광 좋은 원룸입니다.",
      images: ["/listing-studio.jpg"],
      floorPlan: {
        walls3D: [{
          id: "wall-1",
          wall_id: 1,
          dimensions: { width: 3, height: 2.4, depth: 0.15 },
          position: [0, 1.2, 0],
          rotation: [0, 0, 0],
        }],
        furnitures: [],
      },
    },
  ]);
});

test("maps one API listing to the editable manager detail row", () => {
  const row = toManagerListingRow(listings[0]!);
  assert.equal(row.roomType, "원룸");
  assert.equal(row.tradeType, "월세");
  assert.equal(row.location, "서울 성동구 성수동");
  assert.equal(row.detailAddress, "101호");
  assert.equal(row.buildingName, "햇살빌");
  assert.equal(row.description, "채광 좋은 원룸입니다.");
  assert.deepEqual(row.images, ["/listing-studio.jpg"]);
  assert.equal(row.floorPlan?.walls3D.length, 1);
});

test("groups rows by building name with unnamed listings last", () => {
  const row = (id: string, buildingName: string) =>
    ({ id, buildingName } as unknown as ManagerListingRow);
  const grouped = groupListingsByBuilding([
    row("a", "햇살빌"),
    row("b", ""),
    row("c", "정글빌"),
    row("d", "햇살빌"),
  ]);

  assert.deepEqual(
    grouped.map((group) => [group.buildingName, group.listings.map((item) => item.id)]),
    [
      ["정글빌", ["c"]],
      ["햇살빌", ["a", "d"]],
      ["건물 미지정", ["b"]],
    ],
  );
});
