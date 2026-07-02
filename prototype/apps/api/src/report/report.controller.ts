import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import type {
  ChatMessage,
  FaqQuestion,
  Report,
  ReportDelivery,
  ReportPeriod,
  ReportRecipient,
  ReportStatus,
} from "@roomlog/types";
import { ReportService } from "./report.service";

const REPORT_PERIODS: ReportPeriod[] = ["week", "month", "quarter"];
const REPORT_STATUSES: ReportStatus[] = ["draft", "delivered"];

@Controller("reports")
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  listReports(
    @Query("period") period?: string,
    @Query("status") status?: string,
    @Query("buildingId") buildingId?: string,
  ): Report[] {
    return this.reportService.listReports({
      period: period ? this.parseReportPeriod(period) : undefined,
      status: status ? this.parseReportStatus(status) : undefined,
      buildingId,
    });
  }

  @Get("recipients")
  listRecipients(): ReportRecipient[] {
    return this.reportService.listRecipients();
  }

  @Get("chat/messages")
  listChatMessages(): ChatMessage[] {
    return this.reportService.listChatMessages();
  }

  @Get("faq")
  listFaqQuestions(): FaqQuestion[] {
    return this.reportService.listFaqQuestions();
  }

  @Get(":id/delivery")
  getDelivery(@Param("id") id: string): ReportDelivery {
    return this.reportService.getDelivery(id);
  }

  @Get(":id")
  getReport(@Param("id") id: string): Report {
    return this.reportService.getReport(id);
  }

  private parseReportPeriod(value: string): ReportPeriod {
    if (REPORT_PERIODS.includes(value as ReportPeriod)) {
      return value as ReportPeriod;
    }

    throw new BadRequestException(`Invalid report period: ${value}`);
  }

  private parseReportStatus(value: string): ReportStatus {
    if (REPORT_STATUSES.includes(value as ReportStatus)) {
      return value as ReportStatus;
    }

    throw new BadRequestException(`Invalid report status: ${value}`);
  }
}
