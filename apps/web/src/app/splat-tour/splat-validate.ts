export type SplatFileKind = "spz" | "splat-ply" | "mesh-ply" | "pointcloud-ply" | "unknown";

export interface SplatValidationResult {
  ok: boolean;
  kind: SplatFileKind;
  reason: string;
  stats?: {
    vertexCount?: number;
  };
}

interface PlyHeaderInfo {
  hasFaceElement: boolean;
  properties: Set<string>;
  vertexCount?: number;
}

const PLY_HEADER_SCAN_BYTES = 256 * 1024;
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const GAUSSIAN_PROPERTIES = ["f_dc_0", "opacity", "scale_0", "rot_0"];
const XYZ_PROPERTIES = ["x", "y", "z"];
const RGB_PROPERTY_GROUPS = [
  ["red", "green", "blue"],
  ["r", "g", "b"],
  ["diffuse_red", "diffuse_green", "diffuse_blue"]
];

export function validateSplatFile(buffer: ArrayBuffer, fileName: string): SplatValidationResult {
  const bytes = new Uint8Array(buffer);
  const extension = getSupportedExtension(fileName);
  const hasGzipMagic = bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
  const hasPlyMagic = bytes.length >= 3 && bytes[0] === 0x70 && bytes[1] === 0x6c && bytes[2] === 0x79;

  if (extension === "spz") {
    if (hasGzipMagic) {
      return accept("spz", "gzip SPZ 헤더를 확인했습니다. 3D Splat 미리보기를 시작할 수 있습니다.");
    }

    if (hasPlyMagic) {
      const plyResult = validatePlyBytes(bytes, extension);
      return reject(
        plyResult.kind,
        `확장자는 .spz지만 파일 내용은 PLY입니다. Spark 뷰어가 포맷을 잘못 해석할 수 있으니 .ply로 내보내거나 파일명을 확인해 주세요.`,
        plyResult.stats
      );
    }

    return reject(
      "unknown",
      "확장자는 .spz지만 gzip SPZ 헤더가 아닙니다. Scaniverse에서 Splat 모드로 다시 처리한 뒤 .spz로 내보내 주세요."
    );
  }

  if (extension === "ply") {
    if (hasGzipMagic) {
      return reject(
        "spz",
        "파일 내용은 gzip SPZ인데 확장자가 .ply입니다. .spz로 내보내거나 파일명을 고친 뒤 다시 업로드해 주세요."
      );
    }

    if (hasPlyMagic) {
      return validatePlyBytes(bytes, extension);
    }

    return reject(
      "unknown",
      "확장자는 .ply지만 PLY 헤더를 찾을 수 없습니다. Gaussian Splat PLY 또는 .spz 파일을 업로드해 주세요."
    );
  }

  if (hasGzipMagic) {
    return reject(
      "spz",
      "파일 내용은 gzip SPZ로 보이지만 확장자가 .spz가 아닙니다. 파일명을 확인한 뒤 다시 업로드해 주세요."
    );
  }

  if (hasPlyMagic) {
    const plyResult = validatePlyBytes(bytes, extension);
    return reject(
      plyResult.kind,
      "파일 내용은 PLY로 보이지만 확장자가 .ply가 아닙니다. 파일명을 확인한 뒤 다시 업로드해 주세요.",
      plyResult.stats
    );
  }

  return reject(
    "unknown",
    "지원하지 않는 파일입니다. Scaniverse에서 Splat 모드로 다시 처리한 .spz 또는 Gaussian 속성이 있는 .ply를 업로드해 주세요."
  );
}

