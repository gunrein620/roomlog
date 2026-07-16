import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  ReconstructionOrchestratorService,
  type OrchestratorConfig,
  type ReconAssetRow,
  type ReconPrisma
} from "./reconstruction-orchestrator.service";
import {
  InsufficientCapacityError,
  type CommandStatus,
  type Ec2InstanceState,
  type GpuInstance
} from "./gpu-instance.service";
import { buildJobCommand } from "./remote-job-command";

// ─── fakes (NestJS Testing 없이 직접 인스턴스화 + 주입) ──────────────────────

type StoredAsset = ReconAssetRow & { createdAt: Date };

class FakePrisma implements ReconPrisma {
  assets: StoredAsset[] = [];
  listings: Record<string, { ownerId: string }> = {};

  splatAsset = {
    findFirst: async (args: any): Promise<ReconAssetRow | null> => {
      const where = args.where;
      let matches: StoredAsset[];
      if (where.jobState?.in) {
        matches = this.assets.filter((a) => where.jobState.in.includes(a.jobState));
        matches.sort((x, y) => (x.jobStartedAt?.getTime() ?? 0) - (y.jobStartedAt?.getTime() ?? 0));
      } else {
        // 큐 조회: PROCESSING & (jobState null | QUEUED), createdAt 오름차순.
        matches = this.assets.filter(
          (a) => a.status === "PROCESSING" && (a.jobState == null || a.jobState === "QUEUED")
        );
        matches.sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
      }
      return matches[0] ?? null;
    },
    update: async (args: any) => {
      const a: any = this.assets.find((x) => x.id === args.where.id);
      if (!a) return null;
      for (const [k, v] of Object.entries(args.data)) {
        if (v && typeof v === "object" && "increment" in (v as any)) {
          a[k] = (a[k] ?? 0) + (v as any).increment;
        } else {
          a[k] = v;
        }
      }
      return a;
    }
  };

  tradeListing = {
    findUnique: async (args: any) => this.listings[args.where.id] ?? null
  };
}

class FakeGpu implements GpuInstance {
  state: Ec2InstanceState = "stopped";
  ssmOnline = true;
  commandStatus: CommandStatus = { status: "InProgress", stdoutTail: "", stderrTail: "" };
  nextCommandId = "cmd-1";
  startBehavior: () => void = () => {};
  getStatusBehavior: () => CommandStatus = () => this.commandStatus;
  calls = { describe: 0, start: 0, stop: 0, ssm: 0, send: 0, getStatus: 0, cancel: 0 };

  async describeState() {
    this.calls.describe++;
    return this.state;
  }
  async startInstance() {
    this.calls.start++;
    this.startBehavior();
    this.state = "running";
  }
  async stopInstance() {
    this.calls.stop++;
    this.state = "stopped";
  }
  async isSsmOnline() {
    this.calls.ssm++;
    return this.ssmOnline;
  }
  async sendJobCommand() {
    this.calls.send++;
    return this.nextCommandId;
  }
  async getCommandStatus() {
    this.calls.getStatus++;
    return this.getStatusBehavior();
  }
  async cancelCommand() {
    this.calls.cancel++;
  }
}

interface NotifyCall {
  ids: string[];
  event: string;
  payload: Record<string, unknown>;
}

function makeAsset(over: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id: over.id ?? "splat_a",
    listingId: over.listingId ?? "listing-1",
    videoUrl: over.videoUrl ?? "/api/files/source.mp4",
    fileKind: over.fileKind ?? "video",
    status: over.status ?? "PROCESSING",
    jobState: over.jobState ?? null,
    jobError: over.jobError ?? null,
    jobCommandId: over.jobCommandId ?? null,
    jobStartedAt: over.jobStartedAt ?? null,
    jobAttempts: over.jobAttempts ?? 0,
    createdAt: over.createdAt ?? new Date(1000)
  };
}

