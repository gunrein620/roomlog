import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";

function createTradeRoom(service: RoomlogService, title = "거래연결빌라") {
  return service.assignTenantRoomFromContract("tenant-demo", "landlord-demo", {
    title,
    location: "서울 서초구 방배동 101호",
  });
}

function createTradeDraft(
  service: RoomlogService,
  tradeContractId: string,
  monthlyRent = 650_000,
) {
  const room = createTradeRoom(service, `거래연결빌라-${tradeContractId}`);
  const contract = service.ensureTradeContractDraft({
    tradeContractId,
    roomId: room.id,
    tenantId: "tenant-demo",
    landlordId: "landlord-demo",
    landlordName: "박관리",
    depositKrw: 10_000_000,
    monthlyRent,
  });

  return { room, contract };
}

function createManagerDraft(service: RoomlogService, key: string) {
  const room = createTradeRoom(service, `관리자계약빌라-${key}`);
  const detail = service.createManagerContract("landlord-demo", {
    roomId: room.id,
    unitId: room.roomNo,
  });

  return { room, contract: detail.row.contract };
}

function todayInSeoulKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function storedContract(service: RoomlogService, contractId: string) {
  const store = (service as unknown as {
    store: {
      contracts: Array<{
        id: string;
        lifecycle: string;
        review: string;
        valueSource: string;
        monthlyRent?: number;
        maintenanceFee?: number;
      }>;
    };
  }).store;

  return store.contracts.find((candidate) => candidate.id === contractId)!;
}

