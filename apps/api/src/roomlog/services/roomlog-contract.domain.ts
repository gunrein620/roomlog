// 계약(contract)·문서 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// 자기완결(contract* 헬퍼 통째). 공유 헬퍼는 동명 필드로 주입해 본문 verbatim 유지.
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { now } from "../roomlog-support";
import type {
  Contract,
  ContractExtraction,
  ContractPrivacy,
  DeletionState,
  Room,
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
        deposit: this.extractionValue(extraction, "보증금") ?? "관리자 수동값 없음",
        rent: contract.monthlyRent ? `${contract.monthlyRent.toLocaleString("ko-KR")}원` : "관리자 수동값 없음",
        maintenanceFee: contract.maintenanceFee
          ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원`
          : "관리자 수동값 없음",
        paymentDay: contract.paymentDay ? `매월 ${contract.paymentDay}일` : "관리자 수동값 없음",
        account: this.extractionValue(extraction, "임대인 계좌") ?? "관리자 수동값 없음"
      },
      inventory: ["에어컨", "세탁기", "냉장고", "인덕션", "블라인드"],
      timeline: this.contractTimeline(contract, room),
      auditLogs: this.contractAuditLogs(contract, extraction),
      deletionRequests,
      inviteLinks: this.contractInviteLinks(managerId),
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

    if (needsCheck.length > 0 && !input.confirmNeedsCheck) {
      throw new BadRequestException("확인 필요 항목을 원문과 대조했다는 확인이 필요합니다.");
    }

    contract.review = "confirmed";
    contract.valueSource = "confirmed";
    contract.confirmedAt = now();
    contract.confirmedByManagerId = managerId;
    contract.updatedAt = contract.confirmedAt;
    extraction.confirmed = true;
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

  private contractInviteLinks(managerId: string) {
    return this.store.contractInvites
      .filter((invite) => invite.invitedByManagerId === managerId)
      .map((invite) => ({
        unitId: this.displayUnitId(this.findRoom(invite.roomId)),
        tenantName: invite.tenantName,
        state: invite.state,
        link: invite.signupUrl,
        audit: invite.audit
      }));
  }

  private contractConflictCandidates(contract: Contract) {
    const documents = this.store.contractDocuments.filter((document) => document.contractId === contract.id);

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
