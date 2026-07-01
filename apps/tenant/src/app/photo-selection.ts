export type SelectablePhoto = {
  name: string;
  size: number;
};

export const maxPhotosPerTurn = 2;

export function normalizeSelectedPhotos<T extends SelectablePhoto>(
  files: Iterable<T> | ArrayLike<T> | null | undefined,
  maxPhotos = maxPhotosPerTurn
) {
  return Array.from(files ?? [])
    .filter((file) => file.size > 0)
    .slice(0, maxPhotos);
}

export function selectedPhotoSummary(files: SelectablePhoto[]) {
  if (!files.length) {
    return "";
  }

  const totalKb = files.reduce((total, file) => total + file.size / 1024, 0).toFixed(1);
  const firstNames = files.slice(0, 2).map((file) => file.name).join(", ");
  const suffix = files.length > 2 ? ` 외 ${files.length - 2}장` : "";

  return `${files.length}장 첨부 예정 · ${totalKb}KB · ${firstNames}${suffix}`;
}

export function photoUploadStatus(files: SelectablePhoto[]) {
  return files.length ? `사진 ${files.length}장 업로드 중` : "AI가 상담 내용을 정리 중";
}
