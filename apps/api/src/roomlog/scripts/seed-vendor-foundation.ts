import { createHmac, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../roomlog-support";
import { hashActivationKey } from "../services/vendor-activation-security";

export interface SeedVendorFoundationOptions {
  now: Date;
  activationKeyFactory: () => string;
  demoAccountPassword?: string;
  rotateKeyForVendorId?: string;
  printIssuedKey?: (rawKey: string) => void;
}

export interface SeedVendorFoundationResult {
  unlinkedVendorId: string;
  activationId: string;
  issuedRawKey: string;
}

export type SeedVendorFoundationErrorCode =
  | "ACTIVATION_KEY_ALREADY_ISSUED"
  | "ACTIVATION_KEY_PEPPER_REQUIRED"
  | "ACTIVATION_KEY_REUSE_FORBIDDEN"
  | "CATALOG_IDENTITY_CONFLICT"
  | "DEMO_ACCOUNT_IDENTITY_CONFLICT"
  | "DEMO_ACCOUNT_LINK_IDENTITY_CONFLICT"
  | "DEMO_ACCOUNT_NOT_DEDICATED"
  | "DEMO_ACCOUNT_PASSWORD_REQUIRED"
  | "EXAMPLE_ACTIVATION_IDENTITY_CONFLICT"
  | "INVALID_SEED_ARGUMENTS"
  | "INVALID_SEED_DATABASE_URL"
  | "INVALID_SEED_TIME"
  | "MULTIPLE_ISSUED_ACTIVATIONS"
  | "PRODUCTION_SEED_REQUIRES_ALLOW_PRODUCTION_SEED"
  | "ROTATE_VENDOR_NOT_SEED_TARGET"
  | "SEED_DATABASE_URL_REQUIRED"
  | "SEED_TARGET_NOT_ALLOWLISTED"
  | "UNLINKED_VENDOR_ALREADY_LINKED"
  | "UNAVAILABLE_VENDOR";

export class SeedVendorFoundationError extends Error {
  constructor(
    readonly code: SeedVendorFoundationErrorCode,
    message: string = code
  ) {
    super(message);
    this.name = "SeedVendorFoundationError";
  }
}

const unlinkedVendorId = "vendor-foundation-plumbing";
const issuedActivationPrefix = "vendor-foundation-activation-issued";
const issuedLifetimeMs = 15 * 24 * 60 * 60 * 1000;

const vendors = [
  {
    id: unlinkedVendorId,
    businessName: "룸로그 누수 설비",
    contactPerson: "김누수",
    phone: "010-9300-0001",
    businessNumber: "ROOMLOG-DEMO-VND-001",
    trades: ["배관", "누수"],
    serviceAreas: ["서울 성동구", "서울 광진구"]
  },
  {
    id: "vendor-foundation-electrical",
    businessName: "룸로그 전기 안전",
    contactPerson: "이전기",
    phone: "010-9300-0002",
    businessNumber: "ROOMLOG-DEMO-VND-002",
    trades: ["전기"],
    serviceAreas: ["서울 성동구", "서울 중구"]
  },
  {
    id: "vendor-foundation-boiler",
    businessName: "룸로그 보일러 케어",
    contactPerson: "박보일러",
    phone: "010-9300-0003",
    businessNumber: "ROOMLOG-DEMO-VND-003",
    trades: ["보일러", "난방"],
    serviceAreas: ["서울 전역"]
  },
  {
    id: "vendor-foundation-locksmith",
    businessName: "룸로그 도어락",
    contactPerson: "최도어",
    phone: "010-9300-0004",
    businessNumber: "ROOMLOG-DEMO-VND-004",
    trades: ["도어락", "출입문"],
    serviceAreas: ["서울 성동구", "서울 동대문구"]
  },
  {
    id: "vendor-foundation-cleaning",
    businessName: "룸로그 클린 홈",
    contactPerson: "정클린",
    phone: "010-9300-0005",
    businessNumber: "ROOMLOG-DEMO-VND-005",
    trades: ["청소", "곰팡이"],
    serviceAreas: ["서울 성동구"]
  },
  {
    id: "vendor-foundation-plumbing-linked",
    businessName: "룸로그 성동 설비 파트너",
    contactPerson: "한배관",
    phone: "010-9300-0006",
    businessNumber: "ROOMLOG-DEMO-VND-006",
    trades: ["배관", "누수"],
    serviceAreas: ["서울 성동구"]
  }
] as const;

const linkedAccounts = [
  {
    id: "vendor-foundation-user-electrical",
    vendorId: "vendor-foundation-electrical",
    linkId: "vendor-foundation-link-electrical",
    email: "vendor.electrical@roomlog.demo",
    name: "이전기",
    phone: "010-9400-0002"
  },
  {
    id: "vendor-foundation-user-boiler",
    vendorId: "vendor-foundation-boiler",
    linkId: "vendor-foundation-link-boiler",
    email: "vendor.boiler@roomlog.demo",
    name: "박보일러",
    phone: "010-9400-0003"
  },
  {
    id: "vendor-foundation-user-locksmith",
    vendorId: "vendor-foundation-locksmith",
    linkId: "vendor-foundation-link-locksmith",
    email: "vendor.locksmith@roomlog.demo",
    name: "최도어",
    phone: "010-9400-0004"
  },
  {
    id: "vendor-foundation-user-plumbing-linked",
    vendorId: "vendor-foundation-plumbing-linked",
    linkId: "vendor-foundation-link-plumbing-linked",
    email: "vendor.plumbing@roomlog.demo",
    name: "한배관",
    phone: "010-9400-0006"
  }
] as const;

function fail(code: SeedVendorFoundationErrorCode, message: string = code): never {
  throw new SeedVendorFoundationError(code, message);
}

function requireValidNow(now: Date) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("INVALID_SEED_TIME");
  }

  return now;
}

