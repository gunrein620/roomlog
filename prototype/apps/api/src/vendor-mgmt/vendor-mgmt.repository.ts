import { Injectable } from "@nestjs/common";
import type {
  VendorAiComment,
  VendorDuplicateCandidate,
  VendorJobRecord,
  VendorPerf,
  VendorPerfEvent,
  VendorProfile,
  VendorStatus,
  VendorTrade,
} from "@roomlog/types";
import { VENDOR_PERF_MIN_N } from "@roomlog/types";

export interface VendorListOptions {
  q?: string;
  trade?: VendorTrade;
  sort?: "recent" | "trade";
}

export interface VendorCreateDto {
  name: string;
  trades: VendorTrade[];
  status?: VendorStatus;
  phone?: string;
  contactPerson?: string;
  address?: string;
  memo?: string;
}

export interface VendorUpdateDto {
  name?: string;
  trades?: VendorTrade[];
  status?: VendorStatus;
  phone?: string;
  contactPerson?: string;
  address?: string;
  memo?: string;
}

export abstract class VendorMgmtRepository {
  abstract listVendors(options?: VendorListOptions): VendorProfile[];
  abstract getVendor(id: string): VendorProfile | undefined;
  abstract listVendorJobs(vendorId: string): VendorJobRecord[];
  abstract getVendorPerf(vendorId: string): VendorPerf | undefined;
  abstract listVendorPerfEvents(vendorId: string): VendorPerfEvent[];
  abstract listDuplicateCandidates(vendorId: string): VendorDuplicateCandidate[];
  abstract createVendor(dto: VendorCreateDto): VendorProfile;
  abstract updateVendor(id: string, dto: VendorUpdateDto): VendorProfile | undefined;
}

const VENDOR_MIRROR_NOTICE =
  "이 업체는 V-JOB에서 본인 성과를 보고 이의할 수 있어요.";

const DEMO_VENDORS: VendorProfile[] = [
  {
    id: "vnd_0001",
    name: "빠른배관",
    trades: ["plumbing", "waterproofing"],
    status: "active",
    source: "auto",
    dealCount: 8,
    lastUsedAt: "2026-07-02T13:00:00+09:00",
    isNew: false,
    phone: "010-2345-6789",
    contactPerson: "김성수",
    address: "서울 성동구 성수동2가",
    memo: "야간·주말 출동 가능. 누수 대응 빠름.",
    createdAt: "2026-03-11T09:00:00+09:00",
    updatedAt: "2026-07-02T13:10:00+09:00",
  },
  {
    id: "vnd_0002",
    name: "○○냉난방",
    trades: ["hvac", "appliance"],
    status: "active",
    source: "auto",
    dealCount: 3,
    lastUsedAt: "2026-06-30T10:00:00+09:00",
    isNew: false,
    phone: "010-8765-4321",
    contactPerson: "박냉방",
    memo: "에어컨 세척·냉매 충전.",
    createdAt: "2026-05-02T14:00:00+09:00",
    updatedAt: "2026-06-30T10:05:00+09:00",
  },
  {
    id: "vnd_0003",
    name: "성수전기",
    trades: ["electrical"],
    status: "active",
    source: "auto",
    dealCount: 1,
    lastUsedAt: "2026-07-01T15:00:00+09:00",
    isNew: true,
    phone: "010-1111-2222",
    createdAt: "2026-07-01T15:20:00+09:00",
    updatedAt: "2026-07-01T15:20:00+09:00",
  },
  {
    id: "vnd_0004",
    name: "24시열쇠",
    trades: ["locksmith"],
    status: "active",
    source: "manual",
    dealCount: 0,
    isNew: true,
    phone: "010-3333-4444",
    contactPerson: "이잠금",
    memo: "직접 추가(단골). 아직 배정 이력 없음.",
    createdAt: "2026-07-01T18:00:00+09:00",
    updatedAt: "2026-07-01T18:00:00+09:00",
  },
  {
    id: "vnd_0005",
    name: "옛날청소",
    trades: ["cleaning"],
    status: "closed",
    source: "auto",
    dealCount: 5,
    lastUsedAt: "2026-04-20T10:00:00+09:00",
    isNew: false,
    phone: "010-5555-6666",
    memo: "2026-05 폐업. 이력 보존용.",
    createdAt: "2026-01-15T09:00:00+09:00",
    updatedAt: "2026-05-10T09:00:00+09:00",
  },
];

