export type ChatMessageBlock =
  | {
      kind: "heading";
      text: string;
    }
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      kind: "list";
      items: string[];
    };

const sectionHeadings = new Set([
  "제가 이해한 내용",
  "지금 할 일",
  "필요한 사진",
  "관리자 참고 맥락",
  "다음으로 확인할 질문",
  "접수 상태"
]);

export function chatMessageBlocks(messageText: string): ChatMessageBlock[] {
  const blocks: ChatMessageBlock[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  }

  for (const rawLine of messageText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2).trim());
      continue;
    }

    flushList();
    blocks.push({
      kind: sectionHeadings.has(line) ? "heading" : "paragraph",
      text: line
    });
  }

  flushList();

  return blocks.length ? blocks : [{ kind: "paragraph", text: "" }];
}
