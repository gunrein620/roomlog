// 도면(floor plan) + 첨부(attachment) 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 자기완결적(자체 validator 무리). RoomlogService가 store/storageAdapter/persistStore를 주입.
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { basename, extname } from "node:path";
import { deriveUserRoles, id, now } from "../roomlog-support";
import type { FileStorageAdapter } from "../storage.service";
import type {
  Attachment,
  FloorPlanDraft,
  FloorPlanWall,
  SaveAttachmentInput,
  SaveFloorPlanDraftInput
} from "../roomlog.types";
import type { Store } from "../roomlog.service";

export class RoomlogFloorPlanDomain {
  constructor(
    private readonly store: Store,
    private readonly storageAdapter: FileStorageAdapter,
    private readonly persistStore: () => void
  ) {}

  async saveAttachment(uploadedByUserId: string, input: SaveAttachmentInput) {
    const user = this.store.users.find((account) => account.id === uploadedByUserId);

    if (!user) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    if (!input.mimeType.startsWith("image/")) {
      throw new BadRequestException("이미지 파일만 업로드할 수 있습니다.");
    }

    if (!input.buffer.length) {
      throw new BadRequestException("업로드할 파일이 비어 있습니다.");
    }

    if (input.buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException("이미지는 10MB 이하만 업로드할 수 있습니다.");
    }

    const attachmentId = id("att");
    const safeBaseName =
      basename(input.originalName, extname(input.originalName))
        .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "upload";
    const extension = this.extensionForMimeType(input.mimeType, input.originalName);
    const fileName = `${attachmentId}-${safeBaseName}${extension}`;
    const storedFile = await this.storageAdapter.save({
      buffer: input.buffer,
      fileName,
      mimeType: input.mimeType
    });
    const createdAt = now();
    const attachment: Attachment = {
      id: attachmentId,
      uploadedByUserId,
      category: input.category,
      fileName: storedFile.fileName,
      fileUrl: storedFile.fileUrl,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      createdAt
    };

    this.store.attachments.unshift(attachment);
    this.persistStore();

    return { ...attachment };
  }

  createFloorPlanDraft(ownerId: string, input: SaveFloorPlanDraftInput) {
    this.assertFloorPlanOwner(ownerId);
    const createdAt = now();
    const draft: FloorPlanDraft = {
      id: id("plan"),
      ownerId,
      sourceAttachmentId: this.optionalAttachmentId(ownerId, input.sourceAttachmentId),
      sourceImageUrl: this.optionalUrl(input.sourceImageUrl),
      status: "DRAFT",
      pixelToMmRatio: this.validPixelToMmRatio(input.pixelToMmRatio),
      walls: this.validFloorPlanWalls(input.walls),
      hiddenWallIds: this.validStringArray(input.hiddenWallIds),
      furnitures: [],
      room3d: this.validJsonObject(input.room3d),
      extractionMeta: this.validExtractionMeta(input.extractionMeta),
      openings: this.validFloorPlanCandidates(input.openings),
      fixtures: this.validFloorPlanCandidates(input.fixtures),
      createdAt,
      updatedAt: createdAt
    };

    this.store.floorPlans.unshift(draft);
    this.persistStore();

    return this.presentFloorPlanDraft(draft);
  }

  getFloorPlanDraft(ownerId: string, floorPlanId: string) {
    this.assertFloorPlanOwner(ownerId);
    const draft = this.store.floorPlans.find((floorPlan) => floorPlan.id === floorPlanId);

    if (!draft) {
      throw new NotFoundException("저장된 도면을 찾을 수 없습니다.");
    }

    if (draft.ownerId !== ownerId) {
      throw new ForbiddenException("이 도면에 접근할 권한이 없습니다.");
    }

    return this.presentFloorPlanDraft(draft);
  }

  updateFloorPlanDraft(ownerId: string, floorPlanId: string, input: SaveFloorPlanDraftInput) {
    this.assertFloorPlanOwner(ownerId);
    const draft = this.store.floorPlans.find((floorPlan) => floorPlan.id === floorPlanId);

    if (!draft) {
      throw new NotFoundException("저장된 도면을 찾을 수 없습니다.");
    }

    if (draft.ownerId !== ownerId) {
      throw new ForbiddenException("이 도면을 수정할 권한이 없습니다.");
    }

    if (input.sourceAttachmentId !== undefined) {
      draft.sourceAttachmentId = this.optionalAttachmentId(ownerId, input.sourceAttachmentId);
    }
    if (input.sourceImageUrl !== undefined) {
      draft.sourceImageUrl = this.optionalUrl(input.sourceImageUrl);
    }
    if (input.status !== undefined) {
      draft.status = this.validFloorPlanStatus(input.status);
    }
    if (input.pixelToMmRatio !== undefined) {
      draft.pixelToMmRatio = this.validPixelToMmRatio(input.pixelToMmRatio);
    }
    if (input.walls !== undefined) {
      draft.walls = this.validFloorPlanWalls(input.walls);
    }
    if (input.hiddenWallIds !== undefined) {
      draft.hiddenWallIds = this.validStringArray(input.hiddenWallIds);
    }
    if (input.furnitures !== undefined) {
      draft.furnitures = [];
    }
    if (input.room3d !== undefined) {
      draft.room3d = this.validJsonObject(input.room3d);
    }
    if (input.extractionMeta !== undefined) {
      draft.extractionMeta = this.validExtractionMeta(input.extractionMeta);
    }
    if (input.openings !== undefined) {
      draft.openings = this.validFloorPlanCandidates(input.openings);
    }
    if (input.fixtures !== undefined) {
      draft.fixtures = this.validFloorPlanCandidates(input.fixtures);
    }
    if (draft.status === "PUBLISHED") {
      this.assertPublishableFloorPlan(draft);
    }

    draft.updatedAt = now();
    this.persistStore();

    return this.presentFloorPlanDraft(draft);
  }

