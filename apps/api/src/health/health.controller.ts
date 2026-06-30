import { Controller, Get } from "@nestjs/common";
import { DatabaseHealthService } from "./database-health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  @Get()
  async getHealth() {
    const database = await this.databaseHealth.check();

    return {
      status: database.status === "error" ? "degraded" : "ok",
      service: "roomlog-api",
      database
    };
  }
}
