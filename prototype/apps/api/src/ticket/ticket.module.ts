import { Module } from "@nestjs/common";
import { TicketController } from "./ticket.controller";
import { InMemoryTicketRepository, TicketRepository } from "./ticket.repository";
import { TicketService } from "./ticket.service";

@Module({
  controllers: [TicketController],
  providers: [
    TicketService,
    {
      provide: TicketRepository,
      useClass: InMemoryTicketRepository,
    },
  ],
})
export class TicketModule {}
