import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  filterManagerTickets,
  managerTicketFilterLabel,
  type ManagerTicketFilterItem
} from "./manager-ticket-filter";

const tickets: ManagerTicketFilterItem[] = [
  {
    id: "t1",
    status: "ADDITIONAL_INFO_REQUESTED",
    sourceChannel: "CALLBOT",
    priority: 1,
    aiSummary: "화장실 천장에서 물이 계속 떨어집니다.",
    complaint: {
      title: "301호 화장실 누수",
      description: "콜봇으로 접수된 누수입니다.",
      location: "화장실"
    },
    room: {
      buildingName: "정글빌라",
      roomNo: "301호"
    }
  },
  {
    id: "t2",
    status: "RECEIVED",
    sourceChannel: "REALTIME_CHAT",
    priority: 3,
    aiSummary: "세면대 수전 손잡이가 헐거워졌습니다.",
    complaint: {
      title: "909호 세면대 수전 손잡이",
      description: "채팅 상담으로 접수되었습니다.",
      location: "화장실 세면대"
    },
    room: {
      buildingName: "브라우저 테스트 빌라",
      roomNo: "909호"
    }
  }
];

describe("manager ticket filtering", () => {
  it("returns every ticket for an empty query", () => {
    assert.deepEqual(
      filterManagerTickets(tickets, " ").map((ticket) => ticket.id),
      ["t1", "t2"]
    );
  });

  it("matches by source channel, title, room, and summary tokens", () => {
    assert.deepEqual(
      filterManagerTickets(tickets, "콜봇 누수").map((ticket) => ticket.id),
      ["t1"]
    );
    assert.deepEqual(
      filterManagerTickets(tickets, "909호 수전").map((ticket) => ticket.id),
      ["t2"]
    );
  });

  it("builds a compact result count label for the queue header", () => {
    assert.equal(managerTicketFilterLabel(24, 3, "콜봇"), "3/24건 표시 · 콜봇");
    assert.equal(managerTicketFilterLabel(24, 24, ""), "24건 표시");
  });
});
