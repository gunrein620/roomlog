import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { LISTINGS, findListing } from "./listings.data";
import { REGIONS } from "../market/lawd-codes";

const validLawdCodes = new Set(REGIONS.map((region) => region.lawdCd));

describe("Listing seed data", () => {
  it("has unique listing ids", () => {
    const ids = LISTINGS.map((listing) => listing.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("carries the three fields that wire seed listings to real features", () => {
    for (const listing of LISTINGS) {
      // 시세 매칭: lawdCd가 market 모듈 지역과 일치해야 MOLIT 시세가 붙는다.
      assert.ok(validLawdCodes.has(listing.lawdCd), `${listing.id} has unknown lawdCd ${listing.lawdCd}`);
      // 지도 핀: 서울 대략 범위의 좌표.
      assert.ok(listing.lat > 37 && listing.lat < 38, `${listing.id} lat out of range`);
      assert.ok(listing.lng > 126 && listing.lng < 128, `${listing.id} lng out of range`);
      // 3D 연결: tourId는 문자열이거나 null(미등록).
      assert.ok(listing.tourId === null || typeof listing.tourId === "string");
    }
  });

  it("keeps trade-condition numbers consistent with trade type", () => {
    for (const listing of LISTINGS) {
      assert.ok(listing.depositManwon >= 0);
      if (listing.tradeType === "월세") {
        assert.ok(listing.monthlyRentManwon > 0, `${listing.id} 월세 must have monthly rent`);
      } else {
        assert.equal(listing.monthlyRentManwon, 0, `${listing.id} ${listing.tradeType} must not have monthly rent`);
      }
    }
  });

  it("always has a cover image inside the gallery", () => {
    for (const listing of LISTINGS) {
      assert.ok(listing.gallery.length > 0);
      assert.ok(listing.gallery.includes(listing.coverImage), `${listing.id} cover not in gallery`);
    }
  });

  it("looks up a listing by id", () => {
    assert.equal(findListing("57804322")?.title, "방배 루미에르 402호");
    assert.equal(findListing("does-not-exist"), undefined);
  });
});
