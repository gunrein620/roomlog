import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManagerContractDetail } from "./contract-manager-api";
import { hasContractPrefillInput, storedContractPrefillInput } from "./contract-prefill";

describe("contract DB prefill", () => {
  it("fills missing OCR fields from stored contract values", () => {
    const detail = contractDetail({
      items: [
        item("계약 기간", "미확인"),
        item("보증금", "원문 확인 필요"),
        item("월세", "미확인"),
        item("관리비", "없음"),
        item("납부일", "원문 확인 필요"),
        item("임대인 계좌", ""),
      ],
      manualValues: {
        deposit: "전환 후 53,288,000원",
        account: "OO은행 123-456",
      },
    });

    const input = storedContractPrefillInput(detail);

    assert.deepEqual(input, {
      startDate: "2026-03-01",
      endDate: "2028-02-29",
      deposit: "전환 후 53,288,000원",
      monthlyRent: 650000,
      maintenanceFee: 70000,
      paymentDay: 25,
      account: "OO은행 123-456",
    });
    assert.equal(hasContractPrefillInput(input), true);
  });

  it("does not overwrite usable OCR values even when they still need review", () => {
    const detail = contractDetail({
      items: [
        item("계약 기간", "2025.05.01 ~ 2027.04.30", true),
        item("월세", "전환 후 67,510원", true),
        item("관리비", "70,000원", true),
        item("납부일", "매월 10일", true),
        item("보증금", "전환 후 53,288,000원", true),
        item("임대인 계좌", "OO은행 ***21", true),
      ],
      manualValues: {
        deposit: "DB 보증금",
        account: "DB 계좌",
      },
    });

    assert.deepEqual(storedContractPrefillInput(detail), {});
  });

  it("treats mock OCR values as empty and refills them from stored data", () => {
    const detail = contractDetail({
      items: [
        item("계약 기간", "2026.03.01 ~ 2028.02.29", false),
        item("보증금", "전환 후 53,288,000원", false),
        item("월세", "650,000원", false, "mock OCR: 월세 후보"),
        item("관리비", "70,000원", false, "실제 OCR 실패/미설정"),
        item("납부일", "매월 25일", false),
        item("임대인 계좌", "OO은행 ***21", false),
      ],
    });

    assert.deepEqual(storedContractPrefillInput(detail), {
      monthlyRent: 650000,
      maintenanceFee: 70000,
    });
  });
});

function contractDetail({
  items,
  manualValues = {},
}: {
  items: ManagerContractDetail["extraction"]["items"];
  manualValues?: Partial<ManagerContractDetail["manualValues"]>;
}): ManagerContractDetail {
  return {
    row: {
      contract: {
        id: "ct_test",
        roomId: "room_test",
        unitId: "301",
        startDate: "2026-03-01",
        endDate: "2028-02-29",
        monthlyRent: 650000,
        maintenanceFee: 70000,
        paymentDay: 25,
      },
      tenantName: "김민수",
      buildingName: "정글빌라",
    },
    extraction: { items },
    manualValues: {
      deposit: "",
      rent: "",
      maintenanceFee: "",
      paymentDay: "",
      account: "",
      ...manualValues,
    },
  } as unknown as ManagerContractDetail;
}

function item(
  label: string,
  value: string,
  needsCheck = true,
  evidence = "OpenAI OCR",
): ManagerContractDetail["extraction"]["items"][number] {
  return {
    label,
    value,
    group: "money",
    needsCheck,
    evidence,
  };
}
