import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";
import { missingUploadPlaceholderSvg } from "./missing-upload-placeholder";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = Number(process.env.PORT) || 4000;
  const uploadDir = resolve(process.env.LOCAL_UPLOAD_DIR || "uploads");

  app.enableCors();
  app.setGlobalPrefix("api");
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: "/api/files" });
  app.use("/api/files", (request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("X-Roomlog-Missing-Upload", "true");
    response.status(200);

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.send(missingUploadPlaceholderSvg(request.path));
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
