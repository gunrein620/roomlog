import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeService, type TradeListingInput } from "./trade.service";

/** 거래(직접등록 매물 + 구매 문의 채팅) API — 인증은 룸로그 토큰을 그대로 쓴다. */
@Controller("trade")
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService
  ) {}

  private user(authorization?: string) {
    const account = this.roomlogService.getUserFromToken(authorization);
    return { id: account.id, name: account.name };
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
    return this.tradeService.createListing(this.user(authorization), body);
  }

  @Post("inquiries")
  createInquiry(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { listingId?: string | null; listingTitle: string; message: string; visitTime?: string }
  ) {
    return this.tradeService.createInquiry(this.user(authorization), body);
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
    return this.tradeService.sendMessage(this.user(authorization), threadId, body.body);
  }
}
