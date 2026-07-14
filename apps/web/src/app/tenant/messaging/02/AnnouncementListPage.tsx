import Link from "next/link";
import type { Announcement, AnnouncementCategory } from "@roomlog/types";
import {
  ArrowLeft,
  BellRing,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Home,
  LifeBuoy,
  Megaphone,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  ANNOUNCEMENT_FILTERS,
  selectAnnouncements,
  tenantAnnouncementDetailHref,
  tenantAnnouncementListHref,
  type AnnouncementFilter,
} from "./announcement-list-model";
import styles from "./AnnouncementListPage.module.css";

const FILTER_LABELS: Record<AnnouncementFilter, string> = {
  all: "전체",
  urgent: "긴급",
  building: "건물",
  life: "생활",
  event: "행사",
};

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  urgent: "긴급",
  life: "생활",
  event: "행사",
};

const CATEGORY_ICONS: Record<AnnouncementCategory, LucideIcon> = {
  urgent: CircleAlert,
  life: Home,
  event: CalendarDays,
};

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
});

function formatDate(iso: string): string {
  return MONTH_DAY_FORMATTER.format(new Date(iso));
}

function SearchForm({ filter, query }: { filter: AnnouncementFilter; query: string }) {
  return (
    <form action="/tenant/messaging/02" method="get" className={styles.searchForm}>
      {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
      <label className={styles.searchField}>
        <Search aria-hidden="true" size={18} strokeWidth={2} />
        <span className={styles.visuallyHidden}>공지 검색어</span>
        <input name="q" type="search" defaultValue={query} placeholder="공지사항 검색" />
      </label>
      <button type="submit" className={styles.searchButton}>
        검색
      </button>
    </form>
  );
}

export function AnnouncementListPage({
  announcements,
  filter,
  query,
}: {
  announcements: Announcement[];
  filter: AnnouncementFilter;
  query: string;
}) {
  const visible = selectAnnouncements(announcements, { filter, query });

  return (
    <div className={styles.viewport}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <Link href="/tenant/home/00" className={styles.backLink} aria-label="세입자 홈으로 돌아가기">
              <ArrowLeft aria-hidden="true" size={22} />
            </Link>
            <div className={styles.titleBlock}>
              <h1>공지사항</h1>
              <p>우리 건물의 새로운 소식을 확인하세요.</p>
            </div>
            <details className={styles.mobileSearch} open={Boolean(query)}>
              <summary aria-label="공지 검색">
                <Search aria-hidden="true" size={21} />
              </summary>
              <SearchForm filter={filter} query={query} />
            </details>
          </div>
          <div className={styles.desktopSearch}>
            <SearchForm filter={filter} query={query} />
          </div>
        </header>

        <div className={styles.content}>
          <nav className={styles.filters} aria-label="공지 필터">
            {ANNOUNCEMENT_FILTERS.map((item) => (
              <Link
                key={item}
                href={tenantAnnouncementListHref(item, query)}
                className={`${styles.filterChip} ${filter === item ? styles.filterChipActive : ""}`}
                aria-current={filter === item ? "page" : undefined}
              >
                {FILTER_LABELS[item]}
              </Link>
            ))}
          </nav>

          <section aria-label="공지사항 목록">
            {visible.length === 0 ? (
              <div className={styles.emptyState}>
                <Megaphone aria-hidden="true" size={32} />
                <h2>조건에 맞는 공지가 없어요</h2>
                <p>검색어나 필터를 바꾸면 다른 공지를 확인할 수 있어요.</p>
                <Link href="/tenant/messaging/02">전체 공지 보기</Link>
              </div>
            ) : (
              <div className={styles.grid}>
                {visible.map((announcement) => {
                  const CategoryIcon = CATEGORY_ICONS[announcement.category];
                  const isUrgent = announcement.category === "urgent" || announcement.confirmRequired;
                  const needsConfirmation = announcement.confirmRequired && announcement.state !== "confirmed";
                  const isOrdinaryUnread = announcement.state === "unread" && !announcement.confirmRequired;

                  return (
                    <article
                      key={announcement.id}
                      className={`${styles.card} ${isUrgent ? styles.cardUrgent : ""}`}
                    >
                      {isUrgent && <BellRing className={styles.watermark} aria-hidden="true" />}
                      <Link
                        href={tenantAnnouncementDetailHref(announcement.id)}
                        className={styles.cardLink}
                        aria-label={`${announcement.title} 공지 자세히 보기`}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.category}>
                            <span className={styles.categoryIcon}>
                              <CategoryIcon aria-hidden="true" size={18} />
                            </span>
                            {CATEGORY_LABELS[announcement.category]}
                          </span>
                          {needsConfirmation && <span className={styles.unread}>미확인</span>}
                          {isOrdinaryUnread && <span className={styles.unread}>새 공지</span>}
                        </div>
                        <h2>{announcement.title}</h2>
                        <p className={styles.cardBody}>{announcement.body}</p>
                        <footer className={styles.cardMeta}>
                          <span>
                            <Building2 aria-hidden="true" size={15} />
                            {announcement.sender}
                          </span>
                          <time dateTime={announcement.sentAt}>{formatDate(announcement.sentAt)}</time>
                        </footer>
                        <ChevronRight className={styles.cardArrow} aria-hidden="true" size={19} />
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className={styles.help} aria-labelledby="announcement-help-title">
            <LifeBuoy aria-hidden="true" size={26} />
            <div>
              <h2 id="announcement-help-title">도움이 필요하신가요?</h2>
              <p>공지 내용이 궁금하다면 관리인에게 문의해 주세요.</p>
            </div>
            <Link href="/tenant/messaging/00" className={styles.helpLink}>
              문의하기
              <ChevronRight aria-hidden="true" size={18} />
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
