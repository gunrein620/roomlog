// mesh-conversion-dispatcher — USDZ→GLB 변환 잡을 mesh-worker 컨테이너로 던지는 포트.
// 앱 EC2와 같은 compose에 둘 때는 HTTP, 별도 GPU 박스에 둘 때는 SSM RunCommand를 env로 고른다.
// 변환 자체는 순수 CPU 작업이므로 SSM 구현도 GPU 수명주기를 제어하지 않는다. 박스가 켜져 SSM
// online인 상태를 전제로 하되, 레포·NVMe 런타임·mesh-worker 이미지는 잡마다 멱등하게 복구한다.
//
// 흐름: TenantFurnitureService.queueMeshConversion이 GLB 업로드용 presigned PUT을 먼저 발급하고,
// 이 디스패처가 그 URL을 포함한 잡을 HTTP 또는 SSM으로 던진다(둘 다 "접수됨"만 보장, 실제 변환은
// 워커가 비동기로 진행 후 기존 콜백 엔드포인트로 알린다). 워커는 usdzUrl에서 직접 pull → Blender로
// 변환 → glbUploadUrl로 S3에 직접 push → 콜백엔 최종 glbPublicUrl만 싣는다 — "S3=벌크 버스,
// 서버=메타데이터" 원칙을 그대로 따른다(apps/api/src/reconstruction/remote-job-command.ts 주석 참고).
import { SendCommandCommand, SSMClient } from "@aws-sdk/client-ssm";

export interface MeshConversionJob {
  furnitureId: string;
  /** 워커가 pull할 원본 USDZ의 공개 URL. */
  usdzUrl: string;
  /** 변환 결과 GLB를 워커가 직접 PUT할 presigned S3 URL(1시간 만료). */
  glbUploadUrl: string;
  /** presigned PUT에 그대로 실어야 하는 헤더(서명에 포함됨). */
  glbUploadHeaders: Record<string, string>;
  /** PUT 완료 후 완료 콜백에 실어 보낼 최종 공개 URL. */
  glbPublicUrl: string;
}

export interface MeshConversionDispatcher {
  /**
   * 잡을 워커에 투하한다. 여기서 던진 에러는 호출자(TenantFurnitureService.queueMeshConversion)가
   * 즉시 meshJobState=FAILED로 떨어뜨린다 — 이 메서드는 "워커가 접수했다"만 보장하면 되고, 실제
   * 변환의 성공/실패는 워커가 비동기로 completeMeshConversion/markMeshConversionFailed 콜백을
   * 호출해 알린다.
   */
  dispatch(job: MeshConversionJob): Promise<void>;
}

const DISPATCH_TIMEOUT_MS = 5_000;
const MESH_WORKER_REPO_DIR = "/home/ubuntu/roomlog";
const MESH_WORKER_REPO_URL = "https://github.com/gunrein620/roomlog.git";
const MESH_WORKER_REPO_USER = "ubuntu";
const MESH_WORKER_LOCK_FILE = "/home/ubuntu/.roomlog-mesh-worker.lock";
const MESH_WORKER_DEFAULT_BRANCH = "main";

/** POSIX 셸의 단일 인용 문자열로 안전하게 감싼다. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** MESH_WORKER_URL(예: http://mesh-worker:5001)의 POST /convert로 잡을 던진다. */
export class HttpMeshConversionDispatcher implements MeshConversionDispatcher {
  constructor(
    private readonly workerUrl: string,
    private readonly callbackBase: string,
    private readonly workerSecret: string
  ) {}