function requireKeyPepper(env: NodeJS.ProcessEnv) {
  const pepper = env.VENDOR_ACTIVATION_KEY_PEPPER?.trim();
  if (!pepper) fail("ACTIVATION_KEY_PEPPER_REQUIRED");
  return pepper;
}

function exampleActivationHash(label: string, pepper: string) {
  return createHmac("sha256", pepper)
    .update(`vendor-foundation-example:${label}`, "utf8")
    .digest("hex");
}

async function upsertCatalog(tx: Prisma.TransactionClient, now: Date) {
  for (const vendor of vendors) {
    const stableIdRow = await tx.vendorProfile.findUnique({
      where: { id: vendor.id },
      select: { businessNumber: true }
    });
    const businessNumberRow = await tx.vendorProfile.findFirst({
      where: {
        businessNumber: vendor.businessNumber,
        NOT: { id: vendor.id }
      },
      select: { id: true }
    });
    if (
      businessNumberRow ||
      (stableIdRow !== null && stableIdRow.businessNumber !== vendor.businessNumber)
    ) {
      fail(
        "CATALOG_IDENTITY_CONFLICT",
        `Catalog identity conflict for ${vendor.id}.`
      );
    }

    await tx.vendorProfile.upsert({
      where: { id: vendor.id },
      create: {
        id: vendor.id,
        businessName: vendor.businessName,
        contactPerson: vendor.contactPerson,
        phone: vendor.phone,
        serviceArea: vendor.serviceAreas[0],
        businessNumber: vendor.businessNumber,
        trades: [...vendor.trades],
        serviceAreas: [...vendor.serviceAreas],
        verificationStatus: "VERIFIED",
        isActive: true,
        activeJobs: 0,
        createdAt: now,
        updatedAt: now
      },
      update: {
        businessName: vendor.businessName,
        contactPerson: vendor.contactPerson,
        phone: vendor.phone,
        serviceArea: vendor.serviceAreas[0],
        businessNumber: vendor.businessNumber,
        trades: [...vendor.trades],
        serviceAreas: [...vendor.serviceAreas]
      }
    });
  }
}

