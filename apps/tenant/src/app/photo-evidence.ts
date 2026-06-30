export type PhotoEvidenceInput = {
  attachmentUrls: string[];
  previousAttachmentUrls: string[];
};

export type PhotoEvidenceItem = {
  url: string;
  label: string;
  variant: "current" | "previous";
};

export function photoEvidenceItems(input: PhotoEvidenceInput): PhotoEvidenceItem[] {
  const seen = new Set<string>();

  const buildItems = (
    urls: string[],
    variant: PhotoEvidenceItem["variant"],
    labelPrefix: string
  ) => {
    let count = 0;

    return urls.reduce<PhotoEvidenceItem[]>((items, rawUrl) => {
      const url = rawUrl.trim();
      if (!url || seen.has(url)) {
        return items;
      }

      seen.add(url);
      count += 1;
      items.push({
        url,
        label: `${labelPrefix} ${count}`,
        variant
      });

      return items;
    }, []);
  };

  return [
    ...buildItems(input.attachmentUrls, "current", "현재 사진"),
    ...buildItems(input.previousAttachmentUrls, "previous", "입주 전 기준 사진")
  ];
}