describe("trade contract billing bridge", () => {
  it("explains why each current-building room cannot create a bill", () => {
    const service = new RoomlogService();
    const withoutContract = createTradeRoom(service, "청구불가-계약없음");
    const noContractData = service.getManagerBillCreationOptions(
      "landlord-demo",
      withoutContract.buildingName,
      "2026-08",
    );
    const noContract = noContractData.unavailableOptions.find(
      (option) => option.roomId === withoutContract.id,
    );
    assert.deepEqual(noContract?.reasons, ["NO_CONTRACT"]);

    const { room, contract } = createManagerDraft(service, "청구불가-검토중");
    const pendingData = service.getManagerBillCreationOptions(
      "landlord-demo",
      room.buildingName,
      "2026-08",
    );
    const pending = pendingData.unavailableOptions.find(
      (option) => option.contractId === contract.id,
    );
    assert.ok(pending?.reasons.includes("CONTRACT_NOT_ACTIVE"));
    assert.ok(pending?.reasons.includes("CONTRACT_NOT_CONFIRMED"));
    assert.ok(pending?.reasons.includes("CONTRACT_VALUES_NOT_CONFIRMED"));
    assert.ok(pending?.reasons.includes("MONTHLY_RENT_MISSING"));
    assert.ok(pending?.reasons.includes("MAINTENANCE_FEE_MISSING"));
    assert.ok(pending?.reasons.includes("PAYMENT_DAY_MISSING"));
  });

  it("returns the contract attached to the tenant current room", () => {
    const service = new RoomlogService();
    const first = createTradeDraft(service, "tenant-current-old", 610_000);
    service.updateManagerContractManualValues("landlord-demo", first.contract.id, {
      maintenanceFee: 50_000,
      paymentDay: 5,
      startDate: "2000-01-01",
      endDate: "2099-12-31",
    });
    const second = createTradeDraft(service, "tenant-current-new", 730_000);
    service.updateManagerContractManualValues("landlord-demo", second.contract.id, {
      maintenanceFee: 80_000,
      paymentDay: 25,
      startDate: "2000-01-01",
      endDate: "2099-12-31",
    });

    const current = service.getTenantCurrentContract("tenant-demo");
    assert.equal(current?.id, second.contract.id);
    assert.equal(current?.monthlyRent, 730_000);
    assert.equal(current?.maintenanceFee, 80_000);
    assert.equal(current?.paymentDay, 25);
  });

  it("awaits manager confirmation projection and reprojects confirmed state on retry", async () => {
    let rejectConfirmedSnapshot = true;
    let targetContractId: string | undefined;
    const successfulStores: Array<{
      contracts: Array<{ id: string; review: string }>;
      contractExtractions: Array<{
        contractId: string;
        confirmed: boolean;
        items: Array<{ needsCheck: boolean }>;
      }>;
    }> = [];
    const service = new RoomlogService({
      storeProjector: {
        persist: async (store) => {
          const hasConfirmedContract = store.contracts.some(
            (contract) => contract.id === targetContractId && contract.review === "confirmed",
          );
          if (hasConfirmedContract && rejectConfirmedSnapshot) {
            rejectConfirmedSnapshot = false;
            throw new Error("confirmation projector unavailable");
          }
          successfulStores.push(structuredClone(store));
        },
      },
    });
    const { contract } = createTradeDraft(service, "manager-confirmation-projector");
    targetContractId = contract.id;
    service.updateManagerContractManualValues("landlord-demo", contract.id, {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    });
    const auth = service.login({ email: "manager@roomlog.test", password: "password123!" });
    const controller = new RoomlogController(service, new RealtimeGateway());
    const header = `Bearer ${auth.accessToken}`;

    await assert.rejects(
      async () => controller.confirmManagerContract(header, contract.id, { confirmNeedsCheck: true }),
      /confirmation projector unavailable/,
    );

    const confirmedAfterFailure = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(confirmedAfterFailure.row.contract.review, "confirmed");
    assert.equal(confirmedAfterFailure.extraction.confirmed, true);
    assert.equal(confirmedAfterFailure.extraction.items.some((item) => item.needsCheck), false);

    await controller.confirmManagerContract(header, contract.id, { confirmNeedsCheck: true });

    const projected = successfulStores.at(-1)!;
    assert.equal(projected.contracts.find((item) => item.id === contract.id)?.review, "confirmed");
    const extraction = projected.contractExtractions.find((item) => item.contractId === contract.id);
    assert.equal(extraction?.confirmed, true);
    assert.equal(extraction?.items.some((item) => item.needsCheck), false);
  });

  it("waits for manual contract value projection before reporting save success", async () => {
    let rejectManualSnapshot = false;
    let targetContractId: string | undefined;
    const service = new RoomlogService({
      storeProjector: {
        persist: async (store) => {
          const hasUpdatedContract = store.contracts.some(
            (contract) =>
              contract.id === targetContractId &&
              contract.maintenanceFee === 70_000 &&
              contract.startDate === "2026-07-14",
          );
          if (rejectManualSnapshot && hasUpdatedContract) {
            throw new Error("manual contract projector unavailable");
          }
        },
      },
    });
    const { contract } = createTradeDraft(service, "manager-manual-value-projector");
    targetContractId = contract.id;
    await service.ensurePersistenceDurability();

    const auth = service.login({ email: "manager@roomlog.test", password: "password123!" });
    const controller = new RoomlogController(service, new RealtimeGateway());
    const header = `Bearer ${auth.accessToken}`;
    rejectManualSnapshot = true;

    await assert.rejects(
      async () => controller.updateManagerContractManualValues(header, contract.id, {
        maintenanceFee: 70_000,
        startDate: "2026-07-14",
        endDate: "2099-07-13",
      }),
      /manual contract projector unavailable/,
    );
  });

  it("scopes manager contract invite links to the exact selected contract", () => {
    const service = new RoomlogService();
    const first = createManagerDraft(service, "invite-scope-first").contract;
    const second = createManagerDraft(service, "invite-scope-second").contract;
    const firstInvite = service.createManagerContractInvite("landlord-demo", first.id, {
      tenantName: "첫 계약 임차인",
      phone: "010-1111-0001",
    }).invite;
    const secondInvite = service.createManagerContractInvite("landlord-demo", second.id, {
      tenantName: "둘째 계약 임차인",
      phone: "010-2222-0002",
    }).invite;

    const firstDetail = service.getManagerContractDetail("landlord-demo", first.id);
    const secondDetail = service.getManagerContractDetail("landlord-demo", second.id);

    assert.deepEqual(firstDetail.inviteLinks.map((invite) => invite.id), [firstInvite.id]);
    assert.deepEqual(secondDetail.inviteLinks.map((invite) => invite.id), [secondInvite.id]);
  });

  it("creates one unverified billing contract draft on the exact assigned room", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service);
    const input = {
      tradeContractId: "trade-contract-1",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    };

    const first = service.ensureTradeContractDraft(input);
    const second = service.ensureTradeContractDraft(input);
    const rows = service.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === "ct_trade_trade-contract-1");

    assert.equal(first.id, "ct_trade_trade-contract-1");
    assert.equal(first.roomId, room.id);
    assert.equal(first.tenantId, "tenant-demo");
    assert.equal(first.lifecycle, "analyzing");
    assert.equal(first.review, "pending");
    assert.equal(first.valueSource, "unverified");
    assert.equal(first.monthlyRent, 650_000);
    assert.equal(first.maintenanceFee, undefined);
    assert.equal(first.paymentDay, undefined);
    assert.equal(first.startDate, undefined);
    assert.equal(first.endDate, undefined);
    assert.equal(second.id, first.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].origin, "trade_acceptance");

    const detail = service.getManagerContractDetail("landlord-demo", first.id);
    assert.equal(detail.manualValues.deposit, "10,000,000원");
    assert.equal(detail.extraction.items.find((item) => item.label === "보증금")?.needsCheck, true);
    const store = (service as unknown as {
      store: { contractDocuments: Array<{ contractId: string }> };
    }).store;
    assert.equal(store.contractDocuments.some((document) => document.contractId === first.id), false);

    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === first.id),
      false,
    );

    const reviewOnlyConfirmed = service.confirmManagerContractReview("landlord-demo", first.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(reviewOnlyConfirmed.row.contract.review, "confirmed");
    assert.equal(reviewOnlyConfirmed.extraction.confirmed, true);
    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === first.id),
      false,
    );
    assert.deepEqual(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .unavailableOptions.find((option) => option.contractId === first.id)?.reasons,
      ["MAINTENANCE_FEE_MISSING", "PAYMENT_DAY_MISSING"],
    );

    const manualValues = {
      deposit: "10,000,000원",
      monthlyRent: 650_000,
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    const manuallyUpdated = service.updateManagerContractManualValues(
      "landlord-demo",
      first.id,
      manualValues,
    );
    assert.equal(manuallyUpdated.manualValues.maintenanceFee, "0원");
    assert.equal(
      manuallyUpdated.extraction.items.find((item) => item.label === "관리비")?.value,
      undefined,
    );
    assert.equal(
      manuallyUpdated.extraction.items.find((item) => item.label === "계약 기간")?.value,
      undefined,
    );

    assert.throws(() => service.confirmManagerContractReview("landlord-demo", first.id, {
      confirmNeedsCheck: false,
    }), /원문과 대조/);
    const stillNeedsAcknowledgement = service.getManagerContractDetail("landlord-demo", first.id);
    assert.equal(stillNeedsAcknowledgement.row.contract.lifecycle, "active");
    assert.equal(stillNeedsAcknowledgement.row.contract.review, "confirmed");
    assert.equal(stillNeedsAcknowledgement.row.contract.valueSource, "manual");
    assert.equal(stillNeedsAcknowledgement.extraction.confirmed, true);

    const confirmed = service.confirmManagerContractReview("landlord-demo", first.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(confirmed.row.contract.lifecycle, "active");
    assert.equal(confirmed.row.contract.review, "confirmed");
    assert.equal(confirmed.row.contract.valueSource, "confirmed");
    assert.equal(confirmed.extraction.confirmed, true);
    assert.equal(confirmed.extraction.items.some((item) => item.needsCheck), false);
    const confirmedDashboardRow = service.getManagerContractDashboard("landlord-demo").rows
      .find((row) => row.contract.id === first.id);
    assert.equal(confirmedDashboardRow?.needsCheckCount, 0);
    assert.notEqual(confirmedDashboardRow?.statusLabel, "확인 필요");

    const option = service.getManagerBillCreationOptions(
      "landlord-demo",
      room.buildingName,
      "2026-08",
    ).options.find((candidate) => candidate.contractId === first.id);
    assert.equal(option?.monthlyRent, 650_000);
    assert.equal(option?.maintenanceFee, 0);
    assert.equal(option?.dueDate, "2026-08-10");
    assert.equal(
      service.getManagerBillCreationOptions("multi-demo", undefined, "2026-08")
        .options.some((candidate) => candidate.contractId === first.id),
      false,
    );
  });

  it("rolls back contract and extraction confirmation when synchronous file persistence fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-confirm-rollback-"));
    const storeFilePath = join(dir, "roomlog.json");
    const service = new RoomlogService({ seedDemoData: true, storeFilePath });
    const { contract } = createTradeDraft(service, "confirm-persist-failure");
    service.updateManagerContractManualValues("landlord-demo", contract.id, {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    });
    const beforeStore = structuredClone((service as unknown as { store: unknown }).store);
    const beforeFile = readFileSync(storeFilePath, "utf8");
    mkdirSync(`${storeFilePath}.tmp`);

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: true,
      }),
      /EISDIR|directory|rename|write/i,
    );

    assert.deepEqual((service as unknown as { store: unknown }).store, beforeStore);
    assert.equal(readFileSync(storeFilePath, "utf8"), beforeFile);
    const detail = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(detail.row.contract.lifecycle, "analyzing");
    assert.equal(detail.row.contract.review, "pending");
    assert.equal(detail.extraction.confirmed, false);
    assert.equal(detail.extraction.items.some((item) => item.needsCheck), true);
    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo").options
        .some((option) => option.contractId === contract.id),
      false,
    );
  });

  it("stores and persists a missing extraction before a successful confirmation", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-confirm-missing-extraction-"));
    const storeFilePath = join(dir, "roomlog.json");
    const source = new RoomlogService({ seedDemoData: true });
    const { contract } = createTradeDraft(source, "confirm-missing-extraction");
    source.updateManagerContractManualValues("landlord-demo", contract.id, {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    });
    const missingStore = structuredClone((source as unknown as {
      store: {
        contracts: Array<{ id: string; extractionId?: string }>;
        contractExtractions: Array<{ contractId: string }>;
      };
    }).store);
    missingStore.contractExtractions = missingStore.contractExtractions
      .filter((extraction) => extraction.contractId !== contract.id);
    delete missingStore.contracts.find((candidate) => candidate.id === contract.id)!.extractionId;
    const restored = new RoomlogService({
      seedDemoData: false,
      initialStore: missingStore as any,
      storeFilePath,
    });

    const confirmed = restored.confirmManagerContractReview("landlord-demo", contract.id, {
      confirmNeedsCheck: true,
    });
    const stored = (restored as unknown as {
      store: {
        contracts: Array<{ id: string; extractionId?: string }>;
        contractExtractions: Array<{
          id: string;
          contractId: string;
          confirmed: boolean;
          items: Array<{ needsCheck: boolean }>;
        }>;
      };
    }).store;
    const storedExtraction = stored.contractExtractions
      .find((extraction) => extraction.contractId === contract.id);

    assert.equal(confirmed.extraction.confirmed, true);
    assert.equal(storedExtraction?.confirmed, true);
    assert.equal(storedExtraction?.items.some((item) => item.needsCheck), false);
    assert.equal(
      stored.contracts.find((candidate) => candidate.id === contract.id)?.extractionId,
      storedExtraction?.id,
    );

    const restarted = new RoomlogService({ seedDemoData: false, storeFilePath });
    const afterRestart = restarted.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(afterRestart.extraction.confirmed, true);
    assert.equal(afterRestart.extraction.items.some((item) => item.needsCheck), false);
  });

  it("rejects a contract whose end date is earlier than its start date", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "reversed-period");
    const manualValues = {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2099-07-13",
      endDate: "2099-07-12",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: true,
      }),
      /종료일은 시작일보다 빠를 수 없습니다/,
    );
    const detail = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(detail.row.contract.lifecycle, "analyzing");
    assert.equal(detail.row.contract.review, "pending");
    assert.equal(detail.row.contract.valueSource, "manual");
    assert.equal(detail.extraction.confirmed, false);
  });

  it("rejects a contract that ended before the current Seoul calendar day", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "expired-period");
    const manualValues = {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "1999-01-01",
      endDate: "2000-01-01",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: true,
      }),
      /이미 종료된 계약/,
    );
    const detail = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(detail.row.contract.lifecycle, "analyzing");
    assert.equal(detail.row.contract.review, "pending");
    assert.equal(detail.extraction.confirmed, false);
  });

  it("confirms review without rent or maintenance fee but excludes it from billing", () => {
    const rentMissingService = new RoomlogService();
    const rentMissingDraft = createManagerDraft(rentMissingService, "rent-missing");
    const rentMissing = rentMissingDraft.contract;
    const maintenanceOnly = {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    rentMissingService.updateManagerContractManualValues(
      "landlord-demo",
      rentMissing.id,
      maintenanceOnly,
    );
    const rentMissingConfirmed = rentMissingService.confirmManagerContractReview("landlord-demo", rentMissing.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(rentMissingConfirmed.row.contract.review, "confirmed");
    assert.ok(
      rentMissingService.getManagerBillCreationOptions("landlord-demo", rentMissingDraft.room.buildingName, "2026-08")
        .unavailableOptions.find((option) => option.contractId === rentMissing.id)
        ?.reasons.includes("MONTHLY_RENT_MISSING"),
    );

    const feeMissingService = new RoomlogService();
    const feeMissingDraft = createManagerDraft(feeMissingService, "fee-missing");
    const feeMissing = feeMissingDraft.contract;
    const rentOnly = {
      monthlyRent: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    feeMissingService.updateManagerContractManualValues("landlord-demo", feeMissing.id, rentOnly);
    const feeMissingConfirmed = feeMissingService.confirmManagerContractReview("landlord-demo", feeMissing.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(feeMissingConfirmed.row.contract.review, "confirmed");
    assert.ok(
      feeMissingService.getManagerBillCreationOptions("landlord-demo", feeMissingDraft.room.buildingName, "2026-08")
        .unavailableOptions.find((option) => option.contractId === feeMissing.id)
        ?.reasons.includes("MAINTENANCE_FEE_MISSING"),
    );
  });

  it("confirms a zero-total contract through its inclusive end date but excludes it from billing", () => {
    const service = new RoomlogService();
    const { room, contract } = createTradeDraft(service, "zero-total", 0);
    const manualValues = {
      monthlyRent: 0,
      maintenanceFee: 0,
      startDate: "2000-01-01",
      endDate: todayInSeoulKey(),
    };
    const updated = service.updateManagerContractManualValues(
      "landlord-demo",
      contract.id,
      manualValues,
    );

    assert.equal(updated.manualValues.rent, "0원");
    assert.equal(updated.manualValues.maintenanceFee, "0원");
    const confirmed = service.confirmManagerContractReview("landlord-demo", contract.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(confirmed.row.contract.lifecycle, "active");
    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === contract.id),
      false,
    );
  });

  it("rejects a positive total without a payment day and excludes legacy invalid active data", () => {
    const service = new RoomlogService();
    const { room, contract } = createTradeDraft(service, "missing-payment-day");
    const manualValues = {
      maintenanceFee: 0,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);

    const confirmedWithoutPaymentDay = service.confirmManagerContractReview("landlord-demo", contract.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(confirmedWithoutPaymentDay.row.contract.review, "confirmed");
    assert.ok(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .unavailableOptions.find((option) => option.contractId === contract.id)
        ?.reasons.includes("PAYMENT_DAY_MISSING"),
    );

    const store = (service as unknown as {
      store: { contracts: Array<{ id: string; lifecycle: string; review: string; valueSource: string }> };
    }).store;
    const legacyContract = store.contracts.find((candidate) => candidate.id === contract.id)!;
    legacyContract.lifecycle = "active";
    legacyContract.review = "confirmed";
    legacyContract.valueSource = "confirmed";

    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === contract.id),
      false,
    );
  });

  it("requires a payment day from 1 through 31 for activation and billing", () => {
    const service = new RoomlogService();
    const { room, contract } = createTradeDraft(service, "invalid-payment-day");
    const manualValues = {
      maintenanceFee: 0,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);

    const invalidPaymentDay = { paymentDay: 32 };
    assert.throws(
      () => service.updateManagerContractManualValues(
        "landlord-demo",
        contract.id,
        invalidPaymentDay,
      ),
      /납부일.*1.*31/,
    );

    const store = (service as unknown as {
      store: {
        contracts: Array<{
          id: string;
          lifecycle: string;
          review: string;
          valueSource: string;
          paymentDay?: number;
        }>;
      };
    }).store;
    const legacyContract = store.contracts.find((candidate) => candidate.id === contract.id)!;
    legacyContract.paymentDay = 32;
    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: true,
      }),
      /납부일.*1.*31/,
    );
    assert.equal(
      service.getManagerContractDetail("landlord-demo", contract.id).row.contract.lifecycle,
      "analyzing",
    );

    legacyContract.lifecycle = "active";
    legacyContract.review = "confirmed";
    legacyContract.valueSource = "confirmed";
    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === contract.id),
      false,
    );
  });

  it("rejects malformed legacy money values for activation and bill creation", () => {
    const invalidValues = [
      { name: "negative", value: -1 },
      { name: "fractional", value: 1.5 },
      { name: "NaN", value: Number.NaN },
      { name: "positive infinity", value: Number.POSITIVE_INFINITY },
      { name: "negative infinity", value: Number.NEGATIVE_INFINITY },
      { name: "unsafe integer", value: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const field of ["monthlyRent", "maintenanceFee"] as const) {
      const service = new RoomlogService();
      const { room, contract } = createTradeDraft(service, `legacy-money-${field}`);
      const manualValues = {
        monthlyRent: 100,
        maintenanceFee: 100,
        paymentDay: 10,
        startDate: "2026-07-13",
        endDate: "2099-07-12",
      };
      service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);
      const legacyContract = storedContract(service, contract.id);
      const label = field === "monthlyRent" ? "월세" : "관리비";

      for (const invalid of invalidValues) {
        legacyContract.monthlyRent = 100;
        legacyContract.maintenanceFee = 100;
        legacyContract[field] = invalid.value;
        legacyContract.lifecycle = "analyzing";
        legacyContract.review = "pending";
        legacyContract.valueSource = "manual";

        assert.throws(
          () => service.confirmManagerContractReview("landlord-demo", contract.id, {
            confirmNeedsCheck: true,
          }),
          new RegExp(`${label}.*0 이상의 원 단위 정수`),
          `${field} accepted ${invalid.name}`,
        );
        const rejected = service.getManagerContractDetail("landlord-demo", contract.id);
        assert.equal(rejected.row.contract.lifecycle, "analyzing");
        assert.equal(rejected.row.contract.review, "pending");
        assert.equal(rejected.row.contract.valueSource, "manual");
        assert.equal(rejected.extraction.confirmed, false);

        legacyContract.lifecycle = "active";
        legacyContract.review = "confirmed";
        legacyContract.valueSource = "confirmed";
        assert.equal(
          service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
            .options.some((option) => option.contractId === contract.id),
          false,
          `${field} billed ${invalid.name}`,
        );
      }
    }
  });

  it("rejects an unsafe stored money sum before confirmation and bill-option exposure", () => {
    const service = new RoomlogService();
    const { room, contract } = createTradeDraft(service, "unsafe-money-sum");
    service.updateManagerContractManualValues("landlord-demo", contract.id, {
      monthlyRent: Number.MAX_SAFE_INTEGER,
      maintenanceFee: 1,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    });
    const before = service.getManagerContractDetail("landlord-demo", contract.id);

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: true,
      }),
      /합계.*안전한|합계.*정수/,
    );
    const after = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(after.row.contract.lifecycle, before.row.contract.lifecycle);
    assert.equal(after.row.contract.review, before.row.contract.review);
    assert.equal(after.extraction.confirmed, false);

    const legacyContract = storedContract(service, contract.id);
    legacyContract.lifecycle = "active";
    legacyContract.review = "confirmed";
    legacyContract.valueSource = "confirmed";
    assert.equal(
      service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
        .options.some((option) => option.contractId === contract.id),
      false,
    );
  });

  it("requires literal true to acknowledge needs-check extraction items", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "literal-review-acknowledgement");
    const manualValues = {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, manualValues);

    assert.throws(
      () => service.confirmManagerContractReview("landlord-demo", contract.id, {
        confirmNeedsCheck: "false" as any,
      }),
      /원문과 대조/,
    );
    const rejected = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.equal(rejected.row.contract.lifecycle, "analyzing");
    assert.equal(rejected.row.contract.review, "pending");
    assert.equal(rejected.extraction.confirmed, false);
  });

  it("rejects a non-string deposit before any manual contract mutation", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "invalid-manual-deposit");
    const before = service.getManagerContractDetail("landlord-demo", contract.id);
    const invalidInput = {
      deposit: 10_000_000 as any,
      monthlyRent: 700_000,
      maintenanceFee: 70_000,
      paymentDay: 15,
      startDate: "2026-08-01",
      endDate: "2099-07-31",
    };

    assert.throws(
      () => service.updateManagerContractManualValues("landlord-demo", contract.id, invalidInput),
      /보증금.*문자열/,
    );
    const after = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.deepEqual(after.row.contract, before.row.contract);
    assert.deepEqual(after.extraction, before.extraction);
  });

  it("rejects a non-string account before any manual contract mutation", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "invalid-manual-account");
    const before = service.getManagerContractDetail("landlord-demo", contract.id);
    const invalidInput = {
      deposit: "10,000,000원",
      account: 123_456_789 as any,
      monthlyRent: 700_000,
      maintenanceFee: 70_000,
      paymentDay: 15,
      startDate: "2026-08-01",
      endDate: "2099-07-31",
    };

    assert.throws(
      () => service.updateManagerContractManualValues("landlord-demo", contract.id, invalidInput),
      /임대인 계좌.*문자열/,
    );
    const after = service.getManagerContractDetail("landlord-demo", contract.id);
    assert.deepEqual(after.row.contract, before.row.contract);
    assert.deepEqual(after.extraction, before.extraction);
  });

  it("validates manual contract dates and clears a previous date when blank is entered", () => {
    const service = new RoomlogService();
    const { contract } = createTradeDraft(service, "manual-date-validation");
    const validDates = {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    };
    service.updateManagerContractManualValues("landlord-demo", contract.id, validDates);

    const invalidDate = { deposit: undefined, startDate: "2026/07/13" };
    assert.throws(
      () => service.updateManagerContractManualValues("landlord-demo", contract.id, invalidDate),
      /계약 시작일.*YYYY-MM-DD/,
    );

    const impossibleDate = { deposit: undefined, endDate: "2026-02-30" };
    assert.throws(
      () => service.updateManagerContractManualValues("landlord-demo", contract.id, impossibleDate),
      /계약 종료일.*YYYY-MM-DD/,
    );

    const blankDate = { deposit: undefined, startDate: "" };
    const cleared = service.updateManagerContractManualValues(
      "landlord-demo",
      contract.id,
      blankDate,
    );
    assert.equal(cleared.row.contract.startDate, undefined);
    assert.equal(
      cleared.extraction.items.find((item) => item.label === "계약 기간")?.value,
      undefined,
    );
    const confirmedWithoutStartDate = service.confirmManagerContractReview("landlord-demo", contract.id, {
      confirmNeedsCheck: true,
    });
    assert.equal(confirmedWithoutStartDate.row.contract.review, "confirmed");
  });

  it("does not leave partial draft state when deposit validation fails", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "검증원자성빌라");
    const input = {
      tradeContractId: "invalid-deposit",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000.5,
      monthlyRent: 650_000,
    };

    assert.throws(() => service.ensureTradeContractDraft(input), /보증금는 0 이상의 원 단위 정수/);

    const contractId = "ct_trade_invalid-deposit";
    const store = (service as unknown as {
      store: {
        contracts: Array<{ id: string }>;
        contractExtractions: Array<{ contractId: string }>;
        contractPrivacies: Array<{ contractId: string }>;
        contractDocuments: Array<{ contractId: string }>;
      };
    }).store;
    assert.equal(store.contracts.some((contract) => contract.id === contractId), false);
    assert.equal(store.contractExtractions.some((extraction) => extraction.contractId === contractId), false);
    assert.equal(store.contractPrivacies.some((privacy) => privacy.contractId === contractId), false);
    assert.equal(store.contractDocuments.some((document) => document.contractId === contractId), false);

    const retried = service.ensureTradeContractDraft({ ...input, depositKrw: 10_000_000 });
    assert.equal(retried.id, contractId);
  });

  it("displays zero rent as a currency-shaped draft value", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "월세제로빌라");
    const draft = service.ensureTradeContractDraft({
      tradeContractId: "zero-rent",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 0,
    });

    const detail = service.getManagerContractDetail("landlord-demo", draft.id);
    assert.equal(draft.monthlyRent, 0);
    assert.equal(detail.manualValues.rent, "0원");
    assert.equal(detail.extraction.items.find((item) => item.label === "월세")?.value, undefined);
  });

  it("rejects a deterministic relationship conflict before same-party active reuse", () => {
    const service = new RoomlogService();
    const existingRoom = createTradeRoom(service, "결정적ID기존빌라");
    service.ensureTradeContractDraft({
      tradeContractId: "relationship-conflict",
      roomId: existingRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });

    const requestedRoom = createTradeRoom(service, "결정적ID요청빌라");
    const active = service.ensureTradeContractDraft({
      tradeContractId: "requested-active",
      roomId: requestedRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });
    const store = (service as unknown as { store: { contracts: Array<Record<string, unknown>> } }).store;
    const storedActive = store.contracts.find((contract) => contract.id === active.id)!;
    storedActive.lifecycle = "active";

    assert.throws(() => service.ensureTradeContractDraft({
      tradeContractId: "relationship-conflict",
      roomId: requestedRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    }), /동일한 거래 계약 ID가 다른 계약 관계/);
  });

  it("does not expose another landlord's trade draft and rejects an active different tenant", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "권한검증빌라");
    const draft = service.ensureTradeContractDraft({
      tradeContractId: "scope-1",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });

    const otherLandlord = service.signup({
      email: "trade-scope-landlord@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "외부 임대인",
      phone: "010-7788-1001",
      role: "LANDLORD",
      buildingName: "외부관리빌라",
      roomNo: "201호",
      address: "서울 서초구 외부로 2",
    });

    assert.equal(service.getManagerContractDashboard("tenant-demo").rows.some(
      (row) => row.contract.id === draft.id,
    ), false);
    assert.equal(service.getManagerContractDashboard(otherLandlord.userId).rows.some(
      (row) => row.contract.id === draft.id,
    ), false);
    assert.throws(
      () => service.getManagerContractDetail(otherLandlord.userId, draft.id),
      /관리 가능한 계약서를 찾을 수 없습니다/,
    );

    const store = (service as unknown as { store: { contracts: Array<Record<string, unknown>> } }).store;
    const storedDraft = store.contracts.find((contract) => contract.id === draft.id)!;
    storedDraft.lifecycle = "active";
    storedDraft.review = "confirmed";
    storedDraft.valueSource = "confirmed";

    const sameParty = service.ensureTradeContractDraft({
      tradeContractId: "scope-same-party",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });
    assert.equal(sameParty.id, draft.id);

    assert.throws(() => service.ensureTradeContractDraft({
      tradeContractId: "scope-2",
      roomId: room.id,
      tenantId: "other-tenant",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 5_000_000,
      monthlyRent: 500_000,
    }), /다른 임차인의 활성 계약/);
  });
});
