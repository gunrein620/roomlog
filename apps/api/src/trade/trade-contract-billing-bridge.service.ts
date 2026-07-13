import { BadRequestException, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
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
    if (!contract.respondedAt) {
      throw new BadRequestException("거래 계약 수락 시각을 확인할 수 없습니다.");
    }
    return this.roomlogService.connectAcceptedTradeContract({
      tradeContractId: contract.id,
      listingTitle: contract.listingTitle,
      location: contract.location,
      roomNo: contract.roomNo,
      tenantId: contract.tenantId,
      landlordId: contract.landlordId,
      landlordName: contract.landlordName,
      depositKrw: this.toKrw(contract.depositManwon, "보증금"),
      monthlyRent: this.toKrw(contract.monthlyRentManwon, "월세"),
      acceptedAt: contract.respondedAt
    });
  }

  private toKrw(manwon: number, label: string): number {
    if (!Number.isSafeInteger(manwon) || manwon < 0) {
      throw new BadRequestException(`${label}은 0 이상의 안전한 만원 단위 정수여야 합니다.`);
    }
    const krw = manwon * 10_000;
    if (!Number.isSafeInteger(krw)) {
      throw new BadRequestException(`${label}은 안전한 원 단위 정수로 변환되어야 합니다.`);
    }
    return krw;
  }
}
