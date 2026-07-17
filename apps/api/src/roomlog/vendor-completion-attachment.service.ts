import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { VendorAccountResolver } from "./vendor-activation.repository";
import {
  VendorWorkflowRepositoryError,
  type VendorWorkflowRepository
} from "./vendor-workflow.repository";
import {
  isVendorCompletionPrivateFileName,
  type VendorCompletionPrivateStorage
} from "./vendor-completion-storage";

const MAX_COMPLETION_PHOTO_BYTES = 10 * 1024 * 1024;
const SAFE_COMPLETION_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

function startsWithBytes(buffer: Buffer, signature: readonly number[]) {
  return buffer.length >= signature.length
    && signature.every((value, index) => buffer[index] === value);
}

function hasMatchingImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }
  if (mimeType === "image/png") {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
      return false;
    }
    return new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"])
      .has(buffer.subarray(8, 12).toString("ascii"));
  }
  return false;
}

export interface VendorCompletionPhotoUpload {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

interface OrphanObjectLogger {
  error(message: string, trace?: string): void;
}

function requiredIdentifier(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(message);
  }
  return value.trim();
}

function translateRepositoryError(error: unknown): never {
  if (!(error instanceof VendorWorkflowRepositoryError)) throw error;
  if (error.code === "REPAIR_NOT_FOUND" || error.code === "ATTACHMENT_NOT_FOUND") {
    throw new NotFoundException(error.message);
  }
  if (error.code === "REPAIR_ACCESS_DENIED") {
    throw new ForbiddenException(error.message);
  }
  if (error.code === "INVALID_REQUEST") {
    throw new BadRequestException(error.message);
  }
  throw new ConflictException(error.message);
}

export class VendorCompletionAttachmentService {
  constructor(
    private readonly repository: VendorWorkflowRepository,
    private readonly vendorAccounts: VendorAccountResolver,
    private readonly storage: VendorCompletionPrivateStorage,
    private readonly logger: OrphanObjectLogger = new Logger(
      VendorCompletionAttachmentService.name
    )
  ) {}

  async save(
    userId: string,
    repairId: string,
    input: VendorCompletionPhotoUpload
  ): Promise<{ attachmentId: string; fileUrl: string }> {
    const normalizedUserId = requiredIdentifier(
      userId,
      "로그인 정보가 올바르지 않습니다."
    );
    const normalizedRepairId = requiredIdentifier(
      repairId,
      "수리 작업 정보가 올바르지 않습니다."
    );
    if (!input || !Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
      throw new BadRequestException("업로드할 완료 사진이 필요합니다.");
    }
    const mimeType = requiredIdentifier(input.mimeType, "파일 형식을 확인해 주세요.");
    if (!Object.hasOwn(SAFE_COMPLETION_IMAGE_EXTENSIONS, mimeType)) {
      throw new BadRequestException("완료 보고에는 이미지 파일만 첨부할 수 있습니다.");
    }
    if (!hasMatchingImageSignature(input.buffer, mimeType)) {
      throw new BadRequestException("파일 내용과 이미지 형식이 일치하지 않습니다.");
    }
    if (input.buffer.length > MAX_COMPLETION_PHOTO_BYTES) {
      throw new BadRequestException("완료 사진은 10MB 이하만 업로드할 수 있습니다.");
    }

    const vendorId = await this.vendorAccounts.resolveActiveVendorId(normalizedUserId);
    if (typeof vendorId !== "string" || !vendorId.trim()) {
      throw new ForbiddenException("활성 업체 계정으로만 완료 사진을 업로드할 수 있습니다.");
    }
    const normalizedVendorId = vendorId.trim();
    let scopedRepair: Awaited<ReturnType<VendorWorkflowRepository["getJob"]>>;
    try {
      scopedRepair = await this.repository.getJob(normalizedVendorId, normalizedRepairId);
    } catch (error) {
      translateRepositoryError(error);
    }
    if (!scopedRepair) {
      throw new NotFoundException("업체에 배정된 수리 작업을 찾을 수 없습니다.");
    }
    if (["COMPLETION_REPORTED", "COMPLETED", "CANCELLED"].includes(scopedRepair.status)) {
      throw new ConflictException("완료되거나 완료 보고된 작업에는 사진을 추가할 수 없습니다.");
    }

    const fileName = this.safeStoredFileName(mimeType);
    const stored = await this.storage.save({
      buffer: input.buffer,
      fileName,
      mimeType
    });
    const fileUrl = `/api/vendor-completion-files/${encodeURIComponent(stored.fileName)}`;
    try {
      return await this.repository.saveCompletionAttachment({
        vendorId: normalizedVendorId,
        userId: normalizedUserId,
        repairId: normalizedRepairId,
        fileName: stored.fileName,
        fileUrl,
        mimeType,
        sizeBytes: input.buffer.length,
        category: "COMPLETION_PHOTO"
      });
    } catch (error) {
      try {
        await this.storage.delete(stored.fileName);
      } catch (deleteError) {
        const trace = deleteError instanceof Error ? deleteError.stack : undefined;
        this.logger.error(
          `완료 사진 DB 저장 실패 후 private object 삭제에도 실패했습니다: ${stored.fileName}`,
          trace
        );
      }
      translateRepositoryError(error);
    }
  }

  async read(
    userId: string,
    roles: readonly string[],
    fileName: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const normalizedUserId = requiredIdentifier(
      userId,
      "로그인 정보가 올바르지 않습니다."
    );
    if (!isVendorCompletionPrivateFileName(fileName)) {
      throw new NotFoundException("완료 사진을 찾을 수 없습니다.");
    }

    let attachment: { fileName: string; mimeType: string } | null = null;
    try {
      if (roles.includes("LANDLORD")) {
        attachment = await this.repository.findCompletionAttachmentForAccess(fileName, {
          role: "LANDLORD",
          managerId: normalizedUserId
        });
      }

      if (!attachment && roles.includes("TENANT")) {
        attachment = await this.repository.findCompletionAttachmentForAccess(fileName, {
          role: "TENANT",
          tenantId: normalizedUserId
        });
      }

      if (!attachment) {
        const vendorId = await this.vendorAccounts.resolveActiveVendorId(normalizedUserId);
        if (typeof vendorId === "string" && vendorId.trim()) {
          attachment = await this.repository.findCompletionAttachmentForAccess(fileName, {
            role: "VENDOR",
            vendorId: vendorId.trim()
          });
        } else if (!roles.includes("LANDLORD") && !roles.includes("TENANT")) {
          throw new ForbiddenException("완료 사진을 조회할 권한이 없습니다.");
        }
      }
    } catch (error) {
      translateRepositoryError(error);
    }

    if (!attachment) {
      throw new NotFoundException("완료 사진을 찾을 수 없습니다.");
    }
    const buffer = await this.storage.read(attachment.fileName);
    if (!buffer) {
      throw new NotFoundException("완료 사진을 찾을 수 없습니다.");
    }
    return { buffer, mimeType: attachment.mimeType };
  }

  private safeStoredFileName(mimeType: string) {
    const extension = SAFE_COMPLETION_IMAGE_EXTENSIONS[mimeType];
    return `completion-${randomUUID()}${extension}`;
  }
}
