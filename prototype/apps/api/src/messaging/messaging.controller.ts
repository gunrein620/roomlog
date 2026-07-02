import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type {
  Announcement,
  AnnouncementDraft,
  AnnouncementRecipient,
  AnnouncementResult,
  Message,
  Thread,
} from "@roomlog/types";
import { MessagingService } from "./messaging.service";

@Controller()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get("threads")
  listThreads(@Query("unitId") unitId?: string): Thread[] {
    return this.messagingService.listThreads(unitId);
  }

  @Get("threads/:id")
  getThread(@Param("id") id: string): Thread {
    return this.messagingService.getThread(id);
  }

  @Post("threads/:id/messages")
  addThreadMessage(
    @Param("id") id: string,
    @Body() body: Partial<Message>,
  ): Thread {
    return this.messagingService.addThreadMessage(id, body);
  }

  @Get("announcements")
  listAnnouncements(): Announcement[] {
    return this.messagingService.listAnnouncements();
  }

  @Get("announcements/:id")
  getAnnouncement(@Param("id") id: string): Announcement {
    return this.messagingService.getAnnouncement(id);
  }

  @Get("announcement-drafts")
  listAnnouncementDrafts(): AnnouncementDraft[] {
    return this.messagingService.listAnnouncementDrafts();
  }

  @Get("announcement-drafts/:id")
  getAnnouncementDraft(@Param("id") id: string): AnnouncementDraft {
    return this.messagingService.getAnnouncementDraft(id);
  }

  @Post("announcement-drafts")
  saveAnnouncementDraft(
    @Body() body: Partial<AnnouncementDraft>,
  ): AnnouncementDraft {
    return this.messagingService.saveAnnouncementDraft(body);
  }

  @Get("announcement-drafts/:id/recipients")
  listAnnouncementRecipients(
    @Param("id") id: string,
  ): AnnouncementRecipient[] {
    return this.messagingService.listAnnouncementRecipients(id);
  }

  @Post("announcement-drafts/:id/send")
  sendAnnouncementDraft(@Param("id") id: string): AnnouncementResult {
    return this.messagingService.sendAnnouncementDraft(id);
  }

  @Get("announcement-results")
  listAnnouncementResults(): AnnouncementResult[] {
    return this.messagingService.listAnnouncementResults();
  }

  @Get("announcement-results/:id")
  getAnnouncementResult(@Param("id") id: string): AnnouncementResult {
    return this.messagingService.getAnnouncementResult(id);
  }

  @Post("announcement-results/:id/resend")
  resendAnnouncementResult(@Param("id") id: string): AnnouncementResult {
    return this.messagingService.resendAnnouncementResult(id);
  }
}