async function assertClaimableSeedTarget(tx: Prisma.TransactionClient) {
  const target = await tx.vendorProfile.findUnique({
    where: { id: unlinkedVendorId },
    select: { isActive: true, verificationStatus: true }
  });
  if (
    !target ||
    !target.isActive ||
    target.verificationStatus === "REJECTED"
  ) {
    fail("UNAVAILABLE_VENDOR");
  }
}

async function upsertLinkedAccounts(
  tx: Prisma.TransactionClient,
  now: Date,
  demoAccountPassword: string
) {
  for (const account of linkedAccounts) {
    const passwordHash = hashPassword(demoAccountPassword, account.id);
    const existingAccount = await tx.userAccount.findUnique({
      where: { id: account.id },
      select: { email: true, phone: true, role: true, status: true }
    });
    const tenantRoomCount = await tx.tenantRoom.count({
      where: { tenantId: account.id }
    });
    const landlordRoomCount = await tx.room.count({
      where: { landlordId: account.id }
    });
    const existingLink = await tx.vendorAccountLink.findUnique({
      where: { id: account.linkId },
      select: { vendorId: true, userId: true, role: true, status: true }
    });
    if (
      existingAccount &&
      (existingAccount.email !== account.email ||
        existingAccount.phone !== account.phone ||
        existingAccount.role !== "VENDOR" ||
        existingAccount.status !== "ACTIVE")
    ) {
      fail("DEMO_ACCOUNT_IDENTITY_CONFLICT");
    }
    if (tenantRoomCount > 0 || landlordRoomCount > 0) {
      fail("DEMO_ACCOUNT_NOT_DEDICATED");
    }
    if (
      existingLink &&
      (existingLink.vendorId !== account.vendorId ||
        existingLink.userId !== account.id ||
        existingLink.role !== "OWNER" ||
        existingLink.status !== "ACTIVE")
    ) {
      fail("DEMO_ACCOUNT_LINK_IDENTITY_CONFLICT");
    }

    const linkConflict = await tx.vendorAccountLink.findFirst({
      where: {
        id: { not: account.linkId },
        OR: [{ vendorId: account.vendorId }, { userId: account.id }]
      },
      select: { id: true }
    });
    if (linkConflict) fail("DEMO_ACCOUNT_LINK_IDENTITY_CONFLICT");

    await tx.userAccount.upsert({
      where: { id: account.id },
      create: {
        id: account.id,
        email: account.email,
        passwordHash,
        name: account.name,
        phone: account.phone,
        role: "VENDOR",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
      },
      update: {
        email: account.email,
        name: account.name,
        phone: account.phone,
        role: "VENDOR",
        status: "ACTIVE"
      }
    });

    await tx.vendorAccountLink.upsert({
      where: { id: account.linkId },
      create: {
        id: account.linkId,
        vendorId: account.vendorId,
        userId: account.id,
        role: "OWNER",
        status: "ACTIVE",
        linkedAt: now
      },
      update: {
        vendorId: account.vendorId,
        userId: account.id,
        role: "OWNER",
        status: "ACTIVE"
      }
    });
  }
}

