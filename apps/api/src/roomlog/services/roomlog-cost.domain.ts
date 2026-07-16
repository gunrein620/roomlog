// 비용(cost)·영수증 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 읽기 전용(mutation 없음 → persist 불필요). 공유 헬퍼는 동명 필드로 주입해 본문 verbatim 유지.
// cloneReceiptOcr는 store 하이드레이션도 쓰므로 RoomlogService에 잔류·주입.
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { id, now } from "../roomlog-support";
import type {
  Cost,
  CostReviewQueueSummary,
  CostType,
  DisclosureState,
  DisclosureSetting,
  ReceiptOcr,
  RepairRequest,
  Room,
  Ticket
} from "../roomlog.types";
import type { Store } from "../roomlog.service";

export class RoomlogCostDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly timeOf: (iso?: string) => number,
    private readonly findTicket: (ticketId: string) => Ticket,
    private readonly findRoom: (roomId: string) => Room,
    private readonly canManagerAccessRoom: (managerId: string, roomId: string) => boolean,
    private readonly displayUnitId: (room: Room) => string,
    private readonly cloneReceiptOcr: (ocr: ReceiptOcr) => ReceiptOcr
  ) {}

  listManagerCosts(managerId: string, financeOwnedCosts: readonly Cost[] = []) {
    return this.managerCosts(managerId, financeOwnedCosts);
  }

  getManagerCost(
    managerId: string,
    costId: string,
    financeOwnedCosts: readonly Cost[] = []
  ) {
    const cost = this.managerCosts(managerId, financeOwnedCosts).find(
      (item) => item.id === costId
    );

    if (!cost) {
      throw new NotFoundException("관리 가능한 비용을 찾을 수 없습니다.");
    }

    return cost;
  }

  confirmManagerCost(managerId: string, costId: string) {
    const cost = this.findStoredManagerCost(managerId, costId);
    const updatedAt = now();

    cost.status = "confirmed";
    cost.reviewReason = undefined;
    cost.verified = cost.verified || !this.costNeedsReview(cost);
    cost.updatedAt = updatedAt;
    this.persistStore();

    return this.getManagerCost(managerId, cost.id);
  }

  confirmManagerReceiptOcr(managerId: string, ocrId: string) {
    const ocr = this.store.receiptOcrs.find((item) => item.id === ocrId);

    if (!ocr || !this.canManagerAccessReceiptOcr(managerId, ocr)) {
      throw new NotFoundException("관리 가능한 영수증 OCR을 찾을 수 없습니다.");
    }

    if (ocr.costId) {
      return this.confirmManagerCost(managerId, ocr.costId);
    }

    const receipt = this.store.receipts.find((item) => item.id === ocr.receiptId);
    const createdAt = now();
    const cost: Cost = {
      id: id("cost"),
      managerId: receipt?.managerId ?? managerId,
      date: this.toIsoDate(ocr.fields.date.value),
      item: ocr.fields.item.value.trim() || "영수증 비용",
      amount: ocr.fields.amount.value,
      type: ocr.suggestedType ?? "other",
      scope: ocr.fields.unitId?.value ? "unit" : "building",
      unitId: ocr.fields.unitId?.value,
      status: "confirmed",
      verified: !this.ocrNeedsReview(ocr),
      reviewReason: undefined,
      disclosure: ocr.suggestedType === "maintenance" ? "public" : undefined,
      receiptId: ocr.receiptId,
      createdAt,
      updatedAt: createdAt
    };

    this.store.costs.unshift(cost);
    ocr.costId = cost.id;
    this.persistStore();

    return this.getManagerCost(managerId, cost.id);
  }

  voidManagerCost(managerId: string, costId: string, reason?: string) {
    const cost = this.findStoredManagerCost(managerId, costId);

    if (cost.status === "void") {
      return this.getManagerCost(managerId, cost.id);
    }

    const normalizedReason = reason?.trim();
    cost.status = "void";
    cost.voidReason = normalizedReason || "관리자 무효 처리";
    cost.updatedAt = now();
    this.persistStore();

    return this.getManagerCost(managerId, cost.id);
  }

  updateManagerCostDisclosure(
    managerId: string,
    costId: string,
    disclosure: DisclosureState
  ) {
    if (disclosure !== "public" && disclosure !== "private") {
      throw new BadRequestException("공개 설정 값이 올바르지 않습니다.");
    }

    const cost = this.findStoredManagerCost(managerId, costId);

    if (cost.type !== "maintenance") {
      throw new BadRequestException("관리비 비용만 공개 설정을 변경할 수 있습니다.");
    }

    cost.disclosure = disclosure;
    cost.updatedAt = now();
    this.persistStore();

    return this.getManagerDisclosureSetting(managerId, cost.date.slice(0, 7));
  }

  getManagerCostReviewQueueSummary(managerId: string): CostReviewQueueSummary {
    const costs = this.managerCosts(managerId);
    const queued = costs.filter((cost) => cost.status === "draft" && cost.reviewReason);

    return {
      ocrLowConfidence: queued.filter((cost) => cost.reviewReason === "ocr_low_confidence").length,
      classificationUnclear: queued.filter((cost) => cost.reviewReason === "classification_unclear").length,
      unitUnmatched: queued.filter((cost) => cost.reviewReason === "unit_unmatched").length,
      unverifiedConfirmed: costs.filter(
        (cost) => (cost.status === "confirmed" || cost.status === "amended") && !cost.verified
      ).length,
      total: queued.length
    };
  }

  getManagerMonthlyCostSummary(
    managerId: string,
    month = this.currentMonth(),
    financeOwnedCosts: readonly Cost[] = []
  ) {
    const activeCosts = this.activeManagerCostsForSummary(
      managerId,
      financeOwnedCosts
    ).filter((cost) => cost.date.startsWith(month));
    const byType = this.emptyCostTypeAmounts();

    for (const cost of activeCosts) {
      byType[cost.type] += cost.amount;
    }

    return {
      month,
      totalAmount: activeCosts.reduce((sum, cost) => sum + cost.amount, 0),
      byType,
      confirmedCount: activeCosts.length
    };
  }

  listManagerReceipts(managerId: string) {
    const accessibleReceiptIds = new Set(
      this.managerCosts(managerId)
        .map((cost) => cost.receiptId)
        .filter((receiptId): receiptId is string => Boolean(receiptId))
    );

    return this.store.receipts
      .filter((receipt) => receipt.managerId === managerId || accessibleReceiptIds.has(receipt.id))
      .map((receipt) => ({ ...receipt }))
      .sort((a, b) => this.timeOf(b.uploadedAt) - this.timeOf(a.uploadedAt));
  }

  getManagerReceiptOcr(managerId: string, ocrId: string) {
    const ocr = this.store.receiptOcrs.find((item) => item.id === ocrId);

    if (!ocr || !this.canManagerAccessReceiptOcr(managerId, ocr)) {
      throw new NotFoundException("관리 가능한 영수증 OCR을 찾을 수 없습니다.");
    }

    return this.cloneReceiptOcr(ocr);
  }

  getManagerDisclosureSetting(managerId: string, month = this.currentMonth()): DisclosureSetting {
    const maintenanceCosts = this.activeManagerCostsForSummary(managerId).filter(
      (cost) => cost.type === "maintenance" && cost.date.startsWith(month)
    );
    const entries = maintenanceCosts.map((cost) => ({
      costId: cost.id,
      item: cost.item,
      amount: cost.amount,
      disclosure: cost.disclosure ?? "public",
      privateReason: (cost.disclosure ?? "public") === "private" ? "관리자 비공개 예외" : undefined
    }));

    return {
      month,
      scope: "building",
      entries,
      hiddenCount: entries.filter((entry) => entry.disclosure === "private").length,
      updatedAt:
        maintenanceCosts.sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt))[0]
          ?.updatedAt ?? now()
    };
  }

  private managerCosts(managerId: string, financeOwnedCosts: readonly Cost[] = []) {
    const authoritativeById = new Map(
      financeOwnedCosts
        .filter((cost) => cost.managerId === managerId)
        .map((cost) => [cost.id, cost] as const)
    );
    const authoritative = [...authoritativeById.values()];
    const authoritativeIds = new Set(authoritativeById.keys());
    const authoritativeRepairRefs = new Set(
      authoritative
        .map((cost) => cost.paymentRef)
        .filter((paymentRef): paymentRef is string => Boolean(paymentRef))
    );
    const stored = this.store.costs
      .filter((cost) => this.canManagerAccessCost(managerId, cost))
      .filter(
        (cost) =>
          !authoritativeIds.has(cost.id) &&
          (!cost.paymentRef || !authoritativeRepairRefs.has(cost.paymentRef))
      );
    const storedRepairPaymentRefs = new Set(
      [
        ...authoritativeRepairRefs,
        ...stored
          .map((cost) => cost.paymentRef)
          .filter((paymentRef): paymentRef is string => Boolean(paymentRef))
      ]
    );
    const projected = this.store.repairs
      .filter((repair) => !storedRepairPaymentRefs.has(repair.id))
      .map((repair) => this.projectRepairCost(managerId, repair))
      .filter((cost): cost is Cost => Boolean(cost));

    return [
      ...authoritative.map((cost) => ({ ...cost })),
      ...stored.map((cost) => ({ ...cost })),
      ...projected
    ].sort(
      (a, b) => this.timeOf(b.date) - this.timeOf(a.date)
    );
  }

  private findStoredManagerCost(managerId: string, costId: string) {
    const cost = this.store.costs.find((item) => item.id === costId);

    if (!cost || !this.canManagerAccessCost(managerId, cost)) {
      throw new NotFoundException("관리 가능한 비용을 찾을 수 없습니다.");
    }

    return cost;
  }

  private projectRepairCost(managerId: string, repair: RepairRequest): Cost | undefined {
    if (
      repair.status !== "COMPLETED" ||
      repair.costBearer !== "LANDLORD" ||
      !repair.estimateAmount ||
      repair.estimateAmount <= 0
    ) {
      return undefined;
    }

    const ticket = this.findTicket(repair.ticketId);
    if (!this.canManagerAccessRoom(managerId, ticket.roomId)) {
      return undefined;
    }

    const room = this.findRoom(ticket.roomId);
    const costAt = repair.completedAt ?? repair.updatedAt;

    return {
      id: `cost_repair_${repair.id}`,
      managerId,
      date: costAt,
      item: `${this.displayUnitId(room)} ${repair.title}`,
      amount: repair.estimateAmount,
      type: "repair",
      scope: "unit",
      unitId: this.displayUnitId(room),
      status: "confirmed",
      verified: true,
      repairPayment: "unpaid",
      paymentRef: repair.id,
      createdAt: repair.createdAt,
      updatedAt: repair.updatedAt
    };
  }

  private canManagerAccessCost(managerId: string, cost: Cost) {
    if (cost.managerId && cost.managerId !== managerId) {
      return false;
    }

    if (cost.scope === "building") {
      return cost.managerId === managerId;
    }

    if (!cost.unitId) {
      return false;
    }

    return this.store.rooms.some(
      (room) =>
        this.canManagerAccessRoom(managerId, room.id) &&
        this.displayUnitId(room) === cost.unitId
    );
  }

  private canManagerAccessReceiptOcr(managerId: string, ocr: ReceiptOcr) {
    if (ocr.costId) {
      return this.managerCosts(managerId).some((cost) => cost.id === ocr.costId);
    }

    return this.listManagerReceipts(managerId).some((receipt) => receipt.id === ocr.receiptId);
  }

  private costNeedsReview(cost: Cost) {
    return Boolean(cost.reviewReason) || !cost.verified;
  }

  private ocrNeedsReview(ocr: ReceiptOcr) {
    return Object.values(ocr.fields).some((field) => Boolean(field?.needsReview));
  }

  private toIsoDate(value: string) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? now() : parsed.toISOString();
  }

  private activeManagerCostsForSummary(
    managerId: string,
    financeOwnedCosts: readonly Cost[] = []
  ) {
    const costs = this.managerCosts(managerId, financeOwnedCosts);
    const supersededIds = new Set(
      costs
        .filter((cost) => cost.status === "amended" && cost.supersedesId)
        .map((cost) => cost.supersedesId as string)
    );

    return costs.filter(
      (cost) =>
        (cost.status === "confirmed" || cost.status === "amended") &&
        !supersededIds.has(cost.id)
    );
  }

  private emptyCostTypeAmounts(): Record<CostType, number> {
    return {
      repair: 0,
      maintenance: 0,
      common: 0,
      other: 0
    };
  }

  private currentMonth() {
    return now().slice(0, 7);
  }
}
