# syntax=docker/dockerfile:1
# mesh-worker — USDZ→GLB 변환 전용 CPU 컨테이너. HTTP 경로에서는 docker-compose가 상시 띄우고,
# SSM 경로에서는 이미 켜진 GPU 박스에서 같은 이미지를 잡마다 일회성으로 실행한다. 어느 경로에서도
# 이 컨테이너가 EC2 start/stop 수명주기를 관리하지 않는다.
#
# alpine이 아니라 debian-slim인 이유: Blender 공식 Linux 배포판은 glibc 빌드라 musl(alpine)에서
# 바로 못 돈다(apps/api·apps/web은 alpine). Blender headless(--background)도 X11/OpenGL 공유
# 라이브러리 링크가 남아 있어 최소한의 libx11 계열 패키지가 필요하다.
FROM debian:bookworm-slim AS base

# Blender 버전은 4.2 LTS 라인에 고정. 갱신 절차:
#   1) https://download.blender.org/release/Blender4.2/ 에서 최신 4.2.x tar.xz 확인
#   2) curl -fSL -o b.tar.xz <URL> && shasum -a 256 b.tar.xz  로 체크섬 직접 계산(공식 .sha256
#      사이드카가 항상 있는 건 아니라 이 레포는 다운로드해 직접 검증한 값을 박아둔다)
#   3) 아래 BLENDER_VERSION과 BLENDER_SHA256을 함께 교체
# 2026-07-20 다운로드해 직접 계산한 체크섬(빌드 아직 미검증 — docs/mesh-conversion-worker.md 참고).
ARG BLENDER_VERSION=4.2.22
ARG BLENDER_SHA256=b0064f2879b269787375f6b9021fefa6ae478e1d16aca839f5c63ac36fb02fe3
ARG NODE_MAJOR=20

RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      ca-certificates curl xz-utils gnupg \
      # Blender headless(--background) 실행에 필요한 최소 공유 라이브러리 세트(디스플레이 서버 없이도
      # 로드는 되어야 함 — 커뮤니티에 널리 알려진 headless Blender Docker 레시피 기준).
      libxrender1 libxi6 libxfixes3 libxkbcommon0 libsm6 libice6 libgl1 \
    && curl -fSL -o /tmp/nodesource-setup.sh "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" \
    && bash /tmp/nodesource-setup.sh \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs \
    && rm -f /tmp/nodesource-setup.sh \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fSL -o /tmp/blender.tar.xz \
      "https://download.blender.org/release/Blender${BLENDER_VERSION%.*}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    && echo "${BLENDER_SHA256}  /tmp/blender.tar.xz" | sha256sum -c - \
    && mkdir -p /opt/blender \
    && tar -xf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
    && rm -f /tmp/blender.tar.xz
ENV BLENDER_BIN=/opt/blender/blender
ENV PATH="/opt/blender:${PATH}"

WORKDIR /app
COPY services/mesh-worker/package.json ./
COPY services/mesh-worker/server.mjs services/mesh-worker/cli.mjs services/mesh-worker/convert.mjs services/mesh-worker/gltf-bbox.mjs ./
COPY services/mesh-worker/blender ./blender

ENV PORT=5001
EXPOSE 5001

# 기본 진입점은 기존 HTTP 서버 그대로다. SSM은 --entrypoint node ... /app/cli.mjs를 명시한다.
# 서버 기동 시 Blender가 정말 실행되는지 확인해 조용히 성공한 척 넘어가지 않는다.
CMD ["node", "server.mjs"]
