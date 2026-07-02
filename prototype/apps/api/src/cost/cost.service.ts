import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  Cost,
  CostReviewQueueSummary,
  DisclosureSetting,
  MonthlyCostSummary,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";
import type { CostListOptions } from "./cost.repository";
import { CostRepository } from "./cost.repository";

@Injectable()
export class CostService {
  constructor(private readonly repository: CostRepository) {}

  listCosts(options?: CostListOptions): Cost[] {
    return this.repository.listCosts(options);
  }

  getCost(id: string): Cost {
    const cost = this.repository.getCost(id);
    if (!cost) {
      throw new NotFoundException(`Cost not found: ${id}`);
    }

    return cost;
  }

  listReceipts(): Receipt[] {
    return this.repository.listReceipts();
  }

  getReceipt(id: string): Receipt {
    const receipt = this.repository.getReceipt(id);
    if (!receipt) {
      throw new NotFoundException(`Receipt not found: ${id}`);
    }

    return receipt;
  }

  listReceiptOcrs(): ReceiptOcr[] {
    return this.repository.listReceiptOcrs();
  }

  getReceiptOcr(id: string): ReceiptOcr {
    const receiptOcr = this.repository.getReceiptOcr(id);
    if (!receiptOcr) {
      throw new NotFoundException(`Receipt OCR not found: ${id}`);
    }

    return receiptOcr;
  }

  getReviewQueueSummary(): CostReviewQueueSummary {
    return this.repository.getReviewQueueSummary();
  }

  getMonthlySummary(month: string): MonthlyCostSummary {
    const summary = this.repository.getMonthlySummary(month);
    if (!summary) {
      throw new NotFoundException(`Monthly cost summary not found: ${month}`);
    }

    return summary;
  }

  getDisclosureSetting(month: string): DisclosureSetting {
    const setting = this.repository.getDisclosureSetting(month);
    if (!setting) {
      throw new NotFoundException(`Cost disclosure setting not found: ${month}`);
    }

    return setting;
  }
}
