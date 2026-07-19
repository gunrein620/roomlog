// gltf-bbox — GLB(바이너리 glTF) 컨테이너에서 라이브러리 없이 바운딩박스를 뽑아낸다.
// three.js/@gltf-transform 같은 전체 파서를 새 의존성으로 끌어오지 않기 위해 필요한 부분만 직접 읽는다.
//
// GLB 컨테이너 형식(glTF 2.0 스펙): 12바이트 헤더(magic 'glTF' · version · totalLength) 뒤에
// 청크가 이어진다. 첫 청크는 항상 JSON(chunkType 0x4E4F534A), 있다면 두 번째는 BIN(0x004E4942).
// 여기서는 JSON 청크만 읽는다 — 정점 min/max는 accessor 메타데이터에 이미 들어 있어(glTF 스펙상
// POSITION accessor는 min/max가 필수) 실제 정점 버퍼(BIN 청크)를 열어볼 필요가 없다.
//
// 알려진 한계: accessor.min/max는 메시 로컬 공간 값이라 노드 변환(회전/스케일)을 적용하지 않는다.
// Object Capture 가구 스캔은 보통 단일 메시 오브젝트라 이 한계가 실사용에 문제되지 않지만, 다중
// 메시/중첩 노드가 생기면 이 비교가 부정확해질 수 있다 — 그 경우 노드 트리를 순회하며 world 변환을
// 적용하는 계산으로 확장해야 한다.

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'

/** GLB 파일 버퍼에서 JSON 청크만 파싱해 돌려준다. */
function parseGlbJsonChunk(buffer) {
  if (buffer.length < 20) throw new Error("GLB 파일이 헤더보다 짧습니다.");
  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) throw new Error("GLB 매직 넘버가 일치하지 않습니다(유효한 .glb가 아님).");

  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== CHUNK_TYPE_JSON) throw new Error("GLB의 첫 청크가 JSON이 아닙니다.");

  const jsonBytes = buffer.subarray(20, 20 + chunkLength);
  return JSON.parse(jsonBytes.toString("utf8"));
}

/**
 * GLB 버퍼의 모든 POSITION accessor min/max를 합쳐 전체 바운딩박스를 계산한다.
 * @returns {{ min: [number, number, number], max: [number, number, number] }}
 */
export function readGlbBoundingBox(buffer) {
  const doc = parseGlbJsonChunk(buffer);
  const accessors = doc.accessors ?? [];
  const meshes = doc.meshes ?? [];

  const positionAccessorIndices = new Set();
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const idx = primitive.attributes?.POSITION;
      if (typeof idx === "number") positionAccessorIndices.add(idx);
    }
  }
  if (positionAccessorIndices.size === 0) {
    throw new Error("GLB에서 POSITION accessor를 찾을 수 없습니다(빈 메시?).");
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const idx of positionAccessorIndices) {
    const accessor = accessors[idx];
    if (!accessor?.min || !accessor?.max) {
      throw new Error(`accessor[${idx}]에 min/max가 없습니다(내보내기 설정 확인 필요).`);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], accessor.min[axis]);
      max[axis] = Math.max(max[axis], accessor.max[axis]);
    }
  }

  return { min, max };
}
