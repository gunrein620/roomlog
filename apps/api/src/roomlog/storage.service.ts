import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SaveStoredFileInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export type StoredFile = {
  fileName: string;
  fileUrl: string;
};

export interface FileStorageAdapter {
  save(input: SaveStoredFileInput): Promise<StoredFile>;
}

export class LocalStorageAdapter implements FileStorageAdapter {
  constructor(
    private readonly uploadDir: string,
    private readonly publicUploadBaseUrl: string
  ) {}

  async save(input: SaveStoredFileInput): Promise<StoredFile> {
    mkdirSync(this.uploadDir, { recursive: true });
    // 동기 쓰기는 수백 MB 영상(splat intake) 동안 이벤트 루프를 통째로 세운다 — 반드시 비동기로.
    await writeFile(join(this.uploadDir, input.fileName), input.buffer);

    return {
      fileName: input.fileName,
      fileUrl: `${this.publicUploadBaseUrl.replace(/\/$/, "")}/${input.fileName}`
    };
  }
}

export class S3StorageAdapter implements FileStorageAdapter {
  private readonly client: S3Client;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly bucketName: string,
    private readonly region: string,
    publicBaseUrl?: string
  ) {
    this.client = new S3Client({ region });
    this.publicBaseUrl =
      publicBaseUrl?.replace(/\/$/, "") || `https://${bucketName}.s3.${region}.amazonaws.com`;
  }

  async save(input: SaveStoredFileInput): Promise<StoredFile> {
    const key = `floor-plans/${input.fileName}`;

    await this.client.send(
      new PutObjectCommand({
        Body: input.buffer,
        Bucket: this.bucketName,
        ContentType: input.mimeType,
        Key: key
      })
    );

    return {
      fileName: key,
      fileUrl: `${this.publicBaseUrl}/${key}`
    };
  }
}

export function createFileStorageAdapter(env: NodeJS.ProcessEnv, uploadDir: string, publicUploadBaseUrl: string) {
  const bucketName = env.S3_BUCKET_NAME?.trim();
  const region = env.AWS_REGION?.trim() || "ap-northeast-2";
  const s3Enabled = /^(1|true|yes|on)$/i.test(env.S3_UPLOADS_ENABLED?.trim() ?? "");

  if (s3Enabled && bucketName) {
    return new S3StorageAdapter(bucketName, region, env.S3_PUBLIC_BASE_URL || env.CLOUDFRONT_BASE_URL);
  }

  return new LocalStorageAdapter(uploadDir, publicUploadBaseUrl);
}
