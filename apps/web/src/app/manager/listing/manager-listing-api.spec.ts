import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerListingUpdatePayload,
  removeManagerListing,
  updateManagerListing,
} from "./manager-listing-api";

const input = {
  title: "수정 매물",
  roomType: "투룸",
  tradeType: "월세" as const,
  depositManwon: 2000,
  monthlyRentManwon: 80,
  location: "서울 성동구",
  detailAddress: "202호",
  description: "수정 설명",
};

test("builds a basic-info-only update payload", () => {
  const payload = buildManagerListingUpdatePayload(input);
  assert.deepEqual(payload, input);
  assert.equal("images" in payload, false);
  assert.equal("floorPlan" in payload, false);
});

test("patches basic info and deletes only after the delete function is called", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(
      init?.method === "DELETE"
        ? JSON.stringify({ ok: true })
        : JSON.stringify({ id: "listing-1", ...input }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await updateManagerListing("listing-1", input, fetchImpl as typeof fetch);
  assert.equal(requests[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), input);

  assert.equal(requests.length, 1);
  await removeManagerListing("listing-1", fetchImpl as typeof fetch);
  assert.equal(requests[1]?.init?.method, "DELETE");
});

test("surfaces the server error message", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ message: "내 매물만 수정할 수 있습니다." }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    updateManagerListing("listing-1", input, fetchImpl as typeof fetch),
    /내 매물만 수정할 수 있습니다/,
  );
});
