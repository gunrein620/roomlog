// convert.mjs — 잡 1건의 실제 파이프라인: USDZ pull → Blender 변환 → 스케일 검증 → GLB를 S3에
// 직접 push → API에 결과 URL만 콜백. server.mjs가 /convert 요청을 202로 먼저 응답한 뒤 이 함수를
// 백그라운드로 돌린다(오래 걸리는 작업을 HTTP 요청-응답 주기에 묶지 않는다).
//
// 실패 경로가 이 파일의 핵심 관심사다 — 어느 단계에서 죽든 반드시 실패 콜백을 보내야
// TenantFurnitureService가 CONVERTING에 무한정 머무르지 않는다(도구 미설치·타임아웃·스케일 이상
// 전부 이 경로로 수렴).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readGlbBoundingBox } from "./gltf-bbox.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const BLENDER_SCRIPT = join(__dirname, "blender", "usdz_to_glb.py");

const BLENDER_BIN = process.env.BLENDER_BIN || "blender";
const BLENDER_TIMEOUT_MS = Number(process.env.BLENDER_TIMEOUT_MS || 5 * 60 * 1000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.MESH_WORKER_DOWNLOAD_TIMEOUT_MS || 60 * 1000);
const UPLOAD_TIMEOUT_MS = Number(process.env.MESH_WORKER_UPLOAD_TIMEOUT_MS || 60 * 1000);
const CALLBACK_TIMEOUT_MS = Number(process.env.MESH_WORKER_CALLBACK_TIMEOUT_MS || 15 * 1000);

// 같은 오브젝트를 임포트 직후/익스포트 직후 두 번 잰 bbox 세 변 길이가 이 비율을 벗어나면 스케일
// 회귀로 간주한다 — 서로 다른 대상을 비교하는 게 아니라 "같은 메시를 두 시점에 잰" 값이라 비율은
// apps/web mesh-anchor.ts의 SCALE_SANITY(0.5~2, 실물 대비 관용치)보다 훨씬 타이트하게 잡는다.
// 회전/축 변환만으로는 이 비율이 흔들리지 않는다(길이 자체는 회전 불변) — 흔들린다면 유닛 변환 버그.
const SCALE_DRIFT_TOLERANCE = 0.05; // ±5%

/** 오차 메시지를 실어 콜백 실패로 떨어뜨릴 때 쓰는 표식 에러 — 어디서 죽었는지 stage를 남긴다. */
class ConversionStageError extends Error {
  constructor(stage, message) {
    super(`[${stage}] ${message}`);
    this.stage = stage;
  }
}

function extentsOf(min, max) {
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]].sort((a, b) => a - b);
}

/** 두 bbox의 "정렬된 세 변 길이" 비율이 허용 오차 안에 있는지 확인한다(축 재배치엔 둔감, 스케일엔 민감). */
function assertScalePreserved(importBox, exportBox) {
  const importExtents = extentsOf(importBox.min, importBox.max);
  const exportExtents = extentsOf(exportBox.min, exportBox.max);
  for (let i = 0; i < 3; i += 1) {
    const a = importExtents[i];
    const b = exportExtents[i];
    if (a <= 0 || b <= 0) {
      throw new ConversionStageError(
        "scale-check",
        `바운딩박스 변 길이가 0 이하입니다(import=${a}, export=${b}) — 빈 메시이거나 스케일 붕괴.`
      );
    }
    const ratio = b / a;
    if (Math.abs(ratio - 1) > SCALE_DRIFT_TOLERANCE) {
      throw new ConversionStageError(
        "scale-check",
        `Blender import↔export 사이 스케일이 어긋났습니다(변 ${i}: import=${a.toFixed(4)}m, export=${b.toFixed(4)}m, ratio=${ratio.toFixed(4)}). ` +
          `Object Capture USDZ는 metersPerUnit=1이 확정 전제(mesh-anchor.ts) — 이 드리프트는 GLB를 그대로 쓰면 실치수 오류로 이어진다.`
      );
    }
  }
}

