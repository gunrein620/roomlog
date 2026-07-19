import { Prisma } from "@prisma/client";

const POSTGRES_DEADLOCK_SQLSTATE = "40P01";
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 50;
const JITTER_MS = 100;

function metaSqlState(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const record = meta as Record<string, unknown>;
  const direct = record.code ?? record.originalCode;
  if (typeof direct === "string") return direct;
  const driver = record.driverAdapterError;
  if (driver && typeof driver === "object") {
    const cause = (driver as Record<string, unknown>).cause;
    if (cause && typeof cause === "object") {
      const code = (cause as Record<string, unknown>).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

export function isDeadlockError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: 인터랙티브 트랜잭션의 write conflict/deadlock 표준 코드.
    if (error.code === "P2034") return true;
    // P2010(raw query 실패)은 SQLSTATE로 데드락 여부를 구분한다.
    return metaSqlState(error.meta) === POSTGRES_DEADLOCK_SQLSTATE;
  }
  return false;
}

// 데드락 피해자로 롤백된 트랜잭션 전체를 재실행한다. 트랜잭션 콜백이
// 자체 부수효과 없이 tx 안에서만 쓰기를 수행할 때만 안전하다.
export async function withDeadlockRetry<T>(
  run: () => Promise<T>,
  options?: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await run();
    } catch (error) {
      if (!isDeadlockError(error) || attempt >= maxAttempts) throw error;
      await sleep(BASE_DELAY_MS * attempt + Math.floor(Math.random() * JITTER_MS));
    }
  }
}