async function upsertExampleActivations(
  tx: Prisma.TransactionClient,
  now: Date,
  pepper: string
) {
  const locksmithAccount = linkedAccounts.find(
    (account) => account.vendorId === "vendor-foundation-locksmith"
  )!;
  const claimedCreatedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredCreatedAt = new Date(expiredAt.getTime() - issuedLifetimeMs);
  const examples = [
    {
      id: "vendor-foundation-activation-claimed",
      vendorId: locksmithAccount.vendorId,
      keyHash: exampleActivationHash("claimed", pepper),
      status: "CLAIMED" as const,
      expiresAt: new Date(now.getTime() + issuedLifetimeMs),
      claimedByUserId: locksmithAccount.id,
      claimedAt: new Date(now.getTime() - 60_000),
      createdAt: claimedCreatedAt
    },
    {
      id: "vendor-foundation-activation-expired",
      vendorId: "vendor-foundation-cleaning",
      keyHash: exampleActivationHash("expired", pepper),
      status: "EXPIRED" as const,
      expiresAt: expiredAt,
      claimedByUserId: null,
      claimedAt: null,
      createdAt: expiredCreatedAt
    }
  ];

  for (const example of examples) {
    const existing = await tx.vendorActivation.findUnique({
      where: { id: example.id }
    });
    if (existing) {
      const coherentClaimedHistory =
        example.status === "CLAIMED" &&
        existing.claimedAt !== null &&
        existing.createdAt.getTime() <= existing.claimedAt.getTime() &&
        existing.claimedAt.getTime() < existing.expiresAt.getTime();
      const coherentExpiredHistory =
        example.status === "EXPIRED" &&
        existing.claimedAt === null &&
        existing.expiresAt.getTime() <= now.getTime() &&
        existing.createdAt.getTime() < existing.expiresAt.getTime();
      if (
        existing.vendorId !== example.vendorId ||
        existing.keyHash !== example.keyHash ||
        existing.status !== example.status ||
        existing.claimedByUserId !== example.claimedByUserId ||
        (!coherentClaimedHistory && !coherentExpiredHistory)
      ) {
        fail("EXAMPLE_ACTIVATION_IDENTITY_CONFLICT");
      }
      continue;
    }

    await tx.vendorActivation.create({ data: example });
  }
}

