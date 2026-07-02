import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import type {
  Cost,
  CostAttributionScope,
  CostReviewQueueSummary,
  CostReviewReason,
  CostStatus,
  CostType,
  DisclosureSetting,
  MonthlyCostSummary,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";
import type { CostListOptions } from "./cost.repository";
import { CostService } from "./cost.service";

const COST_STATUSES: CostStatus[] = ["draft", "confirmed", "amended", "void"];
const COST_TYPES: CostType[] = ["repair", "maintenance", "common", "other"];
const COST_SCOPES: CostAttributionScope[] = ["unit", "building"];
const COST_REVIEW_REASONS: CostReviewReason[] = [
  "ocr_low_confidence",
  "classification_unclear",
  "unit_unmatched",
];

@Controller("costs")
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get()
  listCosts(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("scope") scope?: string,
    @Query("unitId") unitId?: string,
    @Query("reviewReason") reviewReason?: string,
  ): Cost[] {
    return this.costService.listCosts({
      status: status ? this.parseCostStatus(status) : undefined,
      type: type ? this.parseCostType(type) : undefined,
      scope: scope ? this.parseCostScope(scope) : undefined,
      unitId,
      reviewReason: reviewReason ? this.parseCostReviewReason(reviewReason) : undefined,
    });
  }

  @Get("review-queue-summary")
  getReviewQueueSummary(): CostReviewQueueSummary {
    return this.costService.getReviewQueueSummary();
  }

  @Get("monthly-summary")
  getMonthlySummary(@Query("month") month?: string): MonthlyCostSummary {
    if (!month) {
      throw new BadRequestException("month is required.");
    }

    return this.costService.getMonthlySummary(month);
  }

  @Get("disclosure-settings")
  getDisclosureSetting(@Query("month") month?: string): DisclosureSetting {
    if (!month) {
      throw new BadRequestException("month is required.");
    }

    return this.costService.getDisclosureSetting(month);
  }

  @Get("receipts")
  listReceipts(): Receipt[] {
    return this.costService.listReceipts();
  }

  @Get("receipts/:id")
  getReceipt(@Param("id") id: string): Receipt {
    return this.costService.getReceipt(id);
  }

  @Get("receipt-ocrs")
  listReceiptOcrs(): ReceiptOcr[] {
    return this.costService.listReceiptOcrs();
  }

  @Get("receipt-ocrs/:id")
  getReceiptOcr(@Param("id") id: string): ReceiptOcr {
    return this.costService.getReceiptOcr(id);
  }

  @Get(":id")
  getCost(@Param("id") id: string): Cost {
    return this.costService.getCost(id);
  }

  private parseCostStatus(value: string): CostStatus {
    return this.parseAllowedValue(value, COST_STATUSES, "cost status");
  }

  private parseCostType(value: string): CostType {
    return this.parseAllowedValue(value, COST_TYPES, "cost type");
  }

  private parseCostScope(value: string): CostAttributionScope {
    return this.parseAllowedValue(value, COST_SCOPES, "cost scope");
  }

  private parseCostReviewReason(value: string): CostReviewReason {
    return this.parseAllowedValue(value, COST_REVIEW_REASONS, "cost review reason");
  }

  private parseAllowedValue<T extends CostListOptions[keyof CostListOptions]>(
    value: string,
    allowedValues: T[],
    label: string,
  ): T {
    if (allowedValues.includes(value as T)) {
      return value as T;
    }

    throw new BadRequestException(`Invalid ${label}: ${value}`);
  }
}
