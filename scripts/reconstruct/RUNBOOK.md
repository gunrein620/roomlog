# Record3D → splat 재구성 러너북 (COLMAP 없는 경로)

한 촬영본을 splat까지 만드는 전체 순서. 역할 표기: **[Mac]** = 내 노트북(aws/croc/변환/뷰어), **[서버]** = SSM 접속한 GPU 박스 터미널.

인스턴스: `i-061e16af461c7c5df` (us-east-1, g6e.2xlarge / L40S 48GB, ~$2.2/h)
스크립트: `record3d_pointinit.py` (박스 홈에 이미 있음), 이 파일과 형제.

---

## 0. GPU 켜기 [Mac]
```bash
aws ec2 start-instances --instance-ids i-061e16af461c7c5df
# InsufficientInstanceCapacity 뜨면 몇 분 간격으로 재시도 (용량 풀릴 때까지):
for i in $(seq 1 40); do aws ec2 start-instances --instance-ids i-061e16af461c7c5df && break; sleep 180; done
```
SSM 붙었는지 확인 (Online 떠야 접속 가능):
```bash
aws ssm describe-instance-information --filters "Key=InstanceIds,Values=i-061e16af461c7c5df" \
  --query 'InstanceInformationList[].PingStatus' --output text
```

## 1. 접속 + tmux [서버]
```bash
aws ssm start-session --target i-061e16af461c7c5df   # [Mac]에서 쳐서 서버 진입
tmux new -s recon                                     # 안 꺼지는 창 (필수)
```
- 빠져나오기: `Ctrl+b` → `d` · 재접속: `tmux attach -t recon`

## 2. 파일 전송 (EXR 촬영본)
- **[Mac]** 보내기: `cd ~/Downloads && CROC_SECRET="코드" croc --yes send <촬영본>.zip`
- **[서버]** 받기: `cd ~ && CROC_SECRET="코드" croc --yes`   (send 없이, 코드는 매번 새로)
- croc 규칙: 코드는 명령줄 아닌 `CROC_SECRET`에. "room full" 뜨면 양쪽 `pkill croc` 후 새 코드.

## 3. 압축 풀기 + EXR 폴더 확인 [서버]
```bash
unzip -q <촬영본>.zip -d <이름>          # 예: unzip -q 2026-....zip -d myroom2
find <이름> -name metadata.json          # depth/ rgb/ metadata.json 있는 폴더 경로 확인
```

## 4. 컨테이너 진입 [서버]
```bash
cd ~ && sudo docker run --gpus all -it --rm --shm-size=12gb \
  -v "$(pwd)":/workspace -w /workspace \
  ghcr.io/nerfstudio-project/nerfstudio:latest bash
```
- 프롬프트가 `root@...:/workspace#`로 바뀌면 컨테이너 안. `exit`로 나감.
- ⚠️ `--rm`이라 컨테이너 안 설치물(node 등)은 나가면 사라짐. 데이터는 마운트라 유지.

## 5. 포인트-init 변환 [서버·컨테이너]  (GPU 연산 아직 없음)
```bash
python3 record3d_pointinit.py <EXR폴더> <이름> --num-frames 600 --voxel 0.02 --max-depth 4.0
```
**[verify] 검문소** — GPU 태우기 전 반드시 확인:
- `bbox(m) X/Y/Z` = 방 크기(2~6m)면 정상
- `카메라가 점군 bbox 안? True` 여야 좌표 맞음
- 아니면 멈추고 좌표 점검 (max-depth·채널 등)

## 6. 학습 [서버·컨테이너]  ← 고정 레시피
```bash
ns-train splatfacto --data <이름> \
  --pipeline.model.use-scale-regularization True \
  --max-num-iterations 30000 \
  --output-dir <이름>/train \
  --viewer.quit-on-train-completion True --experiment-name <이름>
```
- L40S에서 30k ≈ 20~40분. tmux 안이라 끊겨도 안전.
- 끝나면 profiling stats 출력 + 프롬프트 복귀. **실수로 다시 엔터치면 재학습되니 주의.**

## 7. ply 내보내기 [서버·컨테이너]
```bash
CONFIG=$(find <이름>/train -name config.yml | sort | tail -1)   # 완주 폴더 확인 후
ns-export gaussian-splat --load-config "$CONFIG" --output-dir <이름>/export
ls -lh <이름>/export/*.ply
```

