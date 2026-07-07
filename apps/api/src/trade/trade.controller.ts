import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeService, type TradeListingInput, type TradeThread } from "./trade.service";

type UploadedImageFile = { buffer: Buffer; originalname: string; mimetype: string };

/** 거래(직접등록 매물 + 구매 문의 채팅) API — 인증은 룸로그 토큰을 그대로 쓴다. */
@Controller("trade")
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService,
    private readonly realtime: RealtimeGateway
  ) {}

  private user(authorization?: string) {
    const account = this.roomlogService.getUserFromToken(authorization);
    return { id: account.id, name: account.name };
  }

  /** 스레드 양쪽 참여자에게 실시간 갱신 신호 — 데이터는 클라이언트가 REST로 다시 읽는다. */
  private notifyThread(thread: TradeThread) {
    this.realtime.notifyUsers([thread.buyerId, thread.ownerId], "trade:updated", {
      threadId: thread.id
    });
  }

  @Get("listings")
  listListings() {
    return this.tradeService.listListings();
  }

  @Post("listings")
  createListing(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: TradeListingInput
  ) {
    const user = this.user(authorization);
    const listing = this.tradeService.createListing(user, body);
    // 첫 매물 등록이 곧 임대인 관계 생성 — 마이페이지 임대인 가드("관리 중인 집 연결 필요")가 풀린다.
    this.roomlogService.ensureLandlordRoomFromListing(user.id, {
      title: listing.title,
      location: listing.location
    });
    return listing;
  }

  /** 매물 수정 — 소유자 전용(서비스에서 검증). 전달된 필드만 갱신. */
  @Patch("listings/:listingId")
  updateListing(
    @Headers("authorization") authorization: string | undefined,
    @Param("listingId") listingId: string,
    @Body() body: Partial<TradeListingInput>
  ) {
    return this.tradeService.updateListing(this.user(authorization), listingId, body);
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
    const thread = this.tradeService.createInquiry(this.user(authorization), body);
    this.notifyThread(thread);

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
    const thread = this.tradeService.sendMessage(this.user(authorization), threadId, body.body);
    this.notifyThread(thread);

    return thread;
  }
}