async function seedVendorFoundationWithPepper(
  prisma: PrismaClient,
  options: SeedVendorFoundationOptions,
  pepper: string
): Promise<SeedVendorFoundationResult> {
  const now = requireValidNow(options.now);
  if (
    options.rotateKeyForVendorId !== undefined &&
    options.rotateKeyForVendorId !== unlinkedVendorId
  ) {
    fail("ROTATE_VENDOR_NOT_SEED_TARGET");
  }

  const issuedRawKey = options.activationKeyFactory();
  const candidateHash = hashActivationKey(issuedRawKey, pepper);
  const activationId = `${issuedActivationPrefix}-${candidateHash.slice(0, 16)}`;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${unlinkedVendorId}))`;
    await upsertCatalog(tx, now);
    await assertClaimableSeedTarget(tx);
    await upsertLinkedAccounts(tx, now, options.demoAccountPassword ?? "password123!");
    const activeOwner = await tx.vendorAccountLink.findFirst({
      where: {
        vendorId: unlinkedVendorId,
        role: "OWNER",
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (activeOwner) fail("UNLINKED_VENDOR_ALREADY_LINKED");
    await upsertExampleActivations(tx, now, pepper);

    const issued = await tx.vendorActivation.findMany({
      where: { vendorId: unlinkedVendorId, status: "ISSUED" },
      orderBy: { createdAt: "asc" }
    });
    if (issued.length > 1) fail("MULTIPLE_ISSUED_ACTIVATIONS");

    const current = issued[0];
    if (
      current?.keyHash === candidateHash &&
      current.expiresAt.getTime() > now.getTime() &&
      options.rotateKeyForVendorId === undefined
    ) {
      return {
        result: {
          unlinkedVendorId,
          activationId: current.id,
          issuedRawKey
        },
        shouldPrintIssuedKey: false
      };
    }

    if (current && options.rotateKeyForVendorId === undefined) {
      fail("ACTIVATION_KEY_ALREADY_ISSUED");
    }

    if (options.rotateKeyForVendorId !== undefined) {
      await tx.vendorActivation.updateMany({
        where: { vendorId: unlinkedVendorId, status: "ISSUED" },
        data: { status: "REVOKED" }
      });
    }

    const previouslyUsed = await tx.vendorActivation.findUnique({
      where: { keyHash: candidateHash },
      select: { id: true }
    });
    if (previouslyUsed) fail("ACTIVATION_KEY_REUSE_FORBIDDEN");

    await tx.vendorActivation.create({
      data: {
        id: activationId,
        vendorId: unlinkedVendorId,
        keyHash: candidateHash,
        status: "ISSUED",
        expiresAt: new Date(now.getTime() + issuedLifetimeMs),
        createdAt: now
      }
    });

    return {
      result: { unlinkedVendorId, activationId, issuedRawKey },
      shouldPrintIssuedKey: true
    };
  });

  if (result.shouldPrintIssuedKey) options.printIssuedKey?.(issuedRawKey);
  return result.result;
}

export async function seedVendorFoundation(
  prisma: PrismaClient,
  options: SeedVendorFoundationOptions
): Promise<SeedVendorFoundationResult> {
  return await seedVendorFoundationWithPepper(
    prisma,
    options,
    requireKeyPepper(process.env)
  );
}

export interface ResolveSeedVendorFoundationCliConfigInput {
  argv: string[];
  env: NodeJS.ProcessEnv;
}

export interface SeedVendorFoundationCliConfig {
  databaseUrl: string;
  keyPepper: string;
  demoAccountPassword: string;
  allowProductionSeed: boolean;
  rotateKeyForVendorId?: string;
}

function parseCliArguments(argv: string[]) {
  let allowProductionSeed = false;
  let rotateKeyForVendorId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-production-seed" && !allowProductionSeed) {
      allowProductionSeed = true;
      continue;
    }
    if (argument === "--rotate-key" && rotateKeyForVendorId === undefined) {
      const vendorId = argv[index + 1]?.trim();
      if (!vendorId || vendorId.startsWith("--")) fail("INVALID_SEED_ARGUMENTS");
      rotateKeyForVendorId = vendorId;
      index += 1;
      continue;
    }
    fail("INVALID_SEED_ARGUMENTS");
  }

  return { allowProductionSeed, rotateKeyForVendorId };
}

function parseSeedDatabaseUrl(rawDatabaseUrl: string) {
  let url: URL;
  try {
    url = new URL(rawDatabaseUrl);
  } catch {
    fail("INVALID_SEED_DATABASE_URL");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const parameters = [...new Set(url.searchParams.keys())];
  const sslModes = url.searchParams.getAll("sslmode");
  // Keep the remote seed surface narrow. verify-ca is intentionally unsupported;
  // operators that need certificate verification must use verify-full.
  const supportedSslModes = new Set(["require", "verify-full"]);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    decodeURIComponent(url.hostname).includes(",") ||
    !databaseName ||
    parameters.some(
      (parameter) => parameter !== "schema" && parameter !== "sslmode"
    ) ||
    url.searchParams.getAll("schema").length !== 1 ||
    url.searchParams.get("schema") !== "public" ||
    sslModes.length > 1 ||
    (sslModes.length === 1 && !supportedSslModes.has(sslModes[0]))
  ) {
    fail("INVALID_SEED_DATABASE_URL");
  }

  return { url, databaseName };
}

function seedTargetIdentity(url: URL, databaseName: string) {
  const hostname = decodeURIComponent(url.hostname)
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const displayHost = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `${displayHost}:${url.port || "5432"}/${databaseName}`;
}

function normalizeAllowlistedSeedTarget(candidate: string) {
  try {
    const url = new URL(`postgresql://${candidate}`);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (
      url.protocol !== "postgresql:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !databaseName
    ) {
      return undefined;
    }

    return seedTargetIdentity(url, databaseName);
  } catch {
    return undefined;
  }
}

