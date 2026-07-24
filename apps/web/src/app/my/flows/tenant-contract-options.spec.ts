import { strict as assert } from "node:assert";
import test from "node:test";
import {
  findTenantContractListing,
  tenantContractOptions,
} from "./tenant-contract-options";

const room = {
  buildingName: "정글빌라",
  roomNo: "301",
  address: "서울시 성동구 성수동",
};

test("prefers the contract listing id and normalizes its options", () => {
  const listing = findTenantContractListing(
    [
      { id: "fallback", title: "정글빌라", options: ["냉장고"] },
      {
        id: "contract-listing",
        options: [" 에어컨 ", "세탁기", "에어컨", "", 3],
      },
    ],
    "contract-listing",
    room,
  );

  assert.equal(listing?.id, "contract-listing");
  assert.deepEqual(tenantContractOptions(listing), ["에어컨", "세탁기"]);
});

test("falls back to room matching and returns an empty list without options", () => {
  const listing = findTenantContractListing(
    [{ id: "room-listing", detailAddress: "정글빌라 301호" }],
    undefined,
    room,
  );

  assert.equal(listing?.id, "room-listing");
  assert.deepEqual(tenantContractOptions(listing), []);
});

test("does not invent options when no listing matches the selected room", () => {
  const listing = findTenantContractListing(
    [{ id: "other-listing", title: "다른빌라", options: ["CCTV"] }],
    undefined,
    room,
  );

  assert.equal(listing, undefined);
  assert.deepEqual(tenantContractOptions(listing), []);
});
