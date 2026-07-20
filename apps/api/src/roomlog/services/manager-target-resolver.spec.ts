import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveManagerTarget } from "./manager-target-resolver";

describe("manager target resolver", () => {
  it("resolves a lightly mistranscribed building name inside the manager scope", () => {
    const result = resolveManagerTarget(
      "관리자 세입자 플로어 테스트 2 102호",
      [
        {
          id: "room-1",
          buildingName: "관리자-세입자 플로우테스트1",
          unitId: "102"
        },
        {
          id: "room-2",
          buildingName: "관리자-세입자 플로우테스트2",
          unitId: "102"
        }
      ]
    );

    assert.deepEqual(result, {
      status: "resolved",
      candidate: {
        id: "room-2",
        buildingName: "관리자-세입자 플로우테스트2",
        unitId: "102"
      }
    });
  });

  it("does not guess when the same unit has no building clue", () => {
    const result = resolveManagerTarget("102호", [
      { id: "room-1", buildingName: "A빌라", unitId: "102" },
      { id: "room-2", buildingName: "B빌라", unitId: "102" }
    ]);

    assert.deepEqual(result, {
      status: "ambiguous",
      candidates: [
        { id: "room-1", buildingName: "A빌라", unitId: "102" },
        { id: "room-2", buildingName: "B빌라", unitId: "102" }
      ]
    });
  });

  it("resolves an ordinal follow-up against the previously shown candidates", () => {
    const result = resolveManagerTarget(
      "103호",
      [
        { id: "room-1", buildingName: "플로우테스트", unitId: "103" },
        { id: "room-2", buildingName: "플로우테스트3", unitId: "103" }
      ],
      "뒤에 거"
    );

    assert.deepEqual(result, {
      status: "resolved",
      candidate: {
        id: "room-2",
        buildingName: "플로우테스트3",
        unitId: "103"
      }
    });
  });

  it("uses the only in-scope candidate when speech loses the unit number", () => {
    const result = resolveManagerTarget(
      "권리서신 업로드 테스트 대기호",
      [
        {
          id: "room-1",
          buildingName: "권리서신 업로드 테스트",
          unitId: "102"
        }
      ]
    );

    assert.deepEqual(result, {
      status: "resolved",
      candidate: {
        id: "room-1",
        buildingName: "권리서신 업로드 테스트",
        unitId: "102"
      }
    });
  });

  it("never includes an out-of-scope target in fallback choices", () => {
    const result = resolveManagerTarget("외부 건물 909호", [
      { id: "room-1", buildingName: "내 건물", unitId: "101" }
    ]);

    assert.deepEqual(result, {
      status: "not_found",
      candidates: [
        { id: "room-1", buildingName: "내 건물", unitId: "101" }
      ]
    });
  });
});