function isLocalSeedTarget(url: URL) {
  const hostname = decodeURIComponent(url.hostname)
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return ["localhost", "127.0.0.1", "::1", "postgres"].includes(hostname);
}

function resolveDemoAccountPassword(env: NodeJS.ProcessEnv, sensitiveTarget: boolean) {
  const password = env.VENDOR_FOUNDATION_DEMO_PASSWORD;
  if (
    sensitiveTarget &&
    (!password ||
      password === "password123!" ||
      password.length < 12 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password))
  ) {
    fail("DEMO_ACCOUNT_PASSWORD_REQUIRED");
  }

  return password || "password123!";
}

export function resolveSeedVendorFoundationCliConfig(
  input: ResolveSeedVendorFoundationCliConfigInput
): SeedVendorFoundationCliConfig {
  const parsedArguments = parseCliArguments(input.argv);
  const databaseUrl = input.env.VENDOR_FOUNDATION_SEED_DATABASE_URL?.trim();
  if (!databaseUrl) fail("SEED_DATABASE_URL_REQUIRED");
  const parsedDatabase = parseSeedDatabaseUrl(databaseUrl);
  const sensitiveTarget =
    input.env.NODE_ENV === "production" || !isLocalSeedTarget(parsedDatabase.url);
  if (
    sensitiveTarget &&
    !parsedArguments.allowProductionSeed
  ) {
    fail("PRODUCTION_SEED_REQUIRES_ALLOW_PRODUCTION_SEED");
  }
  const target = seedTargetIdentity(parsedDatabase.url, parsedDatabase.databaseName);
  const allowlistedTargets = (input.env.VENDOR_FOUNDATION_SEED_ALLOWED_TARGETS ?? "")
    .split(",")
    .map((candidate) => normalizeAllowlistedSeedTarget(candidate.trim()))
    .filter((candidate): candidate is string => candidate !== undefined);
  if (!allowlistedTargets.includes(target)) {
    fail("SEED_TARGET_NOT_ALLOWLISTED");
  }

  return {
    databaseUrl,
    keyPepper: requireKeyPepper(input.env),
    demoAccountPassword: resolveDemoAccountPassword(input.env, sensitiveTarget),
    ...parsedArguments
  };
}

export interface RunSeedVendorFoundationCliOptions {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  stdout?: (text: string) => void;
  now?: () => Date;
  activationKeyFactory?: () => string;
}

function createRawActivationKey() {
  const material = randomBytes(12).toString("hex").toUpperCase();
  return `JIPJU-VND-${material.slice(0, 8)}-${material.slice(8, 16)}-${material.slice(16)}`;
}

export async function runSeedVendorFoundationCli(
  options: RunSeedVendorFoundationCliOptions = {}
): Promise<SeedVendorFoundationResult> {
  const config = resolveSeedVendorFoundationCliConfig({
    argv: options.argv ?? process.argv.slice(2),
    env: options.env ?? process.env
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl })
  });

  try {
    await prisma.$connect();
    return await seedVendorFoundationWithPepper(
      prisma,
      {
        now: (options.now ?? (() => new Date()))(),
        activationKeyFactory: options.activationKeyFactory ?? createRawActivationKey,
        demoAccountPassword: config.demoAccountPassword,
        rotateKeyForVendorId: config.rotateKeyForVendorId,
        printIssuedKey: (rawKey) =>
          (options.stdout ?? ((text: string) => process.stdout.write(text)))(
            `WARNING: 이 등록 키는 다시 조회할 수 없습니다. 안전하게 보관하세요: ${rawKey}\n`
          )
      },
      config.keyPepper
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runSeedVendorFoundationCli().catch((error: unknown) => {
    const code =
      error instanceof SeedVendorFoundationError
        ? error.code
        : "UNEXPECTED_VENDOR_FOUNDATION_SEED_FAILURE";
    process.stderr.write(`Vendor foundation seed failed: ${code}\n`);
    process.exitCode = 1;
  });
}
