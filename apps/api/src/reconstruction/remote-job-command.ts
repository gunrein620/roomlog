// remote-job-command — GPU 원격 잡을 실을 SSM RunShellScript 커맨드(라인 배열) 조립기.
// 레포의 재구성 스크립트 4종을 base64로 인코딩해 원격 /tmp/roomlog-job/에 풀어놓고
// `ASSET_ID=... bash gpu-job.sh`로 실행한다. (스크립트 파일 자체는 W-C가 작성 — 여기선 경로만 맞춘다.)
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SplatSourceKind } from "@roomlog/types";

/** gpu-job.sh가 env로 받는 잡 파라미터. */
export interface JobCommandParams {
  assetId: string;
  sourceUrl: string;
  sourceKind: SplatSourceKind;
  callbackBase: string;
  workerSecret: string;
  iters: number;
}

/** 원격에서 디코드될 작업 디렉토리(gpu-job.sh가 bootstrap·py를 같은 폴더에서 찾는다). */
const REMOTE_WORK_DIR = "/tmp/roomlog-job";

/** SSM SendCommand Parameters.commands 한도(권장). 100KB 근접 시 경고. */
const SSM_PAYLOAD_WARN_BYTES = 90 * 1024;

// 원격에 풀 파일: [원격파일명, 레포상대경로(scripts/reconstruct 기준)]
const SCRIPT_FILES: ReadonlyArray<readonly [remoteName: string, relPath: string]> = [
  ["gpu-job.sh", "remote/gpu-job.sh"],
  ["bootstrap-nvme.sh", "remote/bootstrap-nvme.sh"],
  ["record3d_pointinit.py", "record3d_pointinit.py"],
  ["cull_floaters.py", "cull_floaters.py"]
];

/**
 * scripts/reconstruct 디렉토리 해석 순서:
 *   1) GPU_REMOTE_SCRIPTS_DIR (명시 오버라이드)
 *   2) /app/scripts/reconstruct (컨테이너 — Dockerfile이 COPY)
 *   3) 레포 상대(__dirname 기준 폴백 — 로컬 dev)
 * 실제 존재 검증은 readScriptFiles가 파일 단위로 한다.
 */
export function resolveScriptsDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GPU_REMOTE_SCRIPTS_DIR?.trim();
  if (override) return override;
  // 컨테이너 절대경로가 실재하면 우선(런너 스테이지 CWD 무관, Dockerfile이 COPY).
  const containerDir = "/app/scripts/reconstruct";
  if (existsSync(containerDir)) return containerDir;
  // 로컬 dev 폴백: dist/reconstruction 또는 src/reconstruction → 레포 루트는 4단계 상위(둘 다 동일).
  return resolve(__dirname, "../../../../scripts/reconstruct");
}

/** 단일 인용 안전 이스케이프 — POSIX 셸에서 '...' 내부의 작은따옴표만 분리 처리. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

interface EncodedScript {
  remoteName: string;
  base64: string;
}

function readScriptFiles(scriptsDir: string): EncodedScript[] {
  return SCRIPT_FILES.map(([remoteName, relPath]) => {
    const abs = resolve(scriptsDir, relPath);
    let content: Buffer;
    try {
      content = readFileSync(abs);
    } catch (err) {
      throw new Error(
        `GPU 원격 스크립트를 읽을 수 없습니다: ${abs} (GPU_REMOTE_SCRIPTS_DIR로 디렉토리를 지정하거나 Dockerfile COPY를 확인하세요). 원인: ${
          (err as Error).message
        }`
      );
    }
    return { remoteName, base64: content.toString("base64") };
  });
}

export interface BuiltJobCommand {
  /** SSM AWS-RunShellScript Parameters.commands 로 그대로 넣는다. */
  commands: string[];
  /** commands 총 바이트(페이로드 한도 감시용). */
  approxBytes: number;
  /** 100KB 한도에 근접하면 채워지는 경고 메시지(없으면 undefined). */
  warning?: string;
}

/**
 * 잡 커맨드 라인 배열 조립. 각 스크립트를 base64로 원격에 디코드해 놓고 gpu-job.sh를 실행한다.
 * env 값은 셸 인용 처리하여 주입한다.
 */
export function buildJobCommand(
  params: JobCommandParams,
  env: NodeJS.ProcessEnv = process.env
): BuiltJobCommand {
  const scriptsDir = resolveScriptsDir(env);
  const encoded = readScriptFiles(scriptsDir);

  const lines: string[] = ["set -euo pipefail", `mkdir -p ${REMOTE_WORK_DIR}`, `cd ${REMOTE_WORK_DIR}`];
  for (const { remoteName, base64 } of encoded) {
    // printf '%s' 로 개행 없이 base64를 흘려 디코드 — echo의 백슬래시/개행 이슈 회피.
    lines.push(`printf '%s' ${shellSingleQuote(base64)} | base64 -d > ${shellSingleQuote(remoteName)}`);
  }
  lines.push("chmod +x gpu-job.sh bootstrap-nvme.sh");

  const envAssignments = [
    `ASSET_ID=${shellSingleQuote(params.assetId)}`,
    `SOURCE_URL=${shellSingleQuote(params.sourceUrl)}`,
    `SOURCE_KIND=${shellSingleQuote(params.sourceKind)}`,
    `CALLBACK_BASE=${shellSingleQuote(params.callbackBase)}`,
    `WORKER_SECRET=${shellSingleQuote(params.workerSecret)}`,
    `ITERS=${shellSingleQuote(String(params.iters))}`
  ].join(" ");
  lines.push(`${envAssignments} bash gpu-job.sh`);

  const approxBytes = Buffer.byteLength(lines.join("\n"), "utf8");
  const warning =
    approxBytes >= SSM_PAYLOAD_WARN_BYTES
      ? `SSM 커맨드 페이로드가 ${(approxBytes / 1024).toFixed(1)}KB로 100KB 한도에 근접합니다(스크립트 크기 축소 필요).`
      : undefined;

  return { commands: lines, approxBytes, warning };
}
