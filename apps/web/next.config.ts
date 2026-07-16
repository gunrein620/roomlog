import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import { join } from "node:path";

// 매물 사진은 API 정적서빙(/api/files) 또는 S3/CloudFront에서 온다 — next/image 원격 호스트 허용.
// dev: localhost:4000, prod(로컬 디스크 단계): api.woo-zu.com, 이후 S3 전환 대비 CloudFront 호스트도 env로 추가.
const uploadImagePatterns: RemotePattern[] = [
  { protocol: "http", hostname: "localhost", port: "4000", pathname: "/api/files/**" },
  { protocol: "https", hostname: "api.woo-zu.com", pathname: "/api/files/**" }
];

const cloudfrontHost = (process.env.CLOUDFRONT_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "").trim();
if (cloudfrontHost) {
  try {
    uploadImagePatterns.push({ protocol: "https", hostname: new URL(cloudfrontHost).hostname, pathname: "/**" });
  } catch {
    // 잘못된 URL은 무시 — 나머지 패턴으로 계속 동작
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "..", ".."),
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  images: {
    remotePatterns: uploadImagePatterns
  },
  // @roomlog/ui는 raw TS(main: src/index.ts)를 export → 소스 그대로 트랜스파일.
  transpilePackages: ["@roomlog/ui", "@roomlog/types"],
  // 워크스페이스 루트(모노레포 루트)를 명시 — 홈 디렉토리 ~/package.json을 루트로 오인 방지.
  turbopack: {
    root: join(__dirname, "..", "..")
  }
};

export default nextConfig;
