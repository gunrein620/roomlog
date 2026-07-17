import {
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type OnModuleDestroy
} from "@nestjs/common";
import { DomainEventDispatcher } from "../domain-events/domain-event.dispatcher";
import { CreditModule } from "../credit/credit.module";
import {
  DOMAIN_EVENT_REPOSITORY,
  type DomainEventRepository
} from "../domain-events/domain-event.repository";
import { DomainEventsModule } from "../domain-events/domain-events.module";
import { RoomlogController } from "./roomlog.controller";
import {
  ROOMLOG_SERVICE_OPTIONS,
  RoomlogService,
  RoomlogServiceOptions,
  coreDemoLoginAccounts,
  type AuthAccountRepository,
  type Store,
  type StoreProjector,
  type VendorActivationProvider
} from "./roomlog.service";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { PrismaVendorActivationRepository } from "./prisma-vendor-activation.repository";
import { UnavailableVendorActivationRepository } from "./unavailable-vendor-activation.repository";
import { loadVendorActivationSecurityConfig } from "./services/vendor-activation-security";
import { PrismaAuthRepository } from "./prisma-auth-repository";
import { RealtimeModule } from "../realtime/realtime.module";
import {
  MANAGER_VENDOR_REPOSITORY,
  type ManagerVendorRepository
} from "./manager-vendor.repository";
import { PrismaManagerVendorRepository } from "./prisma-manager-vendor.repository";
import { PrismaVendorWorkflowRepository } from "./prisma-vendor-workflow.repository";
import { PrismaTenantVendorConnectionRepository } from "./prisma-tenant-vendor-connection.repository";
import { RoomlogManagerVendorDomain } from "./services/roomlog-manager-vendor.domain";
import { RoomlogVendorWorkflowDomain } from "./services/roomlog-vendor-workflow.domain";
import { RoomlogTenantVendorConnectionDomain } from "./services/roomlog-tenant-vendor-connection.domain";
import {
  NoopFinancialCostReader,
  PrismaFinancialCostReader,
  type FinancialCostReader
} from "./services/prisma-financial-cost.reader";
import {
  createVendorCompletionPrivateStorage,
  type VendorCompletionPrivateStorage
} from "./vendor-completion-storage";
import { CompletionCreditDeliveryWorker } from "./completion-credit-delivery.worker";
import { VendorCompletionAttachmentService } from "./vendor-completion-attachment.service";
import {
  VENDOR_COMPLETION_CREDIT_BOUNDARY
} from "./vendor-completion-credit.boundary";
import { CreditVendorCompletionAdapter } from "./credit-vendor-completion.adapter";
import {
  VENDOR_WORKFLOW_REPOSITORY,
  type VendorWorkflowRepository
} from "./vendor-workflow.repository";
import {
  TENANT_VENDOR_CONNECTION_REPOSITORY,
  type TenantVendorConnectionRepository
} from "./tenant-vendor-connection.repository";
import {
  TENANT_COMPLAINT_DRAFT_REPOSITORY,
  type TenantComplaintDraftRepository
} from "./tenant-complaint-draft.repository";
import { PrismaTenantComplaintDraftRepository } from "./prisma-tenant-complaint-draft.repository";
import {
  RoomlogTenantComplaintDraftDomain,
  TenantComplaintDraftCleanupWorker
} from "./services/roomlog-tenant-complaint-draft.domain";

export const VENDOR_COMPLETION_STORAGE = Symbol("VENDOR_COMPLETION_STORAGE");

function workflowUnavailable(): never {
  throw new ServiceUnavailableException(
    "DATABASE_URL이 없어 업체 관리와 작업 데이터를 조회하거나 저장할 수 없습니다."
  );
}

class UnavailableManagerVendorRepository implements ManagerVendorRepository {
  async searchCatalog() {
    return workflowUnavailable();
  }
  async list() {
    return workflowUnavailable();
  }
  async getDetail() {
    return workflowUnavailable();
  }
  async findJobByTicket() {
    return workflowUnavailable();
  }
  async register(): Promise<never> {
    return workflowUnavailable();
  }
  async updateNote(): Promise<never> {
    return workflowUnavailable();
  }
  async archive(): Promise<never> {
    return workflowUnavailable();
  }
}