## 8. ply를 Mac으로 [전송]
- **[서버]** 본체(컨테이너 아님, tmux 다른 창): `cd ~ && CROC_SECRET="코드" croc --yes send <이름>/export/splat.ply`
- **[Mac]** 받기 → spz 변환 → 뷰어:
```bash
CROC_SECRET="코드" croc --yes                                    # ~/Downloads에
npx --yes @playcanvas/splat-transform splat.ply --spz-version 3 <이름>.spz
cp <이름>.spz apps/web/public/samples/ ; printf '{"fit":"native","clip":false}' > apps/web/public/samples/<이름>.tuning.json
# tour-viewer.tsx의 SPLAT_SRC를 /samples/<이름>.spz로 (임시) → pnpm --filter web dev → /splat-tour
```

## 9. GPU 끄기 [Mac]  ← 작업 끝나면 반드시!
```bash
aws ec2 stop-instances --instance-ids i-061e16af461c7c5df
```

---
### 고정 레시피 (제품 후보값)
`--num-frames 600 --voxel 0.02 --max-depth 4.0` · `splatfacto --max-num-iterations 30000 --use-scale-regularization True`
스캔마다 안 바꾸는 게 원칙. 촬영 편차는 세팅 아니라 촬영 SOP + 자동 후처리(클립·컬링)로 잡음.

---

## 부록 A. Ablation 배치 — "붓 그림" 원인 분리 (2026-07-09 캠페인)

"품질 천장 = 촬영" 결론을 검증하기 전에 4개 원인 후보를 분리 판정한다:
(a) 촬영 커버리지 (b) depth 감독 부재 (c) ARKit 포즈 드리프트 (d) 블러 프레임 혼입.
평가는 눈이 아니라 **공유 eval 셋의 ns-eval PSNR/SSIM/LPIPS** — 모든 암(arm)이 원시 프레임
매 50번째를 같은 eval로 쓰므로 수치 비교가 성립한다(`record3d_pointinit.py --eval-every`).

**판정 기준(사전 선언 — 사후 합리화 금지):** PSNR +0.5dB↑ = 기여 확인 · ±0.3dB = 무효.
정성 비교는 자유궤도가 아니라 **고정 eval 뷰 렌더**(`ns-render dataset --split test`)로만.

```bash
# [서버·컨테이너] 형제 스크립트 2개(record3d_pointinit.py, run_ablations.sh)가 홈에 있는 상태에서:
bash run_ablations.sh <EXR_RGBD 폴더> <이름>        # A0 A1 A2 A3 순차 (암당 45~60분)
# A0 기준선 / A1 +camera-optimizer(드리프트) / A2 +sharp 키프레임(블러) / A3 +room-bbox(창밖·거울)
# A4(depth loss, dn-splatter 게이트 통과 후):
A4_POINTINIT="--keyframe-mode sharp --depth-out png --depth-resize-rgb" \
  A4_METHOD=dn-splatter bash run_ablations.sh <EXR_RGBD 폴더> <이름> A4
```

- 진행 확인: `tail -f ablate/<이름>/progress.log` — 마지막 줄 `DONE`이 종료 신호(원격 폴링용).
- 결과: `ablate/<이름>/results.json`(암별 수치 누적) + `ablate/<이름>/<암>/renders/`(고정 뷰).
- 재실행 안전: 암별 `eval.json` 있으면 스킵. 플래그명이 버전과 다르면 `DATAPARSER_ARGS` env로 교체.
- **GPU 태우기 전 게이트 4종**(컨테이너에서 확인): ① `ns-train splatfacto nerfstudio-data --help`에
  `--eval-mode filename`·`--orientation-method` 존재 ② `--pipeline.model.camera-optimizer.mode` 존재
  ③ `ns-render dataset --help` ④ dn-splatter 설치 가능성(A4 go/no-go).
- dataparser passthrough(`--orientation-method none --auto-scale-poses False`)로 **metric·ARKit
  Y-up 프레임이 그대로 보존**된다 — 산출 ply가 뷰어에서 rotX 0으로 서는지가 B7 검증 포인트.

---

## 부록 B. 논문 크로스체크 (2026-07-17 서베이)

T1 레시피의 레버들이 저텍스처·실내 3DGS 문헌의 처방과 일치하는지 검증. 결과: **일치 — 절반은 이미 적용돼 있었다.** 레버별 대응:

