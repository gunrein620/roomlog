import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  intakeSlotProgress,
  intakeSlotStatusLabel,
  type TenantIntakeSlot
} from "./intake-slot-progress";

const slots: TenantIntakeSlot[] = [
  {
    key: "symptom",
    label: "증상",
    status: "COLLECTED",
    value: "화장실 누수",
    evidence: "세입자 증상을 확인했습니다."
  },
  {
    key: "location",
    label: "위치",
    status: "COLLECTED",
    value: "301호 화장실",
    evidence: "301호 화장실 위치를 확인했습니다."
  },
  {
    key: "photo",
    label: "사진",
    status: "NEEDS_INFO",
    evidence: "사진이 있으면 관리자 판단이 빨라집니다.",
    action: "근접 사진과 전체 사진을 올려주세요."
  },
  {
    key: "memo",
    label: "참고 메모",
    status: "OPTIONAL",
    evidence: "선택 사항입니다."
  }
];

describe("intake slot progress", () => {
  it("summarizes collected and open intake slots for the consultation UI", () => {
    assert.deepEqual(intakeSlotProgress(slots), {
      collected: 2,
      open: 1,
      total: 4,
      percent: 50,
      label: "2/4 확인됨 · 1개 추가 확인 필요"
    });
  });

  it("returns Korean labels for slot statuses", () => {
    assert.equal(intakeSlotStatusLabel("COLLECTED"), "확인됨");
    assert.equal(intakeSlotStatusLabel("NEEDS_INFO"), "확인 필요");
    assert.equal(intakeSlotStatusLabel("OPTIONAL"), "선택");
  });
});
