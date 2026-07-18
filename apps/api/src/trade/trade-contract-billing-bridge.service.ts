import { BadRequestException, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { ConnectAcceptedTradeContractInput, Contract } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeService, type TradeContract, type TradeListing } from "./trade.service";

@Injectable()
export class TradeContractBillingBridge implements OnModuleInit {
  private readonly logger = new Logger(TradeContractBillingBridge.name);

  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService
  ) {}

  async onModuleInit(): Promise<void> {
    this.backfillListingRooms();

    for (const contract of this.tradeService.listAcceptedContracts()) {
      try {
        await this.tradeService.ensureAcceptedListingDurability(contract);
        await this.ensure(contract);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`거래 계약 ${contract.id} 청구 초안 보정 실패: ${message}`);
      }
    }
  }

  private backfillListingRooms(): void {
    for (const listing of this.tradeService.listListings()) {
      if (listing.status === "계약완료") continue;
      try {
        this.ensureListingRoom(listing);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`거래 매물 ${listing.id} 호실 보정 실패: ${message}`);
      }
    }
  }

  private ensureListingRoom(listing: TradeListing): void {
    const room = this.roomlogService.ensureRoomFromTradeListing(listing.ownerId, {
      roomId: listing.roomId,
      title: listing.title,
      location: listing.location,
      detailAddress: listing.detailAddress,
      buildingName: listing.buildingName
    });
    this.tradeService.attachListingRoom(listing.ownerId, listing.id, room.id);
  }

  preflight(contract: TradeContract): void {
    if (contract.status !== "accepted") return undefined;
    this.roomlogService.preflightAcceptedTradeContract(this.connectionInput(contract));
  }

  async ensure(contract: TradeContract): Promise<Contract | undefined> {
    if (contract.status !== "accepted") return undefined;
    const connected = this.roomlogService.connectAcceptedTradeContract(this.connectionInput(contract));
    await this.roomlogService.ensureTradeContractDurability();
    return connected;
  }

  /** 계약 해지 → 세입자-호실 연결 해제(계약 레코드는 expired 전환, 삭제 없음). */
  async release(contract: TradeContract): Promise<void> {
    if (contract.status !== "terminated") return;
    this.roomlogService.disconnectAcceptedTradeContract({
      tradeContractId: contract.id,
      tenantId: contract.tenantId
    });
    await this.roomlogService.ensureTradeContractDurability();
  }

  private connectionInput(contract: TradeContract): ConnectAcceptedTradeContractInput {
    if (!contract.respondedAt) {
      throw new BadRequestException("거래 계약 수락 시각을 확인할 수 없습니다.");
    }
    return {
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
    };
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
