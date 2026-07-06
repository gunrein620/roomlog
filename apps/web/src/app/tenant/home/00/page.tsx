import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, Card } from "@roomlog/ui";
import { CROSS_ROUTES, HOME_ROUTES } from "@/lib/home-nav";
import { getHomeSummary } from "@/lib/home-api";
import { requireUser } from "@/lib/session";

// 통합 홈은 인증 쿠키로 실 티켓을 읽는다 → 요청마다 렌더(정적 프리렌더 제외).
export const dynamic = "force-dynamic";

const iconLinkStyle: CSSProperties = {
  position: "relative",
  width: 38,
  height: 38,
  border: "1.5px solid var(--outline-variant)",
  borderRadius: 10,
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

const labelStyle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const primaryLinkStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  padding: "0 var(--space-md)",
  boxSizing: "border-box",
};

const secondaryLinkStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  border: "1.5px solid var(--primary)",
  color: "var(--primary)",
  background: "transparent",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  padding: "0 var(--space-md)",
  boxSizing: "border-box",
};

export default async function Page() {
  // [레퍼런스 가드] 통합홈은 임차인 전용(온보딩/인증 화면은 홈의 다른 세그먼트).
  const user = await requireUser("TENANT");
  const summary = await getHomeSummary(user);
  const hasRoom = summary.unitId !== "—";
  const unreadCount = summary.unreadThreads + summary.unreadAnnouncements;

  if (!hasRoom) {
    return (
      <>
        <HomeHeader unitLabel="룸로그" unreadCount={unreadCount} />
        <main style={contentStyle}>
          <Card
            style={{
              flex: 1,
              borderStyle: "dashed",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "var(--space-md)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>내 호실을 연결해 주세요</div>
            <div style={{ fontSize: "var(--fs-body)", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
              초대받은 호실을 연결하면 계약, 하자, 납부 알림을 한 곳에서 볼 수 있어요.
            </div>
            <Link href={HOME_ROUTES["T-HOME-07"]} style={primaryLinkStyle}>
              호실 연결하기
            </Link>
          </Card>
        </main>
        <BottomTabs />
      </>
    );
  }

  return (
    <>
      <HomeHeader unitLabel={`${summary.unitId}호`} unreadCount={unreadCount} />
      <main style={contentStyle}>
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>내 집 현황</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.unitId}호</div>
                <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                  계약 상태 · 연결됨
                </div>
              </div>
              <Badge emphasis>임차인</Badge>
            </div>
            <div
              style={{
                borderTop: "1px dashed var(--border)",
                paddingTop: "var(--space-sm)",
                fontSize: "var(--fs-caption)",
                color: "var(--on-surface-variant)",
                lineHeight: 1.6,
              }}
            >
              계약서는 임대인이 등록하면 표시돼요. 등록 전에는 대기 상태로만 안내합니다.
            </div>
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>오늘 할 일</div>
          {summary.todo ? (
            <Link href={summary.todo.href} style={{ color: "inherit", textDecoration: "none" }}>
              <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <Badge emphasis style={{ alignSelf: "flex-start" }}>
                  {summary.todo.frame}
                </Badge>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{summary.todo.label}</div>
                <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                  필요한 화면에서 이어서 확인할 수 있어요.
                </div>
              </Card>
            </Link>
          ) : (
            <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>오늘 꼭 처리할 일은 없어요</div>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                내 집 현황과 최근 알림만 확인하면 됩니다.
              </div>
            </Card>
          )}
        </section>

        {summary.activeTickets.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={labelStyle}>라이브 상태</div>
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {summary.activeTickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={CROSS_ROUTES.defectStatus}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                    <div>
                      <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>{ticket.title}</div>
                      <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                        내 신고 진행 · 안전하게 상태만 표시
                      </div>
                    </div>
                    <Badge>진행 중</Badge>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomTabs />
    </>
  );
}

function HomeHeader({ unitLabel, unreadCount }: { unitLabel: string; unreadCount: number }) {
  return (
    <header
      style={{
        flex: "none",
        padding: "14px var(--page-margin)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-sm)",
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{unitLabel}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--on-surface-variant)" }}>
          한국어 · English
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Link href={CROSS_ROUTES.messaging} aria-label="대화" style={iconLinkStyle}>
          💬
        </Link>
        <Link href={HOME_ROUTES["T-HOME-04"]} aria-label="알림" style={iconLinkStyle}>
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                minWidth: 18,
                height: 18,
                border: "1.5px solid var(--primary)",
                borderRadius: "var(--radius-full)",
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                fontSize: 10,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {unreadCount}
            </span>
          )}
        </Link>
        <Link href={HOME_ROUTES["T-HOME-05"]} aria-label="설정" style={iconLinkStyle}>
          ⚙
        </Link>
      </div>
    </header>
  );
}

function BottomTabs() {
  return (
    <nav
      style={{
        flex: "none",
        padding: "10px var(--page-margin)",
        borderTop: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}
    >
      <span style={{ ...primaryLinkStyle, minHeight: 42, padding: 0 }}>홈</span>
      <Link href={CROSS_ROUTES.defectHome} style={{ ...secondaryLinkStyle, minHeight: 42, padding: 0 }}>
        하자
      </Link>
      <Link href={CROSS_ROUTES.payment} style={{ ...secondaryLinkStyle, minHeight: 42, padding: 0 }}>
        납부
      </Link>
      <Link href={CROSS_ROUTES.contract} style={{ ...secondaryLinkStyle, minHeight: 42, padding: 0 }}>
        계약
      </Link>
    </nav>
  );
}

const contentStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "var(--page-margin)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-lg)",
};
