import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = Number(process.env.PORT) || 4000;
  const uploadDir = resolve(process.env.LOCAL_UPLOAD_DIR || "uploads");

  app.enableCors();
  app.setGlobalPrefix("api");
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: "/api/files" });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
