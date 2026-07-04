// 업체관리(vendor-mgmt) + 초대(vendor/tenant invite) 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 코어 뮤테이터(transitionTicket 등) 미사용(vendor-repair와 분리). 공유 read 헬퍼는 동명 필드로 주입해 본문 verbatim.
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { id, normalizePhoneNumber, now } from "../roomlog-support";
import type { Complaint, RepairRequest, Room, Ticket } from "../roomlog.types";
import type {
  CreateTenantInviteInput,
  CreateVendorInviteInput,
  ManagerVendorProfileInput,
  Store,
  TenantInvite,
  VendorInvite,
  VendorMgmtListFilters,
  VendorMgmtTrade,
  VendorSummary
} from "../roomlog.service";

const VENDOR_PERF_MIN_N = 5;
const VENDOR_MIRROR_NOTICE = "이 업체는 V-JOB에서 본인 성과를 보고 이의할 수 있어요.";
const VENDOR_MGMT_TRADES: VendorMgmtTrade[] = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "locksmith",
  "waterproofing",
  "cleaning",
  "general",
  "other"
];

export class RoomlogVendorMgmtDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void,
    private readonly canManagerAccessRoom: (managerId: string, roomId: string) => boolean,
    private readonly findTicket: (ticketId: string) => Ticket,
    private readonly findRoom: (roomId: string) => Room,
    private readonly findComplaint: (complaintId: string) => Complaint,
    private readonly timeOf: (iso?: string) => number,
    private readonly elapsedHours: (startIso: string, endIso: string) => number | undefined,
    private readonly average: (values: number[]) => number,
    private readonly median: (values: number[]) => number | undefined
  ) {}

  listVendors() {
    return this.store.vendors.map((vendor) => ({ ...vendor }));
  }

  listManagerVendorMgmtVendors(managerId: string, filters: VendorMgmtListFilters = {}) {
    return this.filteredManagerVendorProfiles(managerId, filters);
  }

  getManagerVendorMgmtDetail(managerId: string, vendorId: string) {
    const vendor = this.findManagerVendorProfile(managerId, vendorId);
    const jobs = this.managerVendorJobRecords(managerId, vendor.id);

    return {
      vendor,
      jobs,
      perf: this.managerVendorPerf(managerId, vendor.id, jobs)
    };
  }

  getManagerVendorMgmtPerf(managerId: string, vendorId: string) {
    const detail = this.getManagerVendorMgmtDetail(managerId, vendorId);

    return {
      vendor: detail.vendor,
      jobs: detail.jobs,
      perf: detail.perf
    };
  }

  listManagerVendorDuplicateCandidates(managerId: string) {
    const vendors = this.filteredManagerVendorProfiles(managerId);
    const candidates: { vendorId: string; name: string; reason: "same_phone" | "same_name" }[] = [];

    for (const vendor of vendors) {
      const normalizedPhone = normalizePhoneNumber(vendor.phone);
      if (
        normalizedPhone &&
        vendors.some(
          (candidate) =>
            candidate.id !== vendor.id && normalizePhoneNumber(candidate.phone) === normalizedPhone
        )
      ) {
        candidates.push({ vendorId: vendor.id, name: vendor.name, reason: "same_phone" });
        continue;
      }

      if (
        vendors.some(
          (candidate) =>
            candidate.id !== vendor.id &&
            candidate.name.trim().toLowerCase() === vendor.name.trim().toLowerCase()
        )
      ) {
        candidates.push({ vendorId: vendor.id, name: vendor.name, reason: "same_name" });
      }
    }

    return candidates;
  }

  createManagerVendorProfile(managerId: string, input: ManagerVendorProfileInput) {
    this.assertLandlord(managerId);
    const values = this.normalizeVendorProfileInput(input);
    const vendorId = id("vnd");
    const vendor: VendorSummary = {
      id: vendorId,
      userId: `manual:${vendorId}`,
      ...values,
      activeJobs: 0,
      createdByManagerId: managerId
    };

    this.store.vendors.unshift(vendor);
    this.persistStore();

    return this.getManagerVendorMgmtDetail(managerId, vendorId);
  }

  updateManagerVendorProfile(
    managerId: string,
    vendorId: string,
    input: ManagerVendorProfileInput
  ) {
    this.assertLandlord(managerId);
    const vendor = this.store.vendors.find((item) => item.id === vendorId);

    if (!vendor || !this.canManagerSeeVendor(managerId, vendor)) {
      throw new NotFoundException("관리 가능한 업체를 찾을 수 없습니다.");
    }

    if (vendor.createdByManagerId && vendor.createdByManagerId !== managerId) {
      throw new ForbiddenException("다른 관리인이 직접 등록한 업체는 편집할 수 없습니다.");
    }

    const values = this.normalizeVendorProfileInput(input);
    vendor.businessName = values.businessName;
    vendor.contactPerson = values.contactPerson;
    vendor.phone = values.phone;
    vendor.serviceArea = values.serviceArea;
    vendor.createdByManagerId ??= managerId;
    this.persistStore();

    return this.getManagerVendorMgmtDetail(managerId, vendorId);
  }

  createVendorInvite(managerId: string, input: CreateVendorInviteInput) {
    const manager = this.store.users.find(
      (user) => user.id === managerId && user.role === "LANDLORD"
    );

    if (!manager) {
      throw new ForbiddenException("관리자만 협력업체를 초대할 수 있습니다.");
    }

    const businessName = input.businessName?.trim();
    const contactPerson = input.contactPerson?.trim();
    const phone = normalizePhoneNumber(input.phone);
    const serviceArea = input.serviceArea?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!businessName) {
      throw new BadRequestException("업체명을 입력해주세요.");
    }

    if (!contactPerson) {
      throw new BadRequestException("담당자명을 입력해주세요.");
    }

    if (!phone) {
      throw new BadRequestException("업체 연락처를 입력해주세요.");
    }

    if (!serviceArea) {
      throw new BadRequestException("서비스 가능 지역을 입력해주세요.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("초대 이메일 형식이 올바르지 않습니다.");
    }

    const inviteToken = randomBytes(18).toString("base64url");
    const createdAt = now();
    const invite: VendorInvite = {
      id: id("vinv"),
      inviteToken,
      invitedByManagerId: managerId,
      email,
      businessName,
      contactPerson,
      phone,
      serviceArea,
      status: "PENDING",
      signupUrl: `/vendor?inviteToken=${inviteToken}`,
      createdAt
    };

    this.store.vendorInvites.unshift(invite);
    this.persistStore();

    return this.presentVendorInvite(invite);
  }

  listVendorInvites(managerId: string) {
    return this.store.vendorInvites
      .filter((invite) => invite.invitedByManagerId === managerId)
      .map((invite) => this.presentVendorInvite(invite));
  }

  createTenantInvite(managerId: string, input: CreateTenantInviteInput) {
    const manager = this.store.users.find(
      (user) => user.id === managerId && user.role === "LANDLORD"
    );

    if (!manager) {
      throw new ForbiddenException("관리자만 임차인을 초대할 수 있습니다.");
    }

    const roomId = input.roomId?.trim();
    const tenantName = input.tenantName?.trim();
    const phone = normalizePhoneNumber(input.phone);
    const moveInDate = input.moveInDate?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!roomId) {
      throw new BadRequestException("초대할 호실을 선택해주세요.");
    }

    this.assertManagerCanAccessRoom(managerId, roomId);

    if (!tenantName) {
      throw new BadRequestException("임차인 이름을 입력해주세요.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("초대 이메일 형식이 올바르지 않습니다.");
    }

    const inviteToken = randomBytes(18).toString("base64url");
    const createdAt = now();
    const invite: TenantInvite = {
      id: id("tinv"),
      inviteToken,
      invitedByManagerId: managerId,
      roomId,
      email,
      tenantName,
      phone,
      moveInDate,
      status: "PENDING",
      signupUrl: `/tenant?inviteToken=${inviteToken}`,
      createdAt
    };

    this.store.tenantInvites.unshift(invite);
    this.persistStore();

    return this.presentTenantInvite(invite);
  }

  listTenantInvites(managerId: string) {
    return this.store.tenantInvites
      .filter((invite) => invite.invitedByManagerId === managerId)
      .map((invite) => this.presentTenantInvite(invite));
  }

  private filteredManagerVendorProfiles(managerId: string, filters: VendorMgmtListFilters = {}) {
    const normalizedQuery = filters.q?.trim().toLowerCase();
    const trade = this.isVendorMgmtTrade(filters.trade) ? filters.trade : undefined;

    return this.store.vendors
      .filter((vendor) => this.canManagerSeeVendor(managerId, vendor))
      .map((vendor) => this.presentManagerVendorProfile(managerId, vendor))
      .filter((vendor) => {
        const matchesQuery =
          !normalizedQuery ||
          vendor.name.toLowerCase().includes(normalizedQuery) ||
          vendor.phone?.toLowerCase().includes(normalizedQuery) ||
          vendor.contactPerson?.toLowerCase().includes(normalizedQuery);
        const matchesTrade = !trade || vendor.trades.includes(trade);

        return matchesQuery && matchesTrade;
      })
      .sort((a, b) => {
        if (filters.sort === "recent") {
          return this.timeOf(b.lastUsedAt) - this.timeOf(a.lastUsedAt);
        }

        const aTrade = trade && a.trades.includes(trade) ? 1 : 0;
        const bTrade = trade && b.trades.includes(trade) ? 1 : 0;

        if (aTrade !== bTrade) return bTrade - aTrade;
        return this.timeOf(b.lastUsedAt) - this.timeOf(a.lastUsedAt);
      });
  }

  private findManagerVendorProfile(managerId: string, vendorId: string) {
    const vendor = this.filteredManagerVendorProfiles(managerId).find((item) => item.id === vendorId);

    if (!vendor) {
      throw new NotFoundException("관리 가능한 업체를 찾을 수 없습니다.");
    }

    return vendor;
  }

  private presentManagerVendorProfile(managerId: string, vendor: VendorSummary) {
    const jobs = this.managerVendorJobRecords(managerId, vendor.id);
    const user = this.store.users.find((account) => account.id === vendor.userId);
    const lastUsedAt = jobs[0]?.completedAt;
    const createdAt = user?.createdAt ?? jobs[jobs.length - 1]?.completedAt ?? now();

    return {
      id: vendor.id,
      name: vendor.businessName,
      trades: this.inferVendorTrades(vendor, jobs),
      status: this.inferVendorStatus(vendor),
      source: jobs.length > 0 ? "auto" : "manual",
      dealCount: jobs.length,
      lastUsedAt,
      isNew: jobs.length <= 1,
      phone: vendor.phone,
      contactPerson: vendor.contactPerson,
      address: vendor.serviceArea,
      memo:
        jobs.length > 0
          ? "완료 수리에서 자동 누적된 업체입니다."
          : "아직 완료 수리 이력이 없는 업체입니다.",
      createdAt,
      updatedAt: lastUsedAt ?? createdAt
    };
  }

  private canManagerSeeVendor(managerId: string, vendor: VendorSummary) {
    if (vendor.createdByManagerId) {
      return vendor.createdByManagerId === managerId || this.managerVendorJobRecords(managerId, vendor.id).length > 0;
    }

    return true;
  }

  private assertLandlord(managerId: string) {
    const manager = this.store.users.find(
      (user) => user.id === managerId && user.role === "LANDLORD"
    );

    if (!manager) {
      throw new ForbiddenException("관리인만 업체 주소록을 수정할 수 있습니다.");
    }
  }

  private normalizeVendorProfileInput(input: ManagerVendorProfileInput) {
    const businessName = input.businessName?.trim();
    const contactPerson = input.contactPerson?.trim();
    const phone = normalizePhoneNumber(input.phone);
    const serviceArea = input.serviceArea?.trim();

    if (!businessName) {
      throw new BadRequestException("업체명을 입력해주세요.");
    }

    if (!contactPerson) {
      throw new BadRequestException("담당자명을 입력해주세요.");
    }

    if (!phone) {
      throw new BadRequestException("업체 연락처를 입력해주세요.");
    }

    if (!serviceArea) {
      throw new BadRequestException("서비스 지역을 입력해주세요.");
    }

    return {
      businessName,
      contactPerson,
      phone,
      serviceArea
    };
  }

  private managerVendorJobRecords(managerId: string, vendorId: string) {
    return this.store.repairs
      .filter((repair) => repair.vendorId === vendorId && repair.status === "COMPLETED")
      .filter((repair) => this.canManagerAccessRoom(managerId, this.findTicket(repair.ticketId).roomId))
      .map((repair) => this.presentManagerVendorJobRecord(repair))
      .sort((a, b) => this.timeOf(b.completedAt) - this.timeOf(a.completedAt));
  }

  private presentManagerVendorJobRecord(repair: RepairRequest) {
    const ticket = this.findTicket(repair.ticketId);
    const room = this.findRoom(ticket.roomId);

    return {
      id: `vjr_${repair.id}`,
      vendorId: repair.vendorId,
      ticketId: ticket.id,
      vendorJobId: repair.id,
      completedAt: repair.completedAt ?? repair.updatedAt,
      unitId: room.roomNo.replace(/호$/u, ""),
      unitMasked: false,
      quoteAmount: repair.estimateAmount,
      responseHours: repair.estimateApprovedAt
        ? this.elapsedHours(repair.createdAt, repair.estimateApprovedAt)
        : undefined,
      rated: false,
      satisfaction: undefined,
      ratedAt: undefined
    };
  }

  private managerVendorPerf(managerId: string, vendorId: string, jobs = this.managerVendorJobRecords(managerId, vendorId)) {
    const ratedJobs = jobs.filter((job) => job.rated && typeof job.satisfaction === "number");
    const completedCount = jobs.length;
    const ratedCount = ratedJobs.length;
    const coverageRatio = completedCount === 0 ? 0 : ratedCount / completedCount;
    const coverageLow = completedCount > 0 && coverageRatio < 0.5;
    const ratingVisible = ratedCount >= VENDOR_PERF_MIN_N && !coverageLow;
    const satisfactionAvg =
      ratingVisible && ratedJobs.length > 0
        ? ratedJobs.reduce((sum, job) => sum + (job.satisfaction ?? 0), 0) / ratedJobs.length
        : undefined;
    const responseHours = jobs
      .map((job) => job.responseHours)
      .filter((value): value is number => typeof value === "number");
    const allQuoteAmounts = this.store.repairs
      .filter((repair) => repair.status === "COMPLETED")
      .filter((repair) => this.canManagerAccessRoom(managerId, this.findTicket(repair.ticketId).roomId))
      .map((repair) => repair.estimateAmount)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const quoteAmounts = jobs
      .map((job) => job.quoteAmount)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const quoteVsAvgPct =
      allQuoteAmounts.length > 0 && quoteAmounts.length > 0
        ? Math.round((this.average(quoteAmounts) / this.average(allQuoteAmounts)) * 100)
        : undefined;

    return {
      vendorId,
      sampleN: ratedCount,
      minN: VENDOR_PERF_MIN_N,
      completedCount,
      ratedCount,
      coverageRatio,
      coverageLow,
      responseMedianHours: this.median(responseHours),
      quoteVsAvgPct,
      satisfactionAvg,
      ratingVisible,
      aiCommentEnabled: ratingVisible,
      aiComment: ratingVisible
        ? {
            summary: `완료 ${completedCount}건 기준으로 산출한 참고용 성과입니다.`,
            basisJobIds: jobs.slice(0, 5).map((job) => job.vendorJobId),
            label: "참고용"
          }
        : undefined,
      mirrorNotice: VENDOR_MIRROR_NOTICE,
      updatedAt: jobs[0]?.completedAt ?? now()
    };
  }

  private inferVendorTrades(vendor: VendorSummary, jobs: { ticketId: string }[]): VendorMgmtTrade[] {
    const text = [
      vendor.businessName,
      vendor.serviceArea,
      ...jobs.map((job) => {
        const ticket = this.findTicket(job.ticketId);
        const complaint = this.findComplaint(ticket.complaintId);
        return `${ticket.category} ${complaint.title} ${complaint.description}`;
      })
    ]
      .join(" ")
      .toLowerCase();
    const trades = new Set<VendorMgmtTrade>();

    if (/누수|배관|수도|하수|욕실|싱크|배수/u.test(text)) trades.add("plumbing");
    if (/방수|물샘|누수/u.test(text)) trades.add("waterproofing");
    if (/전기|조명|콘센트|차단기|배선/u.test(text)) trades.add("electrical");
    if (/에어컨|냉난방|보일러|난방|온수/u.test(text)) trades.add("hvac");
    if (/가전|냉장고|세탁기|전자레인지|인덕션/u.test(text)) trades.add("appliance");
    if (/도어락|열쇠|잠금|문이 안/u.test(text)) trades.add("locksmith");
    if (/청소|소독|폐기/u.test(text)) trades.add("cleaning");

    if (trades.size === 0) trades.add("general");
    return Array.from(trades);
  }

  private inferVendorStatus(vendor: VendorSummary) {
    return /폐업|중단|closed/i.test(vendor.businessName) ? "closed" : "active";
  }

  private isVendorMgmtTrade(value?: string): value is VendorMgmtTrade {
    return Boolean(value && VENDOR_MGMT_TRADES.includes(value as VendorMgmtTrade));
  }

  private presentVendorInvite(invite: VendorInvite) {
    return { ...invite };
  }

  private presentTenantInvite(invite: TenantInvite) {
    const room = this.store.rooms.find((item) => item.id === invite.roomId);

    return {
      ...invite,
      room: room ? { ...room } : undefined
    };
  }
}
