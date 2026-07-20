import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RoomlogService, type Store } from "./roomlog.service";

const MANAGER_ID = "landlord-demo";

function currentMonthInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function storeOf(service: RoomlogService) {
  return (service as unknown as { store: Store }).store;
}

describe("관리인 임대 현황 리포트", () => {
  it("수익은 청구 총액이 아닌 실제 수납액(paidAmount)만 합산한다", async () => {
    const service = new RoomlogService({ seedDemoData: true });
    const store = storeOf(service);
    const currentMonth = currentMonthInSeoul();
    const bill = store.bills.find((candidate) => {
      const room = store.rooms.find((item) => item.id === candidate.roomId);
      return room?.landlordId === MANAGER_ID;
    });

    assert.ok(bill, "실제 수납액을 검증할 관리인 청구서 시드가 필요합니다.");
    bill.billingMonth = currentMonth;
    bill.status = "PARTIALLY_PAID";
    bill.totalAmount = 900_000;
    bill.paidAmount = 275_000;

    const report = await service.getManagerRentalReport(MANAGER_ID, 6);
    const latest = report.points.at(-1);
    const expectedCollectedAmount = store.bills
      .filter((candidate) => {
        const room = store.rooms.find((item) => item.id === candidate.roomId);
        return (
          room?.landlordId === MANAGER_ID &&
          candidate.billingMonth === currentMonth &&
          !["CANCELED", "CORRECTED"].includes(candidate.status)
        );
      })
      .reduce((sum, candidate) => sum + candidate.paidAmount, 0);
    const expectedBilledAmount = store.bills
      .filter((candidate) => {
        const room = store.rooms.find((item) => item.id === candidate.roomId);
        return (
          room?.landlordId === MANAGER_ID &&
          candidate.billingMonth === currentMonth &&
          !["CANCELED", "CORRECTED"].includes(candidate.status)
        );
      })
      .reduce((sum, candidate) => sum + candidate.totalAmount, 0);

    assert.equal(latest?.month, currentMonth);
    assert.equal(latest?.collectedAmount, expectedCollectedAmount);
    assert.notEqual(
      expectedCollectedAmount,
      expectedBilledAmount,
      "이 검증은 청구 총액과 실제 수납액이 다른 상태를 전제로 합니다."
    );
  });
});