function harness(configOver: Partial<OrchestratorConfig> = {}) {
  const prisma = new FakePrisma();
  const gpu = new FakeGpu();
  const notifies: NotifyCall[] = [];
  const gateway = {
    notifyUsers: (ids: string[], event: string, payload: Record<string, unknown>) =>
      notifies.push({ ids, event, payload })
  };
  let clock = 1_000_000;
  const config: Partial<OrchestratorConfig> = {
    pollIntervalMs: 60_000,
    maxAttempts: 2,
    jobTimeoutMs: 4 * 60 * 60 * 1000,
    gpuStartingTimeoutMs: 30 * 60 * 1000,
    callbackGraceMs: 5 * 60 * 1000,
    capacityBackoffMs: 5 * 60 * 1000,
    iters: 30_000,
    publicApiBase: "https://api.test",
    workerSecret: "worker-secret",
    ...configOver
  };
  const service = new ReconstructionOrchestratorService(gpu as any, gateway as any, {
    prisma,
    gpu,
    gateway,
    now: () => clock,
    config
  });
  return {
    service,
    prisma,
    gpu,
    notifies,
    setClock: (t: number) => (clock = t),
    advance: (ms: number) => (clock += ms),
    now: () => clock
  };
}

// ─── 게이트 OFF ───────────────────────────────────────────────────────────

describe("orchestrator gate", () => {
  it("필수 env 미충족이면 onModuleInit이 폴링을 시작하지 않는다", () => {
    const prev = { ...process.env };
    delete process.env.GPU_PIPELINE_ENABLED;
    delete process.env.GPU_INSTANCE_ID;
    delete process.env.GPU_REGION;
    try {
      const { service } = harness();
      service.onModuleInit();
      assert.equal((service as any).timer, undefined, "게이트 OFF면 타이머가 없어야 한다");
    } finally {
      Object.assign(process.env, prev);
    }
  });
});

// ─── 정상 전이 ─────────────────────────────────────────────────────────────

describe("orchestrator 정상 전이", () => {
  it("QUEUED → GPU_STARTING → RUNNING", async () => {
    const h = harness();
    h.prisma.assets.push(makeAsset({ jobState: null }));
    h.gpu.state = "stopped";

    // 틱1: 큐 발견 → 인스턴스 기동 → GPU_STARTING.
    await h.service.tick();
    assert.equal(h.gpu.calls.start, 1);
    assert.equal(h.prisma.assets[0].jobState, "GPU_STARTING");
    assert.ok(h.prisma.assets[0].jobStartedAt, "jobStartedAt 기록");

    // 틱2: GPU_STARTING + SSM online → 잡 투하 → RUNNING.
    h.gpu.ssmOnline = true;
    await h.service.tick();
    assert.equal(h.gpu.calls.send, 1);
    assert.equal(h.prisma.assets[0].jobState, "RUNNING");
    assert.equal(h.prisma.assets[0].jobCommandId, "cmd-1");
    assert.equal(h.prisma.assets[0].jobAttempts, 1);
  });

  it("인스턴스가 이미 running이면 바로 GPU_STARTING으로 승격", async () => {
    const h = harness();
    h.prisma.assets.push(makeAsset({ jobState: "QUEUED" }));
    h.gpu.state = "running";
    await h.service.tick();
    assert.equal(h.gpu.calls.start, 0, "이미 켜져 있으면 start 안 함");
    assert.equal(h.prisma.assets[0].jobState, "GPU_STARTING");
  });

  it("GPU_STARTING인데 SSM 아직 오프라인이면 대기(투하 없음)", async () => {
    const h = harness();
    h.prisma.assets.push(makeAsset({ jobState: "GPU_STARTING", jobStartedAt: new Date(h.now()) }));
    h.gpu.ssmOnline = false;
    await h.service.tick();
    assert.equal(h.gpu.calls.send, 0);
    assert.equal(h.prisma.assets[0].jobState, "GPU_STARTING");
  });
});

// ─── 용량 부족 백오프 ──────────────────────────────────────────────────────

