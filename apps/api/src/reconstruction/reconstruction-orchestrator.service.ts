// reconstruction-orchestrator.service — GPU 재구성 잡 상태머신(폴링 루프).
// 흐름: 큐 조회 → 인스턴스 기동 → SSM 온라인 대기 → 잡 투하(RUNNING) → 콜백(외부)이 DONE 승격 →
//        큐 공백 2틱이면 인스턴스 stop. 동시 1잡 직렬.
//
// 안전 원칙:
// - GPU_PIPELINE_ENABLED 및 필수 env 전부 있을 때만 폴링 시작 — 로컬 dev는 완전 비활성이 기본.
// - 폴링은 setTimeout 체인(setInterval 아님 — 틱 겹침 방지). 틱 전체 try/catch로 루프 불사(不死).
// - 크래시 복구는 별도 로직 불필요: 재기동 후 활성 잡을 jobCommandId로 재부착한다.
import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { SPLAT_ASSET_UPDATED_EVENT, type SplatSourceKind } from "@roomlog/types";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import {
  GpuInstanceService,
  isInsufficientCapacityError,
  type GpuInstance
} from "./gpu-instance.service";

/** 오케스트레이터가 읽고 쓰는 SplatAsset 필드(느슨한 로컬 타입 — prisma 제네릭과 분리). */
export interface ReconAssetRow {
  id: string;
  listingId: string | null;
  videoUrl: string | null;
  fileKind: string;
  status: string; // SplatAssetStatus
  jobState: string | null; // SplatReconstructionJobState
  jobError: string | null;
  jobCommandId: string | null;
  jobStartedAt: Date | null;
  jobAttempts: number;
}

/** 오케스트레이터가 쓰는 prisma 부분집합(실 PrismaClient는 구조적으로 캐스팅해 주입). */
export interface ReconPrisma {
  splatAsset: {
    findFirst(args: unknown): Promise<ReconAssetRow | null>;
    update(args: unknown): Promise<unknown>;
  };
  tradeListing: {
    findUnique(args: unknown): Promise<{ ownerId: string } | null>;
  };
}

export interface OrchestratorConfig {
  pollIntervalMs: number;
  maxAttempts: number;
  jobTimeoutMs: number; // RUNNING 벽시계 상한
  gpuStartingTimeoutMs: number; // GPU_STARTING 상한
  callbackGraceMs: number; // 커맨드 Success인데 콜백 미도착 유예
  capacityBackoffMs: number; // 용량 부족 시 재기동 백오프
  iters: number;
  publicApiBase: string;
  workerSecret: string;
}

/** 테스트 주입용 의존성 오버라이드. 프로덕션 DI에서는 미전달. */
export interface OrchestratorDeps {
  prisma: ReconPrisma;
  gpu: GpuInstance;
  gateway: Pick<RealtimeGateway, "notifyUsers">;
  now: () => number;
  config: Partial<OrchestratorConfig>;
}

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function defaultConfig(env: NodeJS.ProcessEnv): OrchestratorConfig {
  return {
    pollIntervalMs: envInt(env.GPU_POLL_INTERVAL_MS, 60_000),
    maxAttempts: envInt(env.GPU_MAX_ATTEMPTS, 2),
    jobTimeoutMs: envInt(env.GPU_JOB_TIMEOUT_MS, 4 * 60 * 60 * 1000),
    gpuStartingTimeoutMs: envInt(env.GPU_STARTING_TIMEOUT_MS, 30 * 60 * 1000),
    callbackGraceMs: envInt(env.GPU_CALLBACK_GRACE_MS, 5 * 60 * 1000),
    capacityBackoffMs: envInt(env.GPU_CAPACITY_BACKOFF_MS, 5 * 60 * 1000),
    iters: envInt(env.GPU_ITERS, 30_000),
    publicApiBase: (env.PUBLIC_API_BASE_URL ?? "").trim(),
    workerSecret: (env.GPU_WORKER_SECRET ?? "").trim()
  };
}

const JOB_ERROR_MAX_BYTES = 2 * 1024;
const ACTIVE_JOB_STATES = ["GPU_STARTING", "RUNNING"] as const;

