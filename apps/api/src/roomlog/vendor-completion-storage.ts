import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { mkdir } from "node:fs/promises";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type SaveVendorCompletionFileInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export interface VendorCompletionPrivateStorage {
  save(input: SaveVendorCompletionFileInput): Promise<{ fileName: string }>;
  read(fileName: string): Promise<Buffer | null>;
  delete(fileName: string): Promise<void>;
}

type S3CommandClient = {
  send(command: any): Promise<any>;
};

const PRIVATE_S3_PREFIX = "private/vendor-completion";
const SAFE_PRIVATE_FILE_NAME =
  /^completion-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|gif|heic|heif)$/i;

function safePrivateFileName(fileName: string) {
  if (!isVendorCompletionPrivateFileName(fileName)) {
    throw new TypeError("완료 사진 저장 키가 올바르지 않습니다.");
  }
  return fileName;
}

export function isVendorCompletionPrivateFileName(fileName: unknown): fileName is string {
  return typeof fileName === "string" && SAFE_PRIVATE_FILE_NAME.test(fileName);
}

function isWithin(parent: string, child: string) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function isMissingFile(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "ENOENT"
  );
}

function isMissingS3Object(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const named = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return named.name === "NoSuchKey"
    || named.name === "NotFound"
    || named.$metadata?.httpStatusCode === 404;
}

export class LocalVendorCompletionStorage implements VendorCompletionPrivateStorage {
  private readonly privateRoot: string;

  constructor(privateRoot: string, publicUploadRoot: string) {
    this.privateRoot = resolve(privateRoot);
    const normalizedPublicRoot = resolve(publicUploadRoot);
    if (isWithin(normalizedPublicRoot, this.privateRoot)) {
      throw new TypeError("완료 사진 비공개 저장소는 공용 업로드 경로 밖에 있어야 합니다.");
    }
  }

  async save(input: SaveVendorCompletionFileInput) {
    const fileName = safePrivateFileName(input.fileName);
    await mkdir(this.privateRoot, { recursive: true });
    await writeFile(join(this.privateRoot, fileName), input.buffer);
    return { fileName };
  }

  async read(fileName: string) {
    try {
      return await readFile(join(this.privateRoot, safePrivateFileName(fileName)));
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async delete(fileName: string) {
    try {
      await unlink(join(this.privateRoot, safePrivateFileName(fileName)));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
}

export class S3VendorCompletionStorage implements VendorCompletionPrivateStorage {
  private readonly client: S3CommandClient;

  constructor(
    private readonly bucketName: string,
    region: string,
    client?: S3CommandClient
  ) {
    this.client = client ?? new S3Client({ region });
  }

  async save(input: SaveVendorCompletionFileInput) {
    const fileName = safePrivateFileName(input.fileName);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: this.key(fileName),
      Body: input.buffer,
      ContentType: input.mimeType
    }));
    return { fileName };
  }

  async read(fileName: string) {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.key(fileName)
      })) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      if (isMissingS3Object(error)) return null;
      throw error;
    }
  }

  async delete(fileName: string) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: this.key(fileName)
    }));
  }

  private key(fileName: string) {
    return `${PRIVATE_S3_PREFIX}/${safePrivateFileName(fileName)}`;
  }
}

export function createVendorCompletionPrivateStorage(
  env: NodeJS.ProcessEnv,
  publicUploadRoot: string
): VendorCompletionPrivateStorage {
  const bucketName = env.S3_BUCKET_NAME?.trim();
  const region = env.AWS_REGION?.trim() || "ap-northeast-2";
  const s3Enabled = /^(1|true|yes|on)$/i.test(env.S3_UPLOADS_ENABLED?.trim() ?? "");
  if (s3Enabled && bucketName) {
    return new S3VendorCompletionStorage(bucketName, region);
  }

  const normalizedPublicRoot = resolve(publicUploadRoot);
  const privateRoot = env.VENDOR_COMPLETION_PRIVATE_DIR?.trim()
    || join(dirname(normalizedPublicRoot), "private", "vendor-completion");
  return new LocalVendorCompletionStorage(privateRoot, normalizedPublicRoot);
}