  async dispatch(job: MeshConversionJob): Promise<void> {
    const endpoint = `${this.workerUrl.replace(/\/+$/, "")}/convert`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        // x-worker-secret: mesh-worker의 /convert도 동일 시크릿으로 게이트돼 있다(server.mjs) —
        // 이 컨테이너가 실수로 외부에 노출돼도 임의 URL을 변환/업로드시키는 오남용을 막는다.
        headers: { "Content-Type": "application/json", "x-worker-secret": this.workerSecret },
        body: JSON.stringify({
          ...job,
          callbackBase: this.callbackBase,
          workerSecret: this.workerSecret
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS)
      });
    } catch (err) {
      throw new Error(`mesh-worker(${endpoint}) 호출에 실패했습니다: ${(err as Error).message}`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`mesh-worker(${endpoint})가 ${response.status}을 반환했습니다: ${detail.slice(0, 500)}`);
    }
  }
}

/** 테스트에서는 실제 AWS 호출 대신 이 최소 표면의 fake를 주입한다. */
export interface MeshConversionSsmClient {
  send(command: SendCommandCommand): Promise<{ Command?: { CommandId?: string } }>;
}

/**
 * GPU 박스에 SSM RunCommand를 보내 mesh-worker 이미지를 일회성으로 실행한다.
 * 레포 확보와 ensure-worker 준비가 끝난 뒤에만 변환한다. SendCommand 접수까지만 기다리고 결과는
 * 폴링하지 않는다 — 준비 실패는 원격 호스트가 실패 콜백을 시도하고, 변환 완료/실패는 CLI가 콜백한다.
 */
export class SsmMeshConversionDispatcher implements MeshConversionDispatcher {
  constructor(
    private readonly instanceId: string,
    region: string,
    private readonly callbackBase: string,
    private readonly workerSecret: string,
    private readonly ssmClient: MeshConversionSsmClient = new SSMClient({ region }),
    private readonly workerBranch: string = MESH_WORKER_DEFAULT_BRANCH
  ) {}