function truncate(text: string, bytes = JOB_ERROR_MAX_BYTES): string {
  return text.length <= bytes ? text : text.slice(text.length - bytes);
}

@Injectable()
export class ReconstructionOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconstructionOrchestratorService.name);
  private readonly prisma?: ReconPrisma;
  private readonly gpu: GpuInstance;
  private readonly gateway: Pick<RealtimeGateway, "notifyUsers">;
  private readonly now: () => number;
  private readonly config: OrchestratorConfig;

  // 메모리 상태(재기동 시 리셋 — 안전한 기본값으로 수렴).
  private emptyQueueTicks = 0;
  private nextStartAttemptAt = 0; // 용량 부족 백오프 시각(epoch ms)
  private readonly successSeenAt = new Map<string, number>(); // 커맨드 Success 최초 관측 시각

  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running = false; // 틱 재진입 방지(setTimeout 체인이라 이론상 불필요하나 방어적)

  constructor(
    gpu: GpuInstanceService,
    gateway: RealtimeGateway,
    // @Optional: 프로덕션 DI에서는 미전달(Nest가 undefined 주입). 테스트만 fake 의존성을 넣는다.
    @Optional() deps?: Partial<OrchestratorDeps>
  ) {
    this.gpu = deps?.gpu ?? gpu;
    this.gateway = deps?.gateway ?? gateway;
    this.now = deps?.now ?? (() => Date.now());
    this.config = { ...defaultConfig(process.env), ...deps?.config };

    if (deps?.prisma) {
      this.prisma = deps.prisma;
    } else {
      const databaseUrl = process.env.DATABASE_URL?.trim();
      if (databaseUrl) {
        const adapter = new PrismaPg({ connectionString: databaseUrl });
        this.prisma = new PrismaClient({ adapter }) as unknown as ReconPrisma;
      }
    }
  }

  onModuleInit(): void {
    const missing = this.missingGateEnv();
    if (missing.length > 0) {
      this.logger.log(`GPU pipeline disabled: ${missing.join(", ")}`);
      return;
    }
    this.logger.log(
      `GPU pipeline enabled (poll=${this.config.pollIntervalMs}ms, maxAttempts=${this.config.maxAttempts}, jobTimeout=${this.config.jobTimeoutMs}ms)`
    );
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** 활성 게이트 미충족 사유 목록(비어 있으면 활성). */
  private missingGateEnv(): string[] {
    const missing: string[] = [];
    if (!isTruthy(process.env.GPU_PIPELINE_ENABLED)) missing.push("GPU_PIPELINE_ENABLED");
    if (!process.env.GPU_INSTANCE_ID?.trim()) missing.push("GPU_INSTANCE_ID");
    if (!process.env.GPU_REGION?.trim()) missing.push("GPU_REGION");
    if (!this.config.workerSecret) missing.push("GPU_WORKER_SECRET");
    if (!this.config.publicApiBase) missing.push("PUBLIC_API_BASE_URL");
    if (!this.prisma) missing.push("DATABASE_URL");
    return missing;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.runTick(), this.config.pollIntervalMs);
    this.timer.unref?.();
  }

  private async runTick(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      // 틱은 절대 죽지 않는다 — 로그만 남기고 다음 틱으로.
      this.logger.error(`orchestrator tick failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }

  /** 한 틱: 활성 잡 진행 or 큐 처리 or idle-stop. 외부(테스트)에서 직접 호출 가능. */
  async tick(): Promise<void> {
    if (!this.prisma) return;
    const now = this.now();

    // 1) 활성 잡(GPU_STARTING | RUNNING) 1건.
    const active = await this.prisma.splatAsset.findFirst({
      where: { jobState: { in: [...ACTIVE_JOB_STATES] } },
      orderBy: { jobStartedAt: "asc" }
    });
    if (active) {
      this.emptyQueueTicks = 0;
      if (active.jobState === "RUNNING") {
        await this.handleRunning(active, now);
      } else {
        await this.handleStarting(active, now);
      }
      return; // 동시 1잡 — 활성 잡 있으면 틱 종료.
    }

    // 2) 큐: PROCESSING & (jobState null | QUEUED), createdAt 오름차순 1건.
    const queued = await this.prisma.splatAsset.findFirst({
      where: { status: "PROCESSING", OR: [{ jobState: null }, { jobState: "QUEUED" }] },
      orderBy: { createdAt: "asc" }
    });
    if (!queued) {
      await this.maybeIdleStop();
      return;
    }
    this.emptyQueueTicks = 0;

    // 3) 인스턴스 확보.
    const state = await this.gpu.describeState();
    if (state === "stopped") {
      if (now < this.nextStartAttemptAt) return; // 용량 백오프 중.
      try {
        await this.gpu.startInstance();
      } catch (err) {
        if (isInsufficientCapacityError(err)) {
          this.nextStartAttemptAt = now + this.config.capacityBackoffMs;
          this.logger.warn(
            `GPU 용량 부족 — ${Math.round(this.config.capacityBackoffMs / 1000)}초 백오프(재시도 예산 미소모).`
          );
          return; // jobAttempts 소모 안 함.
        }
        throw err; // 그 외 에러는 상위 try/catch로.
      }
      this.nextStartAttemptAt = 0;
      await this.setState(queued, { jobState: "GPU_STARTING", jobStartedAt: new Date(now) });
      return;
    }
    if (state === "running") {
      // 이미 켜져 있으면 바로 GPU_STARTING으로 승격 — 다음 틱에 SSM 온라인 확인 후 투하.
      await this.setState(queued, { jobState: "GPU_STARTING", jobStartedAt: new Date(now) });
      return;
    }
    // pending | stopping | 기타 전이 상태 → 다음 틱 대기.
  }

  private async handleStarting(active: ReconAssetRow, now: number): Promise<void> {
    const startedAt = active.jobStartedAt?.getTime() ?? now;
    if (now - startedAt > this.config.gpuStartingTimeoutMs) {
      await this.failJob(active, "GPU 기동/SSM 온라인 대기 30분 초과");
      return;
    }
    const online = await this.gpu.isSsmOnline();
    if (!online) return; // 아직 대기.
    await this.dispatch(active, now);
  }

  private async dispatch(active: ReconAssetRow, now: number): Promise<void> {
    const sourceUrl = this.absolutize(active.videoUrl);
    const sourceKind: SplatSourceKind = active.fileKind === "video" ? "video" : "record3d-zip";
    const commandId = await this.gpu.sendJobCommand({
      assetId: active.id,
      sourceUrl,
      sourceKind,
      callbackBase: this.config.publicApiBase,
      workerSecret: this.config.workerSecret,
      iters: this.config.iters
    });
    await this.setState(active, {
      jobState: "RUNNING",
      jobCommandId: commandId,
      jobStartedAt: new Date(now),
      jobAttempts: { increment: 1 }
    });
    this.logger.log(`잡 투하 asset=${active.id} command=${commandId} attempt=${active.jobAttempts + 1}`);
  }

  private async handleRunning(active: ReconAssetRow, now: number): Promise<void> {
    const startedAt = active.jobStartedAt?.getTime() ?? now;

    // 벽시계 상한 — 커맨드가 무엇을 반환하든 하드 실패.
    if (now - startedAt > this.config.jobTimeoutMs) {
      if (active.jobCommandId) await this.safeCancel(active.jobCommandId);
      this.successSeenAt.delete(active.id);
      await this.failJob(active, `재구성 벽시계 타임아웃(${Math.round(this.config.jobTimeoutMs / 60000)}분 초과)`);
      return;
    }

    if (!active.jobCommandId) {
      // RUNNING인데 커맨드 id가 없다(비정상) → 재큐.
      this.logger.warn(`RUNNING asset=${active.id}에 jobCommandId 없음 — 재큐.`);
      await this.requeue(active);
      return;
    }

    let statusInfo;
    try {
      statusInfo = await this.gpu.getCommandStatus(active.jobCommandId);
    } catch (err) {
      // 커맨드 조회 실패(유실) → 재큐(전달 직후 일시적 InvocationDoesNotExist가 흔함).
      this.logger.warn(`커맨드 조회 실패 asset=${active.id} command=${active.jobCommandId} — 재큐: ${(err as Error).message}`);
      await this.requeue(active);
      return;
    }

    const s = statusInfo.status;
    if (s === "Success") {
      // 커맨드는 성공. 콜백이 도착했다면 이 자산은 이미 DONE이라 여기 안 온다.
      // 즉 콜백 미도착 상태 — 유예 후 실패 처리.
      const firstSeen = this.successSeenAt.get(active.id);
      if (firstSeen == null) {
        this.successSeenAt.set(active.id, now);
        return; // 콜백 유예 시작.
      }
      if (now - firstSeen > this.config.callbackGraceMs) {
        this.successSeenAt.delete(active.id);
        await this.failJob(active, "GPU 재구성 커맨드는 성공했으나 spz 콜백이 도착하지 않음(유예 초과)");
      }
      return;
    }

    this.successSeenAt.delete(active.id);
    if (s === "Failed" || s === "Cancelled" || s === "TimedOut") {
      await this.failOrRequeue(active, truncate(statusInfo.stderrTail || `GPU 커맨드 ${s}`));
      return;
    }
    // InProgress | Pending | Delayed | Cancelling → 진행 중, 다음 틱 대기.
  }

  private async maybeIdleStop(): Promise<void> {
    const state = await this.gpu.describeState();
    if (state !== "running") {
      this.emptyQueueTicks = 0;
      return;
    }
    // 큐가 비고 인스턴스가 켜져 있음 — 2틱 연속 공백이면 정지(스퓨리어스 정지 방지).
    this.emptyQueueTicks += 1;
    if (this.emptyQueueTicks >= 2) {
      this.logger.log("큐 2틱 연속 공백 — GPU 인스턴스 정지.");
      await this.gpu.stopInstance();
      this.emptyQueueTicks = 0;
    }
  }

  /** 재시도 예산 남으면 재큐, 소진이면 FAILED. (dispatch에서 이미 attempts++ 됨) */
  private async failOrRequeue(active: ReconAssetRow, reason: string): Promise<void> {
    if (active.jobAttempts < this.config.maxAttempts) {
      await this.requeue(active);
      this.logger.warn(`잡 재시도 asset=${active.id} (attempt ${active.jobAttempts}/${this.config.maxAttempts})`);
    } else {
      await this.failJob(active, reason);
    }
  }

  private async requeue(active: ReconAssetRow): Promise<void> {
    this.successSeenAt.delete(active.id);
    await this.setState(active, { jobState: "QUEUED", jobCommandId: null, jobStartedAt: null });
  }

  private async failJob(active: ReconAssetRow, reason: string): Promise<void> {
    this.successSeenAt.delete(active.id);
    await this.setState(active, { status: "FAILED", jobState: "FAILED", jobError: truncate(reason) });
    this.logger.error(`잡 실패 asset=${active.id}: ${reason}`);
    await this.notifyOwner(active, "FAILED");
  }

  private async setState(active: ReconAssetRow, data: Record<string, unknown>): Promise<void> {
    await this.prisma!.splatAsset.update({ where: { id: active.id }, data });
  }

  private async notifyOwner(active: ReconAssetRow, status: "FAILED" | "UPLOADED"): Promise<void> {
    if (!active.listingId) return; // 소유자 미상(방 자산 등) — 알림 생략.
    try {
      const listing = await this.prisma!.tradeListing.findUnique({
        where: { id: active.listingId },
        select: { ownerId: true }
      });
      if (!listing?.ownerId) return;
      this.gateway.notifyUsers([listing.ownerId], SPLAT_ASSET_UPDATED_EVENT, {
        assetId: active.id,
        listingId: active.listingId,
        status
      });
    } catch (err) {
      this.logger.warn(`소유자 알림 실패 asset=${active.id}: ${(err as Error).message}`);
    }
  }

  private async safeCancel(commandId: string): Promise<void> {
    try {
      await this.gpu.cancelCommand(commandId);
    } catch (err) {
      this.logger.warn(`커맨드 취소 실패 command=${commandId}: ${(err as Error).message}`);
    }
  }

  /** videoUrl을 PUBLIC_API_BASE_URL 기준 절대 URL로. 이미 절대면 그대로. */
  private absolutize(url: string | null): string {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.config.publicApiBase.replace(/\/+$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
