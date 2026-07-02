import { Injectable } from "@nestjs/common";
import type {
  Contract,
  ContractExtraction,
  ContractLifecycle,
  ContractPrivacy,
  DeletionState,
  ExtractionItem,
  RetentionItem,
} from "@roomlog/types";

// 계약서 업로드 DTO — OCR·저장 동의 게이트 통과가 전제(T-DOC-01)
export interface CreateContractDto {
  unitId: string;
  landlordName: string;
  ocrConsent: boolean; // OCR 분석·DB 저장 동의(미체크 시 서비스단에서 거부)
}

export interface ManagerInfoRequestDto {
  message: string;
  requestedItems?: string[];
}

export interface ManagerConfirmReviewDto {
  managerName?: string;
}

export interface ManagerLifecycleDto {
  lifecycle: ContractLifecycle;
}

export interface ManagerInviteDto {
  unitId: string;
  tenantName?: string;
  tenantPhoneMasked?: string;
}

export interface ManagerDeletionProcessDto {
  result: Extract<DeletionState, "completed" | "limited" | "denied">;
  reason: string;
  retainedItems?: RetentionItem[];
}

export interface ManagerContractRow {
  contract: Contract;
  tenantName?: string;
  tenantPhoneMasked?: string;
  needsCheckCount: number;
  daysUntilEnd?: number;
  reviewSlaDeadline?: string;
  reviewSlaBreached: boolean;
  deletionSlaDeadline?: string;
  deletionSlaBreached: boolean;
  canQuickConfirm: boolean;
  requiresDesktopReview: boolean;
}

export interface ManagerContractDashboard {
  summary: {
    total: number;
    pendingReview: number;
    infoRequested: number;
    confirmed: number;
    expiringSoon: number;
    expired: number;
    deletionRequested: number;
    slaBreached: number;
  };
  contracts: ManagerContractRow[];
}

export interface ManagerReviewThreadItem {
  id: string;
  contractId: string;
  kind: "tenant_comment" | "manager_info_request" | "tenant_resubmission";
  message: string;
  requestedItems?: string[];
  createdAt: string;
}

export interface ManagerAuditLogItem {
  id: string;
  contractId: string;
  action:
    | "created"
    | "confirmed"
    | "info_requested"
    | "lifecycle_updated"
    | "invited"
    | "deletion_processed";
  actor: "tenant" | "manager" | "system";
  note: string;
  createdAt: string;
}

export interface ManagerContractReview {
  contract: Contract;
  extraction?: ContractExtraction;
  privacy?: ContractPrivacy;
  needsCheckItems: ExtractionItem[];
  thread: ManagerReviewThreadItem[];
  auditLogs: ManagerAuditLogItem[];
  canQuickConfirm: boolean;
  requiresDesktopReview: boolean;
}

export interface ManagerContractLifecycle {
  contractId: string;
  lifecycle: ContractLifecycle;
  startDate?: string;
  endDate?: string;
  daysUntilEnd?: number;
  expiringThresholdDays: number;
}

