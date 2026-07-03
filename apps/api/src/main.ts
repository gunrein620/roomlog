import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const port = Number(process.env.PORT) || 4000;
  const uploadDir = resolve(process.env.LOCAL_UPLOAD_DIR || "uploads");
  // 도면 이미지 data URL(base64) body가 express 기본 한도(100kb)를 넘으므로 상향.
  // 첨부 업로드 한도 10MB의 base64 팽창(약 13.4MB)까지 수용한다.
  const bodyLimit = process.env.API_JSON_BODY_LIMIT || "16mb";

  app.useBodyParser("json", { limit: bodyLimit });
  app.useBodyParser("urlencoded", { extended: true, limit: bodyLimit });
  app.enableCors();
  app.setGlobalPrefix("api");
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: "/api/files" });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
