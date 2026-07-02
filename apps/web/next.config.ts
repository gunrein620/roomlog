import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  // @roomlog/ui는 raw TS(main: src/index.ts)를 export → 소스 그대로 트랜스파일.
  transpilePackages: ["@roomlog/ui", "@roomlog/types"],
  // 워크스페이스 루트(모노레포 루트)를 명시 — 홈 디렉토리 ~/package.json을 루트로 오인 방지.
  turbopack: {
    root: join(__dirname, "..", "..")
  }
};

export default nextConfig;
