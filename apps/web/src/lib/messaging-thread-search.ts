import type { Thread } from "@roomlog/types";

function normalizeSearchValue(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("ko-KR") ?? "";
}

export function filterThreadsBySearch(threads: Thread[], search: string): Thread[] {
  const normalizedSearch = normalizeSearchValue(search);
  if (!normalizedSearch) return threads;

  return threads.filter((thread) => {
    const searchableValues = [
      thread.contextLabel,
      thread.lastMessage,
    ];

    return searchableValues.some((value) =>
      normalizeSearchValue(value).includes(normalizedSearch),
    );
  });
}
