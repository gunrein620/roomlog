"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AnnouncementCategory,
  AnnouncementDraft,
  AnnouncementLanguage,
  AnnouncementScope,
  AnnouncementTranslation,
} from "@roomlog/types";
import { Button } from "@roomlog/ui";
import {
  ANNOUNCEMENT_TRANSLATION_LANGUAGES,
  buildAnnouncementTarget,
  invalidateReviewedTranslations,
  roomDisplayLabel,
  shouldExpandAnnouncementTranslation,
  validateAnnouncementCompose,
  type AnnouncementManagedRoom,
} from "@/lib/announcement-compose-state";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import {
  saveAnnouncementComposeAction,
  translateAnnouncementAction,
} from "./actions";
import styles from "./AnnouncementComposer.module.css";

const CATEGORY_OPTIONS: ReadonlyArray<{
  value: AnnouncementCategory;
  label: string;
  code: string;
}> = [
  { value: "urgent", label: "긴급", code: "URGENT" },
  { value: "life", label: "생활", code: "LIFE" },
  { value: "event", label: "행사", code: "EVENT" },
];

const SCOPE_OPTIONS: ReadonlyArray<{ value: AnnouncementScope; label: string }> = [
  { value: "all", label: "전체" },
  { value: "building", label: "건물" },
  { value: "unit", label: "호실" },
];

