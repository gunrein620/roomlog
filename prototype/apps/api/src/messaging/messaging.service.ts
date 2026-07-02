import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Announcement,
  AnnouncementDraft,
  AnnouncementRecipient,
  AnnouncementResult,
  Message,
  Thread,
} from "@roomlog/types";
import { MessagingRepository } from "./messaging.repository";

@Injectable()
export class MessagingService {
  constructor(private readonly repository: MessagingRepository) {}

  listThreads(unitId?: string): Thread[] {
    return this.repository.listThreads(unitId);
  }

  getThread(id: string): Thread {
    const thread = this.repository.getThread(id);
    if (!thread) {
      throw new NotFoundException(`Thread not found: ${id}`);
    }

    return thread;
  }

  addThreadMessage(id: string, body: Partial<Message>): Thread {
    const messageBody = body.body?.trim();
    if (!messageBody) {
      throw new BadRequestException("Message body is required.");
    }

    const message: Message = {
      id: body.id ?? `msg_${Date.now()}`,
      threadId: id,
      sender: "manager",
      kind: body.kind ?? "text",
      body: messageBody,
      originalBody: body.originalBody,
      createdAt: body.createdAt ?? new Date().toISOString(),
    };
    const thread = this.repository.appendMessage(id, message);
    if (!thread) {
      throw new NotFoundException(`Thread not found: ${id}`);
    }

    return thread;
  }

  listAnnouncements(): Announcement[] {
    return this.repository.listAnnouncements();
  }

  getAnnouncement(id: string): Announcement {
    const announcement = this.repository.getAnnouncement(id);
    if (!announcement) {
      throw new NotFoundException(`Announcement not found: ${id}`);
    }

    return announcement;
  }

  listAnnouncementDrafts(): AnnouncementDraft[] {
    return this.repository.listAnnouncementDrafts();
  }

  getAnnouncementDraft(id: string): AnnouncementDraft {
    const draft = this.repository.getAnnouncementDraft(id);
    if (!draft) {
      throw new NotFoundException(`Announcement draft not found: ${id}`);
    }

    return draft;
  }

  saveAnnouncementDraft(
    draft: Partial<AnnouncementDraft>,
  ): AnnouncementDraft {
    return this.repository.saveAnnouncementDraft(draft);
  }

  listAnnouncementRecipients(id: string): AnnouncementRecipient[] {
    this.getAnnouncementDraft(id);
    return this.repository.listAnnouncementRecipients(id);
  }

  sendAnnouncementDraft(id: string): AnnouncementResult {
    const draft = this.getAnnouncementDraft(id);
    if (
      draft.category === "urgent" &&
      draft.translations?.some((translation) => !translation.reviewed)
    ) {
      throw new BadRequestException(
        "Urgent announcement translations must be reviewed before sending.",
      );
    }

    return this.repository.markAnnouncementSent(id, new Date().toISOString());
  }

  listAnnouncementResults(): AnnouncementResult[] {
    return this.repository.listAnnouncementResults();
  }

  getAnnouncementResult(id: string): AnnouncementResult {
    const result = this.repository.getAnnouncementResult(id);
    if (!result) {
      throw new NotFoundException(`Announcement result not found: ${id}`);
    }

    return result;
  }

  resendAnnouncementResult(id: string): AnnouncementResult {
    const result = this.getAnnouncementResult(id);
    if (!result.confirmRequired || result.category !== "urgent") {
      throw new BadRequestException(
        "Only urgent announcements can be resent to unconfirmed recipients.",
      );
    }

    const resent = this.repository.resendAnnouncementResult(id);
    if (!resent) {
      throw new NotFoundException(`Announcement result not found: ${id}`);
    }

    return resent;
  }
}
