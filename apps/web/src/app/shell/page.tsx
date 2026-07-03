import Link from "next/link";
import { TDEF_SCREENS } from "@/lib/screens";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";
import { ROUTES as MOVEIN_ROUTES } from "@/lib/movein-nav";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";
import { HOME_ROUTES } from "@/lib/home-nav";
import { MANAGER_TICKET_ROUTES, MANAGER_TICKET_START } from "@/lib/ticket-manager-nav";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { MHOME_ROUTES, MVOX_ROUTES } from "@/lib/manager-home-nav";
import { ROUTES as VENDOR_ROUTES } from "@/lib/vendor-nav";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";

type Item = { code: string; href: string; label?: string };
type Domain = { key: string; title: string; desc: string; start: string; items: Item[] };

const entriesOf = (m: Record<string, string>): Item[] =>
  Object.entries(m).map(([code, href]) => ({ code, href }));
const firstRoute = (m: Record<string, string>): string => Object.values(m)[0];

const DOMAINS: Domain[] = [
  {
    key: "home",
    title: "통합 홈·온보딩 (T-HOME)",
    desc: "임차인 셸/척추 — 시작·인증·초대·호실연결·통합홈·알림·설정·데이터요청. 6도메인 착지점. 9화면.",
    start: HOME_ROUTES["T-HOME-00"],
    items: entriesOf(HOME_ROUTES),
  },
  {
    key: "defect",
    title: "하자 (T-DEF)",
    desc: "임차인 하자 신고 → AI 분석 → 업체·수리·결제 / 관리자 경로. 13화면.",
    start: "/tenant/defect/00",
    items: TDEF_SCREENS.map((s) => ({
      code: s.code,
      href: `/tenant/defect/${s.id}`,
      label: s.label,
    })),
  },
  {
    key: "contract",
    title: "계약 (T-DOC)",
    desc: "임차인 계약서 확인·등록·개인정보/보관. 6화면.",
    start: CONTRACT_ROUTES["T-DOC-00"],
    items: Object.entries(CONTRACT_ROUTES).map(([code, href]) => ({ code, href })),
  },
  {
    key: "payment",
    title: "납부 (T-PAY)",
    desc: "임차인 청구 확인·납부 신고·기록. 엔티티=Bill(/api/bills). 6화면.",
    start: PAYMENT_ROUTES["T-PAY-00"],
    items: Object.entries(PAYMENT_ROUTES).map(([code, href]) => ({ code, href })),
  },
  {
    key: "messaging",
    title: "메시징 (T-MSG)",
    desc: "대화·공지 받은함 / 채팅 스레드 / 공지 상세. 공지≠채팅 분리·긴급 확인게이트. 4화면.",
    start: firstRoute(MESSAGING_ROUTES),
    items: entriesOf(MESSAGING_ROUTES),
  },
  {
    key: "movein",
    title: "입주기록 (T-IN)",
    desc: "입주 사진·체크리스트 기록. 하자·퇴실의 1급 근거(공백≠책임추정). 6화면.",
    start: firstRoute(MOVEIN_ROUTES),
    items: entriesOf(MOVEIN_ROUTES),
  },
  {
    key: "moveout",
    title: "퇴실 (T-OUT)",
    desc: "퇴실 체크리스트·정산 추정·이의. 입주기록 대조. 5화면.",
    start: firstRoute(MOVEOUT_ROUTES),
    items: entriesOf(MOVEOUT_ROUTES),
  },
  {
    key: "manager-ticket",
    title: "관리인 티켓 (M-DASH · M-CALL)",
    desc: "관리인 하자/민원 처리. 데스크탑 대시보드(M-DASH)+모바일 Voice(M-CALL) 적응형 2세트. 티켓≠수리 분리·승인 게이트. 13화면.",
    start: MANAGER_TICKET_START,
    items: entriesOf(MANAGER_TICKET_ROUTES),
  },
  {
    key: "manager-billing",
    title: "관리인 청구 (M-BILL)",
    desc: "관리인 청구·수금·연체 관리. 독촉 M-BILL-05 단일 채널·존엄. 데스크탑.",
    start: "/manager/billing",
    items: [
      { code: "M-BILL", href: "/manager/billing" },
      { code: "수금", href: "/manager/billing/collection" },
      { code: "연체", href: "/manager/billing/overdue" },
      { code: "매칭", href: "/manager/billing/matching" },
    ],
  },
  {
    key: "manager-messaging",
    title: "관리인 소통 (M-MSG)",
    desc: "커뮤니케이션 허브·공지작성·발송검토(게이트)·발송결과·채팅. D20 미납 broadcast 제거·D21 긴급 다국어검수. 데스크탑.",
    start: firstRoute(MANAGER_MESSAGING_ROUTES),
    items: entriesOf(MANAGER_MESSAGING_ROUTES),
  },
  {
    key: "manager-home",
    title: "관리인 홈·셸 (M-HOME)",
    desc: "자산현황 대시보드·미처리 허브·건물관리·설정. 큰 화면 데스크탑. D17 정밀검토·primary 1개. 8화면.",
    start: firstRoute(MHOME_ROUTES),
    items: entriesOf(MHOME_ROUTES),
  },
  {
    key: "manager-vox",
    title: "관리인 Voice 홈 (M-VOX)",
    desc: "모바일 Voice 비서 홈 — 음성 요약·오늘 업무·자산 요약. 폰(관리인 주력). 4화면.",
    start: firstRoute(MVOX_ROUTES),
    items: entriesOf(MVOX_ROUTES),
  },
  {
    key: "vendor",
    title: "수리업체 (V-JOB)",
    desc: "업체가 받는 수리 잡 — 배정·견적·수리단계·완료. 티켓(RepairJob) 도메인의 업체 면.",
    start: firstRoute(VENDOR_ROUTES),
    items: entriesOf(VENDOR_ROUTES),
  },
  {
    key: "manager-cost",
    title: "관리인 비용 (M-COST)",
    desc: "비용·영수증 관리(OCR 경량). 비용=부산물(D22). 데스크탑.",
    start: firstRoute(MANAGER_COST_ROUTES),
    items: entriesOf(MANAGER_COST_ROUTES),
  },
  {
    key: "manager-contract",
    title: "관리인 계약 (M-DOC)",
    desc: "계약 검토·OCR 정밀검토·생애주기·임차인 초대·보관/삭제. 데스크탑. D17·개인정보.",
    start: firstRoute(MANAGER_CONTRACT_ROUTES),
    items: entriesOf(MANAGER_CONTRACT_ROUTES),
  },
  {
    key: "manager-moveout",
    title: "관리인 퇴실 (M-OUT)",
    desc: "퇴실 정산 상태별(리포트·예상안·이의·검토완료)·조정. 데스크탑. 존엄·훼손 신중.",
    start: firstRoute(MANAGER_MOVEOUT_ROUTES),
    items: entriesOf(MANAGER_MOVEOUT_ROUTES),
  },
  {
    key: "manager-report",
    title: "관리인 리포트 (M-RPT)",
    desc: "운영 리포트·AI 서술형 임대인 보고·질의 챗봇. 데스크탑. 챗봇≠발송(D24)·검증가능성(D25).",
    start: firstRoute(MANAGER_REPORT_ROUTES),
    items: entriesOf(MANAGER_REPORT_ROUTES),
  },
  {
    key: "manager-vendor-mgmt",
    title: "관리인 업체관리 (M-VEND)",
    desc: "업체 주소록·성과 지표·배정 관리. 데스크탑. 공개 비대칭 금지(D23).",
    start: firstRoute(MANAGER_VENDOR_MGMT_ROUTES),
    items: entriesOf(MANAGER_VENDOR_MGMT_ROUTES),
  },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--surface)",
        color: "var(--on-surface)",
        display: "flex",
        justifyContent: "center",
        padding: "48px 20px",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div
          style={{
            fontSize: "var(--fs-caption)",
            fontFamily: "ui-monospace, monospace",
            color: "var(--outline)",
            letterSpacing: ".04em",
          }}
        >
          룸로그 · 클릭투어 (임차인 · 관리인 표면)
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 4px" }}>
          도메인 슬라이스 인덱스
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--on-surface-variant)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Next.js(web) + NestJS(api) 모노레포. 화면은 @roomlog/ui 토큰 컴포넌트,
          데이터는 /api에서 fetch(미기동 시 데모 폴백). 기능·결제·분석·인증은 스텁.
        </p>

        {DOMAINS.map((d) => (
          <section key={d.key} style={{ marginTop: 32 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{d.title}</h2>
              <Link
                href={d.start}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--on-primary)",
                  background: "var(--primary)",
                  borderRadius: "var(--radius-btn)",
                  padding: "8px 14px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                흐름 시작 →
              </Link>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--on-surface-variant)",
                margin: "4px 0 12px",
              }}
            >
              {d.desc}
            </p>
            <ol
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 8,
              }}
            >
              {d.items.map((it) => (
                <li key={it.code}>
                  <Link
                    href={it.href}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      padding: "10px 12px",
                      border: "1px solid var(--outline-variant)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--surface-container-lowest)",
                      textDecoration: "none",
                      color: "var(--on-surface)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "ui-monospace, monospace",
                        color: "var(--outline)",
                        minWidth: 66,
                      }}
                    >
                      {it.code}
                    </span>
                    {it.label ? (
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
