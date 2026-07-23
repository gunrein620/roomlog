"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  FileClock,
  MessageSquareText,
  ReceiptText,
  Wrench
} from "lucide-react";
import { useState } from "react";
import type { DashboardSourceKey, TodayTask, TodayTaskKind } from "./dashboard-calculations";

const kindLabels: Record<TodayTaskKind, string> = {
  overdue: "연체",
  urgent_ticket: "민원·하자",
  expiring: "계약",
  unanswered: "답장"
};

type TaskFilter = "all" | TodayTaskKind;

export function TodayTasksCard({
  tasks,
  sourceFailures
}: {
  tasks: TodayTask[];
  sourceFailures: DashboardSourceKey[];
}) {
  const [activeFilter, setActiveFilter] = useState<TaskFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const taskCounts = countTasks(tasks);
  const filters = buildFilters(taskCounts);
  const filteredTasks = activeFilter === "all" ? tasks : tasks.filter((task) => task.kind === activeFilter);
  const visibleTasks = expanded ? filteredTasks : filteredTasks.slice(0, 5);
  const hiddenTaskCount = Math.max(0, filteredTasks.length - visibleTasks.length);

  function selectFilter(filter: TaskFilter) {
    setActiveFilter(filter);
    setExpanded(false);
  }

  return (
    <section aria-label="오늘의 업무" className="manager-task-panel">
      {tasks.length > 0 ? (
        <div className="manager-task-filters" role="toolbar" aria-label="오늘의 업무 분류">
          {filters.map((filter) => {
            const selected = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                className={selected ? `manager-task-filter manager-task-filter--selected manager-task-filter--${filter.id}` : `manager-task-filter manager-task-filter--${filter.id}`}
                aria-pressed={selected}
                onClick={() => selectFilter(filter.id)}
              >
                {filter.label}
                <span>{filter.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div role="status" className="manager-task-empty">
          <CheckCircle2 size={24} strokeWidth={2} aria-hidden="true" />
          <div>
            <strong>오늘 바로 처리할 업무가 없습니다</strong>
            <p>
              {sourceFailures.length > 0
                ? "일부 데이터를 불러오지 못해 연결된 메뉴에서 한 번 더 확인해주세요."
                : "새 연체, 긴급 하자, 만료 예정 계약, 답장 대기 메시지가 없습니다."}
            </p>
          </div>
        </div>
      ) : (
        <ol className="manager-task-list">
          {visibleTasks.map((task) => (
            <li key={task.id}>
              <Link href={task.href} className="manager-task-link">
                <span className={`manager-task-row-icon manager-task-row-icon--${task.kind}`} aria-hidden="true">
                  <TaskIcon kind={task.kind} />
                </span>
                <span className="manager-task-copy">
                  <span className="manager-task-title-line">
                    <span className={`manager-task-kind manager-task-kind--${task.kind}`}>{kindLabels[task.kind]}</span>
                    <strong>{task.title}</strong>
                  </span>
                  <span className="manager-task-detail">{task.detail}</span>
                </span>
                <ChevronRight className="manager-task-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      )}

      {filteredTasks.length > 5 ? (
        <button
          type="button"
          className="manager-task-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <>
              업무 접기
              <ChevronUp size={17} strokeWidth={2.25} aria-hidden="true" />
            </>
          ) : (
            <>
              나머지 {hiddenTaskCount}건 보기
              <ChevronDown size={17} strokeWidth={2.25} aria-hidden="true" />
            </>
          )}
        </button>
      ) : null}

      <style>{`
        .manager-task-panel {
          min-width: 0;
          overflow: hidden;
          display: grid;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-soft);
        }

        /* 헤더 없이 필터 행이 카드의 첫 줄 — 제목·건수는 필터 칩이 이미 말해준다 */
        .manager-task-filters {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          overflow-x: auto;
          padding: var(--space-md) var(--space-lg) var(--space-sm);
          scrollbar-width: thin;
        }

        .manager-task-filter {
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          flex: none;
          padding: 0 var(--space-sm);
          border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
          border-radius: var(--radius-full);
          background: var(--surface-container-lowest);
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
          white-space: nowrap;
        }

        .manager-task-filter > span {
          min-width: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: inherit;
        }

        .manager-task-filter--selected {
          border-color: var(--primary);
          background: var(--primary);
          color: var(--on-primary);
        }

        /* AlertStatTiles와 동일한 인디고 단일 축 4단계로 동기화(심각도 순).
           overdue는 흰 텍스트 대비 4.5:1 확보를 위해 85%로 올림(AlertStatTiles와 같은 근거). */
        .manager-task-filter--selected.manager-task-filter--overdue {
          border-color: color-mix(in srgb, var(--primary) 85%, #ffffff);
          background: color-mix(in srgb, var(--primary) 85%, #ffffff);
          color: #ffffff;
        }

        .manager-task-filter--selected.manager-task-filter--urgent_ticket {
          border-color: var(--primary);
          background: var(--primary);
          color: #ffffff;
        }

        .manager-task-filter--selected.manager-task-filter--expiring {
          border-color: color-mix(in srgb, var(--primary) 26%, #ffffff);
          background: color-mix(in srgb, var(--primary) 26%, #ffffff);
          color: var(--on-primary-container);
        }

        .manager-task-filter--selected.manager-task-filter--unanswered {
          border-color: color-mix(in srgb, var(--primary) 12%, #ffffff);
          background: color-mix(in srgb, var(--primary) 12%, #ffffff);
          color: var(--on-primary-container);
        }

        .manager-task-filter--overdue:not(.manager-task-filter--selected),
        .manager-task-filter--urgent_ticket:not(.manager-task-filter--selected) {
          color: var(--on-error-container);
        }

        .manager-task-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-task-list > li + li {
          border-top: 1px solid var(--border);
        }

        .manager-task-link {
          min-height: var(--list-item-min);
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) 20px;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-lg);
          color: var(--on-surface);
          text-decoration: none;
          transition: background-color 0.16s ease;
        }

        .manager-task-link:hover {
          background: color-mix(in srgb, var(--pastel-blue) 38%, var(--surface-container-lowest));
        }

        /* 아이콘 타일은 기본 중립 — 색은 연체·긴급처럼 지금 아파야 하는 곳에만 */
        .manager-task-row-icon {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border-radius: var(--radius);
          background: var(--surface-container);
          color: var(--on-surface-variant);
        }

        .manager-task-row-icon--overdue {
          background: color-mix(in srgb, var(--primary) 85%, #ffffff);
          color: #ffffff;
        }

        .manager-task-row-icon--urgent_ticket {
          background: var(--primary);
          color: #ffffff;
        }

        .manager-task-row-icon--expiring {
          background: color-mix(in srgb, var(--primary) 26%, #ffffff);
          color: var(--on-primary-container);
        }

        .manager-task-row-icon--unanswered {
          background: color-mix(in srgb, var(--primary) 12%, #ffffff);
          color: var(--on-primary-container);
        }

        .manager-task-copy {
          min-width: 0;
          display: grid;
          gap: var(--space-xs);
        }

        .manager-task-title-line {
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
        }

        .manager-task-title-line > strong,
        .manager-task-detail {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .manager-task-kind {
          flex: none;
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        .manager-task-kind--overdue,
        .manager-task-kind--urgent_ticket {
          color: var(--primary);
        }

        .manager-task-kind--expiring,
        .manager-task-kind--unanswered {
          color: var(--on-primary-container);
        }

        .manager-task-detail {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-task-chevron {
          color: var(--outline);
        }

        .manager-task-toggle {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-xs);
          margin: var(--space-sm) var(--space-lg) var(--space-md);
          padding: 0 var(--space-md);
          border: 1px solid color-mix(in srgb, var(--on-pastel-blue) 14%, var(--border));
          border-radius: var(--radius-btn);
          background: var(--pastel-blue);
          color: var(--on-pastel-blue);
          font-weight: 700;
        }

        .manager-task-empty {
          display: flex;
          align-items: flex-start;
          gap: var(--space-md);
          margin: var(--space-lg);
          padding: var(--space-lg);
          border-radius: var(--radius-sm);
          background: var(--surface-container-low);
          color: var(--on-surface);
        }

        .manager-task-empty > svg {
          flex: none;
          color: var(--primary);
        }

        .manager-task-empty p {
          margin: var(--space-xs) 0 0;
          color: var(--on-surface-variant);
          line-height: var(--lh-body);
        }

        @media (max-width: 560px) {
          .manager-task-filters,
          .manager-task-link {
            padding-left: var(--space-md);
            padding-right: var(--space-md);
          }

          .manager-task-link {
            grid-template-columns: 28px minmax(0, 1fr) 18px;
            gap: var(--space-xs);
          }

          .manager-task-row-icon {
            width: 28px;
            height: 28px;
          }

          .manager-task-title-line {
            gap: var(--space-xs);
          }

          .manager-task-toggle {
            margin-left: var(--space-md);
            margin-right: var(--space-md);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-task-link {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}

function countTasks(tasks: TodayTask[]) {
  return tasks.reduce<Record<TaskFilter, number>>(
    (counts, task) => {
      counts.all += 1;
      counts[task.kind] += 1;
      return counts;
    },
    { all: 0, overdue: 0, urgent_ticket: 0, expiring: 0, unanswered: 0 }
  );
}

function buildFilters(counts: Record<TaskFilter, number>): Array<{ id: TaskFilter; label: string; count: number }> {
  const filters: Array<{ id: TaskFilter; label: string; count: number }> = [
    { id: "all", label: "전체", count: counts.all },
    { id: "overdue", label: kindLabels.overdue, count: counts.overdue },
    { id: "urgent_ticket", label: kindLabels.urgent_ticket, count: counts.urgent_ticket },
    { id: "expiring", label: kindLabels.expiring, count: counts.expiring },
    { id: "unanswered", label: kindLabels.unanswered, count: counts.unanswered }
  ];

  return filters.filter((filter) => filter.id === "all" || filter.count > 0);
}

function TaskIcon({ kind }: { kind: TodayTaskKind }) {
  const props = { size: 16, strokeWidth: 2.2 } as const;
  if (kind === "overdue") return <ReceiptText {...props} />;
  if (kind === "urgent_ticket") return <Wrench {...props} />;
  if (kind === "expiring") return <FileClock {...props} />;
  if (kind === "unanswered") return <MessageSquareText {...props} />;
  return <ClipboardList {...props} />;
}
