"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, ChevronRight, CircleAlert, Search } from "lucide-react";
import type { ManagerOverdueWorkspace, OverdueCase } from "@roomlog/types";
import {
  filterOverdueCases,
  managerAgentOverdueHref,
  type OverdueAgeBucket,
} from "@/lib/billing-manager-workspace";
import styles from "./billing-workspace.module.css";

type Queue = "active" | "waiting";

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function guardLabel(item: OverdueCase) {
  if (!item.guard.blocked) return "AI 독촉 준비 가능";
  if (item.guard.hasConfirming && item.guard.hasOrphan) return "납부 신고·미연결 입금 확인 중";
  if (item.guard.hasConfirming) return "납부 신고 확인 중";
  if (item.guard.hasOrphan) return "미연결 입금 확인 중";
  return "확인 대기";
}

export function OverdueWorkspace({ data }: { data: ManagerOverdueWorkspace }) {
  const [queue, setQueue] = useState<Queue>("active");
  const [bucket, setBucket] = useState<OverdueAgeBucket>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(data.activeCases[0]?.billId);
  const source = queue === "active" ? data.activeCases : data.waitingCases;
  const visible = useMemo(
    () => filterOverdueCases(source, bucket, query),
    [bucket, query, source],
  );
  const selected = visible.find((item) => item.billId === selectedId) ?? visible[0];

  function selectQueue(next: Queue) {
    setQueue(next);
    setSelectedId((next === "active" ? data.activeCases : data.waitingCases)[0]?.billId);
  }

  return (
    <>
      <div className={styles.summaryStrip} aria-label="연체 핵심 지표">
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>독촉 대상 미수금</div>
          <div className={styles.metricValue} data-tone="danger">{won(data.summary.activeUnpaidAmount)}</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>독촉 대상 세대</div>
          <div className={styles.metricValue}>{data.summary.activeCount}세대</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>31일 이상</div>
          <div className={styles.metricValue} data-tone={data.summary.severeCount ? "danger" : undefined}>{data.summary.severeCount}세대</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>입금 확인 대기</div>
          <div className={styles.metricValue}>{data.summary.waitingCount}세대</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.metricLabel}>처리 방식</div>
          <div className={styles.metricValue}>AI 채팅</div>
          <div className={styles.muted}>자동 발송 없음</div>
        </div>
      </div>

      <div className={styles.filterStrip}>
        <div className={styles.toolbar} aria-label="연체 경과 구간">
          {[
            ["all", "전체"],
            ["1_7", "1~7일"],
            ["8_30", "8~30일"],
            ["31_plus", "31일 이상"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={styles.filterButton}
              aria-pressed={bucket === key}
              onClick={() => setBucket(key as OverdueAgeBucket)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={styles.searchWrap}>
          <span className={styles.visuallyHidden}>연체 대상 검색</span>
          <Search className={styles.searchIcon} aria-hidden="true" size={15} />
          <input
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="건물, 호실, 임차인 검색"
          />
        </label>
      </div>

      <section className={styles.caseWorkspace}>
        <div className={styles.caseList}>
          <div className={styles.caseListHeader}>
            <div className={styles.toolbar} aria-label="연체 처리 목록">
              <button type="button" className={styles.filterButton} aria-pressed={queue === "active"} onClick={() => selectQueue("active")}>
                독촉 대상 <span className={styles.filterCount}>{data.activeCases.length}</span>
              </button>
              <button type="button" className={styles.filterButton} aria-pressed={queue === "waiting"} onClick={() => selectQueue("waiting")}>
                입금 확인 대기 <span className={styles.filterCount}>{data.waitingCases.length}</span>
              </button>
            </div>
          </div>
          {visible.length ? (
            visible.map((item) => (
              <button
                key={item.billId}
                type="button"
                className={styles.caseButton}
                aria-pressed={selected?.billId === item.billId}
                onClick={() => setSelectedId(item.billId)}
              >
                <div className={styles.caseTop}>
                  <span className={styles.caseIdentity}>{item.buildingName ?? "건물 확인 필요"} · {item.unitId}호</span>
                  <ChevronRight aria-hidden="true" size={15} />
                </div>
                <div className={styles.caseTop}>
                  <span className={styles.muted}>{item.tenantName}</span>
                  <span className={styles.caseAmount}>{won(item.unpaidAmount)}</span>
                </div>
                <div className={styles.caseMeta}>
                  <span>{item.daysOverdue}일 경과</span>
                  <span className={styles.smallPill}>{queue === "waiting" ? "입금 확인" : item.daysOverdue >= 31 ? "장기 연체" : "검토 대상"}</span>
                </div>
              </button>
            ))
          ) : (
            <div className={styles.emptyState}>이 조건에 맞는 대상이 없습니다.</div>
          )}
        </div>

        <div className={styles.caseDetail}>
          {selected ? (
            <>
              <div className={styles.detailTop}>
                <div>
                  <p className={styles.sectionEyebrow}>{queue === "active" ? "연체 상세" : "입금 확인 상세"}</p>
                  <h2 className={styles.detailTitle}>{selected.buildingName ?? "건물 확인 필요"} {selected.unitId}호 · {selected.tenantName}</h2>
                </div>
                <span className={styles.detailBadge}>{selected.daysOverdue}일 경과</span>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.detailField}><div className={styles.detailLabel}>청구월</div><div className={styles.detailValue}>{selected.billingMonth ?? "—"}</div></div>
                <div className={styles.detailField}><div className={styles.detailLabel}>원 납부기한</div><div className={styles.detailValue}>{selected.dueDate.slice(0, 10)}</div></div>
                <div className={styles.detailField}><div className={styles.detailLabel}>총 청구액</div><div className={styles.detailValue}>{selected.totalAmount === undefined ? "—" : won(selected.totalAmount)}</div></div>
                <div className={styles.detailField}><div className={styles.detailLabel}>확정 수납</div><div className={styles.detailValue}>{selected.paidAmount === undefined ? "—" : won(selected.paidAmount)}</div></div>
                <div className={styles.detailField}><div className={styles.detailLabel}>미수금</div><div className={`${styles.detailValue} ${styles.unpaid}`}>{won(selected.unpaidAmount)}</div></div>
                <div className={styles.detailField}><div className={styles.detailLabel}>처리 상태</div><div className={styles.detailValue}>{guardLabel(selected)}</div></div>
              </div>

              {queue === "waiting" ? (
                <div className={styles.guardNotice}>
                  <CircleAlert aria-hidden="true" size={18} />
                  <div>납부 신고 또는 미연결 입금이 있어 연체 처리에서 분리했습니다. 입출금 내역에서 먼저 사실관계를 확인하세요.</div>
                </div>
              ) : (
                <div className={styles.infoNotice}>
                  <Bot aria-hidden="true" size={18} />
                  <div>AI 비서가 이 청구의 맥락을 받아 안내 문구와 다음 조치를 제안합니다. 메시지는 관리자가 확인하기 전 발송되지 않습니다.</div>
                </div>
              )}

              <div className={styles.detailActions}>
                <Link className={styles.secondaryLink} href={`/manager/billing/${encodeURIComponent(selected.billId)}`}>청구 상세</Link>
                {queue === "waiting" ? (
                  <Link className={styles.primaryLink} href="/manager/billing/matching">입출금 내역에서 확인</Link>
                ) : (
                  <Link className={styles.aiLink} href={managerAgentOverdueHref(selected)}>
                    <Bot aria-hidden="true" size={16} />
                    AI 채팅에서 처리
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>왼쪽 목록에서 확인할 청구를 선택하세요.</div>
          )}
        </div>
      </section>
    </>
  );
}
