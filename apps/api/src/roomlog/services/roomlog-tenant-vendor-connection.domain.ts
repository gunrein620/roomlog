import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import type {
  ConfirmTenantVendorConnectionInput,
  PrepareTenantVendorConnectionInput,
  TenantPartnerVendorPublicView,
  TenantPartnerVendorSearchResult,
  TenantVendorConnectionPreview,
  TenantVendorConnectionRequestResult
} from "@roomlog/types";
import { requiredVendorTrade } from "../vendor-trade-compatibility";
import {
  TenantVendorConnectionRepositoryError,
  type TenantPartnerVendorCandidateRecord,
  type TenantVendorRequestStoreBridge,
  type TenantVendorConnectionRepository,
  type TenantVendorConnectionRequestRecord
} from "../tenant-vendor-connection.repository";
import { tokenSecret as defaultTokenSecret } from "../roomlog-support";

type TokenPurpose = "select" | "confirm";

type SelectionClaims = {
  version: 1;
  purpose: TokenPurpose;
  tenantId: string;
  complaintId: string;
  vendorId: string;
  expiresAt: string;
};

export interface TenantVendorConnectionDomainOptions {
  tokenSecret?: string;
  now?: () => Date;
  tokenTtlMs?: number;
}

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_AAD = Buffer.from("tenant-vendor-connection:v1", "utf8");
function publicVendor(
  candidate: TenantPartnerVendorCandidateRecord
): TenantPartnerVendorPublicView {
  return {
    businessName: candidate.businessName,
    trades: [...candidate.trades],
    serviceAreas: [...candidate.serviceAreas],
    verificationStatus: "VERIFIED"
  };
}

function publicRequest(
  record: TenantVendorConnectionRequestRecord
): TenantVendorConnectionRequestResult["request"] {
  return {
    id: record.id,
    complaintId: record.complaintId,
    status: record.status,
    vendor: publicVendor(record.vendor),
    ...(record.requestNote ? { requestNote: record.requestNote } : {}),
    requestedAt: record.createdAt
  };
}

function translateRepositoryError(error: unknown): never {
  if (error instanceof TenantVendorConnectionRepositoryError) {
    if (error.code === "ACTIVE_REPAIR_CONFLICT") {
      throw new ConflictException(
        "이미 다른 업체에 접수된 수리 요청이 진행 중입니다."
      );
    }
    if (error.code === "TENANT_RESPONSIBILITY_REQUIRED") {
      throw new ConflictException(
        "임차인 책임으로 안내된 하자 접수에서만 업체 연결을 요청할 수 있습니다."
      );
    }
    if (error.code === "TICKET_NOT_REQUESTABLE") {
      throw new ConflictException(
        "현재 상태의 하자 접수에는 새 업체 요청을 만들 수 없습니다."
      );
    }
    if (error.code === "COMPLAINT_NOT_FOUND") {
      throw new NotFoundException("조회 가능한 하자 접수를 찾을 수 없습니다.");
    }
    throw new NotFoundException("현재 연결 요청이 가능한 협력업체를 찾을 수 없습니다.");
  }
  throw error;
}

export class RoomlogTenantVendorConnectionDomain {
  private readonly tokenKey: Buffer;
  private readonly currentTime: () => Date;
  private readonly tokenTtlMs: number;

  constructor(
    private readonly repository: TenantVendorConnectionRepository,
    options: TenantVendorConnectionDomainOptions = {},
    private readonly storeBridge: TenantVendorRequestStoreBridge = {
      async synchronizeTenantVendorRequest() {}
    },
    private readonly logger: Pick<Logger, "error"> = new Logger(
      RoomlogTenantVendorConnectionDomain.name
    )
  ) {
    const tokenSecret = options.tokenSecret?.trim() || defaultTokenSecret;
    this.tokenKey = createHash("sha256")
      .update(`tenant-vendor-connection-key:${tokenSecret}`, "utf8")
      .digest();
    this.currentTime = options.now ?? (() => new Date());
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  }

