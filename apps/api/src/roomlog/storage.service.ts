import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SaveStoredFileInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  keyPrefix?: string;
};

export type StoredFile = {
  fileName: string;
  fileUrl: string;
};

export interface FileStorageAdapter {
  save(input: SaveStoredFileInput): Promise<StoredFile>;
  /** 저장된 파일 재조회 — AI 분석 등이 원본 바이트를 다시 읽을 때 사용. 없으면 null. */
  read(fileName: string): Promise<Buffer | null>;
}

function safeKeyPrefix(value: string | undefined) {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  if (!normalized) return "";
  if (!normalized.split("/").every((segment) => /^[a-zA-Z0-9_-]+$/.test(segment))) {
    throw new TypeError("storage keyPrefix contains an invalid path segment.");
  }
  return normalized;
}

export class LocalStorageAdapter implements FileStorageAdapter {
  constructor(
    private readonly uploadDir: string,
    private readonly publicUploadBaseUrl: string
  ) {}

  async save(input: SaveStoredFileInput): Promise<StoredFile> {
    const keyPrefix = safeKeyPrefix(input.keyPrefix);
    const targetDir = keyPrefix ? join(this.uploadDir, keyPrefix) : this.uploadDir;
    const storedName = keyPrefix ? `${keyPrefix}/${input.fileName}` : input.fileName;
    mkdirSync(targetDir, { recursive: true });
    // 동기 쓰기는 수백 MB 영상(splat intake) 동안 이벤트 루프를 통째로 세운다 — 반드시 비동기로.
    await writeFile(join(targetDir, input.fileName), input.buffer);

    return {
      fileName: storedName,
      fileUrl: `${this.publicUploadBaseUrl.replace(/\/$/, "")}/${storedName}`
    };
  }

  async read(fileName: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.uploadDir, fileName));
    } catch {
      return null;
    }
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
    const keyPrefix = safeKeyPrefix(input.keyPrefix) || "floor-plans";
    const key = `${keyPrefix}/${input.fileName}`;

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

  async read(fileName: string): Promise<Buffer | null> {
    // attachment.fileName은 저장 시점의 키 그대로다(S3 저장분은 floor-plans/ 프리픽스 포함).
    // 로컬 저장 시절 레코드(프리픽스 없음)도 조회할 수 있게 두 키를 모두 시도한다.
    const keys = fileName.startsWith("floor-plans/") ? [fileName] : [fileName, `floor-plans/${fileName}`];

    for (const key of keys) {
      try {
        const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }));
        const bytes = await result.Body?.transformToByteArray();
        if (bytes) return Buffer.from(bytes);
      } catch {
        // 키 없음 — 다음 후보 키 시도
      }
    }

    return null;
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