class UnavailableVendorWorkflowRepository implements VendorWorkflowRepository {
  async listJobs() {
    return workflowUnavailable();
  }
  async getJob() {
    return workflowUnavailable();
  }
  async listSettlements() {
    return workflowUnavailable();
  }
  async assignVendor(): Promise<never> {
    return workflowUnavailable();
  }
  async saveEstimateDraft(): Promise<never> {
    return workflowUnavailable();
  }
  async submitEstimate(): Promise<never> {
    return workflowUnavailable();
  }
  async withdrawEstimate(): Promise<never> {
    return workflowUnavailable();
  }
  async reviewEstimate(): Promise<never> {
    return workflowUnavailable();
  }
  async confirmEstimateVisit(): Promise<never> {
    return workflowUnavailable();
  }
  async scheduleApprovedJob(): Promise<never> {
    return workflowUnavailable();
  }
  async startJob(): Promise<never> {
    return workflowUnavailable();
  }
  async saveCompletionAttachment(): Promise<never> {
    return workflowUnavailable();
  }
  async findCompletionAttachmentForAccess(): Promise<never> {
    return workflowUnavailable();
  }
  async submitCompletion(): Promise<never> {
    return workflowUnavailable();
  }
  async decideCompletion(): Promise<never> {
    return workflowUnavailable();
  }
  async getTenantWorkflow(): Promise<never> {
    return workflowUnavailable();
  }
  async reviewTenantEstimate(): Promise<never> {
    return workflowUnavailable();
  }
  async confirmTenantEstimateVisit(): Promise<never> {
    return workflowUnavailable();
  }
  async decideTenantCompletion(): Promise<never> {
    return workflowUnavailable();
  }
}

class UnavailableTenantVendorConnectionRepository
  implements TenantVendorConnectionRepository {
  async search(): Promise<never> {
    return workflowUnavailable();
  }
  async findEligibleCandidate(): Promise<never> {
    return workflowUnavailable();
  }
  async requestVendor(): Promise<never> {
    return workflowUnavailable();
  }
  async readWorkflowAuthority(): Promise<never> {
    return workflowUnavailable();
  }
}

class UnavailableTenantComplaintDraftRepository implements TenantComplaintDraftRepository {
  private unavailable(): never {
    throw new ServiceUnavailableException("DATABASE_URL이 없어 민원 초안을 저장할 수 없습니다.");
  }
  async findActive(): Promise<never> { return this.unavailable(); }
  async upsert(): Promise<never> { return this.unavailable(); }
  async delete(): Promise<never> { return this.unavailable(); }
  async deleteExpired(): Promise<never> { return this.unavailable(); }
}

export function createManagerVendorRepository(
  env: NodeJS.ProcessEnv = process.env
): ManagerVendorRepository {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? new PrismaManagerVendorRepository(databaseUrl)
    : new UnavailableManagerVendorRepository();
}

export function createVendorWorkflowRepository(
  env: NodeJS.ProcessEnv = process.env,
  events: DomainEventRepository
): VendorWorkflowRepository {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? new PrismaVendorWorkflowRepository(databaseUrl, events)
    : new UnavailableVendorWorkflowRepository();
}

export function createTenantVendorConnectionRepository(
  env: NodeJS.ProcessEnv = process.env,
  events: DomainEventRepository
): TenantVendorConnectionRepository {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? new PrismaTenantVendorConnectionRepository(databaseUrl, events)
    : new UnavailableTenantVendorConnectionRepository();
}

export function createTenantComplaintDraftRepository(
  env: NodeJS.ProcessEnv = process.env
): TenantComplaintDraftRepository {
  const databaseUrl = env.DATABASE_URL?.trim();
  return databaseUrl
    ? new PrismaTenantComplaintDraftRepository(databaseUrl)
    : new UnavailableTenantComplaintDraftRepository();
}

@Injectable()
class RoomlogWorkflowResourceLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(MANAGER_VENDOR_REPOSITORY)
    private readonly managerVendors: ManagerVendorRepository,
    @Inject(VENDOR_WORKFLOW_REPOSITORY)
    private readonly vendorWorkflow: VendorWorkflowRepository,
    @Inject(TENANT_VENDOR_CONNECTION_REPOSITORY)
    private readonly tenantVendorConnection: TenantVendorConnectionRepository
  ) {}

  async onModuleDestroy() {
    await Promise.all([
      (this.managerVendors as ManagerVendorRepository & { close?(): Promise<void> }).close?.(),
      (this.vendorWorkflow as VendorWorkflowRepository & { close?(): Promise<void> }).close?.(),
      (
        this.tenantVendorConnection as TenantVendorConnectionRepository & {
          close?(): Promise<void>;
        }
      ).close?.()
    ]);
  }
}

