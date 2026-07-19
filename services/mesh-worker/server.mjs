// server.mjs — mesh-worker의 얇은 HTTP 표면. Nest/Express 등 프레임워크를 쓰지 않는다(엔드포인트가
// 2개뿐이라 의존성 추가가 배보다 배꼽). apps/api의 HttpMeshConversionDispatcher가 POST /convert를
// 호출한다 — GET /healthz는 docker-compose 헬스체크·수동 점검용.
//
// 인증: x-worker-secret 헤더가 MESH_WORKER_ACCEPT_SECRET(비어 있으면 GPU_WORKER_SECRET로 폴백,
// api 쪽과 시크릿을 공유하는 게 기본값)과 일치해야 접수한다. api→worker 방향 호출도 시크릿을 요구하는
// 이유: 이 컨테이너가 내부망이 아니라 실수로 외부에 노출되더라도 임의 URL을 변환/업로드시키는 SSRF성
// 오남용을 막기 위해서다.
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";

import { runConversionJob } from "./convert.mjs";

const PORT = Number(process.env.PORT || 5001);
const BLENDER_BIN = process.env.BLENDER_BIN || "blender";
const ACCEPT_SECRET = (process.env.MESH_WORKER_ACCEPT_SECRET || process.env.GPU_WORKER_SECRET || "").trim();

const REQUIRED_JOB_FIELDS = [
  "furnitureId",
  "usdzUrl",
  "glbUploadUrl",
  "glbUploadHeaders",
  "glbPublicUrl",
  "callbackBase",
  "workerSecret"
];

/** 컨테이너 기동 시 1회 확인 — Blender 미설치를 "일단 받고 나중에 실패"가 아니라 헬스체크에서부터
 * 드러낸다("도구 미설치를 조용히 성공한 척하지 않는다" 원칙을 프로세스 시작 지점까지 끌어올린다). */
function checkBlenderAvailable() {
  try {
    const result = spawnSync(BLENDER_BIN, ["--version"], { timeout: 10_000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

let blenderAvailable = checkBlenderAvailable();
if (!blenderAvailable) {
  console.error(
    `[mesh-worker] 경고: Blender 실행 파일을 찾을 수 없습니다(BLENDER_BIN=${BLENDER_BIN}). ` +
      "/convert 요청은 즉시 503으로 거부되고 /healthz도 비정상을 보고합니다 — 이미지 빌드/설치를 확인하세요."
  );
}
// 컨테이너가 오래 떠 있는 동안 blender 설치 여부가 바뀔 일은 거의 없지만(재설치는 재빌드가 정상
// 경로), 배포 직후 첫 헬스체크 타이밍 이슈를 줄이려고 몇 초 뒤 한 번 더 확인한다.
setTimeout(() => {
  blenderAvailable = checkBlenderAvailable();
}, 5_000).unref?.();

function secretMatches(provided) {
  if (!ACCEPT_SECRET || !provided) return false;
  const expected = Buffer.from(ACCEPT_SECRET, "utf8");
  const actual = Buffer.from(provided, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function validateJob(body) {
  const missing = REQUIRED_JOB_FIELDS.filter((field) => !(field in body) || body[field] == null);
  if (missing.length > 0) {
    throw new Error(`잡 페이로드에 필수 필드가 없습니다: ${missing.join(", ")}`);
  }
  if (typeof body.glbUploadHeaders !== "object") {
    throw new Error("glbUploadHeaders는 객체여야 합니다.");
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(blenderAvailable ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: blenderAvailable, blenderBin: BLENDER_BIN }));
    return;
  }

  if (req.method === "POST" && req.url === "/convert") {
    if (!ACCEPT_SECRET) {
      // 시크릿 미설정 = 인증을 열지 않고 닫는다 — apps/api의 requireWorkerSecret과 동일한 fail-closed 철학.
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "MESH_WORKER_ACCEPT_SECRET/GPU_WORKER_SECRET이 설정되지 않았습니다." }));
      return;
    }
    if (!secretMatches(req.headers["x-worker-secret"])) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "워커 시크릿이 올바르지 않습니다." }));
      return;
    }
    if (!blenderAvailable) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Blender가 설치되어 있지 않습니다(BLENDER_BIN=${BLENDER_BIN}).` }));
      return;
    }

    let job;
    try {
      const body = await readJsonBody(req);
      validateJob(body);
      job = body;
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }

    // 202 = "접수됨"만 보장 — 실제 변환은 아래에서 백그라운드로 진행하고 완료/실패는 콜백으로 알린다
    // (reconstruction의 SSM RunCommand가 비동기인 것과 동일한 계약, 전달 수단만 HTTP로 대체).
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accepted: true, furnitureId: job.furnitureId }));

    runConversionJob(job).catch((err) => {
      // runConversionJob은 내부에서 실패 콜백까지 스스로 처리한다 — 여기 도달하면 그조차 실패한
      // 예상 밖의 경우라 로그만 남긴다.
      console.error(`[mesh-worker] furniture=${job.furnitureId} 처리 중 처리되지 않은 예외: ${err.message}`);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`[mesh-worker] listening on :${PORT} (blender=${blenderAvailable ? "ok" : "MISSING"})`);
});