export interface ManagerInvitation {
  id: string;
  unitId: string;
  tenantName?: string;
  tenantPhoneMasked?: string;
  status: "pending" | "linked" | "revoked";
  inviteUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagerDeletionQueueItem {
  contract: Contract;
  privacy: ContractPrivacy;
  requestedAt?: string;
  slaDeadline?: string;
  slaBreached: boolean;
}

// repository 인터페이스 분리 — 인메모리 구현과 계약을 나눠 후속 DB 교체를 대비.
// 티켓 슬라이스(ticket.repository.ts)와 동일한 레시피.
export abstract class ContractRepository {
  abstract listContracts(): Contract[];
  abstract getContract(id: string): Contract | undefined;
  abstract getExtraction(contractId: string): ContractExtraction | undefined;
  abstract getPrivacy(contractId: string): ContractPrivacy | undefined;
  abstract createContract(dto: CreateContractDto): Contract;
  abstract getManagerDashboard(): ManagerContractDashboard;
  abstract getManagerReview(contractId: string): ManagerContractReview | undefined;
  abstract confirmManagerReview(contractId: string, dto: ManagerConfirmReviewDto): Contract | undefined;
  abstract requestManagerInfo(contractId: string, dto: ManagerInfoRequestDto): Contract | undefined;
  abstract getManagerLifecycle(contractId: string): ManagerContractLifecycle | undefined;
  abstract updateManagerLifecycle(contractId: string, dto: ManagerLifecycleDto): Contract | undefined;
  abstract listManagerInvitations(): ManagerInvitation[];
  abstract createManagerInvitation(dto: ManagerInviteDto): ManagerInvitation;
  abstract listManagerDeletionQueue(): ManagerDeletionQueueItem[];
  abstract processManagerDeletion(contractId: string, dto: ManagerDeletionProcessDto): ContractPrivacy | undefined;
}

// 데모 시드 — 프론트 lib/demo-contract.ts와 값이 일치해야 한다(api 미기동 폴백 정합).
const DEMO_CONTRACT: Contract = {
  id: "ct_0001",
  unitId: "302",
  landlordName: "김임대",
  lifecycle: "active",
  review: "pending", // 검토 전 참고본 (확정 전)
  deletion: "none",
  valueSource: "unverified", // 확정 전이므로 미확인
  monthlyRent: 650000,
  maintenanceFee: 70000,
  paymentDay: 25,
  startDate: "2026-03-01T00:00:00+09:00",
  endDate: "2028-02-29T00:00:00+09:00",
  createdAt: "2026-06-28T09:00:00+09:00",
  updatedAt: "2026-06-28T09:10:00+09:00",
  extractionId: "cx_0001",
};

const DEMO_EXTRACTION: ContractExtraction = {
  id: "cx_0001",
  contractId: "ct_0001",
  confirmed: false, // 관리자 확정 전 — 참고본
  highlights: [
    "월세 65만원 · 매월 25일 납부",
    "계약 기간 2026.03.01 ~ 2028.02.29 (2년)",
    "묵시적 자동연장 특약 있음 — 확인 필요",
  ],
  items: [
    { label: "보증금", value: "10,000,000원", group: "money", needsCheck: false, evidence: "제1조 보증금은 금 일천만원정(₩10,000,000)으로 한다." },
    { label: "월세", value: "650,000원", group: "money", needsCheck: false, evidence: "차임은 월 금 육십오만원정으로 하며" },
    { label: "관리비", value: "70,000원", group: "money", needsCheck: true, evidence: "관리비 별도(관리규약에 따름)" },
    { label: "납부일", value: "매월 25일", group: "money", needsCheck: false, evidence: "매월 25일까지 임대인 계좌로 납부한다." },
    { label: "임대인 계좌", value: "○○은행 ***-**-****21", group: "money", needsCheck: false, masked: true, evidence: "입금계좌: ○○은행 123-45-678921" },
    { label: "계약 기간", value: "2026.03.01 ~ 2028.02.29", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 3월 1일부터 24개월로 한다." },
    { label: "자동연장", value: "묵시적 갱신 특약", group: "term", needsCheck: true, evidence: "만료 1개월 전 통지 없을 시 동일 조건 자동연장" },
    { label: "상세 주소", value: "서울시 ○○구 ***로 **길 **", group: "term", needsCheck: false, masked: true, evidence: "목적물: 서울시 ○○구 △△로 12길 34, 302호" },
    { label: "원상복구", value: "퇴거 시 원상복구 의무", group: "responsibility", needsCheck: false, evidence: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다." },
    { label: "수선 책임", value: "소모품·경미한 수선 임차인 부담", group: "responsibility", needsCheck: true, evidence: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다." },
  ],
  helpNotes: [
    {
      clause: "묵시적 자동연장",
      plain: "만료 1개월 전에 아무도 연락하지 않으면 같은 조건으로 계약이 자동으로 연장돼요. 이사 계획이 있으면 미리 알려두면 좋아요.",
      source: "만료 1개월 전 통지 없을 시 동일 조건 자동연장",
    },
    {
      clause: "원상복구 의무",
      plain: "퇴거할 때 처음 상태로 되돌려 놓아야 해요. 입주 전 사진을 남겨두면 나중에 도움이 돼요.",
      source: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다.",
    },
    {
      clause: "경미한 수선 부담",
      plain: "소모품 교체나 작은 수리는 임차인이 부담할 수 있어요. 큰 하자는 임대인 책임일 수 있으니 관리자에게 물어보세요.",
      source: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다.",
    },
  ],
  createdAt: "2026-06-28T09:10:00+09:00",
};

const DEMO_PRIVACY: ContractPrivacy = {
  contractId: "ct_0001",
  maskingEnabled: true,
  retention: [
    { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" },
    { label: "임대인 계좌·연락처", reason: "정산 완료 시 즉시 파기", until: "정산 완료 시" },
    { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" },
  ],
  forwardingConsent: false, // 업체 전달은 전달 시점 별도 동의 (업로드에서 분리)
  deletion: "none",
  deletionSlaHours: 72, // 삭제 요청 처리 SLA (무응답 시 알림)
  deletable: false, // 계약 유효 중 — 종료 후에만 활성
};

@Injectable()
export class InMemoryContractRepository implements ContractRepository {
  private readonly contracts = new Map<string, Contract>();
  private readonly extractionsByContractId = new Map<string, ContractExtraction>();
  private readonly privacyByContractId = new Map<string, ContractPrivacy>();
  private readonly tenantByContractId = new Map<string, { tenantName?: string; tenantPhoneMasked?: string }>();
  private readonly reviewThreadByContractId = new Map<string, ManagerReviewThreadItem[]>();
  private readonly auditLogsByContractId = new Map<string, ManagerAuditLogItem[]>();
  private readonly invitations = new Map<string, ManagerInvitation>();
  private readonly deletionRequestedAtByContractId = new Map<string, string>();

  constructor() {
    this.contracts.set(DEMO_CONTRACT.id, DEMO_CONTRACT);
    this.extractionsByContractId.set(DEMO_EXTRACTION.contractId, DEMO_EXTRACTION);
    this.privacyByContractId.set(DEMO_PRIVACY.contractId, DEMO_PRIVACY);
    this.tenantByContractId.set(DEMO_CONTRACT.id, {
      tenantName: "박임차",
      tenantPhoneMasked: "010-****-1203",
    });
    this.auditLogsByContractId.set(DEMO_CONTRACT.id, [
      {
        id: "cal_0001",
        contractId: DEMO_CONTRACT.id,
        action: "created",
        actor: "tenant",
        note: "임차인 계약서 업로드 후 OCR 분석 완료",
        createdAt: DEMO_CONTRACT.createdAt,
      },
    ]);
  }

  listContracts(): Contract[] {
    return Array.from(this.contracts.values());
  }

  getContract(id: string): Contract | undefined {
    return this.contracts.get(id);
  }

  getExtraction(contractId: string): ContractExtraction | undefined {
    return this.extractionsByContractId.get(contractId);
  }

  getPrivacy(contractId: string): ContractPrivacy | undefined {
    return this.privacyByContractId.get(contractId);
  }

  createContract(dto: CreateContractDto): Contract {
    const now = new Date().toISOString();
    // 업로드 직후 = 분석 중 · 검토 대기 · 미확인. 확정은 관리자(M-DOC-01)만.
    const contract: Contract = {
      id: this.createContractId(),
      unitId: dto.unitId,
      landlordName: dto.landlordName,
      lifecycle: "analyzing",
      review: "pending",
      deletion: "none",
      valueSource: "unverified",
      createdAt: now,
      updatedAt: now,
    };

    this.contracts.set(contract.id, contract);
    this.auditLogsByContractId.set(contract.id, [
      {
        id: this.createAuditId(),
        contractId: contract.id,
        action: "created",
        actor: "tenant",
        note: "임차인 계약서 업로드 접수",
        createdAt: now,
      },
    ]);
    return contract;
  }

  getManagerDashboard(): ManagerContractDashboard {
    const contracts = Array.from(this.contracts.values()).map((contract) =>
      this.toManagerRow(this.withCurrentLifecycle(contract)),
    );
    const summary = contracts.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.contract.review === "pending") acc.pendingReview += 1;
        if (row.contract.review === "info_requested") acc.infoRequested += 1;
        if (row.contract.review === "confirmed") acc.confirmed += 1;
        if (row.contract.lifecycle === "expiring_soon") acc.expiringSoon += 1;
        if (row.contract.lifecycle === "expired") acc.expired += 1;
        if (row.contract.deletion === "requested") acc.deletionRequested += 1;
        if (row.reviewSlaBreached || row.deletionSlaBreached) acc.slaBreached += 1;
        return acc;
      },
      {
        total: 0,
        pendingReview: 0,
        infoRequested: 0,
        confirmed: 0,
        expiringSoon: 0,
        expired: 0,
        deletionRequested: 0,
        slaBreached: 0,
      },
    );

    return { summary, contracts };
  }

  getManagerReview(contractId: string): ManagerContractReview | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;

    const extraction = this.extractionsByContractId.get(contractId);
    const needsCheckItems = extraction?.items.filter((item) => item.needsCheck) ?? [];

    return {
      contract: this.withCurrentLifecycle(contract),
      extraction,
      privacy: this.privacyByContractId.get(contractId),
      needsCheckItems,
      thread: this.reviewThreadByContractId.get(contractId) ?? [],
      auditLogs: this.auditLogsByContractId.get(contractId) ?? [],
      canQuickConfirm: needsCheckItems.length === 0 && contract.review !== "confirmed",
      requiresDesktopReview: needsCheckItems.length > 0,
    };
  }

  confirmManagerReview(contractId: string, dto: ManagerConfirmReviewDto): Contract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;

    const now = new Date().toISOString();
    const updated: Contract = {
      ...contract,
      lifecycle: this.withCurrentLifecycle(contract).lifecycle === "analyzing" ? "active" : this.withCurrentLifecycle(contract).lifecycle,
      review: "confirmed",
      valueSource: "confirmed",
      updatedAt: now,
    };
    this.contracts.set(contractId, updated);

    const extraction = this.extractionsByContractId.get(contractId);
    if (extraction) {
      this.extractionsByContractId.set(contractId, { ...extraction, confirmed: true });
    }

    this.appendAudit(contractId, {
      action: "confirmed",
      actor: "manager",
      note: `${dto.managerName ?? "관리인"} 검토 확정`,
    });
    return updated;
  }

  requestManagerInfo(contractId: string, dto: ManagerInfoRequestDto): Contract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;

    const now = new Date().toISOString();
    const updated: Contract = {
      ...contract,
      review: "info_requested",
      valueSource: contract.valueSource === "confirmed" ? "confirmed" : "unverified",
      updatedAt: now,
    };
    this.contracts.set(contractId, updated);
    this.appendThread(contractId, {
      kind: "manager_info_request",
      message: dto.message,
      requestedItems: dto.requestedItems,
    });
    this.appendAudit(contractId, {
      action: "info_requested",
      actor: "manager",
      note: dto.message,
    });
    return updated;
  }

