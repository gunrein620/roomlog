import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

// 로컬 개발에서 모노레포 루트 .env를 읽는다 (이미 설정된 환경 변수는 덮어쓰지 않음).
// Local API runs may start from either the repo root or apps/api.
// Load .env.local before .env so local secrets such as OPENAI_API_KEY take precedence.
const envPaths = Array.from(
  new Set([
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../.env")
  ])
);

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const port = Number(process.env.PORT) || 4000;
  const uploadDir = resolve(process.env.LOCAL_UPLOAD_DIR || "uploads");

  // 도면 AI 분석/문창문 탐지가 이미지 data URL을 body로 보내므로 기본 100kb로는 부족하다.
  app.useBodyParser("json", { limit: "12mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "12mb" });
  app.enableCors();
  app.setGlobalPrefix("api");
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: "/api/files" });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
