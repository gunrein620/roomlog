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
        <button type="button">저장</button>
      </header>

      <RoomlogFloorPlanEditor />
    </main>
  );
}
