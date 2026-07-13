import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Contract } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeService, type TradeContract } from "./trade.service";

@Injectable()
export class TradeContractBillingBridge implements OnModuleInit {
  private readonly logger = new Logger(TradeContractBillingBridge.name);

  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService
  ) {}

  onModuleInit(): void {
    for (const contract of this.tradeService.listAcceptedContracts()) {
      try {
        this.ensure(contract);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`거래 계약 ${contract.id} 청구 초안 보정 실패: ${message}`);
      }
    }
  }

  ensure(contract: TradeContract): Contract | undefined {
    if (contract.status !== "accepted") return undefined;
    const room = this.roomlogService.assignTenantRoomFromContract(
      contract.tenantId,
      contract.landlordId,
      { title: contract.listingTitle, location: contract.location }
    );
    return this.roomlogService.ensureTradeContractDraft({
      tradeContractId: contract.id,
      roomId: room.id,
      tenantId: contract.tenantId,
      landlordId: contract.landlordId,
      landlordName: contract.landlordName,
      depositKrw: contract.depositManwon * 10_000,
      monthlyRent: contract.monthlyRentManwon * 10_000
    });
  }
}