| T1 레버 | 대응 논문 | 상태 |
|---|---|---|
| `use-scale-regularization` + `max-gauss-ratio 3.0` (needle 억제) | eRank Regularization ([2406.11672](https://arxiv.org/pdf/2406.11672)) — 같은 진단(과도 이방성 needle), 더 정교한 처방(공분산 유효랭크 페널티) | ✅ 적용. needle 잔존 시 eRank가 업그레이드 카드 (splatfacto 커스텀 손실 필요) |
| `densify-grad-thresh 0.0004` + `cull_floaters.py` | Pixel-GS ([2403.15530](https://arxiv.org/pdf/2403.15530)) — 픽셀 인지 density control로 floater/needle 억제 | ✅ 적용 (우리는 후처리 컬링으로 보완) |
| A4: dn-splatter depth loss (W1-B) | DN-Splatter ([WACV 2025](https://arxiv.org/abs/2403.17822)) — 센서 depth+normal 감독이 실내 저텍스처에서 화질·기하 동시 개선 실증 | ❌ 미적용. 단 07-16 눈검증(통계 대등에도 눈 격차 잔존 = 3지표 모델 반증) 이후 **해상도 판정 실험 다음으로 후퇴** |
| (참고) 평면 프라이어 계열 | 2DGS-Room ([2412.03428](https://arxiv.org/html/2412.03428v1)), PlanarGS (NeurIPS 2025, [2510.23930](https://arxiv.org/html/2510.23930v1)) | 메시/기하 지향 — 사진급 투어 목적엔 DN-Splatter 우선 |

- **LingBot-Map** ([2604.14141](https://arxiv.org/abs/2604.14141), 피드포워드 스트리밍 재구성): 본선(Record3D 경로)엔 불필요 — 포즈·depth는 ARKit 센서가 이미 공급. 비-LiDAR 폰용 video 폴백 경로 강화 카드로만 보류 (안드로이드 지원 시점에 재검토).

**정정 크로스체크 (같은 날, scaniverse-quality-gap 실측 기록 대조): 안티앨리어싱·캡처 해상도**
- **AA — 이미 단일변인 실측 완료(07-16 저녁)**: T1 + `rasterize-mode antialiased` → 3지표 사실상 불변(2.83x·불투명 77%·**스케일 0.72cm = Scaniverse 동률**). **무해 확정 — 남은 건 gpu-job.sh T1 레시피에 플래그 반영뿐**(현재 스크립트엔 아직 없음). 눈검증은 고해상 최종 런에 편승(spz 회수 실수로 소실, 단독 재실행 생략 판단).
- **해상도 — 후순위 아님, 판정 실험 0순위(예약됨)**: 현 캡처 RGB는 **960×720(0.69MP)**. 07-16 눈검증에서 T1/T2가 통계 3지표를 거의 따라잡고도 Scaniverse와 눈 격차 잔존 = **3지표 모델이 격차의 본질이 아니라는 반증** — 유력 용의자가 캡처 해상도(학습 데이터에 디테일 자체가 없으면 splat이 선명해질 수 없음). 예약 실험: ① 캡처 RGB 1920×1440 상향(설정 몇 줄) ② AA 플래그 ③ 같은 방 재촬영 → T1 학습 → 눈검증. 비용 ~GPU 1런 30분. **이 한 번이 "Scaniverse를 넘을 수 있나"의 진짜 판정.** VRAM: T1@0.69MP가 5.8GB → 4배 픽셀이면 ~23GB 추정 = **L4 24GB 경계선. 판정 런은 g6e(L40S 48GB)에서 — num-downscales 후퇴가 끼면 단일변인이 깨진다.** 단 g6e는 NVMe 인스턴스 스토어라 stop 후엔 docker 이미지 생존 확인(없으면 bootstrap-nvme부터).
- **opacity 레버(T2) — 실측 완료·승격 보류**: cull-alpha-thresh 0.005로 불투명>0.9 73→31.8%(raw) 달성했으나 눈검증 "T1/T2 도긴개긴" → T1 표준 유지. cull_floaters min-opacity 커플링 함정은 gpu-job.sh 주석 참조.
- 요약(정정): 남은 헤드룸 우선순위 = **⓪ 캡처 1920×1440 + AA 재촬영 판정 실험(예약)** ① AA 플래그 레시피 반영 ② A4(depth loss — 판정 실험 결과에 따라) ③ eRank(needle 잔존 시). 제품 우회로: intake가 .spz 직접 업로드를 받으므로 화질 최우선 매물은 Scaniverse export 경로가 이미 열려 있음 — 자체 캡처 포지션은 자동화+metric+원샷.
