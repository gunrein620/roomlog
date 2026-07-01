const toolModes = ["벽", "문", "창", "가구", "치수"];

const roomStats = [
  ["전용면적", "24.5m²"],
  ["벽체", "8개"],
  ["창문", "2개"],
  ["저장상태", "초안"]
];

export default function FloorPlan3DPage() {
  return (
    <main
      className="floor-plan-page"
      aria-labelledby="floor-plan-title"
      data-source-program="123123"
      data-editor-component="FloorPlanEditor"
    >
      <header className="floor-plan-topbar">
        <a href="/" aria-label="마이페이지로 돌아가기">
          ←
        </a>
        <div>
          <p className="brand-kicker">ROOMLOG 3D</p>
          <h1 id="floor-plan-title">3D 도면 만들기</h1>
        </div>
        <button type="button">저장</button>
      </header>

      <section className="floor-plan-workspace" aria-label="3D 도면 편집기">
        <aside className="floor-plan-toolbar" aria-label="도면 도구">
          {toolModes.map((mode, index) => (
            <button className={index === 0 ? "active" : ""} type="button" key={mode}>
              {mode}
            </button>
          ))}
        </aside>

        <section className="floor-plan-canvas" aria-label="도면 캔버스">
          <div className="blueprint-stage">
            <div className="room-outline">
              <span className="wall wall-top" />
              <span className="wall wall-right" />
              <span className="wall wall-bottom" />
              <span className="wall wall-left" />
              <span className="inner-wall horizontal" />
              <span className="inner-wall vertical" />
              <span className="door-swing" />
              <span className="window-line window-a" />
              <span className="window-line window-b" />
              <span className="furniture bed" />
              <span className="furniture table" />
            </div>
          </div>
          <button className="floor-plan-primary" type="button">
            PC에서 도면 만들기
          </button>
        </section>

        <aside className="floor-plan-sidepanel" aria-label="도면 정보">
          <div>
            <span>방배 루미에르 402호</span>
            <strong>원룸 도면 초안</strong>
          </div>
          <dl>
            {roomStats.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <a href="/">마이페이지</a>
        </aside>
      </section>
    </main>
  );
}