function emptyTranslation(lang: AnnouncementLanguage, label: string): AnnouncementTranslation {
  return { lang, langLabel: label, title: "", body: "", reviewed: false, sourceHash: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
}

export function AnnouncementComposer({
  initialDraft,
  draftId,
  managedRooms,
}: {
  initialDraft: AnnouncementDraft;
  draftId?: string;
  managedRooms: AnnouncementManagedRoom[];
}) {
  const router = useRouter();
  const [currentDraftId, setCurrentDraftId] = useState(draftId);
  const [category, setCategory] = useState(initialDraft.category);
  const [scope, setScope] = useState(initialDraft.scope);
  const [title, setTitle] = useState(initialDraft.title);
  const [body, setBody] = useState(initialDraft.body);
  const [translations, setTranslations] = useState<AnnouncementTranslation[]>(
    initialDraft.translations ?? [],
  );
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(
    initialDraft.targetRoomIds ?? [],
  );
  const firstTargetRoom = managedRooms.find((room) =>
    initialDraft.targetRoomIds?.includes(room.id),
  );
  const [selectedBuilding, setSelectedBuilding] = useState(
    firstTargetRoom?.buildingName ?? managedRooms[0]?.buildingName ?? "",
  );
  const [translating, setTranslating] = useState<AnnouncementLanguage | null>(null);
  const [expandedLanguages, setExpandedLanguages] = useState<AnnouncementLanguage[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");

  const buildings = Array.from(
    new Set(managedRooms.map((room) => room.buildingName).filter(Boolean)),
  ) as string[];
  const target = buildAnnouncementTarget(
    managedRooms,
    scope,
    selectedBuilding,
    selectedRoomIds,
  );

  function updateSource(field: "title" | "body", value: string) {
    if (field === "title") setTitle(value);
    else setBody(value);
    setTranslations((current) => invalidateReviewedTranslations(current));
    setFeedback("");
  }

  function translationFor(lang: AnnouncementLanguage, label: string): AnnouncementTranslation {
    return translations.find((translation) => translation.lang === lang) ?? emptyTranslation(lang, label);
  }

  function updateTranslation(
    lang: AnnouncementLanguage,
    label: string,
    patch: Partial<AnnouncementTranslation>,
  ) {
    setTranslations((current) => {
      const existing = current.find((translation) => translation.lang === lang);
      const next = { ...(existing ?? emptyTranslation(lang, label)), ...patch };
      return existing
        ? current.map((translation) => (translation.lang === lang ? next : translation))
        : [...current, next];
    });
    setFeedback("");
  }

  async function handleTranslate(lang: AnnouncementLanguage, label: string) {
    setExpandedLanguages((current) => current.includes(lang) ? current : [...current, lang]);
    const sourceErrors = [
      !title.trim() ? "번역 전에 공지 제목을 입력해 주세요." : "",
      !body.trim() ? "번역 전에 상세 내용을 입력해 주세요." : "",
    ].filter(Boolean);
    if (sourceErrors.length > 0) {
      setErrors(sourceErrors);
      return;
    }

    setErrors([]);
    setFeedback("");
    setTranslating(lang);
    try {
      const translated = await translateAnnouncementAction({ targetLang: lang, title, body });
      setTranslations((current) => [
        ...current.filter((translation) => translation.lang !== lang),
        translated,
      ]);
      setFeedback(`${label} 번역이 완료되었습니다. 내용을 확인한 뒤 검수 완료를 체크해 주세요.`);
    } catch (error) {
      setErrors([errorMessage(error)]);
    } finally {
      setTranslating(null);
    }
  }

  function toggleRoom(roomId: string) {
    setSelectedRoomIds((current) =>
      current.includes(roomId)
        ? current.filter((id) => id !== roomId)
        : [...current, roomId],
    );
  }

  async function handleSave(intent: "save" | "review") {
    const validationErrors = validateAnnouncementCompose(
      { category, title, body, targetRoomIds: target.targetRoomIds, translations },
      { requireUrgentReviews: intent === "review" },
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setFeedback("");
    setSaving(true);
    try {
      const saved = await saveAnnouncementComposeAction({
        draftId: currentDraftId,
        draft: {
          category,
          scope,
          targetLabel: target.targetLabel,
          targetRoomIds: target.targetRoomIds,
          title,
          body,
          translations,
        },
      });
      setCurrentDraftId(saved.id);
      setTranslations(saved.translations ?? []);

      if (intent === "review") {
        router.push(`${MANAGER_MESSAGING_ROUTES["M-MSG-02"]}?id=${encodeURIComponent(saved.id)}`);
        return;
      }

      setFeedback("공지 초안을 저장했습니다.");
      router.replace(`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(saved.id)}`);
    } catch (error) {
      setErrors([errorMessage(error)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.composeGrid}>
      <div className={styles.leftColumn}>
        <section className={`${styles.card} ${styles.categoryCard}`} aria-label="공지 카테고리">
          <div className={styles.categoryList}>
            {CATEGORY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  className={styles.choiceInput}
                  type="radio"
                  name="category"
                  value={option.value}
                  checked={category === option.value}
                  onChange={() => setCategory(option.value)}
                />
                <span className={styles.categoryPill}>
                  {option.label} <span className={styles.categoryCode}>{option.code}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionDot} /> 대상
          </h2>
          <div className={styles.sectionStack}>
            <div className={styles.scopeList}>
              {SCOPE_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    className={styles.choiceInput}
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                  />
                  <span className={styles.scopeLabel}>
                    <span className={styles.radioMark} /> {option.label}
                  </span>
                </label>
              ))}
            </div>

            <div className={styles.targetControls}>
              {scope === "building" ? (
                <div className={styles.selectWrap}>
                  <select
                    className={styles.select}
                    aria-label="공지 대상 건물"
                    value={selectedBuilding}
                    onChange={(event) => setSelectedBuilding(event.target.value)}
                  >
                    {buildings.map((building) => (
                      <option key={building} value={building}>{building}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {scope === "unit" ? (
                <div className={styles.unitList} role="group" aria-label="공지 대상 호실">
                  {managedRooms.map((room) => (
                    <label key={room.id} className={styles.unitChoice}>
                      <input
                        type="checkbox"
                        checked={selectedRoomIds.includes(room.id)}
                        onChange={() => toggleRoom(room.id)}
                      />
                      {roomDisplayLabel(room)}
                    </label>
                  ))}
                </div>
              ) : null}

              <div className={styles.targetBox}>
                <span>{target.targetLabel}</span>
              </div>
              <div className={styles.targetHint}>
                공지 대상을 선택하세요.<br />
                미납 세대 옵션은 없습니다. 연체·독촉은 별도 채널에서 처리합니다.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionDot} /> 내 용
          </h2>
          <div className={styles.sectionStack}>
            <label className={styles.fieldLabel}>
              공지 제목
              <input
                className={styles.input}
                name="title"
                value={title}
                onChange={(event) => updateSource("title", event.target.value)}
                required
              />
            </label>
            <label className={styles.fieldLabel}>
              상세 내용
              <textarea
                className={styles.textarea}
                name="body"
                value={body}
                onChange={(event) => updateSource("body", event.target.value)}
                required
              />
            </label>

            {errors.length > 0 ? (
              <ul className={styles.errorList} role="alert">
                {errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            ) : null}
            {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}

            <div className={styles.actionRow}>
              <Button
                className={styles.reviewButton}
                type="button"
                disabled={saving}
                onClick={() => handleSave("review")}
              >
                {saving ? "저장 중..." : "▷ 검토하고 발송으로"}
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => handleSave("save")}>
                임시 저장
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className={styles.rightColumn}>
        <section className={styles.primaryInfo}>
          <h2>발송은 다음 화면에서만</h2>
          <p>이 화면은 작성과 저장까지만 담당합니다. 자동 발송 없이 검토 게이트를 거칩니다.</p>
        </section>

        <section className={styles.card}>
          <div className={styles.translationHeader}>
            <h2>{category === "urgent" ? "긴급 다국어 검수" : "다국어 번역"}</h2>
            <span aria-hidden="true">文A</span>
          </div>
          <div className={styles.translationList}>
            {ANNOUNCEMENT_TRANSLATION_LANGUAGES.map(({ lang, label }) => {
              const translation = translationFor(lang, label);
              const panelId = `translation-panel-${lang}`;
              const isExpanded = shouldExpandAnnouncementTranslation(
                translation,
                expandedLanguages.includes(lang),
                translating === lang,
              );
              return (
                <article
                  key={lang}
                  className={`${styles.translationCard} ${translation.reviewed ? styles.translationCardReviewed : ""}`}
                >
                  <div className={styles.translationTop}>
                    <span className={styles.languageLabel}>{label} 검수</span>
                    <button
                      className={styles.translateButton}
                      type="button"
                      disabled={translating !== null}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() => handleTranslate(lang, label)}
                    >
                      {translating === lang ? "번역 중..." : `${label} 번역`}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div id={panelId} className={styles.translationFields}>
                      <input
                        className={styles.translationInput}
                        aria-label={`${label} 공지 제목`}
                        value={translation.title}
                        onChange={(event) => updateTranslation(lang, label, {
                          title: event.target.value,
                          reviewed: false,
                        })}
                        placeholder={`${label} 제목`}
                      />
                      <textarea
                        className={styles.translationTextarea}
                        aria-label={`${label} 공지 본문`}
                        value={translation.body}
                        onChange={(event) => updateTranslation(lang, label, {
                          body: event.target.value,
                          reviewed: false,
                        })}
                        placeholder={`${label} 본문`}
                      />
                      <label className={styles.reviewRow}>
                        <input
                          type="checkbox"
                          checked={translation.reviewed}
                          disabled={!translation.title.trim() || !translation.body.trim()}
                          onChange={(event) => updateTranslation(lang, label, {
                            reviewed: event.target.checked,
                          })}
                        />
                        검수 완료
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
