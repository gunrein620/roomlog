#!/usr/bin/env python3
"""네이버 부동산 아파트 평면도 수집기 (개인 학습용 소량 수집).

파이프라인:
  1. m.land.naver.com/map/getRegionList        구/동 코드 -> 하위 동 + 좌표
  2. m.land.naver.com/cluster/ajax/complexList 동 좌표 주변 bbox -> 단지번호(hscpNo)
  3. land.naver.com/info/groundPlanGallery.naver?rletNo=  평형별 평면도 JSON
  4. landthumb-phinf.pstatic.net               이미지 다운로드

사용 예:
  # 강남구 전체에서 새 이미지 40장 (단지당 최대 2장)
  python3 crawl_naver_floorplans.py --region 1168000000 --count 40

  # 여러 지역, 동 단위 코드도 가능
  python3 crawl_naver_floorplans.py --region 1168000000 --region 1135000000 --count 120

  # 단지번호 직접 지정
  python3 crawl_naver_floorplans.py --complex 13814 --complex 8928

수집 예의: 모든 요청 사이에 --delay(기본 1.5초)+지터를 두고 순차 실행.
이미지는 네이버/설계사 저작물이므로 개인 연구·학습 범위에서만 사용하고
원본 재배포는 하지 말 것 (Roboflow 등 업로드 시 비공개 워크스페이스 권장).
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
IMG_HOST = "https://landthumb-phinf.pstatic.net"

_last_request_at = 0.0


def polite_get(url: str, *, referer: str, ua: str, delay: float, timeout: int = 25) -> bytes:
    """딜레이를 보장하며 GET. 5xx/네트워크 오류는 2회까지 백오프 재시도."""
    global _last_request_at
    wait = _last_request_at + delay + random.uniform(0.2, 0.9) - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={
        "User-Agent": ua,
        "Referer": referer,
        "Accept-Language": "ko-KR,ko;q=0.9",
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
            _last_request_at = time.monotonic()
            return body
        except (urllib.error.URLError, TimeoutError) as e:
            _last_request_at = time.monotonic()
            if attempt == 2:
                raise
            backoff = 5.0 * (attempt + 1)
            print(f"    ! 요청 실패({e}), {backoff:.0f}초 후 재시도", file=sys.stderr)
            time.sleep(backoff)
    raise AssertionError("unreachable")


def get_json(url: str, *, delay: float) -> dict | list | None:
    body = polite_get(url, referer="https://m.land.naver.com/",
                      ua=MOBILE_UA, delay=delay)
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def expand_region_to_dongs(cortar_no: str, delay: float) -> list[dict]:
    """구 코드면 하위 동 목록을, 동 코드면 자기 자신(좌표 포함)을 반환."""
    url = ("https://m.land.naver.com/map/getRegionList?cortarNo="
           + urllib.parse.quote(cortar_no))
    data = get_json(url, delay=delay)
    items = (data or {}).get("result", {}).get("list", []) if isinstance(data, dict) else []
    dongs = [it for it in items if it.get("CortarType") == "sec"]
    if dongs:
        return dongs
    if items:  # 시도 코드였음 -> 구 단위로 한 번 더 내려감
        out = []
        for gu in items:
            out.extend(expand_region_to_dongs(gu["CortarNo"], delay))
        return out
    # 하위 지역 없음 = 이미 동 코드 -> 상위 구에서 자기 좌표를 찾음
    parent = cortar_no[:5] + "00000"
    if parent != cortar_no:
        return [d for d in expand_region_to_dongs(parent, delay)
                if d["CortarNo"] == cortar_no]
    return []


def list_complexes(dong: dict, delay: float, types: str) -> list[dict]:
    """동 중심좌표 주변 bbox로 단지 목록 조회."""
    lat, lon = float(dong["MapYCrdn"]), float(dong["MapXCrdn"])
    d_lat, d_lon = 0.015, 0.02  # 동 하나를 대략 덮는 bbox
    params = urllib.parse.urlencode({
        "rletTpCd": types, "tradTpCd": "A1", "z": 14,
        "lat": f"{lat:.6f}", "lon": f"{lon:.6f}",
        "btm": f"{lat - d_lat:.6f}", "top": f"{lat + d_lat:.6f}",
        "lft": f"{lon - d_lon:.6f}", "rgt": f"{lon + d_lon:.6f}",
        "cortarNo": dong["CortarNo"], "totCnt": 500,
    })
    data = get_json("https://m.land.naver.com/cluster/ajax/complexList?" + params,
                    delay=delay)
    result = (data or {}).get("result") if isinstance(data, dict) else None
    return result if isinstance(result, list) else []


def fetch_ground_plans(hscp_no: str, delay: float) -> list[dict]:
    """단지 갤러리 페이지에서 평형별 평면도 목록 추출."""
    url = f"https://land.naver.com/info/groundPlanGallery.naver?rletNo={hscp_no}"
    html = polite_get(url, referer="https://land.naver.com/",
                      ua=DESKTOP_UA, delay=delay).decode("utf-8", errors="replace")
    m = re.search(r"var imgInfoData = '(.*?)';\s*(?:\n|var |</script>)", html, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1).replace("\\'", "'"))
    except json.JSONDecodeError:
        return []
    plans = []
    for ptp in data.get("allComplexGrdPlanList") or []:
        for img in ptp.get("imgList") or []:
            if "평면도" not in (img.get("imageTypeName") or ""):
                continue
            if not img.get("imageUrl"):
                continue
            plans.append({
                "hscpNo": str(hscp_no),
                "ptpNo": ptp.get("ptp_no"),
                "ptpNm": ptp.get("ptp_nm"),
                "splySpc": ptp.get("sply_spc"),
                "exclsSpc": ptp.get("excls_spc"),
                "imageId": img.get("imageId"),
                "imageTypeCode": img.get("imageTypeCode"),
                "imageTypeName": img.get("imageTypeName"),
                "imageUrl": img["imageUrl"],
            })
    return plans


def sanitize(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣._-]+", "-", str(name)).strip("-") or "x"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--region", action="append", default=[],
                    help="cortarNo (시도/구/동 코드, 반복 지정 가능)")
    ap.add_argument("--complex", action="append", default=[],
                    help="단지번호 hscpNo 직접 지정 (반복 가능)")
    ap.add_argument("--count", type=int, default=120, help="새로 받을 이미지 수")
    ap.add_argument("--max-per-complex", type=int, default=2,
                    help="단지당 최대 이미지 수 (다양성 확보)")
    ap.add_argument("--delay", type=float, default=1.5, help="요청 간 기본 딜레이(초)")
    ap.add_argument("--types", default="APT", help="rletTpCd (예: APT, APT:OPST)")
    ap.add_argument("--out", type=Path,
                    default=Path(__file__).resolve().parents[2]
                    / ".run/floorplan-datasets/naver/images")
    ap.add_argument("--dry-run", action="store_true", help="다운로드 없이 목록만")
    args = ap.parse_args()

    if not args.region and not args.complex:
        ap.error("--region 또는 --complex 중 하나는 필요합니다")

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir.parent / "manifest.jsonl"

    seen_images: set[str] = set()   # imageUrl 기준 중복 방지 (재실행 resume)
    done_complexes: set[str] = set()
    if manifest_path.exists():
        for line in manifest_path.read_text().splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            seen_images.add(rec.get("imageUrl", ""))
            done_complexes.add(str(rec.get("hscpNo", "")))

    # 1) 대상 단지 목록 구성 — 지역별 동 목록을 라운드로빈으로 섞어
    #    특정 지역에 편중되지 않게 함
    complexes: list[tuple[str, str]] = [(str(c), "") for c in args.complex]
    dong_queues: list[list[dict]] = []
    for region in args.region:
        dongs = expand_region_to_dongs(region, args.delay)
        print(f"region {region}: 동 {len(dongs)}곳")
        random.shuffle(dongs)
        if dongs:
            dong_queues.append(dongs)
    while dong_queues and len(complexes) * args.max_per_complex < args.count * 3:
        for dongs in list(dong_queues):
            dong = dongs.pop(0)
            if not dongs:
                dong_queues.remove(dongs)
            found = list_complexes(dong, args.delay, args.types)
            fresh = [c for c in found if str(c.get("hscpNo")) not in done_complexes]
            print(f"  {dong['CortarNm']}: 단지 {len(found)} (신규 {len(fresh)})")
            for c in fresh:
                complexes.append((str(c["hscpNo"]), c.get("hscpNm", "")))
            if len(complexes) * args.max_per_complex >= args.count * 3:
                break

    # hscpNo 중복 제거 (동 bbox가 겹칠 수 있음) 후 셔플로 지역 다양성 확보
    uniq_map: dict[str, str] = {}
    for no, nm in complexes:
        uniq_map.setdefault(no, nm)
    uniq = list(uniq_map.items())
    random.shuffle(uniq)
    print(f"대상 단지 {len(uniq)}곳, 목표 {args.count}장 (단지당 최대 {args.max_per_complex})")

    # 2) 단지별 평면도 수집
    downloaded = 0
    with manifest_path.open("a") as mf:
        for hscp_no, hscp_nm in uniq:
            if downloaded >= args.count:
                break
            try:
                plans = fetch_ground_plans(hscp_no, args.delay)
            except Exception as e:
                print(f"  {hscp_no} {hscp_nm}: 갤러리 실패 ({e})", file=sys.stderr)
                continue
            fresh = [p for p in plans if p["imageUrl"] not in seen_images]
            if not fresh:
                continue
            # 전용면적이 다른 평형 우선으로 다양성 확보
            fresh.sort(key=lambda p: p.get("exclsSpc") or 0)
            picked: list[dict] = []
            last_spc = None
            for p in fresh:
                if len(picked) >= args.max_per_complex:
                    break
                spc = round(float(p.get("exclsSpc") or 0))
                if spc == last_spc and len(fresh) > args.max_per_complex:
                    continue  # 같은 면적대 변형(A/B/C타입)은 건너뜀
                picked.append(p)
                last_spc = spc
            for p in picked:
                if downloaded >= args.count:
                    break
                ext = Path(p["imageUrl"]).suffix or ".jpg"
                fname = (f"naver_{p['hscpNo']}_{sanitize(p['ptpNm'])}"
                         f"_{sanitize(p['exclsSpc'])}{ext}")
                dest = out_dir / fname
                if args.dry_run:
                    print(f"  [dry] {fname}  ({hscp_nm} {p['imageTypeName']})")
                    downloaded += 1
                    continue
                if dest.exists():
                    seen_images.add(p["imageUrl"])
                    continue
                try:
                    body = polite_get(IMG_HOST + p["imageUrl"],
                                      referer="https://land.naver.com/",
                                      ua=DESKTOP_UA, delay=args.delay)
                except Exception as e:
                    print(f"  {fname}: 다운로드 실패 ({e})", file=sys.stderr)
                    continue
                if len(body) < 3000 or body[:6] in (b"<html>", b"<!DOCT"):
                    print(f"  {fname}: 이미지가 아님, 건너뜀", file=sys.stderr)
                    continue
                dest.write_bytes(body)
                p["hscpNm"] = hscp_nm
                p["file"] = fname
                mf.write(json.dumps(p, ensure_ascii=False) + "\n")
                mf.flush()
                seen_images.add(p["imageUrl"])
                downloaded += 1
                print(f"  [{downloaded}/{args.count}] {fname}  ({hscp_nm})")

    print(f"완료: 새 이미지 {downloaded}장 -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
