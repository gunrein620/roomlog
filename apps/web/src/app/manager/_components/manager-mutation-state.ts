export type ManagerMutationState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const INITIAL_MANAGER_MUTATION_STATE: ManagerMutationState = { status: "idle" };

export function managerMutationSuccess(message: string): ManagerMutationState {
  return { status: "success", message };
}

export function managerMutationError(error: unknown): ManagerMutationState {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "요청을 처리하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
  return { status: "error", message };
}

export type ManagerMutationAction = (
  previousState: ManagerMutationState,
  formData: FormData,
) => Promise<ManagerMutationState>;
