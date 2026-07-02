import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // 워크스페이스 패키지를 소스 그대로 트랜스파일 (빌드 산출물 불필요)
  transpilePackages: ["@roomlog/ui", "@roomlog/types"],
  // 워크스페이스 루트(모노레포 루트)를 명시 — 홈 디렉토리 lockfile 오인 방지 + 워크스페이스 패키지 인식.
  turbopack: {
    root: join(__dirname, "..", ".."),
  },
};

export default nextConfig;
