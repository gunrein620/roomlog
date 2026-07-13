// 계약(contract)·문서 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 자기완결(contract* 헬퍼 통째). 공유 헬퍼는 동명 필드로 주입해 본문 verbatim 유지.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import { id, now } from "../roomlog-support";
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

export class RoomlogContractDomain {
  constructor(
    private readonly store: Store,
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

  connectAcceptedTradeContract(input: ConnectAcceptedTradeContractInput): Contract {
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
      buildingName: input.listingTitle.trim() || resolved.address,
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
    if (deterministic?.tradeAcceptedAt && deterministic.tradeAcceptedAt !== acceptedAt) {
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

    const currentRoomId = this.store.tenantRooms[input.tenantId];
    const newerCurrent = currentRoomId
      ? this.store.contracts
          .filter(
            (contract) =>
              contract.id !== deterministic?.id &&
              contract.id.startsWith("ct_trade_") &&
              contract.tenantId === input.tenantId &&
              contract.roomId === currentRoomId &&
              this.tradeAcceptedTime(contract) > this.timeOf(acceptedAt)
          )
          .sort((left, right) => this.tradeAcceptedTime(right) - this.tradeAcceptedTime(left))[0]
      : undefined;
    if (newerCurrent) {
      return this.presentContract(deterministic ?? newerCurrent);
    }

    if (active && !deterministic) {
      if (currentRoomId === room.id) return this.presentContract(active);
      this.store.tenantRooms[input.tenantId] = room.id;
      try {
        this.persistStore();
      } catch (error) {
        this.restoreTenantRoom(input.tenantId, currentRoomId);
        throw error;
      }
      return this.presentContract(active);
    }

    if (deterministic) {
      const previousAcceptedAt = deterministic.tradeAcceptedAt;
      const previousCreatedAt = deterministic.createdAt;
      const relationChanged = currentRoomId !== room.id;
      const eventChanged = previousAcceptedAt === undefined;
      if (!relationChanged && !eventChanged) return this.presentContract(deterministic);

      deterministic.tradeAcceptedAt = acceptedAt;
      if (eventChanged) deterministic.createdAt = acceptedAt;
      this.store.tenantRooms[input.tenantId] = room.id;
      try {
        this.persistStore();
      } catch (error) {
        deterministic.tradeAcceptedAt = previousAcceptedAt;
        deterministic.createdAt = previousCreatedAt;
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
      landlordName: input.landlordName.trim() || "관리자",
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
        account: this.extractionValue(extraction, "임대인 계좌") ?? ""
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
    const extraction = this.findContractExtraction(contract);
    const needsCheck = extraction.items.filter((item) => item.needsCheck);

    if (needsCheck.length > 0 && input.confirmNeedsCheck !== true) {
      throw new BadRequestException("확인 필요 항목을 원문과 대조했다는 확인이 필요합니다.");
    }

    if (!contract.startDate) {
      throw new BadRequestException("계약 시작일을 입력해주세요.");
    }
    if (!contract.endDate) {
      throw new BadRequestException("계약 종료일을 입력해주세요.");
    }
    if (contract.monthlyRent === undefined) {
      throw new BadRequestException("월세를 입력해주세요.");
    }
    if (contract.maintenanceFee === undefined) {
      throw new BadRequestException("관리비를 입력해주세요.");
    }

    const monthlyRent = this.requireNonNegativeInteger(contract.monthlyRent, "월세");
    const maintenanceFee = this.requireNonNegativeInteger(contract.maintenanceFee, "관리비");

    const startDateKey = this.contractDateKey(contract.startDate, "계약 시작일");
    const endDateKey = this.contractDateKey(contract.endDate, "계약 종료일");
    if (this.timeOf(endDateKey) < this.timeOf(startDateKey)) {
      throw new BadRequestException("계약 종료일은 시작일보다 빠를 수 없습니다.");
    }
    if (endDateKey < this.todayInSeoulKey()) {
      throw new BadRequestException("이미 종료된 계약은 활성화할 수 없습니다.");
    }

    const totalAmount = monthlyRent + maintenanceFee;
    if (!Number.isSafeInteger(totalAmount)) {
      throw new BadRequestException("월세와 관리비 합계는 안전한 원 단위 정수여야 합니다.");
    }
    if (totalAmount > 0) {
      if (contract.paymentDay === undefined) {
        throw new BadRequestException("납부일을 입력해주세요.");
      }
      this.requirePaymentDay(contract.paymentDay);
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
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
  }

  requestManagerContractInfo(managerId: string, contractId: string) {
    const contract = this.findManagerContract(managerId, contractId);

    contract.review = "info_requested";
    contract.updatedAt = now();
    this.persistStore();

    return this.getManagerContractDetail(managerId, contract.id);
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

  updateManagerContractManualValues(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractManualValuesInput
  ) {
    const contract = this.findManagerContract(managerId, contractId);
    const deposit = this.optionalManualText(input.deposit, "보증금");
    const account = this.optionalManualText(input.account, "임대인 계좌");
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

    if (input.monthlyRent !== undefined) contract.monthlyRent = monthlyRent;
    if (input.maintenanceFee !== undefined) contract.maintenanceFee = maintenanceFee;
    if (input.paymentDay !== undefined) contract.paymentDay = paymentDay;
    if (input.startDate !== undefined) contract.startDate = startDate;
    if (input.endDate !== undefined) contract.endDate = endDate;
    contract.valueSource = "manual";
    contract.updatedAt = now();

    this.upsertExtractionItem(extraction, "보증금", deposit, "money");
    this.upsertExtractionItem(
      extraction,
      "월세",
      contract.monthlyRent !== undefined
        ? `${contract.monthlyRent.toLocaleString("ko-KR")}원`
        : undefined,
      "money"
    );
    this.upsertExtractionItem(
      extraction,
      "관리비",
      contract.maintenanceFee !== undefined
        ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원`
        : undefined,
      "money"
    );
    this.upsertExtractionItem(
      extraction,
      "납부일",
      contract.paymentDay ? `매월 ${contract.paymentDay}일` : undefined,
      "money"
    );
    if (input.startDate !== undefined || input.endDate !== undefined) {
      this.upsertExtractionItem(
        extraction,
        "계약 기간",
        `${contract.startDate?.slice(0, 10) ?? "미확인"} ~ ${contract.endDate?.slice(0, 10) ?? "미확인"}`,
        "term"
      );
    }
    this.upsertExtractionItem(extraction, "임대인 계좌", account, "money", true);
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
        "돈·기간·책임 항목은 관리자 확정 전까지 참고본입니다.",
        "민감정보는 기본 마스킹 상태로 보관됩니다."
      ],
      items: [
        { label: "월세", value: contract.monthlyRent !== undefined ? `${contract.monthlyRent.toLocaleString("ko-KR")}원` : "미확인", group: "money", needsCheck: true },
        { label: "관리비", value: contract.maintenanceFee !== undefined ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원` : "미확인", group: "money", needsCheck: true },
        { label: "납부일", value: contract.paymentDay ? `매월 ${contract.paymentDay}일` : "미확인", group: "money", needsCheck: true },
        { label: "계약 기간", value: `${contract.startDate?.slice(0, 10) ?? "미확인"} ~ ${contract.endDate?.slice(0, 10) ?? "미확인"}`, group: "term", needsCheck: true },
        { label: "원상복구", value: "원문 확인 필요", group: "responsibility", needsCheck: true }
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
        "보증금과 월세는 당사자가 수락한 조건이며 관리자 확정 전 참고값입니다.",
        "관리비·납부일·기간 등 누락 조건은 관리자가 확인해야 합니다."
      ],
      items: [
        {
          label: "월세",
          value: contract.monthlyRent !== undefined
            ? `${contract.monthlyRent.toLocaleString("ko-KR")}원`
            : "미확인",
          group: "money",
          needsCheck: true,
          evidence: "거래 계약 수락 조건"
        },
        {
          label: "관리비",
          value: contract.maintenanceFee !== undefined
            ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원`
            : "미확인",
          group: "money",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "납부일",
          value: contract.paymentDay ? `매월 ${contract.paymentDay}일` : "미확인",
          group: "money",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "계약 기간",
          value: `${contract.startDate?.slice(0, 10) ?? "미확인"} ~ ${contract.endDate?.slice(0, 10) ?? "미확인"}`,
          group: "term",
          needsCheck: true,
          evidence: "거래 계약에서 확인되지 않은 조건"
        },
        {
          label: "책임 조건",
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

    if (depositKrw !== undefined) {
      this.upsertExtractionItem(
        extraction,
        "보증금",
        `${depositKrw.toLocaleString("ko-KR")}원`,
        "money",
        false,
        "거래 계약 수락 조건"
      );
    }

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
      existing.evidence = existing.evidence ?? evidence;
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
    const matches = Array.from(value.matchAll(/([\p{L}\p{N}-]+)\s*호/gu))
      .map((match) => this.normalizeUnit(match[1]))
      .filter(Boolean);
    if (matches.length === 0 && /^[\p{L}\p{N}-]+$/u.test(value.trim())) {
      matches.push(this.normalizeUnit(value));
    }
    return Array.from(new Set(matches));
  }

  private trailingUnit(value: string): { unit: string; index: number } | undefined {
    const match = /(?:^|[\s,])([\p{L}\p{N}-]+)\s*호\s*$/u.exec(value);
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
    return this.timeOf(contract.tradeAcceptedAt ?? contract.createdAt);
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

  private contractDateKey(value: string, field: string) {
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
    const needsCheckCount = extraction.items.filter((item) => item.needsCheck).length;
    const origin = this.contractOrigin(contract);

    return {
      contract: this.presentContract(contract),
      tenantName: this.contractTenant(contract)?.name ?? "미연결 임차인",
      buildingName: room.buildingName,
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
    const document = this.store.contractDocuments.find(
      (item) => item.id === contract.documentId || item.contractId === contract.id
    );

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
              detail: `${extraction.items.filter((item) => item.needsCheck).length}개 거래 조건 관리자 확인 필요`
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
            detail: `${extraction.items.filter((item) => item.needsCheck).length}개 항목 관리자 대조 필요`
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

  private presentContract(contract: Contract): Contract {
    return { ...contract };
  }

  private presentContractExtraction(extraction: ContractExtraction): ContractExtraction {
    return {
      ...extraction,
      highlights: [...extraction.highlights],
      items: extraction.items.map((item) => ({ ...item })),
      helpNotes: extraction.helpNotes.map((note) => ({ ...note }))
    };
  }

  private presentContractPrivacy(privacy: ContractPrivacy): ContractPrivacy {
    return {
      ...privacy,
      retention: privacy.retention.map((item) => ({ ...item }))
    };
  }
}
