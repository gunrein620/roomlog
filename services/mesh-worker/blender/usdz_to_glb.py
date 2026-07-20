# usdz_to_glb.py — Blender headless로 USDZ를 GLB로 변환한다.
#
# 실행: blender --background --factory-startup --python usdz_to_glb.py -- <in.usdz> <out.glb> <meta.json>
# (`--factory-startup`은 사용자 설정/애드온 개입을 배제 — 컨테이너 안이라 원래도 없지만 명시.)
#
# 스케일 보존이 이 스크립트의 핵심 제약이다(convert.mjs가 meta.json으로 사후 검증한다):
# Object Capture USDZ는 metersPerUnit=1 · Y-up · 원점=발자국 중심 · 바닥=y0 (tenant-furniture.service.ts
# 상단 주석, docs/tenant-furniture-fit.md 참고). glTF는 스펙상 이미 "미터·Y-up"이 기본 단위계라
# USD(Y-up, 미터) → glTF(Y-up, 미터) 변환은 원칙적으로 단위 재계산이 필요 없다 — 필요한 건 Blender의
# 내부 Z-up 표현을 오가는 두 번의 축 변환(USD 임포터가 한 번, glTF 익스포터가 되돌리는 한 번)이
# 서로 정확히 상쇄되는 것뿐이다. 이 스크립트는 그 변환에 어떤 추가 스케일도 끼워 넣지 않는다
# (scale_length를 1.0으로 고정 + usd_import에 scale 인자를 주지 않음 + export_apply만 켠다).
#
# ⚠️ 미검증: 이 스크립트는 실제 Blender에서 아직 실행해보지 못했다(개발 샌드박스에 Blender 없음).
# Blender 버전별로 bpy.ops.wm.usd_import / export_scene.gltf의 파라미터 이름이 달라질 수 있으므로
# (특히 4.x 계열 간 변화) 실제 설치 후 real Object Capture 샘플로 반드시 확인할 것 — docs/mesh-conversion-worker.md 참고.
import json
import sys

import bpy
import mathutils


def world_bounding_box(objects):
    """오브젝트들의 월드 공간 바운딩박스 (min, max) — 각 오브젝트의 로컬 bound_box 8개 꼭짓점을
    matrix_world로 변환해 합산한다."""
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for obj in objects:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ mathutils.Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world_corner[axis])
                maxs[axis] = max(maxs[axis], world_corner[axis])
    return mins, maxs


def main():
    argv = sys.argv
    try:
        args = argv[argv.index("--") + 1 :]
    except ValueError:
        raise RuntimeError("스크립트 인자가 없습니다 — `-- <in.usdz> <out.glb> <meta.json>` 형태로 넘겨야 합니다.")
    if len(args) != 3:
        raise RuntimeError(f"인자 3개(usdz, glb, meta)가 필요한데 {len(args)}개를 받았습니다: {args}")
    usdz_path, glb_path, meta_path = args

    # 빈 씬으로 시작 — 기본 큐브/라이트/카메라가 GLB에 섞여 들어가는 것을 막는다.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0  # 임의 스케일 배율 개입 차단 — 1유닛 = 1미터 고정.

    bpy.ops.wm.usd_import(filepath=usdz_path)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"USDZ를 임포트했지만 메시가 없습니다: {usdz_path}")

    import_min, import_max = world_bounding_box(mesh_objects)

    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        export_yup=True,  # glTF 규약(Y-up) — Blender 내부 Z-up을 여기서 되돌린다.
        use_selection=False,
        export_apply=True,  # 모디파이어 적용(오브젝트 트랜스폼과 별개, 정점 자체는 그대로 유지).
    )

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "importBBoxMin": list(import_min),
                "importBBoxMax": list(import_max),
                "meshObjectCount": len(mesh_objects),
            },
            f,
        )


if __name__ == "__main__":
    main()
