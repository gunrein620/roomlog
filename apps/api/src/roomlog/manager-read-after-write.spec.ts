// 관리인 읽기가 방금 쓴 내용을 보는지 — "한 박자 밀린 화면" 회귀 방지.
//
// projectStore()는 Postgres 반영을 큐에 걸고 바로 리턴한다. 관리인 조회는 그 Postgres를
// 다시 읽으므로, 반영이 끝나기 전에 읽으면 직전 상태가 돌아온다. 화면에서는 보낸 메시지가
// 다음 전송 때 나타나고(대화가 하나씩 밀림) 레인 토글이 한 클릭 늦게 반영되는 증상이었다.
//
// DATABASE_URL 없이도 돌도록 지연 반영을 흉내내는 가짜 프로젝터를 쓴다 —
// 로컬은 프로젝터가 아예 없어서(인메모리 직독) 이 버그가 재현되지 않는다. 프로덕션 전용 버그였다.
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RoomlogService, type Store, type StoreProjector } from "./roomlog.service";

const MANAGER_ID = "landlord-demo";
const TICKET_ID = "ticket-demo-aircon";

/** persist를 한 틱 늦게 반영하는 프로젝터. load는 "이미 반영된" 스냅샷만 돌려준다. */
function createLaggingProjector() {
  let committed: Store | undefined;

  const projector: StoreProjector = {
    load: () => (committed ? (structuredClone(committed) as Store) : undefined),
    persist: async (store: Store) => {
      const snapshot = structuredClone(store);
      // 실제 Prisma 쓰기처럼 이 await 뒤에야 반영된다 — 그 사이의 읽기가 밀린 값을 봤다.
      await new Promise((resolve) => setTimeout(resolve, 0));
      committed = snapshot;
    }
  };

  return projector;
}

/** 시드된 스토어가 프로젝터에 한 번 반영된 상태에서 시작한다(부팅 직후 정상 상태). */
async function createServiceWithLaggingProjector() {
  const service = new RoomlogService({
    seedDemoData: true,
    storeProjector: createLaggingProjector()
  });

  service.markManagerTicketRead(MANAGER_ID, TICKET_ID);
  await service.flushPersistence();

  return service;
}

describe("관리인 읽기는 방금 쓴 내용을 본다", () => {
  it("보낸 답변이 곧바로 스레드에 보인다 (대화가 밀리지 않는다)", async () => {
    const service = await createServiceWithLaggingProjector();

    const before = await service.getCurrentTicketDetailForManager(MANAGER_ID, TICKET_ID);
    const beforeCount = before.messages.length;

    service.sendManagerTicketReply(MANAGER_ID, TICKET_ID, { messageText: "첫 번째 답변" });
    const afterFirst = await service.getCurrentTicketDetailForManager(MANAGER_ID, TICKET_ID);

    assert.equal(
      afterFirst.messages.length,
      beforeCount + 1,
      "전송 직후 재조회에 방금 보낸 메시지가 있어야 한다"
    );
    assert.equal(afterFirst.messages.at(-1)?.messageText, "첫 번째 답변");

    // 연속 전송에서도 밀리지 않는다 — 밀림 버그는 두 번째부터 확실히 드러났다.
    service.sendManagerTicketReply(MANAGER_ID, TICKET_ID, { messageText: "두 번째 답변" });
    const afterSecond = await service.getCurrentTicketDetailForManager(MANAGER_ID, TICKET_ID);

    assert.equal(afterSecond.messages.length, beforeCount + 2);
    assert.equal(afterSecond.messages.at(-1)?.messageText, "두 번째 답변");
  });

  it("레인 전환이 곧바로 반영된다 (한 클릭 늦지 않는다)", async () => {
    const service = await createServiceWithLaggingProjector();

    service.setManagerTicketLane(MANAGER_ID, TICKET_ID, { lane: "resolved" });
    const afterResolve = await service.getCurrentTicketDetailForManager(MANAGER_ID, TICKET_ID);
    assert.equal(afterResolve.status, "COMPLETED");

    service.setManagerTicketLane(MANAGER_ID, TICKET_ID, { lane: "received" });
    const afterReceive = await service.getCurrentTicketDetailForManager(MANAGER_ID, TICKET_ID);
    assert.equal(afterReceive.status, "RECEIVED");
  });
});
