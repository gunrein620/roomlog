import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeService, type TradeListing, type TradeListingInput, type TradeThread } from "./trade.service";

type UploadedImageFile = { buffer: Buffer; originalname: string; mimetype: string };

/** 거래(직접등록 매물 + 구매 문의 채팅) API — 인증은 룸로그 토큰을 그대로 쓴다. */
@Controller("trade")
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService,
    private readonly realtime: RealtimeGateway,
    private readonly contractBillingBridge: TradeContractBillingBridge
  ) {}

  private user(authorization?: string) {
    const account = this.roomlogService.getUserFromToken(authorization);
    return { id: account.id, name: account.name };
  }

  /** 스레드 양쪽 참여자에게 실시간 갱신 신호 — 데이터는 클라이언트가 REST로 다시 읽는다. */
  private notifyThread(thread: TradeThread, senderId: string) {
    this.realtime.notifyUsers([thread.buyerId, thread.ownerId], "trade:updated", {
      threadId: thread.id,
      senderId
    });
  }

  private ensureRoomForListing(listing: TradeListing): TradeListing {
    const room = this.roomlogService.ensureRoomFromTradeListing(listing.ownerId, {
      roomId: listing.roomId,
      title: listing.title,
      location: listing.location,
      detailAddress: listing.detailAddress,
      buildingName: listing.buildingName
    });

    return this.tradeService.attachListingRoom(listing.ownerId, listing.id, room.id);
  }

  @Get("listings/public")
  listPublicListings() {
    return this.tradeService.listPublicListings();
  }

  // 기본은 전체 반환(공개 매물 브라우징이 이 경로를 씀 — 스코프 걸면 깨진다).
  // ?mine=1 + Bearer면 소유자 매물만 — 마이페이지 배지·앱 매물 픽커용(fail-closed: 토큰 없으면 던짐).
  @Get("listings")
  listListings(
    @Headers("authorization") authorization: string | undefined,
    @Query("mine") mine?: string
  ) {
    if (mine === "1" || mine === "true") {
      return this.tradeService
        .listListingsByOwner(this.user(authorization).id)
        .map((listing) => this.ensureRoomForListing(listing));
    }
    return this.tradeService.listListings();
  }

  @Post("listings")
  async createListing(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: TradeListingInput
  ) {
    const user = this.user(authorization);
    const listing = this.tradeService.createListing(user, body);
    try {
      await this.tradeService.ensureListingDurability();
      const linked = this.ensureRoomForListing(listing);
      await this.tradeService.ensureListingDurability();
      return linked;
    } catch (error) {
      this.tradeService.deleteListing(user, listing.id);
      await this.tradeService.ensureListingDurability();
      throw error;
    }
  }

  /** 매물 수정 — 소유자 전용(서비스에서 검증). 전달된 필드만 갱신. */
  @Patch("listings/:listingId")
  async updateListing(
    @Headers("authorization") authorization: string | undefined,
    @Param("listingId") listingId: string,
    @Body() body: Partial<TradeListingInput>
  ) {
    const user = this.user(authorization);
    const listing = this.ensureRoomForListing(
      this.tradeService.updateListing(user, listingId, body)
    );
    await this.tradeService.ensureListingDurability();
    return listing;
  }

  /** 매물 삭제(내리기) — 소유자 전용. */
  @Delete("listings/:listingId")
  deleteListing(
    @Headers("authorization") authorization: string | undefined,
    @Param("listingId") listingId: string
  ) {
    return this.tradeService.deleteListing(this.user(authorization), listingId);
  }

  /** 매물 사진 업로드 — 로그인 필수(user()가 토큰 없으면 던짐). 저장된 공개 URL 배열 반환. */
  @Post("uploads")
  @UseInterceptors(FilesInterceptor("files", 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadListingPhotos(
    @Headers("authorization") authorization: string | undefined,
    @UploadedFiles() files: UploadedImageFile[] | undefined
  ) {
    this.user(authorization);
    return this.tradeService.saveListingPhotos(files ?? []);
  }

  @Post("inquiries")
  createInquiry(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { listingId?: string | null; listingTitle: string; message: string; visitTime?: string }
  ) {
    const user = this.user(authorization);
    const thread = this.tradeService.createInquiry(user, body);
    this.notifyThread(thread, user.id);

    return thread;
  }

  @Get("threads")
  listThreads(@Headers("authorization") authorization: string | undefined) {
    return this.tradeService.listThreads(this.user(authorization).id);
  }

  @Get("threads/:threadId")
  getThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    return this.tradeService.getThread(this.user(authorization).id, threadId);
  }

  @Post("threads/:threadId/messages")
  sendMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string,
    @Body() body: { body: string }
  ) {
    const user = this.user(authorization);
    const thread = this.tradeService.sendMessage(user, threadId, body.body);
    this.notifyThread(thread, user.id);

    return thread;
  }

  /** 채팅방 나가기 — 내 목록에서만 숨긴다(상대는 유지). 새 메시지가 오면 되살아난다. */
  @Post("threads/:threadId/leave")
  leaveThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    return this.tradeService.leaveThread(this.user(authorization).id, threadId);
  }

  /** 스레드의 최신 계약 — 채팅 화면이 제안 버튼/수락 카드 상태를 판단한다. */
  @Get("threads/:threadId/contract")
  contractForThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    return this.tradeService.contractForThread(this.user(authorization).id, threadId);
  }

  /** 내가 당사자인 계약 전부 — 관리 콘솔 계약중인 집 탭이 사용. */
  @Get("contracts")
  listContracts(@Headers("authorization") authorization: string | undefined) {
    return this.tradeService.listContracts(this.user(authorization).id);
  }

  /** 계약 제안 — 집주인이 채팅에서 "이 분과 계약하기". */
  @Post("contracts")
  proposeContract(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { threadId: string }
  ) {
    const user = this.user(authorization);
    const { contract, thread } = this.tradeService.proposeContract(user, body?.threadId ?? "");
    this.notifyThread(thread, user.id);
    return contract;
  }

  /** 계약 응답 — 수락 시 세입자 관계(tenantRooms)를 연결해 TENANT 권한이 파생되게 한다. */
  @Post("contracts/:contractId/respond")
  async respondContract(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: { accept: boolean }
  ) {
    if (typeof body?.accept !== "boolean") {
      throw new BadRequestException("계약 수락 여부는 true 또는 false boolean이어야 합니다.");
    }
    const user = this.user(authorization);
    const { contract, thread } = this.tradeService.respondContract(
      user,
      contractId,
      body.accept,
      body.accept ? (accepted) => this.contractBillingBridge.preflight(accepted) : undefined
    );
    if (body.accept) {
      await this.tradeService.ensureAcceptedListingDurability(contract);
      await this.contractBillingBridge.ensure(contract);
    }
    this.notifyThread(thread, user.id);
    return contract;
  }

  /** 제안 취소 — 집주인 전용, 응답 전(proposed)만. */
  @Post("contracts/:contractId/cancel")
  cancelContract(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.user(authorization);
    const { contract, thread } = this.tradeService.cancelContract(user, contractId);
    this.notifyThread(thread, user.id);
    return contract;
  }
}
