import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";
import { ContractService } from "./contract.service";
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

@Controller("contracts")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Get()
  listContracts(): Contract[] {
    return this.contractService.listContracts();
  }

  @Get("manager/dashboard")
  getManagerDashboard(): ManagerContractDashboard {
    return this.contractService.getManagerDashboard();
  }

  @Get("manager/invitations")
  listManagerInvitations(): ManagerInvitation[] {
    return this.contractService.listManagerInvitations();
  }

  @Post("manager/invitations")
  createManagerInvitation(@Body() dto: ManagerInviteDto): ManagerInvitation {
    return this.contractService.createManagerInvitation(dto);
  }

  @Get("manager/deletions")
  listManagerDeletionQueue(): ManagerDeletionQueueItem[] {
    return this.contractService.listManagerDeletionQueue();
  }

  @Get("manager/:id/review")
  getManagerReview(@Param("id") id: string): ManagerContractReview {
    return this.contractService.getManagerReview(id);
  }

  @Post("manager/:id/review/confirm")
  confirmManagerReview(
    @Param("id") id: string,
    @Body() dto: ManagerConfirmReviewDto,
  ): Contract {
    return this.contractService.confirmManagerReview(id, dto);
  }

  @Post("manager/:id/review/info-request")
  requestManagerInfo(
    @Param("id") id: string,
    @Body() dto: ManagerInfoRequestDto,
  ): Contract {
    return this.contractService.requestManagerInfo(id, dto);
  }

  @Get("manager/:id/lifecycle")
  getManagerLifecycle(@Param("id") id: string): ManagerContractLifecycle {
    return this.contractService.getManagerLifecycle(id);
  }

  @Patch("manager/:id/lifecycle")
  updateManagerLifecycle(
    @Param("id") id: string,
    @Body() dto: ManagerLifecycleDto,
  ): Contract {
    return this.contractService.updateManagerLifecycle(id, dto);
  }

  @Post("manager/:id/deletion")
  processManagerDeletion(
    @Param("id") id: string,
    @Body() dto: ManagerDeletionProcessDto,
  ): ContractPrivacy {
    return this.contractService.processManagerDeletion(id, dto);
  }

  @Get(":id")
  getContract(@Param("id") id: string): Contract {
    return this.contractService.getContract(id);
  }

  @Get(":id/extraction")
  getExtraction(@Param("id") id: string): ContractExtraction {
    return this.contractService.getExtraction(id);
  }

  @Get(":id/privacy")
  getPrivacy(@Param("id") id: string): ContractPrivacy {
    return this.contractService.getPrivacy(id);
  }

  @Post()
  createContract(@Body() dto: CreateContractDto): Contract {
    return this.contractService.createContract(dto);
  }
}
