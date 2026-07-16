"use client";

import Link from "next/link";
import { Button } from "@roomlog/ui";
import styles from "../../furniture.module.css";

export function PlannerHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.backLink} href="/tenant/furniture" aria-label="내 가구함으로 돌아가기">←</Link>
      <div className={styles.headingBlock}>
        <p className={styles.eyebrow}>2D 탑다운</p>
        <h1 className={styles.title}>내 가구 배치</h1>
      </div>
    </header>
  );
}

export function PlannerLoading() {
  return (
    <div className={styles.screen} aria-busy="true">
      <PlannerHeader />
      <main className={styles.plannerContent} aria-label="배치 화면 불러오는 중">
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </main>
    </div>
  );
}

export function PlannerError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className={styles.screen}>
      <PlannerHeader />
      <main className={styles.plannerContent}>
        <div className={styles.errorState} role="alert">
          <h2>배치 화면을 열지 못했어요</h2>
          <p>{error}</p>
          <Button type="button" onClick={onRetry}>다시 불러오기</Button>
        </div>
      </main>
    </div>
  );
}

export function MissingFloorPlan() {
  return (
    <div className={styles.screen}>
      <PlannerHeader />
      <main className={styles.plannerContent}>
        <div className={styles.emptyState} role="status">
          <span className={styles.categoryIcon} aria-hidden="true">⌑</span>
          <h2>이 매물은 도면이 없어<br />배치를 지원하지 않아요</h2>
          <p>집주인이 실측 도면을 연결하면 내 가구를 미터 단위로 놓아볼 수 있어요.</p>
          <Link className={styles.compactButton} href="/">다른 매물 보기</Link>
        </div>
      </main>
    </div>
  );
}