  async dispatch(job: MeshConversionJob): Promise<void> {
    const payload = JSON.stringify({
      ...job,
      callbackBase: this.callbackBase,
      workerSecret: this.workerSecret
    });
    // base64 문자 집합만 셸 명령에 넣어 presigned URL·시크릿의 따옴표/개행/메타문자 해석을 막는다.
    const encodedPayload = Buffer.from(payload, "utf8").toString("base64");
    const prepareFailurePayload = Buffer.from(
      JSON.stringify({ error: "mesh-worker 준비 실패: SSM 명령 출력에서 실패 단계를 확인하세요." }),
      "utf8"
    ).toString("base64");
    const prepareFailureUrl = `${this.callbackBase.replace(/\/+$/, "")}/tenant-furniture/${encodeURIComponent(
      job.furnitureId
    )}/mesh-conversion/failure`;
    const prepareFailureTrap =
      `prepare_rc=$?; trap - EXIT; if [ "\${MESH_WORKER_PREPARING:-0}" = "1" ]; then ` +
      `printf 'ERROR: mesh-worker 준비 실패 (exit=%s)\\n' "$prepare_rc" >&2; ` +
      `printf '%s' ${shellSingleQuote(prepareFailurePayload)} | base64 -d | ` +
      `curl --connect-timeout 5 --max-time 15 -fsS -X POST ${shellSingleQuote(prepareFailureUrl)} ` +
      `-H ${shellSingleQuote(`x-worker-secret: ${this.workerSecret}`)} ` +
      `-H 'Content-Type: application/json' --data-binary @- || true; ` +
      `fi; exit "$prepare_rc"`;
    const syncRepoCommand =
      `if [ ! -d "$REPO_DIR/.git" ]; then ` +
      `printf 'SSM bootstrap: 레포 없음 — clone %s\\n' "$MESH_WORKER_BRANCH"; ` +
      `timeout --signal=TERM --kill-after=10s 300s runuser -u "$REPO_USER" -- ` +
      `git clone --branch "$MESH_WORKER_BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"; ` +
      `else printf 'SSM bootstrap: 레포 있음 — origin/%s 동기화\\n' "$MESH_WORKER_BRANCH"; ` +
      `timeout --signal=TERM --kill-after=10s 300s runuser -u "$REPO_USER" -- ` +
      `git -c "safe.directory=$REPO_DIR" -C "$REPO_DIR" fetch --prune origin ` +
      `"+refs/heads/$MESH_WORKER_BRANCH:refs/remotes/origin/$MESH_WORKER_BRANCH"; ` +
      `timeout --signal=TERM --kill-after=10s 300s runuser -u "$REPO_USER" -- ` +
      `git -c "safe.directory=$REPO_DIR" -C "$REPO_DIR" reset --hard ` +
      `"refs/remotes/origin/$MESH_WORKER_BRANCH"; fi`;
    const shellCommand =
      `printf '%s' ${encodedPayload} | base64 -d | ` +
      "timeout --signal=TERM --kill-after=10s 600s " +
      "docker run --rm -i --entrypoint node mesh-worker:test /app/cli.mjs";

    let commandId: string | undefined;
    try {
      const output = await this.ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [this.instanceId],
          DocumentName: "AWS-RunShellScript",
          Comment: `roomlog mesh conversion furniture=${job.furnitureId}`.slice(0, 100),
          TimeoutSeconds: 600,
          Parameters: {
            // AWS-RunShellScript는 같은 POSIX sh 스크립트 안에서 순서대로 실행한다. 레포가 아예 없거나
            // 오래돼 ensure-worker.sh가 없는 닭과 달걀만 인라인 clone/fetch/reset으로 끊고, 나머지 준비는
            // 레포 안의 Bash 스크립트에 위임한다. 준비 중 종료하면 EXIT trap이 실패 콜백을 시도한 뒤
            // 원래 non-zero로 끝내므로 변환 컨테이너는 실행되지 않는다. Command 결과는 폴링하지 않는다.
            commands: [
              "set -eu",
              `REPO_DIR=${shellSingleQuote(MESH_WORKER_REPO_DIR)}`,
              `REPO_URL=${shellSingleQuote(MESH_WORKER_REPO_URL)}`,
              `REPO_USER=${shellSingleQuote(MESH_WORKER_REPO_USER)}`,
              `LOCK_FILE=${shellSingleQuote(MESH_WORKER_LOCK_FILE)}`,
              `MESH_WORKER_BRANCH=${shellSingleQuote(this.workerBranch)}`,
              "MESH_WORKER_PREPARING=1",
              `trap ${shellSingleQuote(prepareFailureTrap)} EXIT`,
              "command -v git >/dev/null 2>&1",
              "command -v flock >/dev/null 2>&1",
              "command -v runuser >/dev/null 2>&1",
              "command -v timeout >/dev/null 2>&1",
              "id \"$REPO_USER\" >/dev/null 2>&1",
              "git check-ref-format --branch \"$MESH_WORKER_BRANCH\" >/dev/null 2>&1",
              "exec 9>\"$LOCK_FILE\"",
              "flock -x -w 1200 9",
              syncRepoCommand,
              "cd \"$REPO_DIR\"",
              "MESH_WORKER_PREP_LOCKED=1 MESH_WORKER_REPO_DIR=\"$REPO_DIR\" MESH_WORKER_REPO_URL=\"$REPO_URL\" MESH_WORKER_REPO_USER=\"$REPO_USER\" MESH_WORKER_LOCK_FILE=\"$LOCK_FILE\" MESH_WORKER_BRANCH=\"$MESH_WORKER_BRANCH\" bash services/mesh-worker/remote/ensure-worker.sh",
              "flock -u 9",
              "exec 9>&-",
              "MESH_WORKER_PREPARING=0",
              "trap - EXIT",
              shellCommand
            ],
            // lock 대기 + 인라인/본체 Git + NVMe bootstrap + 이미지 빌드 + 변환의 각 내부 상한 합보다
            // 넉넉하게 둔다. 바깥 SSM timeout이 먼저 dash를 SIGTERM하면 EXIT 실패 콜백도 못 보내기 때문이다.
            executionTimeout: ["5400"]
          }
        })
      );
      commandId = output.Command?.CommandId;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`SSM mesh-worker 잡 전송에 실패했습니다(instance=${this.instanceId}): ${detail}`);
    }

    if (!commandId) {
      throw new Error(
        `SSM mesh-worker 잡 전송에 실패했습니다(instance=${this.instanceId}): SendCommand가 CommandId를 반환하지 않았습니다.`
      );
    }
  }
}

