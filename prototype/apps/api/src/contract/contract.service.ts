import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";
import { ContractRepository } from "./contract.repository";
import type {
  CreateContractDto,
  ManagerConfirmReviewDto,
  ManagerContractDashboard,
  ManagerContractLifecycle,
  ManagerContractReview,
  ManagerDeletionProcessDto,
  ManagerDeletionQueueItem,
  ManagerInfoRequestDto,
  ManagerInvitation,
  ManagerInviteDto,
  ManagerLifecycleDto,
} from "./contract.repository";

@Injectable()
export class ContractService {
  constructor(private readonly repository: ContractRepository) {}

  listContracts(): Contract[] {
    return this.repository.listContracts();
  }

  getContract(id: string): Contract {
    const contract = this.repository.getContract(id);
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${id}`);
    }

    return contract;
  }

  getExtraction(contractId: string): ContractExtraction {
    const extraction = this.repository.getExtraction(contractId);
    if (!extraction) {
      throw new NotFoundException(`Contract extraction not found: ${contractId}`);
    }

    return extraction;
  }

  getPrivacy(contractId: string): ContractPrivacy {
    const privacy = this.repository.getPrivacy(contractId);
    if (!privacy) {
      throw new NotFoundException(`Contract privacy not found: ${contractId}`);
    }

    return privacy;
  }

  createContract(dto: CreateContractDto): Contract {
    // OCR·저장 동의 게이트 — 미체크 업로드는 거부(T-DOC-01 결제급 마찰)
    if (!dto.ocrConsent) {
      throw new BadRequestException("OCR·저장 동의가 필요합니다.");
    }

    return this.repository.createContract(dto);
  }

  getManagerDashboard(): ManagerContractDashboard {
    return this.repository.getManagerDashboard();
  }

  getManagerReview(contractId: string): ManagerContractReview {
    const review = this.repository.getManagerReview(contractId);
    if (!review) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return review;
  }

  confirmManagerReview(contractId: string, dto: ManagerConfirmReviewDto): Contract {
    const review = this.repository.getManagerReview(contractId);
    if (!review) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }
    if (review.requiresDesktopReview) {
      throw new BadRequestException("확인 필요 항목이 남아 있어 데스크탑 검토가 필요합니다.");
    }

    const contract = this.repository.confirmManagerReview(contractId, dto);
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return contract;
  }

  requestManagerInfo(contractId: string, dto: ManagerInfoRequestDto): Contract {
    if (!dto.message?.trim()) {
      throw new BadRequestException("보완 요청 메시지가 필요합니다.");
    }

    const contract = this.repository.requestManagerInfo(contractId, {
      ...dto,
      message: dto.message.trim(),
    });
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return contract;
  }

  getManagerLifecycle(contractId: string): ManagerContractLifecycle {
    const lifecycle = this.repository.getManagerLifecycle(contractId);
    if (!lifecycle) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return lifecycle;
  }

  updateManagerLifecycle(contractId: string, dto: ManagerLifecycleDto): Contract {
    const allowed = ["unregistered", "analyzing", "active", "expiring_soon", "expired"];
    if (!allowed.includes(dto.lifecycle)) {
      throw new BadRequestException("지원하지 않는 계약 생애주기 상태입니다.");
    }

    const contract = this.repository.updateManagerLifecycle(contractId, dto);
    if (!contract) {
      throw new NotFoundException(`Contract not found: ${contractId}`);
    }

    return contract;
  }

  listManagerInvitations(): ManagerInvitation[] {
    return this.repository.listManagerInvitations();
  }

  createManagerInvitation(dto: ManagerInviteDto): ManagerInvitation {
    if (!dto.unitId?.trim()) {
      throw new BadRequestException("호실 정보가 필요합니다.");
    }

    return this.repository.createManagerInvitation({
      ...dto,
      unitId: dto.unitId.trim(),
    });
  }

  listManagerDeletionQueue(): ManagerDeletionQueueItem[] {
    return this.repository.listManagerDeletionQueue();
  }

  processManagerDeletion(contractId: string, dto: ManagerDeletionProcessDto): ContractPrivacy {
    const allowed = ["completed", "limited", "denied"];
    if (!allowed.includes(dto.result)) {
      throw new BadRequestException("삭제 처리 결과는 completed, limited, denied 중 하나여야 합니다.");
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException("삭제 처리 사유가 필요합니다.");
    }

    const privacy = this.repository.processManagerDeletion(contractId, {
      ...dto,
      reason: dto.reason.trim(),
    });
    if (!privacy) {
      throw new NotFoundException(`Contract privacy not found: ${contractId}`);
    }

    return privacy;
  }
}
