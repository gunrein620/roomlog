import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit
} from "@nestjs/common";
import {
  TENANT_COMPLAINT_DRAFT_REPOSITORY,
  type SaveTenantComplaintDraftInput,
  type TenantComplaintDraftRepository
} from "../tenant-complaint-draft.repository";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export interface TenantComplaintDraftCleanupScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const systemCleanupScheduler: TenantComplaintDraftCleanupScheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>)
};

export interface TenantComplaintDraftRoomAccess {
  canAccessRoom(tenantId: string, roomId: string): boolean | Promise<boolean>;
}

@Injectable()
export class RoomlogTenantComplaintDraftDomain {
  constructor(
    @Inject(TENANT_COMPLAINT_DRAFT_REPOSITORY)
    private readonly repository: TenantComplaintDraftRepository,
    private readonly roomAccess: TenantComplaintDraftRoomAccess,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async get(tenantId: string, roomId: string) {
    await this.assertRoomAccess(tenantId, roomId);
    return this.repository.findActive(tenantId, roomId, this.clock());
  }

  async save(tenantId: string, input: SaveTenantComplaintDraftInput) {
    this.validateInput(input);
    await this.assertRoomAccess(tenantId, input.roomId);
    const savedAt = this.clock();
    return this.repository.upsert({
      ...input,
      tenantId,
      expiresAt: new Date(savedAt.getTime() + DRAFT_TTL_MS)
    });
  }

  async remove(tenantId: string, roomId: string) {
    await this.assertRoomAccess(tenantId, roomId);
    await this.repository.delete(tenantId, roomId);
    return { deleted: true };
  }

  async assertRoomAccess(tenantId: string, roomId: string) {
    if (!roomId.trim() || !(await this.roomAccess.canAccessRoom(tenantId, roomId))) {
      throw new ForbiddenException("해당 호실의 민원 초안을 처리할 권한이 없습니다.");
    }
  }

  private validateInput(input: SaveTenantComplaintDraftInput) {
    if (input.category !== "민원" && input.category !== "하자") {
      throw new BadRequestException("민원 또는 하자 유형을 선택해주세요.");
    }
    if (!Array.isArray(input.attachmentUrls) || input.attachmentUrls.some((url) => typeof url !== "string")) {
      throw new BadRequestException("첨부 이미지 주소가 올바르지 않습니다.");
    }
  }
}

@Injectable()
export class TenantComplaintDraftCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: unknown;

  constructor(
    @Inject(TENANT_COMPLAINT_DRAFT_REPOSITORY)
    private readonly repository: TenantComplaintDraftRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly scheduler: TenantComplaintDraftCleanupScheduler = systemCleanupScheduler
  ) {}

  onModuleInit() {
    this.timer = this.scheduler.setInterval(() => {
      void this.removeExpired().catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  async removeExpired() {
    return this.repository.deleteExpired(this.clock());
  }

  async onModuleDestroy() {
    if (this.timer) this.scheduler.clearInterval(this.timer);
    await this.repository.close?.();
  }
}