  private assertFloorPlanOwner(ownerId: string) {
    const user = this.store.users.find((account) => account.id === ownerId);

    if (!user) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    if (!deriveUserRoles(user, this.store).includes("LANDLORD")) {
      throw new ForbiddenException("도면은 집주인 계정으로 저장할 수 있습니다.");
    }
  }

  private optionalAttachmentId(ownerId: string, attachmentId?: string) {
    if (!attachmentId) return undefined;

    const attachment = this.store.attachments.find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new NotFoundException("도면 이미지 첨부를 찾을 수 없습니다.");
    }
    if (attachment.uploadedByUserId !== ownerId) {
      throw new ForbiddenException("이 첨부 파일을 사용할 권한이 없습니다.");
    }

    return attachment.id;
  }

  private optionalUrl(value?: string) {
    const trimmed = value?.trim();

    return trimmed || undefined;
  }

  private validPixelToMmRatio(value?: number) {
    const ratio = Number(value ?? 20);

    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1000) {
      throw new BadRequestException("축척 값이 올바르지 않습니다.");
    }

    return ratio;
  }

  private validFloorPlanWalls(value?: FloorPlanWall[]) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((wall) => wall && wall.start && wall.end)
      .map((wall, index) => {
        const normalized = {
          id: String(wall.id ?? `wall-${index + 1}`),
          start: {
            x: Number(wall.start.x),
            y: Number(wall.start.y)
          },
          end: {
            x: Number(wall.end.x),
            y: Number(wall.end.y)
          }
        };

        if (
          !Number.isFinite(normalized.start.x) ||
          !Number.isFinite(normalized.start.y) ||
          !Number.isFinite(normalized.end.x) ||
          !Number.isFinite(normalized.end.y)
        ) {
          throw new BadRequestException("벽 좌표가 올바르지 않습니다.");
        }

        return normalized;
      });
  }

  private validStringArray(value?: string[]) {
    return Array.isArray(value)
      ? value.map((item) => String(item)).filter((item) => item.trim().length > 0)
      : [];
  }

  private validFloorPlanStatus(value: string) {
    if (value === "DRAFT" || value === "PUBLISHED" || value === "ARCHIVED") return value;

    throw new BadRequestException("도면 상태가 올바르지 않습니다.");
  }

  private validJsonObject(value?: Record<string, unknown>) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  private validExtractionMeta(value?: Record<string, unknown>) {
    const meta = this.validJsonObject(value);

    return {
      ...meta,
      scaleConfirmed: Boolean(meta.scaleConfirmed)
    };
  }

  private validFloorPlanCandidates(value?: Array<Record<string, unknown>>) {
    if (!Array.isArray(value)) return [];

    return value.map((candidate, index) => {
      const rawStatus = String(candidate.status ?? "CANDIDATE");
      if (!["CANDIDATE", "CONFIRMED", "REJECTED"].includes(rawStatus)) {
        throw new BadRequestException("도면 후보 상태가 올바르지 않습니다.");
      }
      const status = rawStatus as "CANDIDATE" | "CONFIRMED" | "REJECTED";

      const confidence = candidate.confidence === undefined ? undefined : Number(candidate.confidence);
      if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new BadRequestException("도면 후보 신뢰도가 올바르지 않습니다.");
      }

      return {
        ...candidate,
        id: String(candidate.id ?? `candidate-${index + 1}`),
        source: String(candidate.source ?? "manual"),
        status,
        type: String(candidate.type ?? "UNKNOWN"),
        ...(confidence === undefined ? {} : { confidence })
      };
    });
  }

  private assertPublishableFloorPlan(draft: FloorPlanDraft) {
    const roomWalls = Array.isArray((draft.room3d as { walls?: unknown[] }).walls)
      ? (draft.room3d as { walls?: unknown[] }).walls ?? []
      : [];

    if (draft.walls.length === 0 || roomWalls.length === 0) {
      throw new BadRequestException("3D 도면 발행에는 벽과 3D 변환 데이터가 필요합니다.");
    }

    if (!draft.extractionMeta.scaleConfirmed || !Number.isFinite(draft.pixelToMmRatio) || draft.pixelToMmRatio <= 0) {
      throw new BadRequestException("도면 발행 전 축척 확인이 필요합니다.");
    }
  }

  private extensionForMimeType(mimeType: string, originalName: string) {
    const extension = extname(originalName).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"];

    if (allowedExtensions.includes(extension)) {
      return extension;
    }

    const fallback: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/heic": ".heic"
    };

    return fallback[mimeType] ?? ".img";
  }

  private presentFloorPlanDraft(draft: FloorPlanDraft): FloorPlanDraft {
    return JSON.parse(JSON.stringify(draft)) as FloorPlanDraft;
  }
}
