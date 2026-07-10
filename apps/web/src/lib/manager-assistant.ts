export const MAX_MANAGER_PROMPT_LENGTH = 1000;

export interface ManagerAssistantBriefingItem {
  label: string;
  value: string;
  href: string;
  tone?: "default" | "attention";
}

export function normalizeManagerPrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_MANAGER_PROMPT_LENGTH);
}

export function managerAgentHref(prompt: string): string {
  const normalized = normalizeManagerPrompt(prompt);
  if (!normalized) return "/manager/agent/realtime";
  return `/manager/agent/realtime?${new URLSearchParams({ prompt: normalized }).toString()}`;
}

export function isDialogBackdropPoint(
  point: { clientX: number; clientY: number },
  bounds: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    point.clientX < bounds.left ||
    point.clientX > bounds.right ||
    point.clientY < bounds.top ||
    point.clientY > bounds.bottom
  );
}