/**
 * 필수 env가 비어 있을 때 쓰는 널 구현. "빈 상태·오류를 데모로 은폐 금지" 원칙 — CONVERTING에 조용히
 * 머무르는 대신 dispatch() 호출 즉시 명확한 에러로 실패해 queueMeshConversion이 FAILED로 떨어뜨리게 한다.
 */
export class UnconfiguredMeshConversionDispatcher implements MeshConversionDispatcher {
  constructor(private readonly missingEnv: string[]) {}

  // 시그니처를 인터페이스와 동일하게 유지한다 — 파라미터 개수를 줄이면 (테스트의 instanceof 어서션이
  // TS 흐름분석으로 이 클래스로 좁혀졌을 때) 호출부가 "인자 개수 불일치"로 컴파일 에러를 낸다.
  async dispatch(_job: MeshConversionJob): Promise<void> {
    throw new Error(
      `USDZ→GLB 변환 워커가 배선되지 않았습니다 — 다음 환경변수가 필요합니다: ${this.missingEnv.join(", ")}`
    );
  }
}

/** 콜백 base = PUBLIC_API_BASE_URL + 글로벌 프리픽스 /api. reconstruction-orchestrator.service.ts의
 * reconstructionCallbackBase와 동일 로직(2026-07-16 prod 실측으로 확정된 규칙) — 도메인별 독립 파일
 * 유지가 이 레포 관례라 여기서도 그대로 재구현한다. */
export function meshConversionCallbackBase(publicApiBase: string): string {
  const base = publicApiBase.replace(/\/+$/, "");
  return /\/api$/i.test(base) ? base : `${base}/api`;
}

/** env로부터 SSM/HTTP 디스패처를 구성한다. 필수값이 비면 즉시 실패하는 널 구현으로 폴백한다. */
export function createMeshConversionDispatcher(env: NodeJS.ProcessEnv): MeshConversionDispatcher {
  const dispatchMode = env.MESH_WORKER_DISPATCH?.trim().toLowerCase();
  const workerUrl = env.MESH_WORKER_URL?.trim();
  const publicApiBase = env.PUBLIC_API_BASE_URL?.trim();
  const workerSecret = env.GPU_WORKER_SECRET?.trim();

  if (dispatchMode === "ssm") {
    const instanceId = env.GPU_INSTANCE_ID?.trim();
    const region = env.GPU_REGION?.trim();
    const missing = [
      !instanceId && "GPU_INSTANCE_ID",
      !region && "GPU_REGION",
      !publicApiBase && "PUBLIC_API_BASE_URL",
      !workerSecret && "GPU_WORKER_SECRET"
    ].filter((name): name is string => Boolean(name));

    if (missing.length > 0) {
      return new UnconfiguredMeshConversionDispatcher(missing);
    }
    return new SsmMeshConversionDispatcher(
      instanceId!,
      region!,
      meshConversionCallbackBase(publicApiBase!),
      workerSecret!,
      undefined,
      env.MESH_WORKER_BRANCH?.trim() || MESH_WORKER_DEFAULT_BRANCH
    );
  }

  const missing = [
    !workerUrl && "MESH_WORKER_URL",
    !publicApiBase && "PUBLIC_API_BASE_URL",
    !workerSecret && "GPU_WORKER_SECRET"
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    return new UnconfiguredMeshConversionDispatcher(missing);
  }
  return new HttpMeshConversionDispatcher(workerUrl!, meshConversionCallbackBase(publicApiBase!), workerSecret!);
}
