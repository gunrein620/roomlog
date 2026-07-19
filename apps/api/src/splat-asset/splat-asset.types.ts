import { BadRequestException } from "@nestjs/common";
import type {
  MetricOpening,
  MetricWall,
  RoomPlanCaptureFloorPlan,
  SplatIntakeCompleteRequest,
  SplatIntakePresignRequest
} from "@roomlog/types";

// SplatAsset CRUD 입출력 계약. web의 tour-types.ts(SplatTransform)와 필드가 같지만,
// billing-manager-mapping과 동일 원칙으로 api는 web 내부 타입을 import하지 않고
// 여기서 느슨한 shape를 자체 선언한다. transform은 DB에 Json으로 영속화된다.

export interface SplatTransformInput {
  rotationXDegrees: number;
  rotationYDegrees: number;
  scaleMultiplier: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

export interface RegistrationPointPairInput {
  splat: { x: number; y: number };
  plan: { x: number; y: number };
}

export interface CreateSplatAssetInput {
  roomId: string;
  fileUrl: string;
  floorPlanId?: string;
  fileKind?: string;
  sizeBytes?: number;
  capturedAt?: string; // ISO 8601
}

export interface RegisterSplatAssetInput {
  transform: SplatTransformInput;
  registrationPairs?: RegistrationPointPairInput[];
  /** 정합에 쓴 서버 도면 id — 있으면 SplatAsset.floorPlanId를 채워 공개 뷰어가 가구를 동봉받는다. */
  floorPlanId?: string;
}

export interface IntakeSplatAssetInput {
  listingId: string;
  title?: string;
  address?: string;
}

export interface UpdateSplatAssetFileInput {
  fileUrl: string;
  fileKind?: string;
  sizeBytes?: number;
}

const TRANSFORM_KEYS: (keyof SplatTransformInput)[] = [
  "rotationXDegrees",
  "rotationYDegrees",
  "scaleMultiplier",
  "offsetX",
  "offsetY",
  "offsetZ"
];

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`${field}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

export function parseCreateInput(body: unknown): CreateSplatAssetInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input: CreateSplatAssetInput = {
    roomId: requireNonEmptyString(raw.roomId, "roomId"),
    fileUrl: requireNonEmptyString(raw.fileUrl, "fileUrl")
  };

  if (raw.floorPlanId != null) input.floorPlanId = requireNonEmptyString(raw.floorPlanId, "floorPlanId");
  if (raw.fileKind != null) input.fileKind = requireNonEmptyString(raw.fileKind, "fileKind");

  if (raw.sizeBytes != null) {
    const n = Number(raw.sizeBytes);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException("sizeBytes는 0 이상의 숫자여야 합니다.");
    input.sizeBytes = Math.trunc(n);
  }

  if (raw.capturedAt != null) {
    const iso = requireNonEmptyString(raw.capturedAt, "capturedAt");
    if (Number.isNaN(Date.parse(iso))) throw new BadRequestException("capturedAt는 ISO 8601 날짜여야 합니다.");
    input.capturedAt = iso;
  }

  return input;
}

export function parseIntakeInput(body: unknown): IntakeSplatAssetInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input: IntakeSplatAssetInput = {
    listingId: requireNonEmptyString(raw.listingId, "listingId")
  };

  if (typeof raw.title === "string" && raw.title.trim() !== "") input.title = raw.title.trim();
  if (typeof raw.address === "string" && raw.address.trim() !== "") input.address = raw.address.trim();

  return input;
}

export function parseIntakePresignInput(body: unknown): SplatIntakePresignRequest {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.sizeBytes !== "number" || !Number.isFinite(raw.sizeBytes) || raw.sizeBytes < 0) {
    throw new BadRequestException("sizeBytes는 0 이상의 숫자여야 합니다.");
  }

  const input: SplatIntakePresignRequest = {
    listingId: requireNonEmptyString(raw.listingId, "listingId"),
    fileName: requireNonEmptyString(raw.fileName, "fileName"),
    sizeBytes: Math.trunc(raw.sizeBytes)
  };
  if (raw.mimeType != null) input.mimeType = requireNonEmptyString(raw.mimeType, "mimeType");
  return input;
}

export function parseIntakeCompleteInput(body: unknown): SplatIntakeCompleteRequest {
  const raw = (body ?? {}) as Record<string, unknown>;
  const intake = parseIntakeInput(raw);
  const captureFloorPlan = parseOptionalCaptureFloorPlanInput(raw);
  return {
    ...intake,
    key: requireNonEmptyString(raw.key, "key"),
    ...(captureFloorPlan ? { captureFloorPlan } : {})
  };
}

export function parseUpdateFileInput(body: unknown): UpdateSplatAssetFileInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input: UpdateSplatAssetFileInput = {
    fileUrl: requireNonEmptyString(raw.fileUrl, "fileUrl")
  };

  if (raw.fileKind != null) input.fileKind = requireNonEmptyString(raw.fileKind, "fileKind");

  if (raw.sizeBytes != null) {
    const n = Number(raw.sizeBytes);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestException("sizeBytes는 0 이상의 숫자여야 합니다.");
    input.sizeBytes = Math.trunc(n);
  }

  return input;
}

export function parseTransform(value: unknown): SplatTransformInput {
  const raw = (value ?? {}) as Record<string, unknown>;
  const transform = {} as SplatTransformInput;
  for (const key of TRANSFORM_KEYS) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) throw new BadRequestException(`transform.${key}는 유한한 숫자여야 합니다.`);
    transform[key] = n;
  }
  return transform;
}

function parsePoint2(value: unknown, field: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new BadRequestException(`${field}는 [x, z] 형태의 좌표여야 합니다.`);
  }
  const [x, z] = value.map((v) => Number(v));
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new BadRequestException(`${field}는 유한한 숫자 2개여야 합니다.`);
  }
  return [x, z];
}

function parsePositiveNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${field}는 0보다 큰 숫자여야 합니다.`);
  return n;
}

