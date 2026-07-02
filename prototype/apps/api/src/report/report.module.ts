import { Module } from "@nestjs/common";
import { ReportController } from "./report.controller";
import { InMemoryReportRepository, ReportRepository } from "./report.repository";
import { ReportService } from "./report.service";

@Module({
  controllers: [ReportController],
  providers: [
    ReportService,
    {
      provide: ReportRepository,
      useClass: InMemoryReportRepository,
    },
  ],
})
export class ReportModule {}