  getManagerLifecycle(contractId: string): ManagerContractLifecycle | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;

    const current = this.withCurrentLifecycle(contract);
    return {
      contractId,
      lifecycle: current.lifecycle,
      startDate: current.startDate,
      endDate: current.endDate,
      daysUntilEnd: this.daysUntil(current.endDate),
      expiringThresholdDays: 60,
    };
  }

  updateManagerLifecycle(contractId: string, dto: ManagerLifecycleDto): Contract | undefined {
    const contract = this.contracts.get(contractId);
    if (!contract) return undefined;

    const updated = { ...contract, lifecycle: dto.lifecycle, updatedAt: new Date().toISOString() };
    this.contracts.set(contractId, updated);
    this.appendAudit(contractId, {
      action: "lifecycle_updated",
      actor: "manager",
      note: `생애주기 상태 변경: ${dto.lifecycle}`,
    });
    return updated;
  }

  listManagerInvitations(): ManagerInvitation[] {
    return Array.from(this.invitations.values());
  }

  createManagerInvitation(dto: ManagerInviteDto): ManagerInvitation {
    const now = new Date().toISOString();
    const invitation: ManagerInvitation = {
      id: `ci_${Date.now().toString(36)}`,
      unitId: dto.unitId,
      tenantName: dto.tenantName,
      tenantPhoneMasked: dto.tenantPhoneMasked,
      status: "pending",
      inviteUrl: `https://roomlog.local/invite/${dto.unitId}-${Date.now().toString(36)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.invitations.set(invitation.id, invitation);

    const contract = Array.from(this.contracts.values()).find((item) => item.unitId === dto.unitId);
    if (contract) {
      this.tenantByContractId.set(contract.id, {
        tenantName: dto.tenantName,
        tenantPhoneMasked: dto.tenantPhoneMasked,
      });
      this.appendAudit(contract.id, {
        action: "invited",
        actor: "manager",
        note: "임차인 초대 링크 생성",
      });
    }

    return invitation;
  }

  listManagerDeletionQueue(): ManagerDeletionQueueItem[] {
    return Array.from(this.privacyByContractId.values())
      .filter((privacy) => privacy.deletion === "requested")
      .map((privacy) => {
        const contract = this.contracts.get(privacy.contractId);
        if (!contract) return undefined;

        const requestedAt = this.deletionRequestedAtByContractId.get(privacy.contractId);
        const slaDeadline = requestedAt ? this.addHours(requestedAt, privacy.deletionSlaHours ?? 72) : undefined;
        return {
          contract: this.withCurrentLifecycle(contract),
          privacy,
          ...(requestedAt ? { requestedAt } : {}),
          ...(slaDeadline ? { slaDeadline } : {}),
          slaBreached: this.isPast(slaDeadline),
        };
      })
      .filter((item): item is ManagerDeletionQueueItem => item !== undefined);
  }

  processManagerDeletion(contractId: string, dto: ManagerDeletionProcessDto): ContractPrivacy | undefined {
    const contract = this.contracts.get(contractId);
    const privacy = this.privacyByContractId.get(contractId);
    if (!contract || !privacy) return undefined;

    const updatedPrivacy: ContractPrivacy = {
      ...privacy,
      deletion: dto.result,
      retention: dto.retainedItems?.length ? dto.retainedItems : privacy.retention,
      maskingEnabled: dto.result !== "denied" ? true : privacy.maskingEnabled,
      deletable: false,
    };
    const updatedContract: Contract = {
      ...contract,
      deletion: dto.result,
      updatedAt: new Date().toISOString(),
    };

    this.privacyByContractId.set(contractId, updatedPrivacy);
    this.contracts.set(contractId, updatedContract);
    this.appendAudit(contractId, {
      action: "deletion_processed",
      actor: "manager",
      note: dto.reason,
    });
    return updatedPrivacy;
  }

  private createContractId(): string {
    return `ct_${Date.now().toString(36)}`;
  }

  private createAuditId(): string {
    return `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private appendThread(
    contractId: string,
    item: Omit<ManagerReviewThreadItem, "id" | "contractId" | "createdAt">,
  ): void {
    const now = new Date().toISOString();
    const next = [
      ...(this.reviewThreadByContractId.get(contractId) ?? []),
      {
        id: `crt_${Date.now().toString(36)}`,
        contractId,
        createdAt: now,
        ...item,
      },
    ];
    this.reviewThreadByContractId.set(contractId, next);
  }

  private appendAudit(
    contractId: string,
    item: Omit<ManagerAuditLogItem, "id" | "contractId" | "createdAt">,
  ): void {
    const now = new Date().toISOString();
    const next = [
      ...(this.auditLogsByContractId.get(contractId) ?? []),
      {
        id: this.createAuditId(),
        contractId,
        createdAt: now,
        ...item,
      },
    ];
    this.auditLogsByContractId.set(contractId, next);
  }

  private toManagerRow(contract: Contract): ManagerContractRow {
    const extraction = this.extractionsByContractId.get(contract.id);
    const privacy = this.privacyByContractId.get(contract.id);
    const needsCheckCount = extraction?.items.filter((item) => item.needsCheck).length ?? 0;
    const createdReviewDeadline = this.addHours(contract.createdAt, 72);
    const deletionRequestedAt = this.deletionRequestedAtByContractId.get(contract.id);
    const deletionSlaDeadline =
      deletionRequestedAt && privacy ? this.addHours(deletionRequestedAt, privacy.deletionSlaHours ?? 72) : undefined;

    return {
      contract,
      ...this.tenantByContractId.get(contract.id),
      needsCheckCount,
      daysUntilEnd: this.daysUntil(contract.endDate),
      reviewSlaDeadline: contract.review === "pending" ? createdReviewDeadline : undefined,
      reviewSlaBreached: contract.review === "pending" && this.isPast(createdReviewDeadline),
      deletionSlaDeadline,
      deletionSlaBreached: contract.deletion === "requested" && this.isPast(deletionSlaDeadline),
      canQuickConfirm: needsCheckCount === 0 && contract.review !== "confirmed",
      requiresDesktopReview: needsCheckCount > 0 || contract.deletion === "requested",
    };
  }

  private withCurrentLifecycle(contract: Contract): Contract {
    if (!contract.endDate || contract.lifecycle === "unregistered" || contract.lifecycle === "analyzing") {
      return contract;
    }

    const daysUntilEnd = this.daysUntil(contract.endDate);
    if (daysUntilEnd === undefined) return contract;
    if (daysUntilEnd < 0) return { ...contract, lifecycle: "expired" };
    if (daysUntilEnd <= 60) return { ...contract, lifecycle: "expiring_soon" };
    return { ...contract, lifecycle: "active" };
  }

  private daysUntil(value?: string): number | undefined {
    if (!value) return undefined;
    const target = new Date(value).getTime();
    if (Number.isNaN(target)) return undefined;
    const today = Date.now();
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  private addHours(value: string, hours: number): string | undefined {
    const base = new Date(value).getTime();
    if (Number.isNaN(base)) return undefined;
    return new Date(base + hours * 60 * 60 * 1000).toISOString();
  }

  private isPast(value?: string): boolean {
    if (!value) return false;
    const time = new Date(value).getTime();
    return !Number.isNaN(time) && time < Date.now();
  }
}