describe("orchestrator 용량 부족 백오프", () => {
  it("InsufficientInstanceCapacity면 백오프하고 재시도 예산을 소모하지 않는다", async () => {
    const h = harness({ capacityBackoffMs: 300_000 });
    h.prisma.assets.push(makeAsset({ jobState: null, jobAttempts: 0 }));
    h.gpu.state = "stopped";
    h.gpu.startBehavior = () => {
      throw new InsufficientCapacityError();
    };

    await h.service.tick();
    assert.equal(h.gpu.calls.start, 1);
    assert.equal(h.prisma.assets[0].jobState, null, "잡 상태 유지(GPU_STARTING로 안 넘어감)");
    assert.equal(h.prisma.assets[0].jobAttempts, 0, "재시도 예산 미소모");

    // 백오프 중 다음 틱 — start 재호출 안 함.
    await h.service.tick();
    assert.equal(h.gpu.calls.start, 1, "백오프 창 안에서는 재기동 금지");

    // 백오프 경과 후 — start 재시도(이번엔 성공).
    h.gpu.startBehavior = () => {};
    h.advance(300_001);
    await h.service.tick();
    assert.equal(h.gpu.calls.start, 2);
    assert.equal(h.prisma.assets[0].jobState, "GPU_STARTING");
  });
});

// ─── 실패 재시도 → 상한 ────────────────────────────────────────────────────

describe("orchestrator 실패 재시도", () => {
  it("Failed면 예산 내 재큐, 소진되면 FAILED + 소유자 알림", async () => {
    const h = harness({ maxAttempts: 2 });
    h.prisma.listings["listing-1"] = { ownerId: "owner-9" };
    const asset = makeAsset({
      jobState: "RUNNING",
      jobCommandId: "cmd-1",
      jobAttempts: 1,
      jobStartedAt: new Date(h.now())
    });
    h.prisma.assets.push(asset);
    h.gpu.getStatusBehavior = () => ({ status: "Failed", stdoutTail: "", stderrTail: "boom" });

    // attempts 1 < 2 → 재큐.
    await h.service.tick();
    assert.equal(h.prisma.assets[0].jobState, "QUEUED");
    assert.equal(h.prisma.assets[0].jobCommandId, null);
    assert.equal(h.prisma.assets[0].status, "PROCESSING");
    assert.equal(h.notifies.length, 0);

    // 재시도 소진 상태로 다시 RUNNING/Failed.
    h.prisma.assets[0].jobState = "RUNNING";
    h.prisma.assets[0].jobCommandId = "cmd-2";
    h.prisma.assets[0].jobAttempts = 2;
    h.prisma.assets[0].jobStartedAt = new Date(h.now());
    await h.service.tick();
    assert.equal(h.prisma.assets[0].status, "FAILED");
    assert.equal(h.prisma.assets[0].jobState, "FAILED");
    assert.match(h.prisma.assets[0].jobError ?? "", /boom/);
    assert.equal(h.notifies.length, 1);
    assert.deepEqual(h.notifies[0].ids, ["owner-9"]);
    assert.equal(h.notifies[0].payload.status, "FAILED");
  });

  it("커맨드 조회 유실이면 재큐(예산 소모 없이)", async () => {
    const h = harness();
    h.prisma.assets.push(
      makeAsset({ jobState: "RUNNING", jobCommandId: "cmd-1", jobAttempts: 1, jobStartedAt: new Date(h.now()) })
    );
    h.gpu.getStatusBehavior = () => {
      throw new Error("InvocationDoesNotExist");
    };
    await h.service.tick();
    assert.equal(h.prisma.assets[0].jobState, "QUEUED");
    assert.equal(h.prisma.assets[0].jobAttempts, 1);
  });
});

// ─── 벽시계 타임아웃 ───────────────────────────────────────────────────────

describe("orchestrator 벽시계 타임아웃", () => {
  it("jobStartedAt + jobTimeoutMs 초과면 cancel + FAILED", async () => {
    const h = harness({ jobTimeoutMs: 1000 });
    h.prisma.assets.push(
      makeAsset({ jobState: "RUNNING", jobCommandId: "cmd-1", jobAttempts: 1, jobStartedAt: new Date(h.now() - 5000) })
    );
    // 커맨드는 아직 InProgress라도 벽시계로 하드 실패.
    h.gpu.getStatusBehavior = () => ({ status: "InProgress", stdoutTail: "", stderrTail: "" });
    await h.service.tick();
    assert.equal(h.gpu.calls.cancel, 1);
    assert.equal(h.prisma.assets[0].status, "FAILED");
    assert.equal(h.prisma.assets[0].jobState, "FAILED");
  });
});

// ─── idle-stop 2틱 ────────────────────────────────────────────────────────

