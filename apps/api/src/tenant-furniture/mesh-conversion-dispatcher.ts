// mesh-conversion-dispatcher — USDZ→GLB 변환 잡을 mesh-worker 컨테이너로 던지는 포트.
//
// reconstruction 모듈(gpu-instance.service.ts)과 대칭 관계이지만 다른 선택: 이 변환은 순수 CPU
// 작업(Blender headless)이라 GPU 인스턴스의 기동/정지 수명주기(EC2 start/stop, SSM 온라인 대기)가
// 필요 없다. mesh-worker는 항상 켜져 있는 경량 컨테이너 — GPU 오케스트레이터의 "큐 2틱 공백이면
// 인스턴스 정지" 최적화를 여기 그대로 옮기면 안 되는 이유가 이것이다(정지·재기동할 인스턴스가 없다).
//
// 흐름: TenantFurnitureService.queueMeshConversion이 GLB 업로드용 presigned PUT을 먼저 발급하고,
// 이 디스패처가 그 URL을 포함한 잡을 mesh-worker에 HTTP로 던진다(202 = "접수됨"만 보장, 실제 변환은
// 워커가 비동기로 진행 후 기존 콜백 엔드포인트로 알린다). 워커는 usdzUrl에서 직접 pull → Blender로
// 변환 → glbUploadUrl로 S3에 직접 push → 콜백엔 최종 glbPublicUrl만 싣는다 — "S3=벌크 버스,
// 서버=메타데이터" 원칙을 그대로 따른다(apps/api/src/reconstruction/remote-job-command.ts 주석 참고).
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

/** env로부터 디스패처를 구성한다. 셋 중 하나라도 비면 즉시 실패하는 널 구현으로 폴백(로컬 dev 기본값). */
export function createMeshConversionDispatcher(env: NodeJS.ProcessEnv): MeshConversionDispatcher {
  const workerUrl = env.MESH_WORKER_URL?.trim();
  const publicApiBase = env.PUBLIC_API_BASE_URL?.trim();
  const workerSecret = env.GPU_WORKER_SECRET?.trim();

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