export type RoomlogServiceOptionFactories = {
  createStoreProjector(databaseUrl: string): StoreProjector;
  createAuthRepository(databaseUrl: string): AuthAccountRepository;
  createFinancialCostReader(databaseUrl: string): FinancialCostReader;
  createVendorActivationRepository(
    databaseUrl: string
  ): VendorActivationProvider;
  createUnavailableVendorActivationRepository(): VendorActivationProvider;
};

const defaultFactories: RoomlogServiceOptionFactories = {
  createStoreProjector: (databaseUrl) => new PrismaStoreProjector(databaseUrl),
  createAuthRepository: (databaseUrl) => new PrismaAuthRepository(databaseUrl),
  createFinancialCostReader: (databaseUrl) =>
    new PrismaFinancialCostReader(databaseUrl),
  createVendorActivationRepository: (databaseUrl) =>
    new PrismaVendorActivationRepository(databaseUrl),
  createUnavailableVendorActivationRepository: () =>
    new UnavailableVendorActivationRepository()
};

/**
 * DB 부팅 스토어에 핵심 데모 계정이 빠져 있으면 병합하고 DB에도 동기 커밋한다.
 * DB가 원본인 환경에서 계정 데이터가 유실돼도(2026-07-16 프로드 사고: DB에 계정이
 * 없는 채로 부팅해 메모리 데모 계정까지 증발) 데모 로그인은 부팅 시 항상 복구된다.
 */
export async function ensureCoreDemoLoginAccounts(
  store: Pick<Store, "users">,
  authRepository?: AuthAccountRepository
): Promise<void> {
  for (const account of coreDemoLoginAccounts()) {
    if (store.users.some((user) => user.email === account.email)) continue;

    store.users.push(account);
    try {
      await authRepository?.saveUser(account);
    } catch {
      // DB 커밋이 실패해도 메모리 병합만으로 데모 로그인은 동작한다 — 다음 프로젝션이 따라잡는다.
    }
  }
}

export async function createRoomlogServiceOptions(
  env: NodeJS.ProcessEnv = process.env,
  optionalFactories: Partial<RoomlogServiceOptionFactories> = {}
): Promise<RoomlogServiceOptions> {
  const security = loadVendorActivationSecurityConfig(env);
  const databaseUrl = env.DATABASE_URL?.trim();
  const factories = { ...defaultFactories, ...optionalFactories };
  let storeProjector: StoreProjector | undefined;
  let authRepository: AuthAccountRepository | undefined;
  let financialCostReader: FinancialCostReader | undefined;
  let vendorActivationRepository: VendorActivationProvider | undefined;

  try {
    storeProjector = databaseUrl
      ? factories.createStoreProjector(databaseUrl)
      : undefined;
    const initialStore = await storeProjector?.load?.();
    if (initialStore) {
      authRepository = databaseUrl
        ? factories.createAuthRepository(databaseUrl)
        : undefined;
      await ensureCoreDemoLoginAccounts(initialStore, authRepository);
    }
    financialCostReader = databaseUrl
      ? factories.createFinancialCostReader(databaseUrl)
      : new NoopFinancialCostReader();

    vendorActivationRepository =
      databaseUrl && security
        ? factories.createVendorActivationRepository(databaseUrl)
        : factories.createUnavailableVendorActivationRepository();
    authRepository ??= databaseUrl
      ? factories.createAuthRepository(databaseUrl)
      : undefined;

    return {
      initialStore,
      storeProjector,
      // 인증 계정은 DB를 단일 원본으로 — 가입/로그인/소셜이 응답 전에 동기 커밋·직접 조회한다.
      authRepository,
      financialCostReader,
      vendorActivationRepository,
      vendorActivationSecurity:
        databaseUrl && security ? security : undefined
    };
  } catch (error) {
    try {
      await financialCostReader?.close?.();
    } catch {}

    try {
      await vendorActivationRepository?.close();
    } catch {}

    try {
      await authRepository?.disconnect?.();
    } catch {}

    if (
      storeProjector &&
      (storeProjector as unknown as object) !==
        (vendorActivationRepository as unknown as object)
    ) {
      try {
        await storeProjector.disconnect?.();
      } catch {}
    }

    throw error;
  }
}