describe("orchestrator idle-stop", () => {
  it("큐 공백 2틱 연속이면 인스턴스 정지", async () => {
    const h = harness();
    h.gpu.state = "running";
    // 틱1: 공백 1회 — 정지 안 함.
    await h.service.tick();
    assert.equal(h.gpu.calls.stop, 0);
    // 틱2: 공백 2회 — 정지.
    await h.service.tick();
    assert.equal(h.gpu.calls.stop, 1);
  });

  it("인스턴스가 이미 stopped면 정지 시도 안 함", async () => {
    const h = harness();
    h.gpu.state = "stopped";
    await h.service.tick();
    await h.service.tick();
    assert.equal(h.gpu.calls.stop, 0);
  });
});

// ─── Success + 콜백 미도착 유예 ────────────────────────────────────────────

describe("orchestrator Success 콜백 유예", () => {
  it("커맨드 Success인데 콜백 미도착이면 유예 후 FAILED", async () => {
    const h = harness({ callbackGraceMs: 300_000 });
    h.prisma.listings["listing-1"] = { ownerId: "owner-9" };
    h.prisma.assets.push(
      makeAsset({ jobState: "RUNNING", jobCommandId: "cmd-1", jobAttempts: 1, jobStartedAt: new Date(h.now()) })
    );
    h.gpu.getStatusBehavior = () => ({ status: "Success", stdoutTail: "ok", stderrTail: "" });

    // 틱1: Success 최초 관측 — 유예 시작, 상태 변화 없음.
    await h.service.tick();
    assert.equal(h.prisma.assets[0].jobState, "RUNNING");
    assert.equal(h.prisma.assets[0].status, "PROCESSING");

    // 유예 이내 재관측 — 여전히 대기.
    h.advance(100_000);
    await h.service.tick();
    assert.equal(h.prisma.assets[0].status, "PROCESSING");

    // 유예 초과 — FAILED.
    h.advance(300_001);
    await h.service.tick();
    assert.equal(h.prisma.assets[0].status, "FAILED");
    assert.equal(h.prisma.assets[0].jobState, "FAILED");
    assert.match(h.prisma.assets[0].jobError ?? "", /콜백/);
  });
});

// ─── remote-job-command ────────────────────────────────────────────────────

describe("buildJobCommand", () => {
  it("스크립트 디렉토리 오버라이드로 base64 + env 커맨드를 조립한다", async (t) => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "recon-scripts-"));
    mkdirSync(join(dir, "remote"), { recursive: true });
    writeFileSync(join(dir, "remote", "gpu-job.sh"), "echo job");
    writeFileSync(join(dir, "remote", "bootstrap-nvme.sh"), "echo boot");
    writeFileSync(join(dir, "record3d_pointinit.py"), "print('pi')");
    writeFileSync(join(dir, "cull_floaters.py"), "print('cull')");

    const built = buildJobCommand(
      {
        assetId: "splat_a",
        sourceUrl: "https://api.test/api/files/x.mp4",
        sourceKind: "video",
        callbackBase: "https://api.test",
        workerSecret: "s3cr3t",
        iters: 30000
      },
      { GPU_REMOTE_SCRIPTS_DIR: dir } as any
    );
    const joined = built.commands.join("\n");
    assert.match(joined, /base64 -d > 'gpu-job\.sh'/);
    assert.match(joined, /base64 -d > 'cull_floaters\.py'/);
    assert.match(joined, /ASSET_ID='splat_a'/);
    assert.match(joined, /SOURCE_KIND='video'/);
    assert.match(joined, /WORKER_SECRET='s3cr3t'/);
    assert.match(joined, /bash gpu-job\.sh$/);
    assert.equal(built.warning, undefined);
  });

  it("스크립트 파일이 없으면 명확한 에러", () => {
    assert.throws(
      () => buildJobCommand(
        { assetId: "a", sourceUrl: "u", sourceKind: "video", callbackBase: "b", workerSecret: "s", iters: 1 },
        { GPU_REMOTE_SCRIPTS_DIR: "/nonexistent-roomlog-scripts-xyz" } as any
      ),
      /원격 스크립트를 읽을 수 없습니다/
    );
  });
});
