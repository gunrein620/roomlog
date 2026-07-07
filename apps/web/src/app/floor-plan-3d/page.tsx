import RoomlogFloorPlanEditor from "./RoomlogFloorPlanEditor";

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
        {/* 저장·발행은 캔버스 아래 액션 바가 담당한다(여기 있던 저장 버튼은 동작 없는 장식이라 제거). */}
        <span className="floor-plan-topbar-hint">저장·발행은 캔버스 아래에서</span>
      </header>

      <RoomlogFloorPlanEditor />
    </main>
  );
}
