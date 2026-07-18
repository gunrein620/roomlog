// 계약(contract)·문서 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 자기완결(contract* 헬퍼 통째). 공유 헬퍼는 동명 필드로 주입해 본문 verbatim 유지.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { basename, extname } from "node:path";
import { id, now } from "../roomlog-support";
import type { FileStorageAdapter } from "../storage.service";
import type {
  Contract,
  ContractDocument,
  ContractExtraction,
  ContractInvite,
  ContractPrivacy,
  ConnectAcceptedTradeContractInput,
  CreateManagerContractInput,
  CreateManagerContractInviteInput,
  CreateTenantContractInput,
  DeletionState,
  EnsureTradeContractDraftInput,
  ExtractionGroup,
  Room,
  SaveContractDocumentUploadInput,
  UpdateManagerContractInventoryInput,
  UpdateManagerContractInviteInput,
  UpdateManagerContractManualValuesInput,
  UpdateManagerContractPrivacyInput,
  UserAccount
} from "../roomlog.types";
import type {
  ConfirmContractInput,
  ManagerContractOrigin,
  ManagerContractRow,
  Store
} from "../roomlog.service";

const TRADE_ACCEPTANCE_MARKER_CLAUSE = "__roomlog_trade_acceptance__";

type TradeAcceptanceMarker = {
  tradeContractId: string;
  acceptedAt: string;
};

type AcceptedTradeContractPlan = {
  resolved: { room?: Room; unit: string; address: string };
  monthlyRent: number;
  depositKrw: number;
  acceptedAt: string;
  tradeContractId: string;
  contractId: string;
  deterministic?: Contract;
  room: Room;
  active?: Contract;
  activeMarker?: TradeAcceptanceMarker;
  currentRoomId?: string;
  newerCurrent?: Contract;
};

type ContractOcrResult = {
  source: "openai" | "mock";
  summary: string;
  clauseSummary: string;
  highlights: string[];
  items: ContractExtraction["items"];
  helpNotes: ContractExtraction["helpNotes"];
  rawText?: string;
};

type OpenAiContractOcrField = {
  value?: string;
  evidence?: string;
  needsCheck?: boolean;
  masked?: boolean;
};

type OpenAiContractOcrFields = {
  depositBaseAmount?: OpenAiContractOcrField;
  depositConversionAmount?: OpenAiContractOcrField;
  depositFinalAmount?: OpenAiContractOcrField;
  specialTerms?: OpenAiContractOcrField;
  autoRenewal?: OpenAiContractOcrField;
  restorationDuty?: OpenAiContractOcrField;
  repairDuty?: OpenAiContractOcrField;
};

const DOCUMENT_ABSENT_CONTRACT_VALUE = "문서에 없음";
const IMPORTANT_CONTRACT_OCR_LABELS = new Set(["보증금", "특약", "자동연장", "원상복구", "수선 책임"]);
const OPTIONAL_CONTRACT_CLAUSE_LABELS = new Set(["특약", "자동연장", "원상복구", "수선 책임"]);

export class RoomlogContractDomain {
  constructor(
    private readonly store: Store,
    private readonly storageAdapter: FileStorageAdapter,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => Room,
    private readonly canManagerAccessRoom: (managerId: string, roomId: string) => boolean,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void,
    private readonly displayUnitId: (room: Room) => string,
    private readonly timeOf: (iso?: string) => number,
    private readonly elapsedHours: (startIso: string, endIso: string) => number | undefined
  ) {}

  listTenantContracts(tenantId: string): Contract[] {
    return this.tenantContracts(tenantId).map((contract) => this.presentContract(contract));
  }

  getTenantCurrentContract(tenantId: string, selectedRoomId?: string): Contract | null {
    const roomId = selectedRoomId?.trim() || this.store.tenantRooms[tenantId];
    if (!roomId) return null;
    if (!this.canTenantAccessRoom(tenantId, roomId)) return null;

    const room = this.findRoom(roomId);
    const today = this.todayInSeoulKey();
    const score = (contract: Contract) => {
      const unitMatches = this.normalizeUnit(contract.unitId) === this.normalizeUnit(room.roomNo);
      const active = contract.lifecycle === "active" || contract.lifecycle === "expiring_soon";
      const withinTerm =
        Boolean(contract.startDate && contract.startDate.slice(0, 10) <= today) &&
        Boolean(contract.endDate && contract.endDate.slice(0, 10) >= today);

      return (
        (unitMatches ? 100 : 0) +
        (active ? 50 : 0) +
        (withinTerm ? 40 : 0) +
        (contract.review === "confirmed" ? 20 : 0) +
        (contract.valueSource === "confirmed" ? 10 : 0)
      );
    };
    const current = this.tenantContracts(tenantId)
      .filter(
        (contract) =>
          contract.roomId === roomId &&
          (!contract.tenantId || contract.tenantId === tenantId)
      )
      .sort(
        (left, right) =>
          score(right) - score(left) || this.timeOf(right.updatedAt) - this.timeOf(left.updatedAt)
      )[0];

    return current ? this.presentContract(current) : null;
  }

  private canTenantAccessRoom(tenantId: string, roomId: string): boolean {
    return (
      this.store.tenantRooms[tenantId] === roomId ||
      this.tenantContracts(tenantId).some((contract) => contract.roomId === roomId)
    );
  }

  getTenantContract(tenantId: string, contractId: string): Contract {
    return this.presentContract(this.findTenantContract(tenantId, contractId));
  }

  getTenantContractExtraction(tenantId: string, contractId: string): ContractExtraction {
    const contract = this.findTenantContract(tenantId, contractId);

    return this.presentContractExtraction(this.findContractExtraction(contract));
  }

  getTenantContractPrivacy(tenantId: string, contractId: string): ContractPrivacy {
    const contract = this.findTenantContract(tenantId, contractId);

    return this.presentContractPrivacy(this.findContractPrivacy(contract));
  }

  requestTenantContractDeletion(tenantId: string, contractId: string): ContractPrivacy {
    const contract = this.findTenantContract(tenantId, contractId);
    const privacy = this.findContractPrivacy(contract);

    if (!privacy.deletable) {
      throw new BadRequestException("계약 종료 후에만 삭제 요청을 접수할 수 있습니다.");
    }

    contract.deletion = "requested";
    contract.updatedAt = now();
    privacy.deletion = "requested";
    this.persistStore();

    return this.presentContractPrivacy(privacy);
  }

  createTenantContract(tenantId: string, input: CreateTenantContractInput) {
    if (!input.ocrConsent || !input.storageConsent) {
      throw new BadRequestException("OCR 분석과 보관 동의가 모두 필요합니다.");
    }

    const roomId = this.store.tenantRooms[tenantId];
    if (!roomId) {
      throw new NotFoundException("계약서를 등록할 호실을 찾을 수 없습니다.");
    }

    const room = this.findRoom(roomId);
    const existing = this.tenantContracts(tenantId)[0];
    const contract = existing ?? this.createContractRecord({
      room,
      tenantId,
      managerId: room.landlordId,
      unitId: this.displayUnitId(room).replace(/호$/, ""),
      origin: "tenant_upload",
      fileName: input.fileName,
      fileUrl: input.fileUrl
    });

    const document = this.addContractDocument(contract, {
      uploadedByUserId: tenantId,
      origin: "tenant_upload",
      fileName: input.fileName,
      fileUrl: input.fileUrl
    });
    contract.documentId = document.id;
    contract.extractionId = this.ensureContractExtraction(contract).id;
    contract.review = "pending";
    contract.lifecycle = "analyzing";
    contract.updatedAt = now();
    this.ensureContractPrivacy(contract);
    this.persistStore();

    return {
      contract: this.presentContract(contract),
      extraction: this.presentContractExtraction(this.findContractExtraction(contract)),
      privacy: this.presentContractPrivacy(this.findContractPrivacy(contract))
    };
  }

  preflightAcceptedTradeContract(input: ConnectAcceptedTradeContractInput): void {
    this.planAcceptedTradeContract(input);
  }

  connectAcceptedTradeContract(input: ConnectAcceptedTradeContractInput): Contract {
    const {
      resolved,
      monthlyRent,
      depositKrw,
      acceptedAt,
      tradeContractId,
      contractId,
      deterministic,
      room,
      active,
      activeMarker,
      currentRoomId,
      newerCurrent
    } = this.planAcceptedTradeContract(input);

    if (newerCurrent) {
      return this.presentContract(deterministic ?? newerCurrent);
    }

    if (active && !deterministic) {
      const acceptedTime = this.timeOf(acceptedAt);
      if (
        activeMarker &&
        activeMarker.tradeContractId !== tradeContractId &&
        this.timeOf(activeMarker.acceptedAt) > acceptedTime
      ) {
        return this.presentContract(active);
      }
      const hadAcceptedAt = Object.prototype.hasOwnProperty.call(active, "tradeAcceptedAt");
      const previousAcceptedAt = active.tradeAcceptedAt;
      const hadExtractionId = Object.prototype.hasOwnProperty.call(active, "extractionId");
      const previousExtractionId = active.extractionId;
      const extractionCount = this.store.contractExtractions.length;
      const existingExtraction = this.store.contractExtractions.find(
        (item) => item.id === active.extractionId || item.contractId === active.id
      );
      const previousHelpNotes = existingExtraction?.helpNotes;
      const relationChanged = currentRoomId !== room.id;
      const markerChanged =
        activeMarker?.tradeContractId !== tradeContractId ||
        activeMarker?.acceptedAt !== acceptedAt;
      if (!relationChanged && !markerChanged) return this.presentContract(active);

      active.tradeAcceptedAt = acceptedAt;
      const extraction = existingExtraction ?? this.ensureContractExtraction(active);
      this.setTradeAcceptanceMarker(extraction, { tradeContractId, acceptedAt });
      this.store.tenantRooms[input.tenantId] = room.id;
      try {
        this.persistStore();
      } catch (error) {
        if (hadAcceptedAt) active.tradeAcceptedAt = previousAcceptedAt;
        else delete active.tradeAcceptedAt;
        if (existingExtraction) {
          existingExtraction.helpNotes = previousHelpNotes ?? [];
        } else {
          this.store.contractExtractions.splice(extractionCount);
        }
        if (hadExtractionId) active.extractionId = previousExtractionId;
        else delete active.extractionId;
        this.restoreTenantRoom(input.tenantId, currentRoomId);
        throw error;
      }
      return this.presentContract(active);
    }

    if (deterministic) {
      const relationChanged = currentRoomId !== room.id;
      if (!relationChanged) return this.presentContract(deterministic);

      const previousAcceptedAt = deterministic.tradeAcceptedAt;
      deterministic.tradeAcceptedAt ??= acceptedAt;
      this.store.tenantRooms[input.tenantId] = room.id;
      try {
        this.persistStore();
      } catch (error) {
        deterministic.tradeAcceptedAt = previousAcceptedAt;
        this.restoreTenantRoom(input.tenantId, currentRoomId);
        throw error;
      }
      return this.presentContract(deterministic);
    }

    const contract: Contract = {
      id: contractId,
      roomId: room.id,
      tenantId: input.tenantId,
      managerId: input.landlordId,
      unitId: resolved.unit,
      landlordName: typeof input.landlordName === "string" && input.landlordName.trim()
        ? input.landlordName.trim()
        : "관리자",
      lifecycle: "analyzing",
      review: "pending",
      deletion: "none",
      valueSource: "unverified",
      monthlyRent,
      optionInventory: [],
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
      tradeAcceptedAt: acceptedAt
    };
    const extraction = this.createTradeContractExtraction(contract, depositKrw);
    contract.extractionId = extraction.id;
    const privacy = this.createTradeContractPrivacy(contract);
    const roomCount = this.store.rooms.length;
    const contractCount = this.store.contracts.length;
    const extractionCount = this.store.contractExtractions.length;
    const privacyCount = this.store.contractPrivacies.length;

    if (!resolved.room) this.store.rooms.push(room);
    this.store.contracts.push(contract);
    this.store.contractExtractions.push(extraction);
    this.store.contractPrivacies.push(privacy);
    this.store.tenantRooms[input.tenantId] = room.id;
    try {
      this.persistStore();
    } catch (error) {
      this.store.rooms.splice(roomCount);
      this.store.contracts.splice(contractCount);
      this.store.contractExtractions.splice(extractionCount);
      this.store.contractPrivacies.splice(privacyCount);
      this.restoreTenantRoom(input.tenantId, currentRoomId);
      throw error;
    }

    return this.presentContract(contract);
  }