function validatePlyBytes(bytes: Uint8Array, extension: "ply" | "spz" | "other" | ""): SplatValidationResult {
  const header = parsePlyHeader(bytes);

  if (!header) {
    return reject(
      "unknown",
      "PLY 헤더의 end_header를 찾을 수 없습니다. 파일이 손상되지 않았는지 확인하고 다시 내보내 주세요."
    );
  }

  const stats = toStats(header);

  if (extension !== "ply") {
    const kind = classifyPlyHeader(header);
    return reject(kind, "PLY 파일은 .ply 확장자로 업로드해 주세요.", stats);
  }

  if (header.hasFaceElement) {
    return reject(
      "mesh-ply",
      "PLY에 face 메시 데이터가 있습니다. Scaniverse mesh 모드/일반 메시 파일은 Gaussian Splat 뷰어에서 사용할 수 없습니다. Scaniverse에서 Splat 모드로 다시 처리해 .spz 또는 splat PLY로 내보내 주세요.",
      stats
    );
  }

  if (hasAllProperties(header.properties, GAUSSIAN_PROPERTIES)) {
    return accept(
      "splat-ply",
      "Gaussian Splat PLY 속성(f_dc_0, opacity, scale_0, rot_0)을 확인했습니다. 3D Splat 미리보기를 시작할 수 있습니다.",
      stats
    );
  }

  if (hasXyzRgbOnly(header.properties)) {
    return reject(
      "pointcloud-ply",
      "PLY가 x/y/z와 색상만 가진 점군입니다. opacity, scale, rotation 같은 Gaussian 속성이 없어 splat 뷰어에서 렌더링할 수 없습니다. Scaniverse에서 Splat 모드로 다시 처리해 주세요.",
      stats
    );
  }

  return reject(
    "unknown",
    "PLY이지만 Gaussian Splat 속성을 찾지 못했습니다. Scaniverse에서 Splat 모드로 다시 처리해 .spz 또는 splat PLY로 내보내 주세요.",
    stats
  );
}

function parsePlyHeader(bytes: Uint8Array): PlyHeaderInfo | null {
  const headerBytes = bytes.subarray(0, Math.min(bytes.length, PLY_HEADER_SCAN_BYTES));
  const headerText = new TextDecoder("utf-8", { fatal: false }).decode(headerBytes);
  const headerEndMatch = /\r?\nend_header(?:\r?\n|$)/.exec(headerText);

  if (!headerEndMatch || !headerText.startsWith("ply")) {
    return null;
  }

  const lines = headerText.slice(0, headerEndMatch.index).split(/\r?\n/);
  let currentElement = "";
  let vertexCount: number | undefined;
  let hasFaceElement = false;
  const properties = new Set<string>();

  for (const line of lines) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    if (tokens[0] === "element") {
      currentElement = tokens[1] ?? "";
      if (currentElement === "vertex") {
        const parsedVertexCount = Number(tokens[2]);
        if (Number.isInteger(parsedVertexCount) && parsedVertexCount >= 0) {
          vertexCount = parsedVertexCount;
        }
      }
      if (currentElement === "face") {
        hasFaceElement = true;
      }
      continue;
    }

    if (tokens[0] === "property" && currentElement === "vertex") {
      const propertyName = tokens[tokens.length - 1];
      if (propertyName) {
        properties.add(propertyName);
      }
    }
  }

  return { hasFaceElement, properties, vertexCount };
}

function classifyPlyHeader(header: PlyHeaderInfo): SplatFileKind {
  if (header.hasFaceElement) return "mesh-ply";
  if (hasAllProperties(header.properties, GAUSSIAN_PROPERTIES)) return "splat-ply";
  if (hasXyzRgbOnly(header.properties)) return "pointcloud-ply";
  return "unknown";
}

function hasXyzRgbOnly(properties: Set<string>): boolean {
  return hasAllProperties(properties, XYZ_PROPERTIES) && RGB_PROPERTY_GROUPS.some((group) => hasAllProperties(properties, group));
}

function hasAllProperties(properties: Set<string>, required: string[]): boolean {
  return required.every((property) => properties.has(property));
}

function getSupportedExtension(fileName: string): "ply" | "spz" | "other" | "" {
  const trimmed = fileName.trim().toLowerCase();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return "";

  const extension = trimmed.slice(lastDot + 1);
  if (extension === "ply" || extension === "spz") return extension;
  return "other";
}

function accept(kind: Exclude<SplatFileKind, "unknown">, reason: string, stats?: SplatValidationResult["stats"]): SplatValidationResult {
  return { ok: true, kind, reason, ...(stats ? { stats } : {}) };
}

function reject(kind: SplatFileKind, reason: string, stats?: SplatValidationResult["stats"]): SplatValidationResult {
  return { ok: false, kind, reason, ...(stats ? { stats } : {}) };
}

function toStats(header: PlyHeaderInfo): SplatValidationResult["stats"] | undefined {
  if (header.vertexCount === undefined) return undefined;
  return { vertexCount: header.vertexCount };
}
