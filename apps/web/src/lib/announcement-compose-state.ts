import type {
  AnnouncementCategory,
  AnnouncementLanguage,
  AnnouncementScope,
  AnnouncementTranslation,
} from "@roomlog/types";

export interface AnnouncementManagedRoom {
  id: string;
  buildingName?: string;
  roomNo?: string;
  address?: string;
}

export const ANNOUNCEMENT_TRANSLATION_LANGUAGES: ReadonlyArray<{
  lang: AnnouncementLanguage;
  label: string;
}> = [
  { lang: "en", label: "English" },
  { lang: "zh", label: "中文" },
  { lang: "vi", label: "Tiếng Việt" },
];

export function roomDisplayLabel(room: AnnouncementManagedRoom): string {
  return [room.buildingName, room.roomNo].filter(Boolean).join(" ") || room.id;
}

export function buildAnnouncementTarget(
  rooms: AnnouncementManagedRoom[],
  scope: AnnouncementScope,
  selectedBuilding: string,
  selectedRoomIds: string[],
): { targetRoomIds: string[]; targetLabel: string } {
  if (scope === "all") {
    return {
      targetRoomIds: rooms.map((room) => room.id),
      targetLabel: rooms.length > 0 ? `전체 ${rooms.length}세대` : "전체 관리 세대",
    };
  }

  if (scope === "building") {
    const buildingName = selectedBuilding || rooms[0]?.buildingName || "";
    const matchingRooms = rooms.filter((room) => room.buildingName === buildingName);
    return {
      targetRoomIds: matchingRooms.map((room) => room.id),
      targetLabel:
        buildingName && matchingRooms.length > 0
          ? `${buildingName} 전체 ${matchingRooms.length}세대`
          : "건물 선택 필요",
    };
  }

  const selected = new Set(selectedRoomIds);
  const matchingRooms = rooms.filter((room) => selected.has(room.id));
  return {
    targetRoomIds: matchingRooms.map((room) => room.id),
    targetLabel:
      matchingRooms.length === 1
        ? roomDisplayLabel(matchingRooms[0])
        : matchingRooms.length > 1
          ? `${roomDisplayLabel(matchingRooms[0])} 외 ${matchingRooms.length - 1}세대`
          : "호실 선택 필요",
  };
}

export function invalidateReviewedTranslations(
  translations: AnnouncementTranslation[],
): AnnouncementTranslation[] {
  return translations.map((translation) => ({ ...translation, reviewed: false }));
}

export function validateAnnouncementCompose(
  input: {
    category: AnnouncementCategory;
    title: string;
    body: string;
    targetRoomIds: string[];
    translations: AnnouncementTranslation[];
  },
  options: { requireUrgentReviews?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (!input.title.trim()) errors.push("공지 제목을 입력해 주세요.");
  if (!input.body.trim()) errors.push("상세 내용을 입력해 주세요.");
  if (input.targetRoomIds.length === 0) errors.push("발송 대상을 선택해 주세요.");

  if (input.category === "urgent" && options.requireUrgentReviews !== false) {
    const everyLanguageReviewed = ANNOUNCEMENT_TRANSLATION_LANGUAGES.every(({ lang }) => {
      const translation = input.translations.find((item) => item.lang === lang);
      return Boolean(
        translation?.title.trim() && translation.body.trim() && translation.reviewed,
      );
    });
    if (!everyLanguageReviewed) {
      errors.push("긴급 공지는 English, 中文, Tiếng Việt 번역을 모두 검수해야 합니다.");
    }
  }

  return errors;
}
