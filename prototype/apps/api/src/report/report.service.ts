import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ChatMessage,
  FaqQuestion,
  Report,
  ReportDelivery,
  ReportRecipient,
} from "@roomlog/types";
import type { ReportListOptions } from "./report.repository";
import { ReportRepository } from "./report.repository";

@Injectable()
export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  listReports(options?: ReportListOptions): Report[] {
    return this.repository.listReports(options);
  }

  getReport(id: string): Report {
    const report = this.repository.getReport(id);
    if (!report) {
      throw new NotFoundException(`Report not found: ${id}`);
    }

    return report;
  }

  listRecipients(): ReportRecipient[] {
    return this.repository.listRecipients();
  }

  listChatMessages(): ChatMessage[] {
    return this.repository.listChatMessages();
  }

  listFaqQuestions(): FaqQuestion[] {
    return this.repository.listFaqQuestions();
  }

  getDelivery(reportId: string): ReportDelivery {
    const delivery = this.repository.getDelivery(reportId);
    if (!delivery) {
      throw new NotFoundException(`Report delivery not found: ${reportId}`);
    }

    return delivery;
  }
}
