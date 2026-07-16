const MANAGER_ASSISTANT_BOTTOM_THRESHOLD = 96;

export function shouldManagerAssistantStickToBottom(metrics: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}) {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom < MANAGER_ASSISTANT_BOTTOM_THRESHOLD;
}