const DEMO_VENDOR_JOBS: VendorJobRecord[] = [
  {
    id: "vjr_0001",
    vendorId: "vnd_0001",
    ticketId: "tk_0004",
    vendorJobId: "vj_0004",
    completedAt: "2026-07-02T14:00:00+09:00",
    unitId: "502",
    unitMasked: false,
    quoteAmount: 120000,
    responseHours: 2,
    rated: true,
    satisfaction: 5,
    ratedAt: "2026-07-02T15:00:00+09:00",
  },
  {
    id: "vjr_0002",
    vendorId: "vnd_0001",
    ticketId: "tk_0002",
    vendorJobId: "vj_0002",
    completedAt: "2026-06-27T12:00:00+09:00",
    unitId: "804",
    unitMasked: true,
    quoteAmount: 350000,
    responseHours: 3,
    rated: true,
    satisfaction: 4,
    ratedAt: "2026-06-27T13:00:00+09:00",
  },
  {
    id: "vjr_0003",
    vendorId: "vnd_0001",
    ticketId: "tk_0031",
    vendorJobId: "vj_0031",
    completedAt: "2026-06-10T11:00:00+09:00",
    unitId: "1103",
    unitMasked: false,
    quoteAmount: 65000,
    responseHours: 4,
    rated: false,
  },
  {
    id: "vjr_0004",
    vendorId: "vnd_0002",
    ticketId: "tk_0001",
    vendorJobId: "vj_0001",
    completedAt: "2026-06-30T11:00:00+09:00",
    unitId: "302",
    unitMasked: false,
    quoteAmount: 80000,
    responseHours: 5,
    rated: true,
    satisfaction: 4,
    ratedAt: "2026-06-30T12:00:00+09:00",
  },
  {
    id: "vjr_0005",
    vendorId: "vnd_0003",
    ticketId: "tk_0028",
    vendorJobId: "vj_0028",
    completedAt: "2026-07-01T15:00:00+09:00",
    unitId: "701",
    unitMasked: false,
    quoteAmount: 45000,
    responseHours: 6,
    rated: false,
  },
];

const DEMO_VENDOR_PERF_EVENTS: VendorPerfEvent[] = [
  {
    id: "vpe_0001",
    vendorId: "vnd_0001",
    type: "quote_requested",
    at: "2026-07-02T10:00:00+09:00",
    ticketId: "tk_0004",
  },
  {
    id: "vpe_0002",
    vendorId: "vnd_0001",
    type: "vendor_viewed",
    at: "2026-07-02T10:05:00+09:00",
    ticketId: "tk_0004",
  },
  {
    id: "vpe_0003",
    vendorId: "vnd_0001",
    type: "quote_submitted",
    at: "2026-07-02T12:00:00+09:00",
    ticketId: "tk_0004",
    jobId: "vj_0004",
    responseHours: 2,
    quoteAmount: 120000,
  },
  {
    id: "vpe_0004",
    vendorId: "vnd_0001",
    type: "assigned",
    at: "2026-07-02T12:30:00+09:00",
    ticketId: "tk_0004",
    jobId: "vj_0004",
  },
  {
    id: "vpe_0005",
    vendorId: "vnd_0001",
    type: "completed",
    at: "2026-07-02T14:00:00+09:00",
    jobId: "vj_0004",
  },
  {
    id: "vpe_0006",
    vendorId: "vnd_0001",
    type: "rated",
    at: "2026-07-02T15:00:00+09:00",
    jobId: "vj_0004",
    satisfaction: 5,
  },
];

const AI_COMMENT_VND_0001: VendorAiComment = {
  summary: "누수·배관 건에서 평균 응답 2~3시간, 견적은 시장 평균 대비 소폭 낮음(근거 3건).",
  basisJobIds: ["vj_0004", "vj_0002", "vj_0031"],
  label: "참고용",
};

const DEMO_VENDOR_PERF: VendorPerf[] = [
  {
    vendorId: "vnd_0001",
    sampleN: 6,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 8,
    ratedCount: 6,
    coverageRatio: 0.75,
    coverageLow: false,
    responseMedianHours: 3,
    quoteVsAvgPct: 96,
    satisfactionAvg: 4.3,
    ratingVisible: true,
    aiCommentEnabled: true,
    aiComment: AI_COMMENT_VND_0001,
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-07-02T15:05:00+09:00",
  },
  {
    vendorId: "vnd_0002",
    sampleN: 2,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 3,
    ratedCount: 2,
    coverageRatio: 0.67,
    coverageLow: true,
    responseMedianHours: 5,
    quoteVsAvgPct: 108,
    satisfactionAvg: undefined,
    ratingVisible: false,
    aiCommentEnabled: false,
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-06-30T12:05:00+09:00",
  },
  {
    vendorId: "vnd_0005",
    sampleN: 4,
    minN: VENDOR_PERF_MIN_N,
    completedCount: 5,
    ratedCount: 4,
    coverageRatio: 0.8,
    coverageLow: false,
    responseMedianHours: 6,
    quoteVsAvgPct: 101,
    satisfactionAvg: undefined,
    ratingVisible: false,
    aiCommentEnabled: false,
    mirrorNotice: VENDOR_MIRROR_NOTICE,
    updatedAt: "2026-05-10T09:00:00+09:00",
  },
];

