#!/usr/bin/env python3
"""Record3D(EXR+JPG) → nerfstudio 데이터셋 + LiDAR 포인트 init (COLMAP·ns-process-data 우회).

왜: ns-process-data record3d는 LiDAR 깊이를 포즈 계산에만 쓰고 버린다(P3=0). 그 결과
텍스처 없는 흰 벽은 랜덤 init에서 못 벗어나 뿌옇게 남는다. 이 스크립트는 metadata.json의
전체 포즈+intrinsics를 직접 읽어, 매 프레임 깊이를 월드로 back-project해 **가우시안을 벽
표면 위에 미리 뿌려놓는** init 점군(ply)을 만든다. 카메라와 점군을 같은 포즈에서 생성하므로
좌표계가 내부적으로 일관된다(방향은 뷰어 native fit로 보정).

v2 (ablation 캠페인용 — 기존 동작은 전부 기본값으로 보존):
  --eval-every N     원시 프레임 매 N번째를 eval 전용으로 예약. 모든 암(arm)이 같은 eval
                     셋을 공유해야 ns-eval PSNR 비교가 성립한다. eval 프레임은 학습 선별
                     풀과 init back-projection 양쪽에서 제외(기하 prior 누출 차단).
                     transforms.json에 train/val/test_filenames 기록 → dataparser
                     `--eval-mode filename`으로 소비.
  --keyframe-mode    uniform(기존) | sharp — sharp는 균등 윈도우 안에서 라플라시안 분산
                     최대 프레임 선택(블러 회피). 점수는 src/.sharpness_cache.json에 캐시.
  --room-bbox        off(기존) | auto — 전체 점의 축별 강건 백분위(±margin)로 방 경계를
                     추정해 경계 밖 init 점 제거(통창 투과·거울 유령 기하 컷).
  --depth-out        none(기존) | exr | npy | png — frames에 depth_file_path 기록
                     (dn-splatter depth loss 암용. 포맷은 GPU 게이트에서 확정).

산출: <out>/transforms.json (nerfstudio, ply_file_path 포함) + <out>/init.ply
그 뒤:  ns-train splatfacto --data <out> --pipeline.model.use-scale-regularization True ...

사용:  python3 record3d_pointinit.py <EXR_RGBD dir> <out dir> [--num-frames 600] [--voxel 0.02] [--max-depth 5.0]
"""
import argparse, json, os, sys
import numpy as np

os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
import cv2  # EXR 읽기 (OPENCV_IO_ENABLE_OPENEXR 필요)


def quat_trans_to_c2w(pose):
    """Record3D pose [qx,qy,qz,qw, tx,ty,tz] → 4x4 camera-to-world (OpenGL 규약)."""
    qx, qy, qz, qw, tx, ty, tz = pose
    # 정규화
    n = (qx*qx + qy*qy + qz*qz + qw*qw) ** 0.5
    qx, qy, qz, qw = qx/n, qy/n, qz/n, qw/n
    R = np.array([
        [1 - 2*(qy*qy + qz*qz), 2*(qx*qy - qz*qw),     2*(qx*qz + qy*qw)],
        [2*(qx*qy + qz*qw),     1 - 2*(qx*qx + qz*qz), 2*(qy*qz - qx*qw)],
        [2*(qx*qz - qy*qw),     2*(qy*qz + qx*qw),     1 - 2*(qx*qx + qy*qy)],
    ])
    c2w = np.eye(4)
    c2w[:3, :3] = R
    c2w[:3, 3] = [tx, ty, tz]
    return c2w


def read_depth(path):
    """EXR/NPY 깊이 읽기 — EXR은 cv2 채널 순서 함정 때문에 max로 안전 추출."""
    if path.endswith(".npy"):
        return np.load(path)
    depth = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if depth is None:
        return None
    if depth.ndim == 3:
        depth = depth.max(axis=2)
    return depth


def depth_path(src, i):
    """프레임 i 깊이 경로: EXR 우선, 없으면 RoomLog Capture v1 NPY."""
    exr = os.path.join(src, "depth", f"{i}.exr")
    if os.path.exists(exr):
        return exr
    npy = os.path.join(src, "depth", f"{i}.npy")
    if os.path.exists(npy):
        return npy
    return None


