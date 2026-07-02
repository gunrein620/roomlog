import Link from "next/link";
import type { ResponsibilityVerdict, Urgency } from "@roomlog/types";
import { Badge, Button } from "@roomlog/ui";
import { ROUTES } from "@/lib/nav";
import { getAnalysis, DEMO_TICKET_ID } from "@/lib/api";
import { MoreDetails } from "./MoreDetails";

// T-DEF-04 · 분석 결과
// 1차 핵심 3개(문제 후보 · 긴급도+추천조치 · 책임 가능성 한 줄)만 노출, 나머지는 더보기.
// 원칙: AI는 책임 확정 금지(가능성/판단어려움만) · 거짓 안전문구 금지 · 공백 ≠ 책임 추정(D27).

// 책임 가능성 한 줄 (확정 아님)
const RESP_LINE: Record<ResponsibilityVerdict, string> = {
  tenant_likely: "임차인 책임 가능성",
  landlord_likely: "임대인 책임 가능성",
  unclear: "판단 어려움",
};

// 긴급도 1~4순위별 추천 조치
const URGENCY_ACTION: Record<Urgency, string> = {
  1: "지금 바로 조치가 필요해요",
  2: "빠른 방문 일정을 권장해요",
  3: "일반 일정으로 처리해요",
  4: "일반 접수·문의로 진행해요",
};

const sectionLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 7,
} as const;

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const analysis = await getAnalysis(id);
  const problem = analysis.problemCandidates[0] ?? "하자 후보 미상";

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={ROUTES["T-DEF-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>분석 결과</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 위험 키워드 감지 시 상단 고정 배너 */}
        {analysis.safetyRisk && (
          <div
            style={{
              border: "1.5px solid var(--primary)",
              borderRadius: 10,
              padding: 11,
              background: "var(--surface-container-high)",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠</span>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              안전 위험 감지 — 긴급도가 자동 상향되었어요
            </div>
          </div>
        )}

        {/* 핵심 ① 문제 후보 */}
        <section>
          <div style={sectionLabel}>문제 후보</div>
          <div
            style={{
              border: "1px solid var(--outline-variant)",
              borderRadius: 10,
              padding: 13,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {problem}
          </div>
        </section>

        {/* 핵심 ② 긴급도 + 추천 조치 */}
        <section>
          <div style={sectionLabel}>긴급도 · 추천 조치</div>
          <div
            style={{
              border: "1px solid var(--outline-variant)",
              borderRadius: 10,
              padding: 13,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <Badge emphasis style={{ alignSelf: "flex-start" }}>
              긴급도 {analysis.urgency}순위
            </Badge>
            <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
              {URGENCY_ACTION[analysis.urgency]}
            </div>
          </div>
        </section>

        {/* 핵심 ③ 책임 가능성 한 줄 (확정 아님) */}
        <section>
          <div style={sectionLabel}>책임 가능성</div>
          <div
            style={{
              border: "1px dashed var(--outline)",
              borderRadius: 10,
              padding: 13,
              display: "flex",
              flexDirection: "column",
              gap: 5,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{RESP_LINE[analysis.responsibility]}</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
              AI 추정 · 확정 아님
            </div>
          </div>
        </section>

        {/* 더보기(접기): 근거·입주전비교·이의제기·신뢰도 */}
        <MoreDetails
          reasoning={analysis.reasoning}
          confidence={analysis.confidence}
          moveinComparisonAvailable={analysis.moveinComparisonAvailable}
        />
      </div>

      {/* 책임별 적응형 CTA */}
      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <ResponsibilityCta verdict={analysis.responsibility} />
      </footer>
    </>
  );
}

function ResponsibilityCta({ verdict }: { verdict: ResponsibilityVerdict }) {
  if (verdict === "tenant_likely") {
    return (
      <>
        <Link href={ROUTES["T-DEF-05"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>수리 진행하기</Button>
        </Link>
        <p
          style={{
            fontSize: 11,
            color: "var(--on-surface-variant)",
            lineHeight: 1.5,
            textAlign: "center",
            margin: 0,
          }}
        >
          이 수리는 <b>본인 부담으로 진행</b>됩니다. 책임 판단에 이의가 있으면 관리자 검토를 요청할
          수 있어요.
        </p>
        <Link href={ROUTES["T-DEF-09"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            이의 있음 · 관리자 검토 요청
          </Button>
        </Link>
      </>
    );
  }

  if (verdict === "landlord_likely") {
    return (
      <Link href={ROUTES["T-DEF-09"]} style={{ textDecoration: "none", display: "block" }}>
        <Button fullWidth>관리자에게 전달</Button>
      </Link>
    );
  }

  // unclear — 판단 어려움
  return (
    <>
      <Link href={ROUTES["T-DEF-09"]} style={{ textDecoration: "none", display: "block" }}>
        <Button fullWidth>관리자 검토 요청</Button>
      </Link>
      <Link href={ROUTES["T-DEF-02"]} style={{ textDecoration: "none", display: "block" }}>
        <Button fullWidth variant="secondary">
          재촬영 후 재분석
        </Button>
      </Link>
    </>
  );
}
