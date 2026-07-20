// cli.mjs — SSM RunCommand가 잡 1건을 stdin으로 넘겨 일회성 변환할 때 쓰는 진입점.
// 잡에는 presigned URL과 워커 시크릿이 있으므로 argv에 싣지 않는다.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runConversionJob } from "./convert.mjs";

function errorMessage(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

async function readStdin(input) {
  input.setEncoding?.("utf8");
  let raw = "";
  for await (const chunk of input) {
    raw += chunk;
  }
  return raw;
}

/** 테스트는 stdin/변환 함수/stderr를 가짜로 주입하고, 실제 실행은 기본값을 그대로 쓴다. */
export async function runCli({ input = process.stdin, stderr = process.stderr, runJob = runConversionJob } = {}) {
  try {
    const raw = await readStdin(input);
    if (!raw.trim()) {
      throw new Error("stdin에 mesh 변환 잡 JSON이 없습니다.");
    }

    const job = JSON.parse(raw);

    // runConversionJob이 변환 실패 콜백까지 직접 보낸다. CLI는 콜백을 다시 보내지 않고,
    // 반환된 결과만 보고 프로세스 종료 코드를 정한다.
    const result = await runJob(job);
    if (result?.ok === true) {
      return 0;
    }
    const failure = result?.error ?? "runConversionJob이 성공 결과를 반환하지 않았습니다.";
    stderr.write(`[mesh-worker-cli] 변환 실패: ${errorMessage(failure)}\n`);
    return 1;
  } catch (error) {
    stderr.write(`[mesh-worker-cli] 실행 실패: ${errorMessage(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