function runBlender(inputPath, outputPath, metaPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      BLENDER_BIN,
      ["--background", "--factory-startup", "--python", BLENDER_SCRIPT, "--", inputPath, outputPath, metaPath],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ConversionStageError("blender-timeout", `Blender가 ${BLENDER_TIMEOUT_MS}ms 안에 끝나지 않았습니다.`));
    }, BLENDER_TIMEOUT_MS);
    timer.unref?.();

    child.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT = 바이너리 자체가 없음(설치 안 됨) — "조용히 성공한 척" 금지 원칙의 핵심 실패 지점.
      reject(new ConversionStageError("blender-spawn", `Blender 실행 파일을 찾을 수 없거나 실행할 수 없습니다(BLENDER_BIN=${BLENDER_BIN}): ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = (stderr || stdout).slice(-4000);
        reject(new ConversionStageError("blender-exit", `Blender가 코드 ${code}로 종료했습니다.\n${tail}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function downloadUsdz(usdzUrl, destPath) {
  let response;
  try {
    response = await fetch(usdzUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (err) {
    throw new ConversionStageError("download", `USDZ 다운로드 실패(${usdzUrl}): ${err.message}`);
  }
  if (!response.ok) {
    throw new ConversionStageError("download", `USDZ 다운로드가 ${response.status}를 반환했습니다(${usdzUrl}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new ConversionStageError("download", "다운로드한 USDZ가 비어 있습니다.");
  }
  await writeFile(destPath, buffer);
}

async function uploadGlb(glbUploadUrl, headers, glbPath) {
  const buffer = await readFile(glbPath);
  if (buffer.length === 0) {
    throw new ConversionStageError("upload", "생성된 GLB가 비어 있습니다.");
  }
  let response;
  try {
    response = await fetch(glbUploadUrl, {
      method: "PUT",
      headers,
      body: buffer,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    });
  } catch (err) {
    throw new ConversionStageError("upload", `GLB 업로드 실패: ${err.message}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ConversionStageError("upload", `GLB 업로드가 ${response.status}를 반환했습니다: ${detail.slice(0, 500)}`);
  }
  return buffer.length;
}

async function postCallback(callbackBase, workerSecret, furnitureId, path, body) {
  const url = `${callbackBase.replace(/\/+$/, "")}/tenant-furniture/${furnitureId}/mesh-conversion/${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`콜백(${url})이 ${response.status}를 반환했습니다: ${detail.slice(0, 500)}`);
  }
}

/**
 * 잡 1건을 처리한다. 성공/실패 어느 쪽이든 API에 콜백을 보내는 것으로 끝난다 — 이 함수 자체는
 * 예외를 던지지 않는다(호출부인 server.mjs는 로그만 남기면 된다). 콜백 전송 자체가 실패하면(네트워크
 * 끊김 등) 그건 로그로만 남긴다 — 그 이상 재시도하지 않는다(오케스트레이터 없는 단순 파이프라인이라
 * 재큐잉 로직이 없다; 이 워커가 재기동되지 않는 한 해당 잡은 CONVERTING에 멈춘 채 API 쪽에서
 * 사람이 재시도를 유도해야 한다 — docs/mesh-conversion-worker.md에 명시).
 */
export async function runConversionJob(job) {
  const { furnitureId, usdzUrl, glbUploadUrl, glbUploadHeaders, glbPublicUrl, callbackBase, workerSecret } = job;
  const workDir = await mkdtemp(join(tmpdir(), `mesh-job-${furnitureId}-`));
  const inputPath = join(workDir, "in.usdz");
  const outputPath = join(workDir, "out.glb");
  const metaPath = join(workDir, "meta.json");

  try {
    await downloadUsdz(usdzUrl, inputPath);
    await runBlender(inputPath, outputPath, metaPath);

    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const importBox = { min: meta.importBBoxMin, max: meta.importBBoxMax };
    const exportBox = readGlbBoundingBox(await readFile(outputPath));
    assertScalePreserved(importBox, exportBox);

    const uploadedBytes = await uploadGlb(glbUploadUrl, glbUploadHeaders, outputPath);
    console.log(`[mesh-worker] furniture=${furnitureId} 변환 성공 (${uploadedBytes} bytes) — 완료 콜백 전송`);

    await postCallback(callbackBase, workerSecret, furnitureId, "complete", { glbUrl: glbPublicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mesh-worker] furniture=${furnitureId} 변환 실패: ${message}`);
    try {
      await postCallback(callbackBase, workerSecret, furnitureId, "failure", { error: message.slice(0, 2000) });
    } catch (callbackErr) {
      console.error(`[mesh-worker] furniture=${furnitureId} 실패 콜백 전송조차 실패: ${callbackErr.message}`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
