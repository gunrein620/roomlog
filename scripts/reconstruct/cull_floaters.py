#!/usr/bin/env python3
"""가우시안 splat .ply에서 floater(허공 조각) 제거 — 가우시안 삭제만 하므로 회전·SH 무관, 안전.

세 가지 컷:
  ① 불투명도(opacity) 낮은 것 — 반투명 floater
  ② 스케일 큰 것 — 길쭉·거대한 스파이크
  ③ 공간 이상치 — median ± k·IQR 밖(창밖·허공 조각). IQR은 floater 많아도 강건.

사용:  python3 cull_floaters.py <in.ply> <out.ply> [--min-opacity 0.1] [--max-scale 0.5] [--iqr-k 3.0]
"""
import argparse, sys
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--min-opacity", type=float, default=0.10)
    ap.add_argument("--max-scale", type=float, default=0.5, help="가우시안 최대 반경(m) 초과 제거")
    ap.add_argument("--max-needle", type=float, default=6.0, help="최장축/차장축 비율 초과 제거(바늘 스파이크). 원반(얇은 면)은 보존")
    ap.add_argument("--iqr-k", type=float, default=3.0, help="median ± k·IQR 밖 제거(작을수록 공격적)")
    a = ap.parse_args()

    with open(a.inp, "rb") as f:
        header = b""
        while b"end_header" not in header:
            line = f.readline()
            if not line:
                sys.exit("end_header 못 찾음")
            header += line
        lines = header.decode("latin1").splitlines()
        props = [l.split()[-1] for l in lines if l.startswith("property float")]
        n = int(next(l for l in lines if l.startswith("element vertex")).split()[-1])
        raw = f.read(n * len(props) * 4)
    data = np.frombuffer(raw, dtype="<f4").reshape(n, len(props)).copy()
    idx = {name: i for i, name in enumerate(props)}
    print(f"[in] {n:,} 가우시안 · 속성 {len(props)}개")

    xyz = data[:, [idx["x"], idx["y"], idx["z"]]]
    opacity = 1.0 / (1.0 + np.exp(-data[:, idx["opacity"]]))
    scales = np.exp(data[:, [idx["scale_0"], idx["scale_1"], idx["scale_2"]]])
    maxscale = scales.max(1)

    keep = np.ones(n, dtype=bool)
    keep &= opacity > a.min_opacity;  o_cut = n - keep.sum()
    keep &= maxscale < a.max_scale;   s_cut = n - keep.sum() - o_cut
    # 바늘: 스케일 내림차순 [s0,s1,s2]에서 s0/s1 큰 것 = 한 축만 긴 스파이크(원반은 s0≈s1이라 보존)
    ssort = np.sort(scales, axis=1)[:, ::-1]
    needle = ssort[:, 0] / np.maximum(ssort[:, 1], 1e-6)
    keep &= needle < a.max_needle;    nd_cut = n - keep.sum() - o_cut - s_cut

    # 공간 이상치: 불투명도 상위(=진짜 표면) 점들로 방 경계 추정 → 그 밖 제거
    core = opacity > 0.5
    ref = xyz[core] if core.sum() > 1000 else xyz[keep]
    lo_hi = []
    for ax in range(3):
        q1, med, q3 = np.percentile(ref[:, ax], [25, 50, 75])
        iqr = max(q3 - q1, 1e-3)
        lo_hi.append((med - a.iqr_k * iqr, med + a.iqr_k * iqr))
    for ax, (lo, hi) in enumerate(lo_hi):
        keep &= (xyz[:, ax] >= lo) & (xyz[:, ax] <= hi)
    sp_cut = n - keep.sum() - o_cut - s_cut - nd_cut

    kept = data[keep]
    print(f"[cut] 불투명도<{a.min_opacity}: {o_cut:,} · 스케일>{a.max_scale}m: {s_cut:,} · 바늘>{a.max_needle}: {nd_cut:,} · 공간이상치: {sp_cut:,}")
    print(f"[out] {keep.sum():,} 가우시안 유지 ({100*keep.sum()/n:.1f}%)")
    lo = kept[:, [idx['x'], idx['y'], idx['z']]].min(0); hi = kept[:, [idx['x'], idx['y'], idx['z']]].max(0)
    print(f"[bbox] 이전 {np.ptp(xyz,0).round(1)} → 이후 {(hi-lo).round(1)} (m)")

    # 헤더의 vertex 수만 갱신해 재작성
    new_header = header.replace(
        f"element vertex {n}".encode(), f"element vertex {keep.sum()}".encode())
    with open(a.out, "wb") as f:
        f.write(new_header)
        f.write(kept.astype("<f4").tobytes())
    print(f"[write] {a.out}")


if __name__ == "__main__":
    main()
