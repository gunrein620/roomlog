import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  emptyOwnerForm,
  formatDraftSavedAt,
  initialOwnerListings,
  parseOwnerDraft,
  OWNER_DRAFT_STORAGE_KEY,
  saveOwnerDraft,
  serializeOwnerDraft
} from "./owner-draft";

const sampleState = {
  ownerForm: { ...emptyOwnerForm, title: "성수 아뜰리에 501호", deposit: "2000", monthly: "90" },
  photoCount: 4,
  has3DRoom: true,
  registrationStatus: "노출중",
  myListings: [
    { id: 1749990000000, title: "성수 아뜰리에 501호", price: "월세 2000/90", status: "노출중", caption: "조회 12 · 문의 2건" },
    ...initialOwnerListings
  ]
};

describe("owner listing draft persistence", () => {
  it("round-trips the registration state through serialize/parse", () => {
    // QA 8 회귀 방지: 새로고침 후에도 작성 중 폼과 제출된 매물이 복원돼야 한다.
    const raw = serializeOwnerDraft(sampleState, "2026-07-05T12:34:56.000Z");
    const restored = parseOwnerDraft(raw);

    assert.ok(restored);
    assert.equal(restored.savedAt, "2026-07-05T12:34:56.000Z");
    assert.equal(restored.ownerForm.title, "성수 아뜰리에 501호");
    assert.equal(restored.photoCount, 4);
    assert.equal(restored.has3DRoom, true);
    assert.equal(restored.registrationStatus, "노출중");
    assert.equal(restored.myListings.length, 2);
    assert.equal(restored.myListings[0].title, "성수 아뜰리에 501호");
    assert.equal(restored.ownerForm.detailAddress, "");
  });

  it("writes the current registration state synchronously before navigation", () => {
    const entries = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => entries.set(key, value) };
    const savedAt = "2026-07-15T12:34:56.000Z";

    const returnedSavedAt = saveOwnerDraft(storage, sampleState, savedAt);
    const restored = parseOwnerDraft(entries.get(OWNER_DRAFT_STORAGE_KEY) ?? null);

    assert.equal(returnedSavedAt, savedAt);
    assert.ok(restored);
    assert.equal(restored.ownerForm.title, sampleState.ownerForm.title);
    assert.equal(restored.photoCount, sampleState.photoCount);
    assert.equal(restored.has3DRoom, true);
  });

  it("keeps the 3D floor-plan request id with its owner draft", () => {
    const restored = parseOwnerDraft(
      serializeOwnerDraft({ ...sampleState, floorPlanRequestId: "floor-plan-request-123" }),
    );

    assert.ok(restored);
    assert.equal(restored.floorPlanRequestId, "floor-plan-request-123");
  });

  it("fills detailAddress for legacy drafts that do not have it yet", () => {
    const { detailAddress: _detailAddress, ...legacyOwnerForm } = sampleState.ownerForm;
    const raw = JSON.stringify({ version: 1, savedAt: "2026-07-05T12:34:56.000Z", ...sampleState, ownerForm: legacyOwnerForm });
    const restored = parseOwnerDraft(raw);

    assert.ok(restored);
    assert.equal(restored.ownerForm.detailAddress, "");
  });

  it("round-trips selected options and fills [] for legacy drafts without them", () => {
    const withOptions = {
      ...sampleState,
      ownerForm: { ...sampleState.ownerForm, options: ["에어컨", "CCTV"] }
    };
    const restored = parseOwnerDraft(serializeOwnerDraft(withOptions, "2026-07-05T12:34:56.000Z"));
    assert.ok(restored);
    assert.deepEqual(restored.ownerForm.options, ["에어컨", "CCTV"]);

    // options/roomType 필드 추가 이전에 저장된 draft — 기본값으로 보정돼야 한다.
    const { options: _options, roomType: _roomType, ...legacyOwnerForm } = sampleState.ownerForm;
    const legacyRaw = JSON.stringify({ version: 1, savedAt: "2026-07-05T12:34:56.000Z", ...sampleState, ownerForm: legacyOwnerForm });
    const legacyRestored = parseOwnerDraft(legacyRaw);
    assert.ok(legacyRestored);
    assert.deepEqual(legacyRestored.ownerForm.options, []);
    assert.equal(legacyRestored.ownerForm.roomType, "원룸");
  });

  it("rejects unknown versions and corrupted payloads", () => {
    assert.equal(parseOwnerDraft(null), null);
    assert.equal(parseOwnerDraft("not-json"), null);
    assert.equal(parseOwnerDraft(JSON.stringify({ version: 2 })), null);
    assert.equal(
      parseOwnerDraft(JSON.stringify({ version: 1, savedAt: "x", photoCount: "4" })),
      null
    );
  });

  it("drops malformed listings and deduplicates by id", () => {
    const raw = serializeOwnerDraft({
      ...sampleState,
      myListings: [
        ...sampleState.myListings,
        ...sampleState.myListings,
        { id: "bad" } as unknown as (typeof sampleState.myListings)[number]
      ]
    });
    const restored = parseOwnerDraft(raw);

    assert.ok(restored);
    // 같은 매물이 새로고침마다 불어나지 않는다 — id 기준 중복 제거.
    assert.equal(restored.myListings.length, 2);
  });

  it("starts user-editable fields empty (no fake prefilled values)", () => {
    assert.equal(emptyOwnerForm.title, "");
    assert.equal(emptyOwnerForm.address, "");
    assert.equal(emptyOwnerForm.detailAddress, "");
    assert.equal(emptyOwnerForm.deposit, "");
    assert.equal(emptyOwnerForm.tradeType, "월세");
  });

  it("formats the saved-at time and tolerates bad input", () => {
    assert.notEqual(formatDraftSavedAt("2026-07-05T12:34:56.000Z"), "");
    assert.equal(formatDraftSavedAt("garbage"), "");
  });
});