@Module({
  imports: [RealtimeModule, DomainEventsModule, CreditModule],
  controllers: [RoomlogController],
  providers: [
    {
      provide: ROOMLOG_SERVICE_OPTIONS,
      useFactory: async () => createRoomlogServiceOptions()
    },
    RoomlogService,
    {
      provide: MANAGER_VENDOR_REPOSITORY,
      useFactory: () => createManagerVendorRepository()
    },
    {
      provide: VENDOR_WORKFLOW_REPOSITORY,
      inject: [DOMAIN_EVENT_REPOSITORY],
      useFactory: (events: DomainEventRepository) =>
        createVendorWorkflowRepository(process.env, events)
    },
    {
      provide: TENANT_VENDOR_CONNECTION_REPOSITORY,
      inject: [DOMAIN_EVENT_REPOSITORY],
      useFactory: (events: DomainEventRepository) =>
        createTenantVendorConnectionRepository(process.env, events)
    },
    {
      provide: TENANT_COMPLAINT_DRAFT_REPOSITORY,
      useFactory: () => createTenantComplaintDraftRepository()
    },
    {
      provide: RoomlogManagerVendorDomain,
      inject: [MANAGER_VENDOR_REPOSITORY],
      useFactory: (repository: ManagerVendorRepository) =>
        new RoomlogManagerVendorDomain(repository)
    },
    {
      provide: RoomlogVendorWorkflowDomain,
      inject: [VENDOR_WORKFLOW_REPOSITORY, RoomlogService, DomainEventDispatcher],
      useFactory: (
        repository: VendorWorkflowRepository,
        vendorAccounts: RoomlogService,
        events: DomainEventDispatcher
      ) => new RoomlogVendorWorkflowDomain(repository, vendorAccounts, events)
    },
    {
      provide: RoomlogTenantVendorConnectionDomain,
      inject: [TENANT_VENDOR_CONNECTION_REPOSITORY, RoomlogService],
      useFactory: (
        repository: TenantVendorConnectionRepository,
        storeBridge: RoomlogService
      ) => new RoomlogTenantVendorConnectionDomain(repository, {}, storeBridge)
    },
    {
      provide: RoomlogTenantComplaintDraftDomain,
      inject: [TENANT_COMPLAINT_DRAFT_REPOSITORY, RoomlogService],
      useFactory: (
        repository: TenantComplaintDraftRepository,
        roomlogService: RoomlogService
      ) => new RoomlogTenantComplaintDraftDomain(
        repository,
        {
          canAccessRoom: (tenantId, roomId) =>
            roomlogService.listTenantRooms(tenantId).some((room) => room.roomId === roomId)
        }
      )
    },
    {
      provide: TenantComplaintDraftCleanupWorker,
      inject: [TENANT_COMPLAINT_DRAFT_REPOSITORY],
      useFactory: (repository: TenantComplaintDraftRepository) =>
        new TenantComplaintDraftCleanupWorker(repository)
    },
    {
      provide: VENDOR_COMPLETION_STORAGE,
      useFactory: (): VendorCompletionPrivateStorage =>
        createVendorCompletionPrivateStorage(
          process.env,
          process.env.LOCAL_UPLOAD_DIR ?? "uploads"
        )
    },
    {
      provide: VendorCompletionAttachmentService,
      inject: [VENDOR_WORKFLOW_REPOSITORY, RoomlogService, VENDOR_COMPLETION_STORAGE],
      useFactory: (
        repository: VendorWorkflowRepository,
        vendorAccounts: RoomlogService,
        storage: VendorCompletionPrivateStorage
      ) => new VendorCompletionAttachmentService(repository, vendorAccounts, storage)
    },
    CreditVendorCompletionAdapter,
    {
      provide: VENDOR_COMPLETION_CREDIT_BOUNDARY,
      useExisting: CreditVendorCompletionAdapter
    },
    CompletionCreditDeliveryWorker,
    RoomlogWorkflowResourceLifecycle
  ],
  // 거래(trade) 모듈이 같은 토큰 인증을 재사용한다.
  exports: [RoomlogService]
})
export class RoomlogModule {}