const DEMO_VENDOR_DUPLICATE_CANDIDATES: VendorDuplicateCandidate[] = [
  { vendorId: "vnd_0001", name: "빠른배관", reason: "same_phone" },
];

@Injectable()
export class InMemoryVendorMgmtRepository implements VendorMgmtRepository {
  private readonly vendors = new Map<string, VendorProfile>();
  private readonly jobsByVendorId = new Map<string, VendorJobRecord[]>();
  private readonly perfByVendorId = new Map<string, VendorPerf>();
  private readonly eventsByVendorId = new Map<string, VendorPerfEvent[]>();
  private readonly duplicatesByVendorId = new Map<string, VendorDuplicateCandidate[]>();

  constructor() {
    for (const vendor of DEMO_VENDORS) {
      this.vendors.set(vendor.id, vendor);
    }
    for (const job of DEMO_VENDOR_JOBS) {
      this.jobsByVendorId.set(job.vendorId, [
        ...(this.jobsByVendorId.get(job.vendorId) ?? []),
        job,
      ]);
    }
    for (const perf of DEMO_VENDOR_PERF) {
      this.perfByVendorId.set(perf.vendorId, perf);
    }
    for (const event of DEMO_VENDOR_PERF_EVENTS) {
      this.eventsByVendorId.set(event.vendorId, [
        ...(this.eventsByVendorId.get(event.vendorId) ?? []),
        event,
      ]);
    }
    for (const candidate of DEMO_VENDOR_DUPLICATE_CANDIDATES) {
      this.duplicatesByVendorId.set(candidate.vendorId, [
        ...(this.duplicatesByVendorId.get(candidate.vendorId) ?? []),
        candidate,
      ]);
    }
  }

  listVendors(options: VendorListOptions = {}): VendorProfile[] {
    const query = options.q?.trim().toLocaleLowerCase();
    const vendors = Array.from(this.vendors.values()).filter((vendor) => {
      const searchableText = [
        vendor.name,
        vendor.phone,
        vendor.contactPerson,
        vendor.address,
        vendor.memo,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return (
        (!query || searchableText.includes(query)) &&
        (!options.trade || vendor.trades.includes(options.trade))
      );
    });

    if (options.sort === "trade") {
      return vendors.sort((left, right) => {
        const leftTrade = left.trades[0] ?? "";
        const rightTrade = right.trades[0] ?? "";
        return leftTrade.localeCompare(rightTrade) || left.name.localeCompare(right.name);
      });
    }

    if (options.sort === "recent") {
      return vendors.sort(
        (left, right) =>
          this.toTimestamp(right.lastUsedAt ?? right.updatedAt) -
          this.toTimestamp(left.lastUsedAt ?? left.updatedAt),
      );
    }

    return vendors;
  }

  getVendor(id: string): VendorProfile | undefined {
    return this.vendors.get(id);
  }

  listVendorJobs(vendorId: string): VendorJobRecord[] {
    return [...(this.jobsByVendorId.get(vendorId) ?? [])].sort(
      (left, right) => this.toTimestamp(right.completedAt) - this.toTimestamp(left.completedAt),
    );
  }

  getVendorPerf(vendorId: string): VendorPerf | undefined {
    return this.perfByVendorId.get(vendorId);
  }

  listVendorPerfEvents(vendorId: string): VendorPerfEvent[] {
    return [...(this.eventsByVendorId.get(vendorId) ?? [])].sort(
      (left, right) => this.toTimestamp(right.at) - this.toTimestamp(left.at),
    );
  }

  listDuplicateCandidates(vendorId: string): VendorDuplicateCandidate[] {
    return this.duplicatesByVendorId.get(vendorId) ?? [];
  }

  createVendor(dto: VendorCreateDto): VendorProfile {
    const now = new Date().toISOString();
    const vendor: VendorProfile = {
      id: this.createVendorId(),
      name: dto.name,
      trades: dto.trades,
      status: dto.status ?? "active",
      source: "manual",
      dealCount: 0,
      isNew: true,
      phone: dto.phone,
      contactPerson: dto.contactPerson,
      address: dto.address,
      memo: dto.memo,
      createdAt: now,
      updatedAt: now,
    };

    this.vendors.set(vendor.id, vendor);
    return vendor;
  }

  updateVendor(id: string, dto: VendorUpdateDto): VendorProfile | undefined {
    const vendor = this.vendors.get(id);
    if (!vendor) {
      return undefined;
    }

    const updatedVendor: VendorProfile = {
      ...vendor,
      ...dto,
      updatedAt: new Date().toISOString(),
    };
    this.vendors.set(id, updatedVendor);

    return updatedVendor;
  }

  private createVendorId(): string {
    return `vnd_${Date.now().toString(36)}`;
  }

  private toTimestamp(isoDate: string): number {
    return new Date(isoDate).getTime();
  }
}
