import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ManagerVendorJobLookup } from "@roomlog/types";
import type { ManagerVendorRepository } from "../manager-vendor.repository";
import { RoomlogManagerVendorDomain } from "./roomlog-manager-vendor.domain";

function jobLookup(
  partnership: "REGISTERED" | "UNREGISTERED"
): ManagerVendorJobLookup {
  const catalog = {
    id: "vendor-1",
    businessName: partnership === "REGISTERED" ? "등록 설비" : "세입자 연결 설비",
    contactPerson: "김기사",
    phone: "02-100-1000",
    trades: ["PLUMBING"],
    serviceAreas: ["성동구"],
    verificationStatus: "VERIFIED" as const,
    isActive: true,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
  const job = {
    repairId: "repair-1",
    ticketId: "ticket-1",
    title: "배관 처리 요청",
    trade: "배관",
    status: "REQUESTED" as const,
    publicLocation: "테스트 빌라 701호",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };

  return partnership === "REGISTERED"
    ? {
        partnership,
        vendor: {
          id: "relation-1",
          managerId: "manager-1",
          vendorId: "vendor-1",
          status: "ACTIVE",
          registeredAt: "2026-07-17T00:00:00.000Z",
          catalog,
          accountStatus: "ACTIVE",
          activeJobCount: 1,
          waitingPaymentCount: 0,
          completedJobCount: 0
        },
        job
      }
    : {
        partnership,
        vendor: {
          vendorId: "vendor-1",
          catalog
        },
        job
      };
}

describe("RoomlogManagerVendorDomain.findJobByTicket", () => {
  for (const partnership of ["REGISTERED", "UNREGISTERED"] as const) {
    it(`preserves the ${partnership} partnership marker`, async () => {
      const repository = {
        async findJobByTicket() {
          return jobLookup(partnership);
        }
      } as unknown as ManagerVendorRepository;
      const domain = new RoomlogManagerVendorDomain(repository);

      const result = await domain.findJobByTicket("manager-1", "ticket-1");

      assert.ok(result);
      assert.equal(result.partnership, partnership);
      assert.equal(result.job.repairId, "repair-1");
      assert.equal(result.vendor.catalog.id, "vendor-1");
    });
  }
});