def sharpness_scores(src, indices):
    """프레임별 라플라시안 분산(블러 지표). src/.sharpness_cache.json에 캐시(암 간 재사용)."""
    cache_path = os.path.join(src, ".sharpness_cache.json")
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path))
        except Exception:
            cache = {}
    missing = [i for i in indices if str(i) not in cache]
    if missing:
        print(f"[sharp] 라플라시안 계산 {len(missing)}프레임 (캐시 {len(indices)-len(missing)}) — 수 분 걸릴 수 있음")
        for n_done, i in enumerate(missing):
            g = cv2.imread(os.path.join(src, "rgb", f"{i}.jpg"), cv2.IMREAD_GRAYSCALE)
            cache[str(i)] = float(cv2.Laplacian(g, cv2.CV_64F).var()) if g is not None else -1.0
            if (n_done + 1) % 1000 == 0:
                print(f"[sharp]   {n_done+1}/{len(missing)}")
        try:
            json.dump(cache, open(cache_path, "w"))
        except Exception as e:
            print(f"[sharp] 캐시 저장 실패(무시): {e}")
    return {i: cache[str(i)] for i in indices}


def select_frames(candidates, num, mode, src):
    """train 프레임 선별. candidates는 eval 제외·파일 존재 확인이 끝난 원시 인덱스 배열."""
    if len(candidates) <= num:
        return candidates
    if mode == "uniform":
        pos = np.unique(np.linspace(0, len(candidates) - 1, num).round().astype(int))
        return candidates[pos]
    # sharp: 균등 윈도우(시간 커버리지 유지) 안에서 가장 선명한 프레임
    scores = sharpness_scores(src, candidates.tolist())
    chunks = np.array_split(candidates, num)
    sel = [int(max(c, key=lambda i: scores[int(i)])) for c in chunks if len(c)]
    vals = [scores[i] for i in sel]
    print(f"[sharp] 선택 프레임 선명도 median {np.median(vals):.0f} / min {min(vals):.0f}"
          f" (전체 후보 median {np.median(list(scores.values())):.0f})")
    return np.array(sorted(set(sel)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="EXR_RGBD 폴더 (metadata.json, depth/, rgb/ 포함)")
    ap.add_argument("out", help="출력 nerfstudio 데이터셋 폴더")
    ap.add_argument("--num-frames", type=int, default=600, help="전체에서 선택할 train 프레임 수")
    ap.add_argument("--voxel", type=float, default=0.02, help="점군 voxel 다운샘플 간격(m)")
    ap.add_argument("--max-depth", type=float, default=5.0, help="이 거리(m) 초과 깊이 폐기(LiDAR 한계·창밖)")
    ap.add_argument("--min-depth", type=float, default=0.15, help="이 거리 미만 폐기")
    ap.add_argument("--pix-stride", type=int, default=2, help="깊이 픽셀 서브샘플(2=1/4)")
    ap.add_argument("--eval-every", type=int, default=0,
                    help="원시 프레임 매 N번째를 eval 예약(0=끔). 암 간 공유 eval 셋 — ablation 필수")
    ap.add_argument("--keyframe-mode", choices=["uniform", "sharp"], default="uniform",
                    help="train 선별: uniform=균등(기존) | sharp=윈도우별 라플라시안 최대(블러 회피)")
    ap.add_argument("--room-bbox", choices=["off", "auto"], default="off",
                    help="auto: 축별 강건 백분위로 방 경계 추정, 밖의 init 점 제거(창밖·거울 유령)")
    ap.add_argument("--bbox-pct", type=float, default=1.0, help="room-bbox 백분위(축별 pct~100-pct)")
    ap.add_argument("--bbox-margin", type=float, default=0.3, help="room-bbox 여유(m)")
    ap.add_argument("--depth-out", choices=["none", "exr", "npy", "png"], default="none",
                    help="frames에 depth_file_path 기록: exr=원본 심링크, npy=float32 m, png=uint16 mm")
    ap.add_argument("--depth-resize-rgb", action="store_true",
                    help="depth-out npy/png를 RGB 해상도로 nearest 업샘플(소비자가 요구할 때)")
    ap.add_argument("--conf-min", type=int, choices=[0, 1, 2], default=0,
                    help="init back-projection에서 conf/<i>.npy < conf-min 픽셀 깊이 무효(0=끔)")
    args = ap.parse_args()

    meta = json.load(open(os.path.join(args.src, "metadata.json")))
    poses = np.array(meta["poses"], dtype=np.float64)            # (N,7)
    K = np.array(meta["K"], dtype=np.float64).reshape(3, 3).T    # Record3D는 column-major
    W, H = int(meta["w"]), int(meta["h"])
    dw, dh = int(meta["dw"]), int(meta["dh"])
    N = len(poses)
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]
    print(f"[meta] 전체 {N}프레임 · RGB {W}x{H} · depth {dw}x{dh} · fx={fx:.1f} cx={cx:.1f} cy={cy:.1f}")

    # 깊이 해상도용 intrinsics로 스케일
    sx, sy = dw / W, dh / H
    fxd, fyd, cxd, cyd = fx*sx, fy*sy, cx*sx, cy*sy

    # 파일이 실존하는 원시 인덱스만 후보로
    exists = np.array([
        depth_path(args.src, i) is not None
        and os.path.exists(os.path.join(args.src, "rgb", f"{i}.jpg"))
        for i in range(N)
    ])
    all_idx = np.nonzero(exists)[0]

    # eval 예약: 원시 인덱스 기준 매 N번째 — 모든 암이 같은 셋을 공유(선별 방식과 무관)
    if args.eval_every > 0:
        eval_idx = np.array([i for i in range(0, N, args.eval_every) if exists[i]])
    else:
        eval_idx = np.array([], dtype=int)
    eval_set = set(eval_idx.tolist())
    candidates = np.array([i for i in all_idx if i not in eval_set])

    train_idx = select_frames(candidates, args.num_frames, args.keyframe_mode, args.src)
    print(f"[select] train {len(train_idx)}프레임({args.keyframe_mode}) · eval {len(eval_idx)}프레임"
          f"(every {args.eval_every}) / 전체 {N}")

    # 깊이 픽셀 격자 (서브샘플)
    us = np.arange(0, dw, args.pix_stride)
    vs = np.arange(0, dh, args.pix_stride)
    uu, vv = np.meshgrid(us, vs)
    uu, vv = uu.ravel(), vv.ravel()
    # OpenGL 카메라 광선: x 우, y 상(이미지 y-down 반전), z 전방=-1
    ray_x = (uu - cxd) / fxd
    ray_y = -(vv - cyd) / fyd

    os.makedirs(args.out, exist_ok=True)
    all_pts, all_cols = [], []
    kept = 0
    for i in train_idx:            # init 점군은 train 프레임만 — eval 기하 prior 누출 차단
        dpath = depth_path(args.src, i)
        depth = read_depth(dpath) if dpath else None
        if depth is None:
            continue
        if args.conf_min > 0:
            cpath = os.path.join(args.src, "conf", f"{i}.npy")
            if os.path.exists(cpath):
                conf = np.load(cpath)
                if conf.shape != depth.shape:
                    conf = cv2.resize(conf, (depth.shape[1], depth.shape[0]),
                                      interpolation=cv2.INTER_NEAREST)
                depth = depth.copy()
                depth[conf < args.conf_min] = 0
        d = depth[vs][:, us].ravel().astype(np.float64) # 서브샘플 격자와 정렬
        valid = np.isfinite(d) & (d > args.min_depth) & (d < args.max_depth)
        c2w = quat_trans_to_c2w(poses[i])

        # 카메라 좌표: [x*d, y*d, -d]  (OpenGL, 전방 -Z)
        p_cam = np.stack([ray_x*d, ray_y*d, -d, np.ones_like(d)], axis=0)  # (4, P)
        p_world = (c2w @ p_cam)[:3].T                   # (P,3)
        p_world = p_world[valid]

        # 색: rgb를 depth 격자로 리사이즈 후 샘플
        rgb = cv2.imread(os.path.join(args.src, "rgb", f"{i}.jpg"))  # BGR
        rgb = cv2.resize(rgb, (dw, dh))
        col = rgb[vs][:, us].reshape(-1, 3)[valid][:, ::-1]  # BGR→RGB
        all_pts.append(p_world.astype(np.float32))
        all_cols.append(col.astype(np.uint8))
        kept += 1

    pts = np.concatenate(all_pts)
    cols = np.concatenate(all_cols)
    print(f"[backproj] {kept}프레임 · 원시 점 {len(pts):,}")

    # 방 경계 마스킹: 축별 강건 백분위 + 마진 — max-depth(구면)보다 정확한 공간 컷
    if args.room_bbox == "auto":
        lo = np.percentile(pts, args.bbox_pct, axis=0) - args.bbox_margin
        hi = np.percentile(pts, 100 - args.bbox_pct, axis=0) + args.bbox_margin
        inside = np.all((pts >= lo) & (pts <= hi), axis=1)
        print(f"[room-bbox] 경계 {np.round(lo,2)} ~ {np.round(hi,2)} · 컷 {(~inside).sum():,}점"
              f" ({100*(~inside).mean():.1f}%)")
        pts, cols = pts[inside], cols[inside]

    # voxel 다운샘플 (numpy 격자 해시 — open3d 불필요)
    keys = np.floor(pts / args.voxel).astype(np.int64)
    _, uniq = np.unique(keys, axis=0, return_index=True)
    pts, cols = pts[uniq], cols[uniq]
    print(f"[voxel {args.voxel}m] 점 {len(pts):,}")

    # ── 캐노니컬 프레임 정규화: 180° X Y-up 플립 + 바닥 y=0 앵커 ──────────────────
    # Record3D/ARKit→OpenGL 파이프라인 출력은 뷰어 프레임 기준 **Y-down**이다(방이 180° 뒤집혀
    # 카메라가 바닥 밑에서 봄 — 실측 확인). c0dccba가 "이미 Y-up"으로 오판해 splat-transform의
    # 회전 굽기(-r -90,0,0)를 뺐던 게 원인. ARKit 월드→OpenGL 규약은 결정론적이라 **모든 Record3D
    # 캡처가 동일하게 Y-down** → 여기서 180° X 회전((x,y,z)→(x,-y,-z))으로 Y-up으로 세운다.
    # 그다음 dense 점군에서 바닥을 찾아 y=0으로 앵커. 점군과 카메라 c2w에 같은 월드변환을 적용해
    # 일관성 유지(포즈 quaternion은 안 만지고 c2w 행렬 곱으로 처리 — frame_entry 참조).
    R_YUP = np.diag([1.0, -1.0, -1.0])  # 180° X (Y-up 플립)
    pts[:, 1] *= -1.0
    pts[:, 2] *= -1.0

    _ys = pts[:, 1]  # 플립 후: 바닥이 low-Y
    _lo, _hi = float(_ys.min()), float(_ys.max())
    _nbins = max(1, int(np.ceil((_hi - _lo) / 0.05)))  # 5cm 빈
    _counts, _edges = np.histogram(_ys, bins=_nbins, range=(_lo, _hi))
    # 바닥 = "가장 낮은 큰 수평 슬래브". 최빈 대비 비율 OR 전체 대비 절대 문턱 중 하나 넘는
    # 최저 빈 — 바닥 아래 소수 플로터는 문턱에서 걸러지고, 벽처럼 Y로 퍼진 밀도엔 안 걸린다.
    _thresh = max(0.33 * float(_counts.max()), 0.02 * float(_counts.sum()))
    _floor_y = _lo
    for _i, _c in enumerate(_counts):
        if float(_c) >= _thresh:
            _floor_y = 0.5 * (float(_edges[_i]) + float(_edges[_i + 1]))
            break
    pts[:, 1] -= _floor_y
    print(f"[canonical] 180° X Y-up 플립 + 바닥 y={_floor_y:.3f}→0 앵커 (점군·카메라 {len(poses)}개)")

    def _canonical_c2w(i):
        # 월드 180° X 플립 후 바닥 앵커를 c2w에 반영(점군과 동일 변환).
        c2w = quat_trans_to_c2w(poses[i])
        c2w[:3, :] = R_YUP @ c2w[:3, :]
        c2w[1, 3] -= _floor_y
        return c2w

    # frames: train+eval을 원시 인덱스 순으로 병합, split은 filename 리스트로 선언
    def frame_entry(i):
        e = {"file_path": f"rgb/{i}.jpg",
             "transform_matrix": _canonical_c2w(i).tolist()}
        if args.depth_out != "none":
            ext = {"exr": "exr", "npy": "npy", "png": "png"}[args.depth_out]
            sub = "depth" if args.depth_out == "exr" else f"depth_{args.depth_out}"
            e["depth_file_path"] = f"{sub}/{i}.{ext}"
        return e

    merged = sorted(set(train_idx.tolist()) | eval_set)
    frames = [frame_entry(i) for i in merged]

    # bbox 검증(방 크기 나와야 정상 — 수 m)
    lo, hi = pts.min(0), pts.max(0)
    print(f"[verify] bbox(m) X {hi[0]-lo[0]:.2f}  Y {hi[1]-lo[1]:.2f}  Z {hi[2]-lo[2]:.2f}")
    cam_t = np.array([_canonical_c2w(i)[:3, 3] for i in merged])
    print(f"[verify] 카메라 {len(frames)}개 중심 {cam_t.mean(0).round(2)} / 점군 중심 {pts.mean(0).round(2)}")
    print(f"[verify] Y-up·바닥0 기대: 카메라 Y>0 · 점군 Y_min≈0 (실제 Y_min {pts[:,1].min():.2f})")
    print(f"[verify] 카메라가 점군 bbox 안? "
          f"{np.all((cam_t.mean(0) > lo - 1) & (cam_t.mean(0) < hi + 1))}")

    # init.ply 쓰기 (ascii, 색 포함)
    ply = os.path.join(args.out, "init.ply")
    with open(ply, "w") as f:
        f.write("ply\nformat ascii 1.0\n")
        f.write(f"element vertex {len(pts)}\n")
        f.write("property float x\nproperty float y\nproperty float z\n")
        f.write("property uchar red\nproperty uchar green\nproperty uchar blue\n")
        f.write("end_header\n")
        for p, c in zip(pts, cols):
            f.write(f"{p[0]} {p[1]} {p[2]} {c[0]} {c[1]} {c[2]}\n")
    print(f"[write] {ply}  ({len(pts):,} pts)")

    # depth_file_path 실파일 준비 (dn-splatter 암용)
    if args.depth_out == "exr":
        dst = os.path.join(args.out, "depth")
        if not os.path.exists(dst):
            os.symlink(os.path.abspath(os.path.join(args.src, "depth")), dst)
    elif args.depth_out in ("npy", "png"):
        dst = os.path.join(args.out, f"depth_{args.depth_out}")
        os.makedirs(dst, exist_ok=True)
        for i in merged:
            dpath = depth_path(args.src, i)
            d = read_depth(dpath) if dpath else None
            if d is None:
                continue
            d = np.nan_to_num(d.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
            if args.depth_resize_rgb:
                d = cv2.resize(d, (W, H), interpolation=cv2.INTER_NEAREST)
            if args.depth_out == "npy":
                np.save(os.path.join(dst, f"{i}.npy"), d)
            else:  # png: uint16 mm (0=invalid 관례)
                cv2.imwrite(os.path.join(dst, f"{i}.png"),
                            np.clip(d * 1000.0, 0, 65535).astype(np.uint16))
        print(f"[write] {dst}  ({len(merged)} depth {args.depth_out})")

    # transforms.json (nerfstudio) — rgb는 원본 참조, ply_file_path로 init 지정
    tf = {
        "camera_model": "OPENCV",
        "fl_x": fx, "fl_y": fy, "cx": cx, "cy": cy, "w": W, "h": H,
        "ply_file_path": "init.ply",
        "frames": frames,
    }
    if len(eval_idx):
        # dataparser `--eval-mode filename`이 소비. 모든 암이 같은 test 셋 → PSNR 비교 성립.
        tf["train_filenames"] = [f"rgb/{i}.jpg" for i in train_idx.tolist()]
        tf["val_filenames"] = [f"rgb/{i}.jpg" for i in eval_idx.tolist()]
        tf["test_filenames"] = [f"rgb/{i}.jpg" for i in eval_idx.tolist()]
    # rgb 폴더를 out에서 참조 가능하게 심볼릭 링크(없으면 상대경로 깨짐)
    src_rgb = os.path.abspath(os.path.join(args.src, "rgb"))
    dst_rgb = os.path.join(args.out, "rgb")
    if not os.path.exists(dst_rgb):
        os.symlink(src_rgb, dst_rgb)
    json.dump(tf, open(os.path.join(args.out, "transforms.json"), "w"), indent=2)
    print(f"[write] {os.path.join(args.out, 'transforms.json')}  ({len(frames)} frames"
          f", train {len(train_idx)} / eval {len(eval_idx)})")
    print("\n다음: ns-train splatfacto --data", args.out,
          "--pipeline.model.use-scale-regularization True \\\n"
          "        --max-num-iterations 30000 --output-dir", os.path.join(args.out, "train"),
          "--viewer.quit-on-train-completion True \\\n"
          "        nerfstudio-data --orientation-method none --center-method none"
          " --auto-scale-poses False" + (" --eval-mode filename" if len(eval_idx) else ""))


if __name__ == "__main__":
    main()