  /**
   * 거래 계약 해지 → 세입자-호실 연결 해제. 계약 레코드는 지우지 않고 expired로만 전환한다
   * (돈/이력 데이터 파괴 금지 — 청구·이력 소비자가 계속 참조할 수 있어야 한다).
   */
  disconnectAcceptedTradeContract(input: { tradeContractId: string; tenantId: string }): void {
    const tradeContractId =
      typeof input.tradeContractId === "string" ? input.tradeContractId.trim() : "";
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
    if (!tradeContractId) {
      throw new BadRequestException("거래 계약 ID를 확인할 수 없습니다.");
    }
    if (!tenantId) {
      throw new BadRequestException("거래 계약 임차인을 확인할 수 없습니다.");
    }

    const contractId = `ct_trade_${tradeContractId}`;
    // 결정적 id(ct_trade_*)로 만들어진 계약 + 기존 활성 계약에 마커만 얹힌 계약 둘 다 커버.
    const targets = this.store.contracts.filter(
      (contract) =>
        contract.tenantId === tenantId &&
        (contract.id === contractId ||
          this.tradeAcceptanceMarker(contract)?.tradeContractId === tradeContractId)
    );

    let changed = false;
    for (const contract of targets) {
      if (contract.lifecycle !== "expired") {
        contract.lifecycle = "expired";
        contract.updatedAt = now();
        changed = true;
      }
      if (this.store.tenantRooms[tenantId] === contract.roomId) {
        delete this.store.tenantRooms[tenantId];
        changed = true;
      }
    }
    if (changed) this.persistStore();
  }

  ensureTradeContractDraft(input: EnsureTradeContractDraftInput): Contract {
    const room = this.findRoom(input.roomId);
    if (room.landlordId !== input.landlordId) {
      throw new ForbiddenException("거래 계약 임대인의 호실만 계약으로 연결할 수 있습니다.");
    }
    const monthlyRent = this.requireNonNegativeInteger(input.monthlyRent, "월세");
    const depositKrw = this.requireNonNegativeInteger(input.depositKrw, "보증금");

    const contractId = `ct_trade_${input.tradeContractId}`;
    const deterministic = this.store.contracts.find((contract) => contract.id === contractId);
    if (
      deterministic &&
      (
        deterministic.roomId !== room.id ||
        deterministic.managerId !== input.landlordId ||
        deterministic.tenantId !== input.tenantId
      )
    ) {
      throw new ConflictException("동일한 거래 계약 ID가 다른 계약 관계에 연결돼 있습니다.");
    }
    const active = this.store.contracts.find(
      (contract) =>
        contract.id !== deterministic?.id &&
        contract.roomId === room.id &&
        contract.lifecycle === "active"
    );
    if (active?.tenantId === input.tenantId) return this.presentContract(active);
    if (active) {
      throw new ConflictException("해당 호실에 다른 임차인의 활성 계약이 있습니다.");
    }
    if (deterministic) {
      return this.presentContract(deterministic);
    }

    const createdAt = now();
    const contract: Contract = {
      id: contractId,
      roomId: room.id,
      tenantId: input.tenantId,
      managerId: input.landlordId,
      unitId: this.displayUnitId(room).replace(/호$/, ""),
      landlordName: input.landlordName.trim() || "관리자",
      lifecycle: "analyzing",
      review: "pending",
      deletion: "none",
      valueSource: "unverified",
      monthlyRent,
      optionInventory: [],
      createdAt,
      updatedAt: createdAt
    };

    this.store.contracts.push(contract);
    const extraction = this.ensureContractExtraction(contract);
    this.upsertExtractionItem(
      extraction,
      "보증금",
      `${depositKrw.toLocaleString("ko-KR")}원`,
      "money",
      false,
      "거래 계약 수락값"
    );
    contract.extractionId = extraction.id;
    this.ensureContractPrivacy(contract);
    this.persistStore();
    return this.presentContract(contract);
  }

  getManagerContractDashboard(managerId: string) {
    const rows = this.managerContracts(managerId).map((contract) =>
      this.buildManagerContractRow(managerId, contract)
    );
    const managedRoomIds = new Set(
      this.store.rooms.filter((room) => room.landlordId === managerId).map((room) => room.id)
    );
    const contractedRoomIds = new Set(rows.map((row) => row.contract.roomId));

    return {
      counts: {
        pending: rows.filter((row) => row.contract.review === "pending").length,
        needsCheck: rows.reduce((sum, row) => sum + row.needsCheckCount, 0),
        slaOverdue: rows.filter((row) => row.slaOverdue).length,
        expiringSoon: rows.filter((row) => row.daysToExpire <= 30).length,
        unregistered: Array.from(managedRoomIds).filter((roomId) => !contractedRoomIds.has(roomId)).length,
        deletionRequests: rows.filter((row) => row.contract.deletion === "requested").length
      },
      rows
    };
  }

