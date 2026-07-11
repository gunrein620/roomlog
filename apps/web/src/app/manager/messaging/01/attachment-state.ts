import type { AnnouncementDraft, AnnouncementTranslation } from "@roomlog/types";
import { ANNOUNCEMENT_TRANSLATION_LANGUAGES } from "../../../../lib/announcement-compose-state";

export function buildAttachedTranslations(
  translation: AnnouncementTranslation,
): AnnouncementTranslation[] {
  return ANNOUNCEMENT_TRANSLATION_LANGUAGES.map(({ lang }) => ({
    ...translation,
    lang,
    langLabel: translation.langLabel,
    reviewed: true,
  }));
}

export function findAttachedTranslation(
  draft: Pick<AnnouncementDraft, "title" | "body" | "translations">,
): AnnouncementTranslation | undefined {
  const translations = draft.translations ?? [];
  if (translations.length !== ANNOUNCEMENT_TRANSLATION_LANGUAGES.length) return undefined;

  const first = translations[0];
  const matchesFinalContent = first.title === draft.title && first.body === draft.body;
  const allProjected = translations.every((translation) =>
    translation.reviewed
    && translation.title === first.title
    && translation.body === first.body
    && translation.langLabel === first.langLabel,
  );

  return matchesFinalContent && allProjected ? first : undefined;
}