  async search(
    tenantId: string,
    complaintId: string,
    query?: string
  ): Promise<TenantPartnerVendorSearchResult> {
    const normalizedQuery = query?.trim() || undefined;
    if (normalizedQuery && normalizedQuery.length > 100) {
      throw new BadRequestException("업체 검색어는 100자 이하여야 합니다.");
    }
    try {
      const record = await this.repository.search(
        tenantId,
        complaintId,
        normalizedQuery
      );
      return {
        complaint: {
          complaintId: record.complaint.complaintId,
          title: record.complaint.title,
          category: record.complaint.category,
          location: record.complaint.location
        },
        requiredTrade: requiredVendorTrade(record.complaint.category),
        vendors: record.candidates.map((candidate) => ({
          ...publicVendor(candidate),
          vendorId: this.issueToken("select", candidate)
        }))
      };
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  async prepare(
    tenantId: string,
    complaintId: string,
    input: PrepareTenantVendorConnectionInput
  ): Promise<TenantVendorConnectionPreview> {
    const claims = this.verifyToken(
      input?.vendorId as unknown,
      "select",
      tenantId,
      complaintId
    );
    const candidate = await this.findCandidate(tenantId, complaintId, claims.vendorId);
    return {
      previewId: this.issueToken("confirm", candidate),
      complaint: {
        complaintId: candidate.complaintId,
        title: candidate.complaintTitle,
        category: candidate.category,
        location: candidate.location
      },
      ticket: {
        category: candidate.category,
        summary: candidate.ticketSummary
      },
      vendor: publicVendor(candidate),
      sharedInfo: [
        { label: "하자 위치", value: candidate.location },
        { label: "접수 요약", value: candidate.ticketSummary },
        { label: "접수 방식", value: "확인하면 선택한 업체에 바로 접수됩니다." }
      ],
      requiresManagerApproval: false
    };
  }

  async confirm(
    tenantId: string,
    complaintId: string,
    input: ConfirmTenantVendorConnectionInput
  ): Promise<TenantVendorConnectionRequestResult> {
    const claims = this.verifyToken(
      input?.previewId as unknown,
      "confirm",
      tenantId,
      complaintId
    );
    const rawIdempotencyKey = input?.idempotencyKey as unknown;
    if (typeof rawIdempotencyKey !== "string") {
      throw new BadRequestException("요청 식별 키를 올바르게 입력해주세요.");
    }
    const idempotencyKey = rawIdempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 120) {
      throw new BadRequestException("요청 식별 키를 올바르게 입력해주세요.");
    }
    const rawRequestNote = input?.requestNote as unknown;
    if (rawRequestNote !== undefined && typeof rawRequestNote !== "string") {
      throw new BadRequestException("업체 연결 요청 메모를 올바르게 입력해주세요.");
    }
    const requestNote = rawRequestNote?.trim();
    if (requestNote && requestNote.length > 1000) {
      throw new BadRequestException("업체 연결 요청 메모는 1,000자 이하여야 합니다.");
    }

    let result: Awaited<
      ReturnType<TenantVendorConnectionRepository["requestVendor"]>
    >;
    try {
      result = await this.repository.requestVendor({
        tenantId,
        complaintId,
        vendorId: claims.vendorId,
        idempotencyKey,
        ...(requestNote ? { requestNote } : {})
      });
    } catch (error) {
      translateRepositoryError(error);
    }

    try {
      await this.mirrorWorkflowAuthority(
        tenantId,
        result.request.complaintId
      );
    } catch (error) {
      this.logger.error(
        "Tenant vendor request was committed, but the legacy store mirror failed.",
        error instanceof Error ? error.stack : String(error)
      );
    }
    return {
      request: publicRequest(result.request),
      idempotent: result.idempotent
    };
  }

  private async mirrorWorkflowAuthority(
    tenantId: string,
    complaintId: string
  ) {
    const before = await this.repository.readWorkflowAuthority(
      tenantId,
      complaintId
    );
    await this.storeBridge.synchronizeTenantVendorRequest(before);
    const after = await this.repository.readWorkflowAuthority(
      tenantId,
      complaintId
    );
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      await this.storeBridge.synchronizeTenantVendorRequest(after);
    }
  }

  private async findCandidate(
    tenantId: string,
    complaintId: string,
    vendorId: string
  ) {
    try {
      const candidate = await this.repository.findEligibleCandidate(
        tenantId,
        complaintId,
        vendorId
      );
      if (!candidate) {
        throw new TenantVendorConnectionRepositoryError(
          "VENDOR_NOT_ELIGIBLE",
          "Vendor is no longer eligible."
        );
      }
      return candidate;
    } catch (error) {
      translateRepositoryError(error);
    }
  }

  private issueToken(
    purpose: TokenPurpose,
    candidate: TenantPartnerVendorCandidateRecord
  ): string {
    const claims: SelectionClaims = {
      version: 1,
      purpose,
      tenantId: candidate.tenantId,
      complaintId: candidate.complaintId,
      vendorId: candidate.vendorId,
      expiresAt: new Date(this.currentTime().getTime() + this.tokenTtlMs).toISOString()
    };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.tokenKey, nonce);
    cipher.setAAD(TOKEN_AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(claims), "utf8"),
      cipher.final()
    ]);
    return [nonce, ciphertext, cipher.getAuthTag()]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  private verifyToken(
    token: unknown,
    purpose: TokenPurpose,
    tenantId: string,
    complaintId: string
  ): SelectionClaims {
    if (typeof token !== "string") {
      throw new BadRequestException("업체 선택 확인 정보가 올바르지 않습니다.");
    }
    const [noncePart, ciphertextPart, authTagPart, ...rest] =
      token.trim().split(".");
    if (!noncePart || !ciphertextPart || !authTagPart || rest.length > 0) {
      throw new BadRequestException("업체 선택 확인 정보가 올바르지 않습니다.");
    }
    let claims: SelectionClaims;
    try {
      const nonce = Buffer.from(noncePart, "base64url");
      const ciphertext = Buffer.from(ciphertextPart, "base64url");
      const authTag = Buffer.from(authTagPart, "base64url");
      if (nonce.length !== 12 || ciphertext.length === 0 || authTag.length !== 16) {
        throw new Error("Malformed selection token.");
      }
      const decipher = createDecipheriv("aes-256-gcm", this.tokenKey, nonce);
      decipher.setAAD(TOKEN_AAD);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]).toString("utf8");
      claims = JSON.parse(plaintext) as SelectionClaims;
    } catch {
      throw new BadRequestException("업체 선택 확인 정보가 올바르지 않습니다.");
    }
    if (
      claims?.version !== 1 ||
      claims.purpose !== purpose ||
      claims.tenantId !== tenantId ||
      claims.complaintId !== complaintId ||
      typeof claims.vendorId !== "string" ||
      !claims.vendorId ||
      typeof claims.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(claims.expiresAt)) ||
      Date.parse(claims.expiresAt) <= this.currentTime().getTime()
    ) {
      throw new BadRequestException("업체 선택 확인 정보가 만료되었거나 올바르지 않습니다.");
    }
    return claims;
  }
}