  getManagerContractDetail(managerId: string, contractId = "ct_0001") {
    const contract = this.findManagerContract(managerId, contractId);
    const row = this.buildManagerContractRow(managerId, contract);
    const extraction = this.findContractExtraction(contract);
    const privacy = this.findContractPrivacy(contract);
    const room = this.findRoom(contract.roomId);
    const tenant = this.contractTenant(contract);
    const currentDocument = this.currentContractDocument(contract);
    const tenantName = tenant?.name ?? row.tenantName;
    const deletionRequests = this.managerContracts(managerId)
      .filter((item) => item.deletion === "requested")
      .map((item) => {
        const itemPrivacy = this.findContractPrivacy(item);

        return {
          id: `del_${item.id}`,
          contractId: item.id,
          unitId: item.unitId,
          tenantName: this.contractTenant(item)?.name ?? "미연결 임차인",
          requestedAt: item.updatedAt,
          slaHours: itemPrivacy.deletionSlaHours ?? 72,
          state: itemPrivacy.deletion,
          retentionNote: itemPrivacy.deletable
            ? "계약 종료 후 삭제 요청입니다. 제한 보관 예외 항목을 확인하세요."
            : "계약 유효 중이라 정산·분쟁 예외 항목을 먼저 확인해야 합니다."
        };
      });

    return {
      row,
      currentDocument,
      extraction: this.presentContractExtraction(extraction),
      privacy: this.presentContractPrivacy(privacy),
      tenant: {
        name: tenantName,
        phone: tenant?.phone ?? "010-****-0000",
        moveInDate: contract.startDate?.slice(0, 10) ?? "미등록",
        residentState: contract.lifecycle === "expired" ? "퇴실" : "거주 중"
      },
      manualValues: {
        deposit: this.extractionValue(extraction, "보증금") ?? "",
        rent: contract.monthlyRent !== undefined
          ? `${contract.monthlyRent.toLocaleString("ko-KR")}원`
          : "관리자 수동값 없음",
        maintenanceFee: contract.maintenanceFee !== undefined
          ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원`
          : "관리자 수동값 없음",
        paymentDay: contract.paymentDay ? `매월 ${contract.paymentDay}일` : "관리자 수동값 없음",
        account: this.extractionValue(extraction, "임대인 계좌") ?? "",
        specialTerms: this.extractionValue(extraction, "특약") ?? "",
        autoRenewal: this.extractionValue(extraction, "자동연장") ?? "",
        restorationDuty: this.extractionValue(extraction, "원상복구") ?? "",
        repairDuty: this.extractionValue(extraction, "수선 책임") ?? ""
      },
      inventory: contract.optionInventory?.length
        ? [...contract.optionInventory]
        : ["에어컨", "세탁기", "냉장고", "인덕션", "블라인드"],
      timeline: this.contractTimeline(contract, room),
      auditLogs: this.contractAuditLogs(contract, extraction),
      deletionRequests,
      inviteLinks: this.contractInviteLinks(managerId, contract.id),
      conflictCandidates: this.contractConflictCandidates(contract)
    };
  }

  confirmManagerContractReview(
    managerId: string,
    contractId: string,
    input: ConfirmContractInput = {}
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const storedExtraction = this.store.contractExtractions.find(
      (item) => item.id === contract.extractionId || item.contractId === contract.id
    );
    const extraction = storedExtraction ?? this.findContractExtraction(contract);
    const needsCheck = this.contractReviewExtractionItems(extraction.items).filter((item) => item.needsCheck);

    if (needsCheck.length > 0 && input.confirmNeedsCheck !== true) {
      throw new BadRequestException("확인 필요 항목을 원문과 대조했다는 확인이 필요합니다.");
    }

    const monthlyRent = contract.monthlyRent === undefined
      ? undefined
      : this.requireNonNegativeInteger(contract.monthlyRent, "월세");
    const maintenanceFee = contract.maintenanceFee === undefined
      ? undefined
      : this.requireNonNegativeInteger(contract.maintenanceFee, "관리비");

    const startDateKey = contract.startDate
      ? this.contractDateKey(contract.startDate, "계약 시작일")
      : undefined;
    const endDateKey = contract.endDate
      ? this.contractDateKey(contract.endDate, "계약 종료일")
      : undefined;
    if (startDateKey && endDateKey && this.timeOf(endDateKey) < this.timeOf(startDateKey)) {
      throw new BadRequestException("계약 종료일은 시작일보다 빠를 수 없습니다.");
    }
    if (endDateKey && endDateKey < this.todayInSeoulKey()) {
      throw new BadRequestException("이미 종료된 계약은 활성화할 수 없습니다.");
    }

    if (monthlyRent !== undefined && maintenanceFee !== undefined) {
      const totalAmount = monthlyRent + maintenanceFee;
      if (!Number.isSafeInteger(totalAmount)) {
        throw new BadRequestException("월세와 관리비 합계는 안전한 원 단위 정수여야 합니다.");
      }
    }
    if (contract.paymentDay !== undefined) {
      this.requirePaymentDay(contract.paymentDay);
    }

    const previousContract = {
      lifecycle: contract.lifecycle,
      review: contract.review,
      valueSource: contract.valueSource,
      confirmedAt: contract.confirmedAt,
      confirmedByManagerId: contract.confirmedByManagerId,
      updatedAt: contract.updatedAt,
      extractionId: contract.extractionId
    };
    const previousExtraction = {
      confirmed: extraction.confirmed,
      needsCheck: extraction.items.map((item) => item.needsCheck)
    };

    if (!storedExtraction) {
      this.store.contractExtractions.push(extraction);
      contract.extractionId = extraction.id;
    }
    contract.lifecycle = "active";
    contract.review = "confirmed";
    contract.valueSource = "confirmed";
    contract.confirmedAt = now();
    contract.confirmedByManagerId = managerId;
    contract.updatedAt = contract.confirmedAt;
    extraction.confirmed = true;
    extraction.items.forEach((item) => {
      item.needsCheck = false;
    });
    try {
      this.persistStore();
    } catch (error) {
      contract.lifecycle = previousContract.lifecycle;
      contract.review = previousContract.review;
      contract.valueSource = previousContract.valueSource;
      contract.updatedAt = previousContract.updatedAt;
      if (previousContract.confirmedAt === undefined) delete contract.confirmedAt;
      else contract.confirmedAt = previousContract.confirmedAt;
      if (previousContract.confirmedByManagerId === undefined) delete contract.confirmedByManagerId;
      else contract.confirmedByManagerId = previousContract.confirmedByManagerId;
      if (previousContract.extractionId === undefined) delete contract.extractionId;
      else contract.extractionId = previousContract.extractionId;
      extraction.confirmed = previousExtraction.confirmed;
      extraction.items.forEach((item, index) => {
        item.needsCheck = previousExtraction.needsCheck[index] ?? item.needsCheck;
      });
      if (!storedExtraction) {
        const extractionIndex = this.store.contractExtractions.indexOf(extraction);
        if (extractionIndex >= 0) this.store.contractExtractions.splice(extractionIndex, 1);
      }
      throw error;
    }

    return this.getManagerContractDetail(managerId, contract.id);
  }

  requestManagerContractInfo(managerId: string, contractId: string) {
    const contract = this.findManagerContract(managerId, contractId);

    contract.review = "info_requested";
    contract.updatedAt = now();
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  async runManagerContractOcr(managerId: string, contractId: string) {
    const contract = this.findManagerContract(managerId, contractId);
    const extraction = this.ensureContractExtraction(contract);
    const room = this.findRoom(contract.roomId);
    const document = this.currentContractDocument(contract);
    const executedAt = now();
    const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
    let openAiFailureReason: string | undefined;
    const openAiResult = openAiApiKey
      ? await this.runOpenAiContractOcr(managerId, contract, extraction, room, document, openAiApiKey).catch((error) => {
          openAiFailureReason = this.openAiOcrFailureReason(error);
          return undefined;
        })
      : undefined;
    const result =
      openAiResult ??
      this.buildMockContractOcrResult(
        contract,
        extraction,
        room,
        document,
        openAiApiKey
          ? `OpenAI OCR 호출에 실패했습니다.${openAiFailureReason ? ` (${openAiFailureReason})` : ""}`
          : "OPENAI_API_KEY가 없어 실제 OCR을 실행하지 못했습니다."
      );

    this.applyContractOcrResult(contract, extraction, result, executedAt);
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  private openAiOcrFailureReason(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim().slice(0, 180);
    }

    return "원인 미상";
  }

  private buildMockContractOcrResult(
    _contract: Contract,
    _extraction: ContractExtraction,
    _room: Room,
    document: ContractDocument | undefined,
    summary: string
  ): ContractOcrResult {
    const missingItem = (label: string, group: ExtractionGroup, masked = false) => ({
      label,
      value: "미확인",
      group,
      needsCheck: true,
      masked,
      evidence: "실제 OCR 실패/미설정으로 원문에서 값을 추출하지 못했습니다."
    });

    return {
      source: "mock",
      summary,
      clauseSummary: "OCR 실패로 특약성 조항 확인 필요",
      highlights: [
        `${summary} · ${document?.fileName ?? "계약서 원본"} 기준`,
        "실제 OCR 값은 추출되지 않았습니다.",
        "보증금과 특약성 조항은 원문 확인 후 수동 입력으로 보강하세요."
      ],
      helpNotes: [
        {
          clause: "OCR 실행 실패",
          plain: "OpenAI 키가 없거나 OCR 호출이 실패해 원문에서 계약값을 읽지 못했습니다.",
          source: "M-DOC-01 OCR 실행"
        },
        {
          clause: "관리자 확정 필요",
          plain: "계약서 원문을 보며 보증금과 특약성 조항을 직접 입력한 뒤 확정해야 합니다.",
          source: "계약서 검토 워크플로"
        }
      ],
      items: [
        missingItem("보증금", "money"),
        missingItem("특약", "responsibility"),
        missingItem("자동연장", "term"),
        missingItem("원상복구", "responsibility"),
        missingItem("수선 책임", "responsibility")
      ]
    };
  }

  private applyContractOcrResult(
    contract: Contract,
    extraction: ContractExtraction,
    result: ContractOcrResult,
    executedAt: string
  ) {
    const sourceLine =
      result.source === "openai"
        ? `실제 OCR 완료 · ${result.summary}`
        : `실제 OCR 실패 · ${result.summary}`;

    extraction.confirmed = false;
    extraction.createdAt = executedAt;
    extraction.highlights = [
      sourceLine,
      ...result.highlights.filter(Boolean)
    ].slice(0, 6);
    extraction.clauseSummary = result.clauseSummary || this.buildContractClauseSummary(result.items);
    extraction.helpNotes = result.helpNotes.length
      ? result.helpNotes
      : [
          {
            clause: "관리자 확정 필요",
            plain: "OCR 결과는 자동 확정되지 않습니다. 원문과 대조한 뒤 확정하세요.",
            source: "M-DOC-01 OCR 실행"
          }
        ];

    this.keepContractReviewExtractionItems(extraction);
    result.items.slice(0, 16).forEach((item) => this.setOcrExtractionItem(extraction, item, result.source));
    if (result.source === "openai") {
      this.markMissingOptionalClausesAsDocumentAbsent(extraction, result.items);
    }

    contract.review = "pending";
    if (contract.lifecycle === "unregistered") {
      contract.lifecycle = "analyzing";
    }
    contract.valueSource = "unverified";
    contract.updatedAt = executedAt;
  }

  private async runOpenAiContractOcr(
    managerId: string,
    contract: Contract,
    extraction: ContractExtraction,
    room: Room,
    document: ContractDocument | undefined,
    openAiApiKey: string
  ): Promise<ContractOcrResult | undefined> {
    if (!document?.fileName) return undefined;

    const bytes = await this.readContractDocumentBytes(document);
    if (!bytes) return undefined;

    const mimeType = this.contractDocumentMimeType(document.fileName);
    const documentPart = this.openAiContractDocumentPart(document, bytes, mimeType);
    if (!documentPart) return undefined;

    const model = process.env.OPENAI_CONTRACT_OCR_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.6";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": `contract-ocr-${managerId}-${contract.id}`
      },
      body: JSON.stringify({
        model,
        instructions: [
          "너는 한국 주택 임대차 계약서 OCR 검토 보조자다.",
          "계약서 이미지나 PDF에서 보증금, 특약, 자동연장, 원상복구, 수선 책임처럼 원문 확인이 중요한 항목만 추출한다.",
          "복합 금액은 한 문장으로 뭉치지 말고 기본 금액, 전환 금액, 최종 금액처럼 세부 필드로 나누어 판단한다.",
          "월세, 관리비, 납부일, 주소, 계약 기간, 계좌처럼 DB에 이미 있는 매물·계약 기본값은 추출 대상에서 제외한다.",
          "불확실하거나 원문 재확인이 필요한 항목은 needsCheck를 true로 둔다.",
          "특약, 자동연장, 원상복구, 수선 책임 조항이 원문에 명시되어 있지 않으면 value를 '문서에 없음', needsCheck를 false로 둔다.",
          "clauseSummary에는 특약, 자동연장, 원상복구, 수선 책임만 대상으로 대시보드에 바로 보여줄 60자 이내 한 줄 요약을 넣는다.",
          "특약성 조항이 모두 원문에 없으면 clauseSummary는 '특약성 조항 없음'으로 둔다.",
          "문서가 흐리거나 일부 영역을 읽지 못해 없는지 판단할 수 없을 때만 value를 빈 문자열로 두고 needsCheck를 true로 둔다.",
          "반드시 한국어 JSON만 반환한다."
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: this.contractOcrPrompt(contract, extraction, room, document)
              },
              documentPart
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "roomlog_contract_ocr",
            strict: true,
            schema: this.contractOcrJsonSchema()
          }
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const detail = errorBody.trim().replace(/\s+/g, " ").slice(0, 260);
      throw new Error(
        `OpenAI contract OCR failed with ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawText = this.extractOpenAiResponseText(payload);
    const parsed = this.parseOpenAiContractOcr(rawText);

    if (parsed.items.length === 0) {
      throw new Error("OpenAI contract OCR returned no items");
    }

    return {
      source: "openai",
      summary: parsed.summary || `${document.fileName}에서 계약 핵심 항목을 추출했습니다.`,
      clauseSummary: parsed.clauseSummary,
      highlights: parsed.highlights,
      items: parsed.items,
      helpNotes: parsed.helpNotes,
      rawText
    };
  }

  createManagerContract(managerId: string, input: CreateManagerContractInput) {
    const room = this.findManagerRoom(managerId, input.roomId, input.unitId);
    const unitId = input.unitId?.trim() || this.displayUnitId(room).replace(/호$/, "");
    const contract =
      this.managerContracts(managerId).find((item) => item.roomId === room.id && item.unitId === unitId) ??
      this.createContractRecord({
        room,
        tenantId: input.tenantId,
        managerId,
        unitId,
        origin: "manager_upload",
        fileName: input.fileName,
        fileUrl: input.fileUrl
      });

    contract.managerId = managerId;
    contract.tenantId = input.tenantId ?? contract.tenantId;
    contract.monthlyRent = this.positiveInteger(input.monthlyRent) ?? contract.monthlyRent;
    contract.maintenanceFee = this.positiveInteger(input.maintenanceFee) ?? contract.maintenanceFee;
    contract.paymentDay = this.paymentDay(input.paymentDay) ?? contract.paymentDay;
    contract.startDate = input.startDate || contract.startDate;
    contract.endDate = input.endDate || contract.endDate;
    contract.review = "pending";
    contract.lifecycle = "analyzing";
    contract.updatedAt = now();

    const document = this.addContractDocument(contract, {
      uploadedByUserId: managerId,
      origin: "manager_upload",
      fileName: input.fileName,
      fileUrl: input.fileUrl
    });
    contract.documentId = document.id;
    contract.extractionId = this.ensureContractExtraction(contract).id;
    this.ensureContractPrivacy(contract);

    if (input.tenantName?.trim()) {
      this.upsertContractInvite(contract, managerId, {
        tenantName: input.tenantName.trim(),
        email: undefined,
        phone: undefined
      });
    }

    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  async saveManagerContractUpload(managerId: string, input: SaveContractDocumentUploadInput) {
    const user = this.store.users.find((account) => account.id === managerId);

    if (!user) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    if (!input.buffer.length) {
      throw new BadRequestException("업로드할 계약서 파일이 비어 있습니다.");
    }

    if (input.buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException("계약서는 20MB 이하만 업로드할 수 있습니다.");
    }

    const mimeType = input.mimeType || "application/octet-stream";
    if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
      throw new BadRequestException("계약서는 PDF 또는 이미지 파일만 업로드할 수 있습니다.");
    }

    const uploadId = id("cdocu");
    const safeBaseName =
      basename(input.originalName, extname(input.originalName))
        .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "contract";
    const fileName = `${uploadId}-${safeBaseName}${this.contractDocumentExtension(mimeType, input.originalName)}`;
    const storedFile = await this.storageAdapter.save({
      buffer: input.buffer,
      fileName,
      mimeType
    });

    return {
      fileName: storedFile.fileName,
      fileUrl: storedFile.fileUrl,
      mimeType,
      sizeBytes: input.buffer.length
    };
  }

  updateManagerContractManualValues(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractManualValuesInput
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const deposit = this.optionalManualText(input.deposit, "보증금");
    const specialTerms = this.optionalManualText(input.specialTerms, "특약");
    const autoRenewal = this.optionalManualText(input.autoRenewal, "자동연장");
    const restorationDuty = this.optionalManualText(input.restorationDuty, "원상복구");
    const repairDuty = this.optionalManualText(input.repairDuty, "수선 책임");
    if (input.account !== undefined) this.optionalManualText(input.account, "임대인 계좌");
    const monthlyRent = this.optionalNonNegativeInteger(input.monthlyRent, "월세");
    const maintenanceFee = this.optionalNonNegativeInteger(input.maintenanceFee, "관리비");
    const paymentDay = input.paymentDay === undefined
      ? undefined
      : this.requirePaymentDay(input.paymentDay);
    const startDate = input.startDate === undefined
      ? undefined
      : this.optionalContractDate(input.startDate, "계약 시작일");
    const endDate = input.endDate === undefined
      ? undefined
      : this.optionalContractDate(input.endDate, "계약 종료일");
    const extraction = this.ensureContractExtraction(contract);
    this.keepContractReviewExtractionItems(extraction);

    if (input.monthlyRent !== undefined) contract.monthlyRent = monthlyRent;
    if (input.maintenanceFee !== undefined) contract.maintenanceFee = maintenanceFee;
    if (input.paymentDay !== undefined) contract.paymentDay = paymentDay;
    if (input.startDate !== undefined) contract.startDate = startDate;
    if (input.endDate !== undefined) contract.endDate = endDate;
    contract.valueSource = "manual";
    contract.updatedAt = now();

    this.upsertExtractionItem(extraction, "보증금", deposit, "money");
    this.upsertExtractionItem(extraction, "특약", specialTerms, "responsibility");
    this.upsertExtractionItem(extraction, "자동연장", autoRenewal, "term");
    this.upsertExtractionItem(extraction, "원상복구", restorationDuty, "responsibility");
    this.upsertExtractionItem(extraction, "수선 책임", repairDuty, "responsibility");
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  updateManagerContractInventory(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractInventoryInput
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const items = Array.from(
      new Set(input.items.map((item) => item.trim()).filter(Boolean))
    ).slice(0, 30);

    contract.optionInventory = items;
    contract.updatedAt = now();
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  createManagerContractInvite(
    managerId: string,
    contractId: string,
    input: CreateManagerContractInviteInput
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const invite = this.upsertContractInvite(contract, managerId, input);

    this.persistStore();

    return {
      invite: { ...invite },
      detail: this.getManagerContractDetail(managerId, contract.id)
    };
  }

  updateManagerContractInvite(
    managerId: string,
    inviteId: string,
    input: UpdateManagerContractInviteInput
  ) {
    const invite = this.store.contractInvites.find(
      (item) => item.id === inviteId && item.invitedByManagerId === managerId
    );

    if (!invite) {
      throw new NotFoundException("관리 가능한 계약 초대를 찾을 수 없습니다.");
    }

    const contract = this.findManagerContract(managerId, invite.contractId);
    invite.state = input.state;
    invite.audit = input.note?.trim() || this.inviteAuditLabel(input.state);

    if (input.state === "connected") {
      const tenant = this.findTenantForInvite(invite);
      invite.acceptedAt = now();
      invite.acceptedByUserId = tenant?.id;
      contract.tenantId = tenant?.id ?? contract.tenantId;
      if (tenant) {
        this.store.tenantRooms[tenant.id] = contract.roomId;
      }
    }

    contract.updatedAt = now();
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  updateManagerContractPrivacy(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractPrivacyInput
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const privacy = this.ensureContractPrivacy(contract);

    if (input.maskingEnabled !== undefined) privacy.maskingEnabled = input.maskingEnabled;
    if (input.forwardingConsent !== undefined) privacy.forwardingConsent = input.forwardingConsent;
    if (input.retentionNote?.trim()) {
      privacy.retention = [
        ...privacy.retention,
        {
          label: "관리자 보관 사유",
          reason: input.retentionNote.trim(),
          until: contract.lifecycle === "expired" ? "계약 종료 후 5년 이내" : "계약 유효 기간 및 정산 종료까지"
        }
      ];
    }

    contract.updatedAt = now();
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  decideManagerContractDeletion(
    managerId: string,
    contractId: string,
    state: DeletionState,
    retentionNote?: string
  ) {
    if (!["completed", "limited", "denied"].includes(state)) {
      throw new BadRequestException("삭제 처리 결과는 완료, 제한 보관, 삭제 불가 중 하나여야 합니다.");
    }

    const contract = this.findManagerContract(managerId, contractId);
    const privacy = this.findContractPrivacy(contract);

    contract.deletion = state;
    contract.updatedAt = now();
    privacy.deletion = state;

    if (retentionNote?.trim()) {
      privacy.retention = [
        ...privacy.retention,
        {
          label: "관리자 처리 메모",
          reason: retentionNote.trim(),
          until: state === "completed" ? "삭제 완료 시점" : "예외 보관 만료 시"
        }
      ];
    }

    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  private tenantContracts(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    return this.store.contracts
      .filter((contract) => contract.tenantId === tenantId || contract.roomId === roomId)
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt));
  }

  private managerContracts(managerId: string) {
    return this.store.contracts
      .filter((contract) => this.canManagerAccessRoom(managerId, contract.roomId))
      .sort((a, b) => this.timeOf(b.updatedAt) - this.timeOf(a.updatedAt));
  }

  private findTenantContract(tenantId: string, contractId: string) {
    const contract = this.tenantContracts(tenantId).find(
      (item) => item.id === contractId || item.unitId === contractId
    );

    if (!contract) {
      throw new NotFoundException("조회 가능한 계약서를 찾을 수 없습니다.");
    }

    return contract;
  }

  private findManagerContract(managerId: string, contractId: string) {
    const contract = this.managerContracts(managerId).find(
      (item) => item.id === contractId || item.unitId === contractId
    );

    if (!contract) {
      throw new NotFoundException("관리 가능한 계약서를 찾을 수 없습니다.");
    }

    return contract;
  }

  private findContractExtraction(contract: Contract): ContractExtraction {
    const extraction = this.store.contractExtractions.find(
      (item) => item.id === contract.extractionId || item.contractId === contract.id
    );

    if (!extraction) {
      if (contract.id.startsWith("ct_trade_")) {
        return this.createTradeContractExtraction(contract);
      }
      return {
        id: `cx_${contract.id}`,
        contractId: contract.id,
        confirmed: contract.review === "confirmed",
        highlights: ["계약서 추출 결과가 아직 없습니다."],
        items: [],
        helpNotes: [],
        createdAt: contract.updatedAt
      };
    }

    return extraction;
  }

  private findContractPrivacy(contract: Contract): ContractPrivacy {
    const privacy = this.store.contractPrivacies.find((item) => item.contractId === contract.id);

    if (!privacy) {
      if (contract.id.startsWith("ct_trade_")) {
        return this.createTradeContractPrivacy(contract);
      }
      return {
        contractId: contract.id,
        maskingEnabled: true,
        retention: [
          { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" }
        ],
        forwardingConsent: false,
        deletion: contract.deletion,
        deletionSlaHours: 72,
        deletable: contract.lifecycle === "expired"
      };
    }

    return privacy;
  }

  private ensureContractExtraction(contract: Contract): ContractExtraction {
    const existing = this.store.contractExtractions.find(
      (item) => item.id === contract.extractionId || item.contractId === contract.id
    );

    if (existing) return existing;

    if (contract.id.startsWith("ct_trade_")) {
      const extraction = this.createTradeContractExtraction(contract);
      this.store.contractExtractions.push(extraction);
      contract.extractionId = extraction.id;
      return extraction;
    }

    const createdAt = now();
    const extraction: ContractExtraction = {
      id: id("cx"),
      contractId: contract.id,
      confirmed: contract.review === "confirmed",
      highlights: [
        "새 계약서가 등록되었습니다. 원문 대조 후 확정하세요.",
        "매물 DB 기본값은 그대로 두고 보증금·특약성 조항만 검토합니다.",
        "계약서 원문 확인이 필요한 핵심 항목은 관리자 확정 전까지 참고본입니다."
      ],
      items: [
        { label: "보증금", value: "원문 확인 필요", group: "money", needsCheck: true },
        { label: "특약", value: "원문 확인 필요", group: "responsibility", needsCheck: true },
        { label: "자동연장", value: "원문 확인 필요", group: "term", needsCheck: true },
        { label: "원상복구", value: "원문 확인 필요", group: "responsibility", needsCheck: true },
        { label: "수선 책임", value: "원문 확인 필요", group: "responsibility", needsCheck: true }
      ],
      helpNotes: [
        {
          clause: "관리자 확정 전 참고본",
          plain: "OCR이나 수동 입력값은 관리자 확정 전까지 참고용입니다.",
          source: "M-DOC-01 확정 게이트"
        }
      ],
      createdAt
    };

    this.store.contractExtractions.push(extraction);
    contract.extractionId = extraction.id;

    return extraction;
  }

  private ensureContractPrivacy(contract: Contract): ContractPrivacy {
    const existing = this.store.contractPrivacies.find((item) => item.contractId === contract.id);
    if (existing) return existing;

    if (contract.id.startsWith("ct_trade_")) {
      const privacy = this.createTradeContractPrivacy(contract);
      this.store.contractPrivacies.push(privacy);
      return privacy;
    }

    const privacy: ContractPrivacy = {
      contractId: contract.id,
      maskingEnabled: true,
      retention: [
        { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" },
        { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" }
      ],
      forwardingConsent: false,
      deletion: contract.deletion,
      deletionSlaHours: 72,
      deletable: contract.lifecycle === "expired"
    };

    this.store.contractPrivacies.push(privacy);

    return privacy;
  }

  private createTradeContractExtraction(
    contract: Contract,
    depositKrw?: number
  ): ContractExtraction {
    const extraction: ContractExtraction = {
      id: id("cx"),
      contractId: contract.id,
      confirmed: contract.review === "confirmed",
      highlights: [
        "거래 계약 수락 조건으로 생성한 관리자 검토 초안입니다.",
        "매물 DB 기본값은 그대로 두고 보증금·특약성 조항만 검토합니다.",
        "계약서 원문 확인이 필요한 핵심 항목은 관리자 확정 전까지 참고본입니다."
      ],
      items: [
        {
          label: "보증금",
          value: depositKrw !== undefined ? `${depositKrw.toLocaleString("ko-KR")}원` : "미확인",
          group: "money",
          needsCheck: true,
          evidence: "거래 계약 수락 조건"
        },
        {
          label: "특약",
          value: "미확인",
          group: "responsibility",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "자동연장",
          value: "미확인",
          group: "term",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "원상복구",
          value: "미확인",
          group: "responsibility",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "수선 책임",
          value: "미확인",
          group: "responsibility",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        }
      ],
      helpNotes: [
        {
          clause: "거래 수락 조건 검토",
          plain: "당사자가 수락한 거래 조건도 관리자가 확인하고 확정하기 전에는 참고용입니다.",
          source: "거래 계약 수락 이벤트"
        }
      ],
      createdAt: contract.tradeAcceptedAt ?? contract.createdAt
    };

    return extraction;
  }

  private createTradeContractPrivacy(contract: Contract): ContractPrivacy {
    return {
      contractId: contract.id,
      maskingEnabled: true,
      retention: [
        {
          label: "거래 계약 수락 조건·관리자 확정값",
          reason: "정산·분쟁 대비",
          until: "계약 종료 후 5년"
        },
        { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" }
      ],
      forwardingConsent: false,
      deletion: contract.deletion,
      deletionSlaHours: 72,
      deletable: contract.lifecycle === "expired"
    };
  }

  private findManagerRoom(managerId: string, roomId?: string, unitId?: string) {
    const candidates = this.store.rooms.filter((room) => this.canManagerAccessRoom(managerId, room.id));
    const room =
      candidates.find((item) => item.id === roomId) ??
      candidates.find((item) => item.roomNo === unitId || this.displayUnitId(item).replace(/호$/, "") === unitId) ??
      candidates[0];

    if (!room) {
      throw new NotFoundException("관리 가능한 호실을 찾을 수 없습니다.");
    }

    this.assertManagerCanAccessRoom(managerId, room.id);

    return room;
  }

  private createContractRecord({
    room,
    tenantId,
    managerId,
    unitId,
    origin,
    fileName,
    fileUrl
  }: {
    room: Room;
    tenantId?: string;
    managerId?: string;
    unitId: string;
    origin: "tenant_upload" | "manager_upload" | "manual";
    fileName?: string;
    fileUrl?: string;
  }) {
    const createdAt = now();
    const contract: Contract = {
      id: id("ct"),
      roomId: room.id,
      tenantId,
      managerId,
      unitId,
      landlordName: this.store.users.find((user) => user.id === (managerId ?? room.landlordId))?.name ?? "관리자",
      lifecycle: "analyzing",
      review: "pending",
      deletion: "none",
      valueSource: origin === "manual" ? "manual" : "unverified",
      optionInventory: [],
      createdAt,
      updatedAt: createdAt
    };

    this.store.contracts.push(contract);
    const document = this.addContractDocument(contract, {
      uploadedByUserId: tenantId ?? managerId,
      origin,
      fileName,
      fileUrl
    });
    contract.documentId = document.id;
    contract.extractionId = this.ensureContractExtraction(contract).id;
    this.ensureContractPrivacy(contract);

    return contract;
  }

  private addContractDocument(
    contract: Contract,
    input: {
      uploadedByUserId?: string;
      origin: "tenant_upload" | "manager_upload" | "manual";
      fileName?: string;
      fileUrl?: string;
    }
  ): ContractDocument {
    const uploadedAt = now();
    const document: ContractDocument = {
      id: id("cdoc"),
      contractId: contract.id,
      uploadedByUserId: input.uploadedByUserId,
      origin: input.origin,
      fileName: input.fileName?.trim() || "contract.pdf",
      fileUrl: input.fileUrl?.trim() || `/uploads/${contract.id}.pdf`,
      uploadedAt
    };

    this.store.contractDocuments.push(document);

    return document;
  }

  private upsertContractInvite(
    contract: Contract,
    managerId: string,
    input: CreateManagerContractInviteInput
  ): ContractInvite {
    const tenantName = input.tenantName?.trim();
    if (!tenantName) {
      throw new BadRequestException("초대할 임차인 이름이 필요합니다.");
    }

    const existing = this.store.contractInvites.find(
      (item) => item.contractId === contract.id && item.tenantName === tenantName
    );
    const inviteToken = existing?.inviteToken ?? id("cinv").replace(/^cinv_/, "");
    const invite: ContractInvite = existing ?? {
      id: id("cinv"),
      contractId: contract.id,
      roomId: contract.roomId,
      inviteToken,
      invitedByManagerId: managerId,
      tenantName,
      state: "waiting",
      signupUrl: `/signup?role=TENANT&inviteToken=${inviteToken}`,
      audit: "초대 링크 생성",
      createdAt: now()
    };

    invite.email = input.email?.trim() || invite.email;
    invite.phone = input.phone?.trim() || invite.phone;
    invite.audit = "초대 링크 생성";

    if (!existing) this.store.contractInvites.push(invite);

    return invite;
  }

  private upsertExtractionItem(
    extraction: ContractExtraction,
    label: string,
    value: string | undefined,
    group: ExtractionGroup,
    masked = false,
    evidence = "관리자 수동 입력"
  ) {
    const nextValue = value?.trim();
    if (!nextValue) return;

    const existing = extraction.items.find((item) => item.label === label);
    if (existing) {
      existing.value = nextValue;
      existing.group = group;
      existing.masked = masked || existing.masked;
      existing.needsCheck = true;
      existing.evidence = "관리자 수동 입력";
      return;
    }

    extraction.items.push({
      label,
      value: nextValue,
      group,
      needsCheck: true,
      masked,
      evidence
    });
  }

  private setExtractionItem(
    extraction: ContractExtraction,
    item: ContractExtraction["items"][number]
  ) {
    const index = extraction.items.findIndex((existing) => existing.label === item.label);

    if (index >= 0) {
      extraction.items[index] = {
        ...extraction.items[index],
        ...item
      };
      return;
    }

    extraction.items.push(item);
  }

  private setOcrExtractionItem(
    extraction: ContractExtraction,
    item: ContractExtraction["items"][number],
    source: ContractOcrResult["source"] = "openai"
  ) {
    const existing = extraction.items.find((candidate) => candidate.label === item.label);

    if (
      existing &&
      this.isMissingExtractionValue(item.value) &&
      !this.isMissingExtractionValue(existing.value) &&
      (source === "openai" || !this.isMockExtractionEvidence(existing.evidence))
    ) {
      this.setExtractionItem(extraction, {
        ...item,
        value: existing.value,
        needsCheck: true,
        masked: item.masked || existing.masked,
        evidence: item.evidence
          ? `${item.evidence} · OCR 미확인으로 기존 저장값 유지`
          : "OCR 미확인으로 기존 저장값 유지"
      });
      return;
    }

    this.setExtractionItem(extraction, item);
  }

  private isMissingExtractionValue(value?: string) {
    const normalized = value?.trim();
    return !normalized || normalized === "미확인" || normalized === "원문 확인 필요" || normalized === "관리자 수동값 없음";
  }

  private contractReviewExtractionItems(items: ContractExtraction["items"]) {
    return items.filter((item) => IMPORTANT_CONTRACT_OCR_LABELS.has(item.label));
  }

  private keepContractReviewExtractionItems(extraction: ContractExtraction) {
    extraction.items = this.contractReviewExtractionItems(extraction.items);
  }

  private isMockExtractionEvidence(evidence?: string) {
    return /mock OCR|OCR 미확인으로 기존 (?:DB 계약값|저장값) 유지|실제 OCR 실패\/미설정/i.test(evidence ?? "");
  }

  // 통합 계정 모델: 초대는 "기존 로그인 계정에 관계를 붙이는 루트"이므로
  // 이메일/휴대폰 같은 강한 식별자는 role과 무관하게 매칭한다.
  // 이름 단독 일치는 약한 신호라 이미 임차 관계가 있는 계정으로 한정(오연결 방지).
  private findTenantForInvite(invite: ContractInvite) {
    return this.store.users.find((user) => {
      if (invite.email && user.email === invite.email) return true;
      if (invite.phone && user.phone === invite.phone) return true;
      return Boolean(this.store.tenantRooms[user.id]) && user.name === invite.tenantName;
    });
  }

  private inviteAuditLabel(state: "waiting" | "connected" | "disputed") {
    if (state === "connected") return "관리자 확인 후 연결 완료";
    if (state === "disputed") return "임차인 이의 또는 정보 불일치로 보류";
    return "초대 링크 발송 대기";
  }

  private positiveInteger(value: number | undefined) {
    if (value === undefined || value === null) return undefined;
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  private planAcceptedTradeContract(
    input: ConnectAcceptedTradeContractInput
  ): AcceptedTradeContractPlan {
    const resolved = this.resolveExactTradeRoom(input);
    const tradeContractId = typeof input.tradeContractId === "string"
      ? input.tradeContractId.trim()
      : "";
    if (!tradeContractId) {
      throw new BadRequestException("거래 계약 ID를 확인할 수 없습니다.");
    }
    if (typeof input.landlordId !== "string" || !input.landlordId.trim()) {
      throw new BadRequestException("거래 계약 임대인을 확인할 수 없습니다.");
    }
    if (typeof input.tenantId !== "string" || !input.tenantId.trim()) {
      throw new BadRequestException("거래 계약 임차인을 확인할 수 없습니다.");
    }

    const monthlyRent = this.requireNonNegativeInteger(input.monthlyRent, "월세");
    const depositKrw = this.requireNonNegativeInteger(input.depositKrw, "보증금");
    const acceptedAt = this.requireAcceptedEventTime(input.acceptedAt);
    const contractId = `ct_trade_${tradeContractId}`;
    const deterministic = this.store.contracts.find((contract) => contract.id === contractId);
    const room: Room = resolved.room ?? {
      id: id("room"),
      buildingName:
        typeof input.listingTitle === "string" && input.listingTitle.trim()
          ? input.listingTitle.trim()
          : resolved.address,
      roomNo: resolved.unit,
      address: resolved.address,
      landlordId: input.landlordId
    };

    if (
      deterministic &&
      (
        deterministic.roomId !== room.id ||
        deterministic.managerId !== input.landlordId ||
        deterministic.tenantId !== input.tenantId
      )
    ) {
      throw new ConflictException("동일한 거래 계약 ID가 다른 계약 관계에 연결돼 있습니다.");
    }
    if (
      deterministic &&
      this.tradeAcceptedTime(deterministic) !== this.timeOf(acceptedAt)
    ) {
      throw new ConflictException("동일한 거래 계약 ID의 수락 이벤트 시각이 일치하지 않습니다.");
    }

    const active = this.store.contracts.find(
      (contract) =>
        contract.id !== deterministic?.id &&
        contract.roomId === room.id &&
        contract.lifecycle === "active"
    );
    if (active && active.tenantId !== input.tenantId) {
      throw new ConflictException("해당 호실에 다른 임차인의 활성 계약이 있습니다.");
    }
    const activeMarker = active ? this.tradeAcceptanceMarker(active) : undefined;
    if (
      activeMarker?.tradeContractId === tradeContractId &&
      activeMarker.acceptedAt !== acceptedAt
    ) {
      throw new ConflictException("동일한 거래 계약 ID의 수락 이벤트 시각이 일치하지 않습니다.");
    }
    if (
      activeMarker &&
      activeMarker.tradeContractId !== tradeContractId &&
      this.timeOf(activeMarker.acceptedAt) === this.timeOf(acceptedAt)
    ) {
      throw new ConflictException("동일한 수락 시각에 서로 다른 거래 계약 ID가 연결돼 있습니다.");
    }

    const currentRoomId = this.store.tenantRooms[input.tenantId];
    const newerCurrent = currentRoomId
      ? this.store.contracts
          .filter(
            (contract) =>
              contract.id !== deterministic?.id &&
              (contract.id.startsWith("ct_trade_") || contract.lifecycle === "active") &&
              contract.tenantId === input.tenantId &&
              contract.roomId === currentRoomId &&
              this.tradeAcceptedTime(contract) > this.timeOf(acceptedAt)
          )
          .sort((left, right) => this.tradeAcceptedTime(right) - this.tradeAcceptedTime(left))[0]
      : undefined;

    return {
      resolved,
      monthlyRent,
      depositKrw,
      acceptedAt,
      tradeContractId,
      contractId,
      deterministic,
      room,
      active,
      activeMarker,
      currentRoomId,
      newerCurrent
    };
  }

  private resolveExactTradeRoom(input: ConnectAcceptedTradeContractInput): {
    room?: Room;
    unit: string;
    address: string;
  } {
    const location = this.normalizePhysicalAddress(input.location);
    if (!location || location === "위치 미입력") {
      throw new BadRequestException("정확한 건물 주소와 호실을 확인해주세요.");
    }

    const explicitRoomNo = typeof input.roomNo === "string" ? input.roomNo.trim() : "";
    const explicitUnits = this.unitCandidates(explicitRoomNo);
    if (explicitRoomNo && explicitUnits.length !== 1) {
      throw new BadRequestException("정확한 호실 하나를 확인해주세요.");
    }
    const trailing = this.trailingUnit(location);
    const locationUnits = this.unitCandidates(location);
    if (locationUnits.length > 1) {
      throw new BadRequestException("정확한 호실 하나를 확인해주세요.");
    }

    const unit = explicitUnits[0] ?? trailing?.unit;
    if (!unit) {
      throw new BadRequestException("정확한 호실을 확인해주세요.");
    }
    if (trailing && trailing.unit !== unit) {
      throw new BadRequestException("상세 호실과 주소의 호실이 일치하지 않습니다.");
    }

    const address = this.normalizePhysicalAddress(trailing ? location.slice(0, trailing.index) : location);
    if (!address || address === "위치 미입력") {
      throw new BadRequestException("정확한 건물 주소를 확인해주세요.");
    }
    const candidates = this.store.rooms.filter(
      (room) =>
        room.landlordId === input.landlordId &&
        this.normalizeUnit(room.roomNo) === unit &&
        this.roomPhysicalAddress(room) === address
    );
    if (candidates.length > 1) {
      throw new ConflictException("동일 주소와 호실에 중복된 Roomlog 호실이 있어 연결할 수 없습니다.");
    }

    return { room: candidates[0], unit, address };
  }

  private unitCandidates(value: string): string[] {
    if (!value) return [];
    const matches = Array.from(value.matchAll(/([\p{L}\p{N}-]+)\s*호(?![\p{L}\p{N}-])/gu))
      .map((match) => this.normalizeUnit(match[1]))
      .filter(Boolean);
    if (matches.length === 0 && /^[\p{L}\p{N}-]+$/u.test(value.trim())) {
      matches.push(this.normalizeUnit(value));
    }
    return Array.from(new Set(matches));
  }

  private trailingUnit(value: string): { unit: string; index: number } | undefined {
    const match = /(?:^|[\s,])([\p{L}\p{N}-]+)\s*호(?=[^\p{L}\p{N}-]*$)/u.exec(value);
    if (!match || match.index === undefined) return undefined;
    const tokenOffset = match[0].search(/[\p{L}\p{N}-]/u);
    return {
      unit: this.normalizeUnit(match[1]),
      index: match.index + Math.max(0, tokenOffset)
    };
  }

  private normalizeUnit(value: string): string {
    return value.normalize("NFKC").replace(/\s+/gu, "").replace(/호$/u, "").toLowerCase();
  }

  private normalizePhysicalAddress(value: string): string {
    return typeof value === "string"
      ? value.normalize("NFKC").trim().replace(/[\s,]+$/gu, "").replace(/\s+/gu, " ")
      : "";
  }

  private roomPhysicalAddress(room: Room): string {
    const normalized = this.normalizePhysicalAddress(room.address);
    const trailing = this.trailingUnit(normalized);
    if (trailing && trailing.unit === this.normalizeUnit(room.roomNo)) {
      return this.normalizePhysicalAddress(normalized.slice(0, trailing.index));
    }
    return normalized;
  }

  private requireAcceptedEventTime(value: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException("거래 계약 수락 시각을 확인할 수 없습니다.");
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException("거래 계약 수락 시각을 확인할 수 없습니다.");
    }
    return new Date(timestamp).toISOString();
  }

  private tradeAcceptedTime(contract: Contract): number {
    if (contract.id.startsWith("ct_trade_")) return this.timeOf(contract.createdAt);
    const marker = this.tradeAcceptanceMarker(contract);
    return marker ? this.timeOf(marker.acceptedAt) : Number.NEGATIVE_INFINITY;
  }

  private tradeAcceptanceMarker(contract: Contract): TradeAcceptanceMarker | undefined {
    const extraction = this.store.contractExtractions.find(
      (item) => item.id === contract.extractionId || item.contractId === contract.id
    );
    const note = extraction?.helpNotes.find(
      (candidate) => candidate.clause === TRADE_ACCEPTANCE_MARKER_CLAUSE
    );
    if (!note) return undefined;

    try {
      const parsed = JSON.parse(note.plain) as Partial<TradeAcceptanceMarker>;
      if (typeof parsed.tradeContractId !== "string" || !parsed.tradeContractId.trim()) {
        return undefined;
      }
      if (typeof parsed.acceptedAt !== "string" || !Number.isFinite(Date.parse(parsed.acceptedAt))) {
        return undefined;
      }
      return {
        tradeContractId: parsed.tradeContractId.trim(),
        acceptedAt: new Date(parsed.acceptedAt).toISOString()
      };
    } catch {
      return undefined;
    }
  }

  private setTradeAcceptanceMarker(
    extraction: ContractExtraction,
    marker: TradeAcceptanceMarker
  ) {
    extraction.helpNotes = [
      ...extraction.helpNotes.filter((note) => note.clause !== TRADE_ACCEPTANCE_MARKER_CLAUSE),
      {
        clause: TRADE_ACCEPTANCE_MARKER_CLAUSE,
        plain: JSON.stringify(marker),
        source: "Roomlog machine metadata"
      }
    ];
  }

  private restoreTenantRoom(tenantId: string, roomId: string | undefined) {
    if (roomId === undefined) {
      delete this.store.tenantRooms[tenantId];
      return;
    }
    this.store.tenantRooms[tenantId] = roomId;
  }

  private requireNonNegativeInteger(value: number, field: string) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new BadRequestException(`${field}는 0 이상의 원 단위 정수여야 합니다.`);
    }

    return value;
  }

  private optionalNonNegativeInteger(value: number | undefined, field: string) {
    return value === undefined ? undefined : this.requireNonNegativeInteger(value, field);
  }

  private optionalManualText(value: string | undefined, field: string) {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      throw new BadRequestException(`${field}은 문자열이어야 합니다.`);
    }

    return value.trim();
  }

  private requirePaymentDay(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      throw new BadRequestException("납부일은 1일부터 31일 사이의 정수여야 합니다.");
    }

    return value;
  }

  private optionalContractDate(value: string, field: string) {
    if (typeof value !== "string") {
      throw new BadRequestException(`${field}은 문자열이어야 합니다.`);
    }
    if (!value.trim()) return undefined;

    return this.contractDateKey(value, field);
  }

  private contractDateKey(rawValue: string, field: string) {
    // 저장된 계약 날짜가 ISO 전체 문자열(2026-03-01T00:00:00+09:00)인 경우가 있어 날짜부만 본다.
    const value = rawValue.trim().slice(0, 10);
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(value)) {
      throw new BadRequestException(`${field}은 YYYY-MM-DD 형식이어야 합니다.`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field}은 YYYY-MM-DD 형식이어야 합니다.`);
    }

    return value;
  }

  private todayInSeoulKey() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;

    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private paymentDay(value: number | undefined) {
    const parsed = this.positiveInteger(value);

    return parsed && parsed >= 1 && parsed <= 31 ? parsed : undefined;
  }

  private buildManagerContractRow(managerId: string, contract: Contract): ManagerContractRow {
    this.assertManagerCanAccessRoom(managerId, contract.roomId);
    const room = this.findRoom(contract.roomId);
    const extraction = this.findContractExtraction(contract);
    const needsCheckCount = this.contractReviewExtractionItems(extraction.items).filter((item) => item.needsCheck).length;
    const origin = this.contractOrigin(contract);

    return {
      contract: this.presentContract(contract),
      tenantName: this.contractTenant(contract)?.name ?? "미연결 임차인",
      buildingName: room.buildingName,
      depositSummary: this.extractionValue(extraction, "보증금"),
      clauseSummary: extraction.clauseSummary || this.buildContractClauseSummary(extraction.items),
      origin,
      statusLabel: this.contractStatusLabel(contract, needsCheckCount),
      slaOverdue: this.isContractReviewSlaOverdue(contract),
      needsCheckCount,
      daysToExpire: this.contractDaysToExpire(contract),
      mobileQuickConfirm: needsCheckCount === 0 && contract.review !== "confirmed"
    };
  }

  private contractOrigin(contract: Contract): ManagerContractOrigin {
    if (contract.id.startsWith("ct_trade_")) return "trade_acceptance";
    const document = this.currentContractDocument(contract);

    return document?.origin ?? (contract.valueSource === "manual" ? "manual" : "tenant_upload");
  }

  private contractStatusLabel(contract: Contract, needsCheckCount: number) {
    if (contract.deletion === "requested") return "삭제 요청";
    if (contract.review === "confirmed") return "확정됨";
    if (contract.review === "info_requested") return "보완 요청";
    if (contract.lifecycle === "unregistered") return "미등록 호실";
    if (needsCheckCount > 0) return "확인 필요";

    return "검토 전 참고본";
  }

  private isContractReviewSlaOverdue(contract: Contract) {
    return contract.review !== "confirmed" && (this.elapsedHours(contract.createdAt, now()) ?? 0) >= 72;
  }

  private contractDaysToExpire(contract: Contract) {
    if (!contract.endDate) return 9999;

    return Math.max(0, Math.ceil((this.timeOf(contract.endDate) - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  private contractTenant(contract: Contract) {
    return contract.tenantId
      ? this.store.users.find((user) => user.id === contract.tenantId)
      : Object.entries(this.store.tenantRooms)
          .filter(([, roomId]) => roomId === contract.roomId)
          .map(([tenantId]) => this.store.users.find((user) => user.id === tenantId))
          .find((user): user is UserAccount => Boolean(user));
  }

  private contractTimeline(contract: Contract, room: Room) {
    if (this.contractOrigin(contract) === "trade_acceptance") {
      return [
        {
          at: contract.updatedAt,
          kind: "거래 계약",
          title: contract.review === "confirmed" ? "관리자 검토 확정" : "거래 수락 조건 검토 대기",
          detail: `${room.buildingName} ${room.roomNo} 거래 계약 초안`
        },
        {
          at: contract.tradeAcceptedAt ?? contract.createdAt,
          kind: "거래 계약",
          title: "거래 계약 수락",
          detail: "당사자가 수락한 보증금·월세 조건으로 관리자 검토 초안 생성"
        },
        {
          at: contract.startDate ?? contract.createdAt,
          kind: "입주",
          title: "계약 시작일",
          detail: contract.startDate ? contract.startDate.slice(0, 10) : "계약 시작일 미등록"
        }
      ];
    }
    return [
      {
        at: contract.updatedAt,
        kind: "계약서",
        title: contract.review === "confirmed" ? "관리자 검토 확정" : "OCR 분석 및 검토 대기",
        detail: `${room.buildingName} ${room.roomNo} 계약 레코드`,
      },
      {
        at: contract.createdAt,
        kind: "계약서",
        title: "계약서 업로드",
        detail: "원본 보존, OCR 추출, 개인정보 마스킹 정책 연결"
      },
      {
        at: contract.startDate ?? contract.createdAt,
        kind: "입주",
        title: "계약 시작일",
        detail: contract.startDate ? contract.startDate.slice(0, 10) : "계약 시작일 미등록"
      }
    ];
  }

  private contractAuditLogs(contract: Contract, extraction: ContractExtraction) {
    const manager = contract.confirmedByManagerId
      ? this.store.users.find((user) => user.id === contract.confirmedByManagerId)
      : undefined;

    if (this.contractOrigin(contract) === "trade_acceptance") {
      return [
        contract.confirmedAt
          ? {
              at: contract.confirmedAt,
              actor: manager?.name ?? "관리자",
              action: "거래 계약값 확정",
              detail: "거래 수락 조건을 관리자 검토로 확정"
            }
          : {
              at: extraction.createdAt,
              actor: "Roomlog",
              action: "관리자 확인 필요 표시",
              detail: `${this.contractReviewExtractionItems(extraction.items).filter((item) => item.needsCheck).length}개 핵심 항목 관리자 확인 필요`
            },
        {
          at: contract.tradeAcceptedAt ?? contract.createdAt,
          actor: this.contractTenant(contract)?.name ?? "임차인",
          action: "거래 계약 수락",
          detail: "수락된 거래 조건으로 관리자 검토 초안 생성"
        }
      ];
    }

    return [
      contract.confirmedAt
        ? {
            at: contract.confirmedAt,
            actor: manager?.name ?? "관리자",
            action: "계약값 확정",
            detail: "관리자 검토를 거쳐 확정본으로 전환"
          }
        : {
            at: extraction.createdAt,
            actor: "AI OCR",
            action: "확인 필요 표시",
            detail: `${this.contractReviewExtractionItems(extraction.items).filter((item) => item.needsCheck).length}개 핵심 항목 관리자 대조 필요`
          },
      {
        at: contract.createdAt,
        actor: this.contractTenant(contract)?.name ?? "임차인",
        action: "계약서 업로드",
        detail: "OCR 분석 및 DB 저장 동의"
      }
    ];
  }

  private contractInviteLinks(managerId: string, contractId: string) {
    return this.store.contractInvites
      .filter(
        (invite) =>
          invite.invitedByManagerId === managerId && invite.contractId === contractId
      )
      .map((invite) => ({
        id: invite.id,
        unitId: this.displayUnitId(this.findRoom(invite.roomId)),
        tenantName: invite.tenantName,
        state: invite.state,
        link: invite.signupUrl,
        audit: invite.audit
      }));
  }

  private contractConflictCandidates(contract: Contract) {
    const documents = this.store.contractDocuments.filter((document) => document.contractId === contract.id);

    if (this.contractOrigin(contract) === "trade_acceptance") {
      return [
        {
          source: "trade" as const,
          uploadedAt: contract.tradeAcceptedAt ?? contract.createdAt,
          summary: "거래 계약 수락 조건 · 중복 연결 없음",
          decision: "당사자 수락 조건을 관리자 검토 후 확정"
        }
      ];
    }

    if (documents.length <= 1) {
      return [
        {
          source: this.contractOrigin(contract) === "manager_upload" ? "manager" : "tenant",
          uploadedAt: documents[0]?.uploadedAt ?? contract.createdAt,
          summary: "단일 계약 원본 · 충돌 없음",
          decision: "원본 보존, 관리자 검토 후 확정"
        }
      ];
    }

    return documents.map((document) => ({
      source: document.origin === "manager_upload" ? "manager" : "tenant",
      uploadedAt: document.uploadedAt,
      summary: `${document.fileName ?? "계약서 원본"} · ${document.origin === "manual" ? "수동 등록" : "업로드본"}`,
      decision: "채택 시 사유와 임차인 알림 기록"
    }));
  }

  private extractionValue(extraction: ContractExtraction, label: string) {
    return extraction.items.find((item) => item.label === label)?.value;
  }

  private buildContractClauseSummary(items: ContractExtraction["items"]) {
    const clauseItems = items.filter((item) => this.isOptionalContractClauseLabel(item.label));
    const needsCheck = clauseItems.filter((item) => item.needsCheck);

    if (needsCheck.length > 0) {
      return `${needsCheck.map((item) => item.label).slice(0, 2).join("·")} 확인 필요`;
    }

    const presentClauses = clauseItems.filter(
      (item) => !this.isMissingExtractionValue(item.value) && !this.isDocumentAbsentContractValue(item.value)
    );

    if (presentClauses.length === 0) return "특약성 조항 없음";

    return presentClauses
      .slice(0, 2)
      .map((item) => `${item.label}: ${this.compactContractClauseSummary(item.value)}`)
      .join(" · ");
  }

  private compactContractClauseSummary(value: string) {
    return value
      .replace(/\s+/g, " ")
      .replace(/합니다|한다|하여야 한다|하여야 합니다/g, "")
      .replace(/[.。]+$/g, "")
      .trim()
      .slice(0, 42);
  }

  private currentContractDocument(contract: Contract) {
    const byId = contract.documentId
      ? this.store.contractDocuments.find((item) => item.id === contract.documentId)
      : undefined;

    if (byId) return byId;

    return this.store.contractDocuments
      .filter((item) => item.contractId === contract.id)
      .sort((a, b) => this.timeOf(b.uploadedAt) - this.timeOf(a.uploadedAt))[0];
  }

  private currencyLabel(value: number | undefined) {
    return value === undefined ? undefined : `${value.toLocaleString("ko-KR")}원`;
  }

  private dateLabel(iso?: string) {
    return iso?.slice(0, 10).replace(/-/g, ".") ?? "미확인";
  }

  private async readContractDocumentBytes(document: ContractDocument) {
    if (document.fileName) {
      const fromAdapter = await this.storageAdapter.read(document.fileName).catch(() => null);
      if (fromAdapter) return fromAdapter;
    }

    if (document.fileUrl && /^https?:\/\//i.test(document.fileUrl)) {
      try {
        const response = await fetch(document.fileUrl);
        if (response.ok) return Buffer.from(await response.arrayBuffer());
      } catch {
        return null;
      }
    }

    return null;
  }

  private openAiContractDocumentPart(
    document: ContractDocument,
    bytes: Buffer,
    mimeType: string
  ): Record<string, unknown> | undefined {
    const fileData = `data:${mimeType};base64,${bytes.toString("base64")}`;

    if (mimeType.startsWith("image/")) {
      return {
        type: "input_image",
        image_url: fileData,
        detail: process.env.OPENAI_CONTRACT_OCR_IMAGE_DETAIL?.trim() || "high"
      };
    }

    if (mimeType === "application/pdf") {
      return {
        type: "input_file",
        filename: basename(document.fileName || "contract.pdf"),
        file_data: fileData,
        detail: process.env.OPENAI_CONTRACT_OCR_PDF_DETAIL?.trim() || "high"
      };
    }

    return undefined;
  }

  private contractOcrPrompt(
    contract: Contract,
    extraction: ContractExtraction,
    room: Room,
    document: ContractDocument
  ) {
    const knownItems = extraction.items
      .map((item) => `${item.label}: ${item.value}`)
      .join(", ") || "없음";

    return [
      "첨부된 임대차 계약서 원본에서 Roomlog 계약 핵심 검토 테이블에 넣을 항목만 추출해줘.",
      `파일명: ${document.fileName ?? "계약서 원본"}`,
      `관리 호실: ${room.buildingName} ${this.displayUnitId(room)}`,
      `등록 DB 기본값: 주소 ${room.address}, 월세 ${this.currencyLabel(contract.monthlyRent) ?? "미등록"}, 관리비 ${this.currencyLabel(contract.maintenanceFee) ?? "미등록"}, 납부일 ${contract.paymentDay ? `매월 ${contract.paymentDay}일` : "미등록"}, 계약기간 ${this.dateLabel(contract.startDate)} ~ ${this.dateLabel(contract.endDate)}`,
      `기존 추출값: ${knownItems}`,
      "등록 DB 기본값은 비교 참고용일 뿐 추출하거나 items에 넣지 마. 월세, 관리비, 납부일, 주소, 계약 기간, 계좌는 제외한다.",
      "권장 label은 보증금, 특약, 자동연장, 원상복구, 수선 책임이다.",
      "fields에는 depositBaseAmount, depositConversionAmount, depositFinalAmount, specialTerms, autoRenewal, restorationDuty, repairDuty를 가능한 범위에서 채워줘.",
      "clauseSummary에는 특약, 자동연장, 원상복구, 수선 책임을 합쳐 대시보드에 표시할 한 줄 요약을 넣어줘. 예: '특약: 미납 관리비·원상복구비 정산', '원상복구·수선 책임 확인 필요', '특약성 조항 없음'.",
      "보증금이 문서에 없거나 읽히지 않으면 추측하지 말고 value를 빈 문자열로 두고 needsCheck를 true로 둬.",
      "특약, 자동연장, 원상복구, 수선 책임이 원문에 명시되어 있지 않으면 value는 반드시 '문서에 없음', needsCheck는 false로 둬.",
      "조항이 없는지 판단할 수 없을 만큼 흐리거나 가려졌다면 value를 빈 문자열로 두고 needsCheck를 true로 둬.",
      "계약서의 표나 조항에 여러 보증금이 있으면 항목별 의미를 evidence에 적고, finalAmount가 명확하지 않으면 기본/전환 값을 모두 유지해.",
      "금액은 원 단위 문자열로 정리해줘.",
      "원문에서 근거 문장을 evidence에 짧게 넣어줘."
    ].join("\n");
  }

  private contractOcrJsonSchema() {
    const fieldSchema = {
      type: "object",
      properties: {
        value: { type: "string" },
        evidence: { type: "string" },
        needsCheck: { type: "boolean" },
        masked: { type: "boolean" }
      },
      required: ["value", "evidence", "needsCheck", "masked"],
      additionalProperties: false
    };
    const fieldsProperties = [
      "depositBaseAmount",
      "depositConversionAmount",
      "depositFinalAmount",
      "specialTerms",
      "autoRenewal",
      "restorationDuty",
      "repairDuty"
    ].reduce<Record<string, typeof fieldSchema>>((properties, key) => {
      properties[key] = fieldSchema;
      return properties;
    }, {});

    return {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        clauseSummary: { type: "string" },
        highlights: {
          type: "array",
          items: { type: "string" }
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              group: { enum: ["money", "term", "responsibility"], type: "string" },
              needsCheck: { type: "boolean" },
              evidence: { type: "string" },
              masked: { type: "boolean" }
            },
            required: ["label", "value", "group", "needsCheck", "evidence", "masked"],
            additionalProperties: false
          }
        },
        fields: {
          type: "object",
          properties: fieldsProperties,
          required: Object.keys(fieldsProperties),
          additionalProperties: false
        },
        helpNotes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              clause: { type: "string" },
              plain: { type: "string" },
              source: { type: "string" }
            },
            required: ["clause", "plain", "source"],
            additionalProperties: false
          }
        }
      },
      required: ["summary", "clauseSummary", "highlights", "items", "fields", "helpNotes"]
    };
  }

  private extractOpenAiResponseText(payload: Record<string, unknown>) {
    if (typeof payload.output_text === "string") {
      return payload.output_text;
    }

    const output = payload.output;
    if (!Array.isArray(output)) {
      throw new Error("OpenAI response did not include output_text");
    }

    for (const message of output) {
      if (!this.isRecord(message) || !Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (!this.isRecord(part)) continue;
        if (typeof part.text === "string") return part.text;
        if (typeof part.output_text === "string") return part.output_text;
      }
    }

    throw new Error("OpenAI response text was empty");
  }

  private parseOpenAiContractOcr(rawText: string): Omit<ContractOcrResult, "source"> {
    const parsed = JSON.parse(this.extractJsonObjectText(rawText)) as Record<string, unknown>;
    const itemItems = this.normalizeOpenAiOcrItems(parsed.items);
    const fieldItems = this.normalizeOpenAiOcrFields(parsed.fields);
    const mergedItems = this.mergeOpenAiOcrItems(itemItems, fieldItems);

    return {
      summary: this.stringValue(parsed.summary) || "계약 OCR 분석 완료",
      clauseSummary: this.stringValue(parsed.clauseSummary) || this.buildContractClauseSummary(mergedItems),
      highlights: this.stringArray(parsed.highlights).slice(0, 5),
      items: this.validateOpenAiOcrItems(mergedItems),
      helpNotes: this.normalizeOpenAiHelpNotes(parsed.helpNotes)
    };
  }

  private normalizeOpenAiOcrFields(value: unknown): ContractExtraction["items"] {
    if (!this.isRecord(value)) return [];

    const field = (key: keyof OpenAiContractOcrFields) => this.normalizeOpenAiOcrField(value[key]);
    const items: ContractExtraction["items"] = [];
    const addItem = (
      label: string,
      itemValue: string,
      group: ExtractionGroup,
      fields: Array<OpenAiContractOcrField | undefined>,
      masked = false
    ) => {
      const cleanValue = this.normalizeContractOcrItemValue(label, itemValue, fields);
      if (!cleanValue) return;
      const activeFields = fields.filter((field): field is OpenAiContractOcrField =>
        this.hasActiveOcrField(field, label)
      );

      const evidence = activeFields
        .map((item) => item?.evidence?.trim())
        .filter(Boolean)
        .join(" / ");
      const documentAbsent = this.isDocumentAbsentContractValue(cleanValue);
      items.push({
        label,
        value: cleanValue,
        group,
        needsCheck: documentAbsent ? false : activeFields.some((item) => item?.needsCheck !== false),
        evidence: evidence || "OpenAI OCR 세부 필드 추출",
        masked: masked || activeFields.some((item) => item?.masked === true)
      });
    };

    const depositBase = field("depositBaseAmount");
    const depositConversion = field("depositConversionAmount");
    const depositFinal = field("depositFinalAmount");
    addItem(
      "보증금",
      this.joinLabeledOcrValues([
        ["기본", depositBase?.value],
        ["전환보증금", depositConversion?.value],
        ["전환 후", depositFinal?.value]
      ]),
      "money",
      [depositBase, depositConversion, depositFinal]
    );

    const specialTerms = field("specialTerms");
    addItem("특약", specialTerms?.value ?? "", "responsibility", [specialTerms]);

    const autoRenewal = field("autoRenewal");
    addItem("자동연장", autoRenewal?.value ?? "", "term", [autoRenewal]);

    const restorationDuty = field("restorationDuty");
    addItem("원상복구", restorationDuty?.value ?? "", "responsibility", [restorationDuty]);

    const repairDuty = field("repairDuty");
    addItem("수선 책임", repairDuty?.value ?? "", "responsibility", [repairDuty]);

    return items;
  }

  private normalizeOpenAiOcrField(value: unknown): OpenAiContractOcrField | undefined {
    if (!this.isRecord(value)) return undefined;

    return {
      value: this.stringValue(value.value),
      evidence: this.stringValue(value.evidence),
      needsCheck: typeof value.needsCheck === "boolean" ? value.needsCheck : true,
      masked: typeof value.masked === "boolean" ? value.masked : false
    };
  }

  private mergeOpenAiOcrItems(
    itemItems: ContractExtraction["items"],
    fieldItems: ContractExtraction["items"]
  ): ContractExtraction["items"] {
    const merged = [...itemItems];

    for (const fieldItem of fieldItems) {
      const index = merged.findIndex((item) => item.label === fieldItem.label);
      if (index < 0) {
        merged.push(fieldItem);
        continue;
      }

      const existing = merged[index];
      const replacingMissingExisting = this.isMissingExtractionValue(existing.value);
      if (replacingMissingExisting || !this.isMissingExtractionValue(fieldItem.value)) {
        merged[index] = {
          ...existing,
          ...fieldItem,
          evidence: [existing.evidence, fieldItem.evidence].filter(Boolean).join(" / "),
          needsCheck: replacingMissingExisting ? fieldItem.needsCheck : existing.needsCheck || fieldItem.needsCheck,
          masked: existing.masked || fieldItem.masked
        };
      }
    }

    return merged;
  }

  private validateOpenAiOcrItems(items: ContractExtraction["items"]): ContractExtraction["items"] {
    return items.map((item) => {
      const validationMessage = this.openAiOcrValidationMessage(item);
      if (!validationMessage) return item;

      return {
        ...item,
        needsCheck: true,
        evidence: [item.evidence, validationMessage].filter(Boolean).join(" / ")
      };
    });
  }

  private openAiOcrValidationMessage(item: ContractExtraction["items"][number]) {
    if (this.isMissingExtractionValue(item.value)) return undefined;

    if (item.label === "계약 기간") {
      const dates = this.extractOcrDates(item.value);
      if (dates.length < 2) return "검증: 계약 시작일과 종료일을 모두 확인해야 합니다.";
      if (this.timeOf(dates[0]) > this.timeOf(dates[1])) {
        return "검증: 계약 시작일이 종료일보다 늦습니다.";
      }
      return undefined;
    }

    if (["보증금", "월세", "관리비"].includes(item.label)) {
      return this.hasOcrAmount(item.value)
        ? undefined
        : "검증: 금액 항목인데 원 단위 숫자를 확인하지 못했습니다.";
    }

    if (item.label === "납부일") {
      const day = this.extractOcrPaymentDay(item.value);
      return day !== undefined && day >= 1 && day <= 31
        ? undefined
        : "검증: 납부일은 1일부터 31일 사이의 일자로 확인해야 합니다.";
    }

    if (item.label === "임대인 계좌") {
      const digits = item.value.replace(/\D/g, "");
      return digits.length >= 6
        ? undefined
        : "검증: 계좌번호 숫자가 충분히 확인되지 않았습니다.";
    }

    if (item.label === "상세 주소") {
      return item.value.replace(/\s/g, "").length >= 6
        ? undefined
        : "검증: 주소가 너무 짧아 원문 확인이 필요합니다.";
    }

    return undefined;
  }

  private extractOcrDates(value: string) {
    return Array.from(value.matchAll(/\d{4}[.-]\d{1,2}[.-]\d{1,2}/g))
      .map((match) => this.normalizeOcrDate(match[0]))
      .filter(Boolean) as string[];
  }

  private normalizeOcrDate(value: string) {
    const match = value.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
    if (!match) return undefined;

    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  private hasOcrAmount(value: string) {
    return /\d/.test(value) && /(원|만원|억|천|백|만|,)/.test(value);
  }

  private extractOcrPaymentDay(value: string) {
    const match = value.match(/\d{1,2}/);
    return match ? Number(match[0]) : undefined;
  }

  private joinLabeledOcrValues(values: Array<[string, string | undefined]>) {
    return values
      .map(([label, value]) => [label, value?.trim()] as const)
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `${label} ${value}`)
      .join("; ");
  }

  private markMissingOptionalClausesAsDocumentAbsent(
    extraction: ContractExtraction,
    resultItems: ContractExtraction["items"]
  ) {
    const resultLabels = new Set(resultItems.map((item) => item.label));

    for (const label of OPTIONAL_CONTRACT_CLAUSE_LABELS) {
      if (resultLabels.has(label)) continue;

      this.setExtractionItem(extraction, {
        label,
        value: DOCUMENT_ABSENT_CONTRACT_VALUE,
        group: label === "자동연장" ? "term" : "responsibility",
        needsCheck: false,
        masked: false,
        evidence: "성공한 OCR에서 해당 조항을 찾지 못했습니다."
      });
    }
  }

  private hasActiveOcrField(field: OpenAiContractOcrField | undefined, label: string) {
    if (!field) return false;

    return Boolean(field.value?.trim()) || Boolean(field.evidence?.trim()) || this.isOptionalContractClauseLabel(label);
  }

  private normalizeContractOcrItemValue(
    label: string,
    value: string,
    fields: Array<OpenAiContractOcrField | undefined> = []
  ) {
    const cleanValue = value.trim();
    if (!this.isOptionalContractClauseLabel(label)) return cleanValue;
    if (this.isDocumentAbsentContractValue(cleanValue)) return DOCUMENT_ABSENT_CONTRACT_VALUE;

    const explicitlyAbsent = fields.some(
      (field) =>
        field?.needsCheck === false &&
        (
          this.isDocumentAbsentContractValue(field.value) ||
          /없|미기재|명시되어 있지|해당 조항 없음|해당 항목 없음/.test(field.evidence ?? "")
        )
    );

    if (explicitlyAbsent) return DOCUMENT_ABSENT_CONTRACT_VALUE;
    if (!cleanValue && fields.some((field) => field && field.needsCheck !== false)) return "미확인";

    return cleanValue;
  }

  private isOptionalContractClauseLabel(label: string) {
    return OPTIONAL_CONTRACT_CLAUSE_LABELS.has(label);
  }

  private isDocumentAbsentContractValue(value?: string) {
    const normalized = value?.replace(/\s+/g, "").trim();
    return (
      normalized === "문서에없음" ||
      normalized === "해당없음" ||
      normalized === "해당사항없음" ||
      normalized === "없음"
    );
  }

  private normalizeOpenAiOcrItems(value: unknown): ContractExtraction["items"] {
    if (!Array.isArray(value)) return [];

    const items: ContractExtraction["items"] = [];

    for (const rawItem of value) {
      if (!this.isRecord(rawItem)) continue;

      const label = this.normalizeOcrLabel(this.stringValue(rawItem.label));
      const itemValue = this.normalizeContractOcrItemValue(label, this.stringValue(rawItem.value));
      if (!label || !itemValue || !this.isImportantContractOcrLabel(label)) continue;
      const documentAbsent = this.isDocumentAbsentContractValue(itemValue);

      items.push({
        label,
        value: itemValue,
        group: this.normalizeOcrGroup(this.stringValue(rawItem.group), label),
        needsCheck: documentAbsent ? false : typeof rawItem.needsCheck === "boolean" ? rawItem.needsCheck : true,
        evidence: this.stringValue(rawItem.evidence) || "OpenAI OCR 추출",
        masked: typeof rawItem.masked === "boolean" ? rawItem.masked : this.shouldMaskOcrLabel(label)
      });
    }

    return items;
  }

  private normalizeOpenAiHelpNotes(value: unknown): ContractExtraction["helpNotes"] {
    if (!Array.isArray(value)) return [];

    const notes: ContractExtraction["helpNotes"] = [];

    for (const rawNote of value) {
      if (!this.isRecord(rawNote)) continue;
      const clause = this.stringValue(rawNote.clause);
      const plain = this.stringValue(rawNote.plain);
      if (!clause || !plain) continue;

      notes.push({
        clause,
        plain,
        source: this.stringValue(rawNote.source) || "OpenAI OCR"
      });
    }

    return notes.slice(0, 6);
  }

  private normalizeOcrLabel(label: string) {
    const compact = label.replace(/\s+/g, "");

    if (/보증|보증금|임대보증금/.test(compact)) return "보증금";
    if (/특약|특별약정|특별조건|중요조항/.test(compact)) return "특약";
    if (/월세|차임|임대료/.test(compact)) return "월세";
    if (/관리비|공용관리/.test(compact)) return "관리비";
    if (/납부|지급일|입금일/.test(compact)) return "납부일";
    if (/계좌|입금계좌/.test(compact)) return "임대인 계좌";
    if (/기간|계약기간|임대차기간/.test(compact)) return "계약 기간";
    if (/주소|소재지|목적물/.test(compact)) return "상세 주소";
    if (/연장|갱신/.test(compact)) return "자동연장";
    if (/원상|복구/.test(compact)) return "원상복구";
    if (/수선|수리|보수/.test(compact)) return "수선 책임";

    return label.trim().slice(0, 32);
  }

  private isImportantContractOcrLabel(label: string) {
    return IMPORTANT_CONTRACT_OCR_LABELS.has(label);
  }

  private normalizeOcrGroup(group: string, label: string): ExtractionGroup {
    if (group === "money" || group === "term" || group === "responsibility") return group;
    if (label === "보증금") return "money";
    if (["계약 기간", "상세 주소", "자동연장"].includes(label)) return "term";

    return "responsibility";
  }

  private shouldMaskOcrLabel(label: string) {
    return label === "임대인 계좌" || label === "상세 주소";
  }

  private extractJsonObjectText(rawText: string) {
    const trimmed = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  }

  private stringArray(value: unknown) {
    return Array.isArray(value)
      ? value.map((item) => this.stringValue(item)).filter(Boolean)
      : [];
  }

  private stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private contractDocumentMimeType(fileName: string) {
    const extension = extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".heic": "image/heic"
    };

    return mimeTypes[extension] ?? "application/octet-stream";
  }

  private contractDocumentExtension(mimeType: string, originalName: string) {
    const extension = extname(originalName).toLowerCase();
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"];

    if (allowedExtensions.includes(extension)) {
      return extension;
    }

    const fallback: Record<string, string> = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/heic": ".heic"
    };

    return fallback[mimeType] ?? ".bin";
  }

  private presentContract(contract: Contract): Contract {
    return { ...contract };
  }

  private presentContractExtraction(extraction: ContractExtraction): ContractExtraction {
    return {
      ...extraction,
      highlights: [...extraction.highlights],
      items: extraction.items.map((item) => ({ ...item })),
      helpNotes: extraction.helpNotes
        .filter((note) => note.clause !== TRADE_ACCEPTANCE_MARKER_CLAUSE)
        .map((note) => ({ ...note }))
    };
  }

  private presentContractPrivacy(privacy: ContractPrivacy): ContractPrivacy {
    return {
      ...privacy,
      retention: privacy.retention.map((item) => ({ ...item }))
    };
  }
}
