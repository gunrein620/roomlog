const roleApps = [
  {
    label: "세입자",
    eyebrow: "TENANT",
    href: process.env.NEXT_PUBLIC_TENANT_URL ?? "http://localhost:3001",
    title: "AI 상담 접수",
    description: "챗봇/음성 상담 스레드에서 하자 내용을 정리하고 사진과 접수 초안을 확인합니다.",
    port: "3001",
    account: "tenant@roomlog.test",
    action: "세입자 앱 열기",
    accent: "blue"
  },
  {
    label: "관리자",
    eyebrow: "MANAGER",
    href: process.env.NEXT_PUBLIC_MANAGER_URL ?? "http://localhost:3002",
    title: "관리자 운영",
    description: "AI 상담 인계 기록, 티켓 큐, 업체 배정, 완료 승인까지 이어서 검토합니다.",
    port: "3002",
    account: "manager@roomlog.test",
    action: "관리자 앱 열기",
    accent: "green"
  },
  {
    label: "업체",
    eyebrow: "VENDOR",
    href: process.env.NEXT_PUBLIC_VENDOR_URL ?? "http://localhost:3003",
    title: "업체 작업",
    description: "배정된 수리 건의 견적, 방문 일정, 작업 로그와 완료 사진을 처리합니다.",
    port: "3003",
    account: "vendor@roomlog.test",
    action: "업체 앱 열기",
    accent: "amber"
  }
];

const healthUrl = process.env.NEXT_PUBLIC_API_HEALTH_URL ?? "http://localhost:4000/api/health";

export default function Home() {
  return (
    <main className="page">
      <section className="console-heading">
        <div>
          <p className="eyebrow">ROOMLOG LOCAL</p>
          <h1>로컬 테스트 콘솔</h1>
          <p className="description">
            Roomlog MVP는 역할별 앱이 분리되어 있습니다. 이 화면은 3000번 포트에서
            실제 테스트 앱과 API 상태로 바로 이동하는 로컬 진입점입니다.
          </p>
        </div>
        <a className="health-link" href={healthUrl}>
          API Health
          <strong>localhost:4000/api/health</strong>
        </a>
      </section>

      <section className="status-grid" aria-label="로컬 실행 포트">
        <span>
          <strong>API</strong>
          localhost:4000
        </span>
        <span>
          <strong>Tenant</strong>
          localhost:3001
        </span>
        <span>
          <strong>Manager</strong>
          localhost:3002
        </span>
        <span>
          <strong>Vendor</strong>
          localhost:3003
        </span>
      </section>

      <nav className="app-grid" aria-label="Roomlog role apps">
        {roleApps.map((app) => (
          <a className={`app-link ${app.accent}`} href={app.href} key={app.label}>
            <span className="app-eyebrow">{app.eyebrow}</span>
            <strong>{app.title}</strong>
            <span>{app.description}</span>
            <dl>
              <div>
                <dt>데모 계정</dt>
                <dd>{app.account}</dd>
              </div>
              <div>
                <dt>비밀번호</dt>
                <dd>password123!</dd>
              </div>
              <div>
                <dt>포트</dt>
                <dd>localhost:{app.port}</dd>
              </div>
            </dl>
            <em>{app.action}</em>
          </a>
        ))}
      </nav>

      <section className="flow-strip" aria-label="추천 테스트 흐름">
        <strong>추천 흐름</strong>
        <span>세입자 AI 상담 접수</span>
        <span>관리자 티켓 검토</span>
        <span>업체 배정/완료 보고</span>
        <span>관리자 완료 승인</span>
      </section>
    </main>
  );
}
