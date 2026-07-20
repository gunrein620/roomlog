import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  cleanManagerAgentReplyText,
  managerBillingCollectionState
} from "../roomlog.service";

describe("manager agent reply facts", () => {
  it("calls a zero-day unpaid bill unpaid rather than overdue", () => {
    assert.equal(managerBillingCollectionState(0), "unpaid");
    assert.equal(managerBillingCollectionState(19), "overdue");
  });

  it("removes internal manager paths from spoken replies", () => {
    assert.equal(
      cleanManagerAgentReplyText(
        "자세한 내역은 /manager/billing 에서 확인해 주세요."
      ),
      "자세한 내역은 청구 관리 화면에서 확인해 주세요."
    );
  });
});
