import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerListingUpdatePayload,
  removeManagerListing,
  updateManagerListing,
  uploadManagerListingPhotos,
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
  images: ["/uploads/old.jpg"],
  floorPlan: {
    walls3D: [{
      id: "wall-1",
      wall_id: 1,
      dimensions: { width: 3, height: 2.4, depth: 0.15 },
      position: [0, 1.2, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    }],
    furnitures: [],
  },
};

test("builds an update payload that preserves final photos and floor plan", () => {
  const payload = buildManagerListingUpdatePayload(input);
  assert.deepEqual(payload, input);
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

test("uploads selected image files as multipart data before patching", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ images: ["/uploads/new.jpg"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const uploaded = await uploadManagerListingPhotos(
    [new File(["image"], "new.jpg", { type: "image/jpeg" })],
    fetchImpl as typeof fetch,
  );

  assert.deepEqual(uploaded, ["/uploads/new.jpg"]);
  assert.equal(requests[0]?.url, "/api/trade/uploads");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.ok(requests[0]?.init?.body instanceof FormData);
  assert.equal((requests[0]?.init?.headers as Record<string, string> | undefined)?.["Content-Type"], undefined);
});

test("surfaces a photo upload error and returns without fabricated URLs", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ message: "사진 형식이 올바르지 않습니다." }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    uploadManagerListingPhotos(
      [new File(["image"], "bad.jpg", { type: "image/jpeg" })],
      fetchImpl as typeof fetch,
    ),
    /사진 형식이 올바르지 않습니다/,
  );
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
