import { BadRequestException } from "@nestjs/common";

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

export function parseRegisterInput(body: unknown): RegisterSplatAssetInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input: RegisterSplatAssetInput = {
    transform: parseTransform(raw.transform)
  };

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