function parseMetricWall(value: unknown, index: number): MetricWall {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    start: parsePoint2(raw.start, `walls[${index}].start`),
    end: parsePoint2(raw.end, `walls[${index}].end`),
    height: parsePositiveNumber(raw.height, `walls[${index}].height`),
    thickness: parsePositiveNumber(raw.thickness, `walls[${index}].thickness`)
  };
}

function parseMetricOpening(value: unknown, index: number): MetricOpening {
  const raw = (value ?? {}) as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "door" && kind !== "window") {
    throw new BadRequestException(`openings[${index}].kind는 door 또는 window여야 합니다.`);
  }
  return {
    kind,
    center: parsePoint2(raw.center, `openings[${index}].center`),
    width: parsePositiveNumber(raw.width, `openings[${index}].width`),
    height: parsePositiveNumber(raw.height, `openings[${index}].height`)
  };
}

/**
 * A4a — RoomPlan(iOS) 캡처 도면 계약(packages/types/src/roomplan-capture.ts) 값 검증.
 * asset.captureFloorPlan(저장된 roomplan.json)과 요청 body의 captureFloorPlan 둘 다 이 함수로
 * 검증한다 — 저장 시점(complete)과 읽기 시점(auto-register-preview override) 양쪽의 유일한 소비처.
 */
export function parseCaptureFloorPlanValue(value: unknown): RoomPlanCaptureFloorPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException("captureFloorPlan이 필요합니다.");
  }
  const plan = value as Record<string, unknown>;
  if (plan.frame !== "arkit-metric") {
    throw new BadRequestException('captureFloorPlan.frame은 "arkit-metric"이어야 합니다.');
  }
  if (!Array.isArray(plan.walls) || plan.walls.length === 0) {
    throw new BadRequestException("captureFloorPlan.walls는 비어 있지 않은 배열이어야 합니다.");
  }

  const openingsRaw = plan.openings;
  if (openingsRaw !== undefined && !Array.isArray(openingsRaw)) {
    throw new BadRequestException("captureFloorPlan.openings는 배열이어야 합니다.");
  }

  return {
    frame: "arkit-metric",
    walls: plan.walls.map((wall, index) => parseMetricWall(wall, index)),
    openings: Array.isArray(openingsRaw) ? openingsRaw.map((opening, index) => parseMetricOpening(opening, index)) : []
  };
}

/** body.captureFloorPlan 필수 검증 — auto-register-preview 스펙의 직접 단위테스트 대상. */
export function parseCaptureFloorPlanInput(body: unknown): RoomPlanCaptureFloorPlan {
  const raw = (body ?? {}) as Record<string, unknown>;
  return parseCaptureFloorPlanValue(raw.captureFloorPlan);
}

/** body.captureFloorPlan 있으면 검증, 없으면 undefined — intake/complete와 auto-register-preview override가 쓴다. */
export function parseOptionalCaptureFloorPlanInput(body: unknown): RoomPlanCaptureFloorPlan | undefined {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.captureFloorPlan == null) return undefined;
  return parseCaptureFloorPlanValue(raw.captureFloorPlan);
}

export function parseRegisterInput(body: unknown): RegisterSplatAssetInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input: RegisterSplatAssetInput = {
    transform: parseTransform(raw.transform)
  };

  if (raw.floorPlanId != null) input.floorPlanId = requireNonEmptyString(raw.floorPlanId, "floorPlanId");

  if (raw.registrationPairs != null) {
    if (!Array.isArray(raw.registrationPairs)) {
      throw new BadRequestException("registrationPairs는 배열이어야 합니다.");
    }
    input.registrationPairs = raw.registrationPairs.map((pair, index) => {
      const p = (pair ?? {}) as Record<string, unknown>;
      const splat = (p.splat ?? {}) as Record<string, unknown>;
      const plan = (p.plan ?? {}) as Record<string, unknown>;
      const num = (v: unknown, path: string): number => {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new BadRequestException(`registrationPairs[${index}].${path}가 숫자가 아닙니다.`);
        return n;
      };
      return {
        splat: { x: num(splat.x, "splat.x"), y: num(splat.y, "splat.y") },
        plan: { x: num(plan.x, "plan.x"), y: num(plan.y, "plan.y") }
      };
    });
  }

  return input;
}
