import { timingSafeEqual } from "node:crypto";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

function configuredWorkerSecret(env: NodeJS.ProcessEnv): string | null {
  const secret = env.GPU_WORKER_SECRET;
  return secret && secret.trim() !== "" ? secret : null;
}

/** 선택 인증 경로에서 사용한다. 환경변수나 헤더가 없으면 단순히 false를 반환한다. */
export function workerSecretMatches(
  provided: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const expected = configuredWorkerSecret(env);
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

/** GPU 콜백의 필수 인증. 설정 누락 시 인증을 열지 않고 503으로 닫는다. */
export function requireWorkerSecret(
  provided: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!configuredWorkerSecret(env)) {
    throw new ServiceUnavailableException("GPU_WORKER_SECRET이 설정되지 않았습니다.");
  }
  if (!provided) {
    throw new UnauthorizedException("워커 시크릿이 필요합니다.");
  }
  if (!workerSecretMatches(provided, env)) {
    throw new ForbiddenException("워커 시크릿이 올바르지 않습니다.");
  }
}
