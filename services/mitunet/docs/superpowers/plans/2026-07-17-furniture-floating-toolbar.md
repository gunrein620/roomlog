# Furniture Floating Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 3D 가구 바로 위에 아이콘 조작 도구를 표시하고, 이동·신규 배치는 `✓`를 누르기 전까지 포인터를 따라다니도록 만든다.

**Architecture:** 기존 `selectedFurniture`와 `pendingFurniture`를 상태의 단일 기준으로 유지한다. 상태 판정과 화면 가장자리 위치 제한은 `viewer/furniture-placement.mjs`의 순수 함수로 분리하고, Three.js 월드 좌표 투영과 DOM 이벤트 연결은 기존 구조에 맞춰 `viewer/index.html`에 둔다.

**Tech Stack:** Three.js r162, Lucide 0.468, HTML/CSS/ES modules, Node.js test runner, pytest

## Global Constraints

- 벽·문·창문·바닥 마스크·재질·카메라 전환·상승 애니메이션 코드는 수정하지 않는다.
- 가구 저장 형식과 GLB 크기 보정 로직을 변경하지 않는다.
- 화면 클릭은 배치를 확정하지 않으며 초록색 `✓`만 확정한다.
- 기존 가구 이동 취소는 원래 위치와 회전으로 복구하고, 신규 가구 취소는 미리보기를 제거한다.
- 현재 작업 트리의 사용자 변경을 보존하고 이 기능과 무관한 파일을 수정하지 않는다.
- 사용자가 별도로 요청하지 않았으므로 커밋·푸시·병합은 하지 않는다.

---

## File Structure

- Modify: `viewer/furniture-placement.mjs` — 플로팅 도구 모드 판정과 화면 위치 제한 순수 함수
- Modify: `tests_js/furniture-placement.test.mjs` — 상태·좌표 경계 테스트
- Modify: `viewer/index.html` — 아이콘 도구, Three.js 좌표 투영, 기존 가구 조작 함수 연결
- Modify: `tests/test_viewer_shell.py` — 마크업과 이벤트 흐름 정적 회귀 테스트

새 런타임 의존성이나 별도 번들 단계는 추가하지 않는다.

---

### Task 1: 플로팅 도구의 순수 상태·위치 계산

**Files:**
- Modify: `viewer/furniture-placement.mjs`
- Test: `tests_js/furniture-placement.test.mjs`

**Interfaces:**
- Produces: `resolveFurnitureToolbarMode({ currentView, hasSelectedFurniture, hasPendingFurniture }): "hidden" | "selection" | "pending"`
- Produces: `positionFurnitureToolbar({ anchorX, anchorY, toolbarWidth, toolbarHeight, viewportWidth, viewportHeight, margin, gap }): { left, top }`

- [ ] **Step 1: 실패 테스트 작성**

`tests_js/furniture-placement.test.mjs`의 import에 두 함수를 추가하고 아래 테스트를 붙인다.

```js
test("resolves toolbar modes from furniture interaction state", () => {
  assert.equal(resolveFurnitureToolbarMode({ currentView: "3d" }), "hidden");
  assert.equal(resolveFurnitureToolbarMode({ currentView: "furnishing" }), "hidden");
  assert.equal(resolveFurnitureToolbarMode({
    currentView: "furnishing",
    hasSelectedFurniture: true,
  }), "selection");
  assert.equal(resolveFurnitureToolbarMode({
    currentView: "furnishing",
    hasSelectedFurniture: true,
    hasPendingFurniture: true,
  }), "pending");
});

test("positions and clamps a toolbar above its screen anchor", () => {
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 400, anchorY: 200,
    toolbarWidth: 180, toolbarHeight: 44,
    viewportWidth: 800, viewportHeight: 600,
  }), { left: 310, top: 144 });
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 0, anchorY: 0,
    toolbarWidth: 180, toolbarHeight: 44,
    viewportWidth: 800, viewportHeight: 600,
  }), { left: 8, top: 8 });
  assert.deepEqual(positionFurnitureToolbar({
    anchorX: 800, anchorY: 600,
    toolbarWidth: 180, toolbarHeight: 44,
    viewportWidth: 800, viewportHeight: 600,
  }), { left: 612, top: 544 });
});
```

- [ ] **Step 2: 테스트가 export 부재로 실패하는지 확인**

Run: `node --test tests_js/furniture-placement.test.mjs`

Expected: 두 함수가 export되지 않아 FAIL.

- [ ] **Step 3: 최소 구현 추가**

`viewer/furniture-placement.mjs`에 아래 함수를 추가한다.

```js
export function resolveFurnitureToolbarMode({
  currentView,
  hasSelectedFurniture = false,
  hasPendingFurniture = false,
} = {}) {
  if (currentView !== "furnishing") return "hidden";
  if (hasPendingFurniture) return "pending";
  return hasSelectedFurniture ? "selection" : "hidden";
}

export function positionFurnitureToolbar({
  anchorX,
  anchorY,
  toolbarWidth,
  toolbarHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
  gap = 12,
}) {
  const maximumLeft = Math.max(margin, viewportWidth - toolbarWidth - margin);
  const maximumTop = Math.max(margin, viewportHeight - toolbarHeight - margin);
  return {
    left: Math.min(maximumLeft, Math.max(margin, anchorX - toolbarWidth / 2)),
    top: Math.min(maximumTop, Math.max(margin, anchorY - toolbarHeight - gap)),
  };
}
```

- [ ] **Step 4: 집중 테스트 통과 확인**

Run: `node --test tests_js/furniture-placement.test.mjs`

Expected: 모든 furniture placement 테스트 PASS.

---

### Task 2: 아이콘 전용 플로팅 도구 마크업과 스타일

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Produces: `#furniture-floating-toolbar`
- Produces: 선택 상태 버튼 `move`, `rotate-ccw`, `rotate-cw`, `trash-2`
- Produces: 배치 상태 버튼 `x`, `check`

- [ ] **Step 1: 실패 정적 테스트 작성**

`tests/test_viewer_shell.py`에 아래 테스트를 추가하고, 기존 테스트의 `furniture-selection-actions`와 패널 취소 버튼 기대값은 제거한다.

```python
def test_furniture_controls_use_an_accessible_floating_icon_toolbar(self):
    self.assertIn('id="furniture-floating-toolbar"', self.html)
    self.assertIn('role="toolbar"', self.html)
    self.assertIn('aria-label="선택한 가구 조작"', self.html)
    for button_id in (
        "furniture-move-btn",
        "furniture-rotate-left-btn",
        "furniture-rotate-right-btn",
        "furniture-delete-btn",
        "furniture-cancel-btn",
        "furniture-confirm-btn",
    ):
        self.assertIn(f'id="{button_id}"', self.html)
    for icon_name in ("move", "rotate-ccw", "rotate-cw", "trash-2", "x", "check"):
        self.assertIn(f'data-lucide="{icon_name}"', self.html)
    self.assertNotIn('id="furniture-selection-actions"', self.html)
    self.assertNotIn('id="furniture-placement-actions"', self.html)
```

- [ ] **Step 2: 새 마크업 부재로 실패하는지 확인**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: floating toolbar가 없어 FAIL.

- [ ] **Step 3: 기존 패널 버튼을 플로팅 도구로 교체**

카탈로그에는 `#furniture-reset-btn`만 남기고 `</aside>` 다음에 아래 마크업을 둔다.

```html
<div id="furniture-floating-toolbar" role="toolbar" aria-label="선택한 가구 조작" hidden>
  <div id="furniture-selection-toolbar-actions">
    <button class="furniture-toolbar-button" id="furniture-move-btn" type="button" title="가구 이동" aria-label="가구 이동"><i data-lucide="move" aria-hidden="true"></i></button>
    <button class="furniture-toolbar-button" id="furniture-rotate-left-btn" type="button" title="왼쪽으로 90도 회전" aria-label="왼쪽으로 90도 회전"><i data-lucide="rotate-ccw" aria-hidden="true"></i></button>
    <button class="furniture-toolbar-button" id="furniture-rotate-right-btn" type="button" title="오른쪽으로 90도 회전" aria-label="오른쪽으로 90도 회전"><i data-lucide="rotate-cw" aria-hidden="true"></i></button>
    <button class="furniture-toolbar-button danger" id="furniture-delete-btn" type="button" title="가구 삭제" aria-label="가구 삭제"><i data-lucide="trash-2" aria-hidden="true"></i></button>
  </div>
  <div id="furniture-pending-toolbar-actions" hidden>
    <button class="furniture-toolbar-button cancel" id="furniture-cancel-btn" type="button" title="배치 취소" aria-label="배치 취소"><i data-lucide="x" aria-hidden="true"></i></button>
    <button class="furniture-toolbar-button confirm" id="furniture-confirm-btn" type="button" title="배치 완료" aria-label="배치 완료"><i data-lucide="check" aria-hidden="true"></i></button>
  </div>
</div>
```

- [ ] **Step 4: 42px 아이콘 도구 스타일 추가**

기존 패널 action CSS를 제거하고 아래 스타일을 추가한다.

```css
#furniture-reset-btn { width: 100%; margin-top: 8px; }
#furniture-floating-toolbar {
  position: fixed;
  z-index: 30;
  visibility: hidden;
  padding: 5px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(10px);
}
#furniture-selection-toolbar-actions,
#furniture-pending-toolbar-actions { display: flex; gap: 4px; }
.furniture-toolbar-button {
  display: inline-grid;
  width: 42px;
  height: 42px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #182033;
  cursor: pointer;
}
.furniture-toolbar-button:hover { background: #edf2f7; }
.furniture-toolbar-button:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
.furniture-toolbar-button:disabled { opacity: 0.38; cursor: not-allowed; }
.furniture-toolbar-button svg { width: 20px; height: 20px; }
.furniture-toolbar-button.danger,
.furniture-toolbar-button.cancel { color: #dc2626; }
.furniture-toolbar-button.confirm { color: #15803d; }
.furniture-toolbar-button.cancel:hover { background: #fee2e2; }
.furniture-toolbar-button.confirm:hover:not(:disabled) { background: #dcfce7; }
```

- [ ] **Step 5: 정적 마크업 테스트 통과 확인**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: 아이콘·접근성 마크업 검증 PASS.

---

### Task 3: 상태 전환과 Three.js 화면 좌표 연결

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: `resolveFurnitureToolbarMode(...)`, `positionFurnitureToolbar(...)`
- Produces: `activeFurnitureToolbarObject(): THREE.Object3D | null`
- Produces: `updateFurnitureFloatingToolbarPosition(): void`

- [ ] **Step 1: 상태·좌표 연결 실패 테스트 작성**

```python
def test_furniture_toolbar_tracks_the_active_three_object(self):
    self.assertIn("resolveFurnitureToolbarMode({", self.html)
    self.assertIn("positionFurnitureToolbar({", self.html)
    self.assertIn("function activeFurnitureToolbarObject()", self.html)
    self.assertIn("function updateFurnitureFloatingToolbarPosition()", self.html)
    self.assertIn("furnitureToolbarBounds.setFromObject(target)", self.html)
    self.assertIn("furnitureToolbarAnchor.project(camera)", self.html)
    self.assertIn("furnitureConfirmButton.disabled = !pendingFurniture?.valid", self.html)
```

- [ ] **Step 2: 연결 부재로 실패하는지 확인**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: helper import와 투영 함수가 없어 FAIL.

- [ ] **Step 3: import와 DOM 참조 교체**

`viewer/index.html`의 furniture import에 `positionFurnitureToolbar`, `resolveFurnitureToolbarMode`를 추가하고 다음 DOM 참조를 사용한다.

```js
const furnitureToolbar = document.getElementById("furniture-floating-toolbar");
const furnitureSelectionToolbarActions = document.getElementById("furniture-selection-toolbar-actions");
const furniturePendingToolbarActions = document.getElementById("furniture-pending-toolbar-actions");
const furnitureMoveButton = document.getElementById("furniture-move-btn");
const furnitureRotateLeftButton = document.getElementById("furniture-rotate-left-btn");
const furnitureRotateRightButton = document.getElementById("furniture-rotate-right-btn");
const furnitureDeleteButton = document.getElementById("furniture-delete-btn");
const furnitureCancelButton = document.getElementById("furniture-cancel-btn");
const furnitureConfirmButton = document.getElementById("furniture-confirm-btn");
```

- [ ] **Step 4: 상태별 UI 동기화 구현**

`updateFurnitureInteractionUi()` 안에서 다음 상태를 계산한다.

```js
const toolbarMode = resolveFurnitureToolbarMode({
  currentView,
  hasSelectedFurniture: Boolean(selectedFurniture),
  hasPendingFurniture: Boolean(pendingFurniture),
});
furnitureToolbar.hidden = toolbarMode === "hidden";
furnitureSelectionToolbarActions.hidden = toolbarMode !== "selection";
furniturePendingToolbarActions.hidden = toolbarMode !== "pending";
furnitureConfirmButton.disabled = !pendingFurniture?.valid;
if (toolbarMode === "hidden") furnitureToolbar.style.visibility = "hidden";
```

`selectFurnitureAt()`과 `resetFurniturePlacements()`의 옛 패널 직접 숨김 코드를 제거한다. `updateFurniturePreview()`는 `valid` 값이 바뀌었을 때만 `updateFurnitureInteractionUi()`를 호출하여 `✓` 활성 상태를 동기화한다.

- [ ] **Step 5: 가구 상단을 화면 좌표로 투영**

재사용 객체를 선언하고 아래 함수를 추가한다.

```js
const furnitureToolbarBounds = new THREE.Box3();
const furnitureToolbarAnchor = new THREE.Vector3();

function activeFurnitureToolbarObject() {
  return pendingFurniture?.object ?? selectedFurniture ?? null;
}

function updateFurnitureFloatingToolbarPosition() {
  if (furnitureToolbar.hidden) return;
  const target = activeFurnitureToolbarObject();
  if (!target) {
    furnitureToolbar.style.visibility = "hidden";
    return;
  }
  furnitureToolbarBounds.setFromObject(target);
  if (furnitureToolbarBounds.isEmpty()) {
    furnitureToolbar.style.visibility = "hidden";
    return;
  }
  furnitureToolbarBounds.getCenter(furnitureToolbarAnchor);
  furnitureToolbarAnchor.y = furnitureToolbarBounds.max.y;
  furnitureToolbarAnchor.project(camera);
  if (furnitureToolbarAnchor.z < -1 || furnitureToolbarAnchor.z > 1) {
    furnitureToolbar.style.visibility = "hidden";
    return;
  }
  const canvasRect = sceneCanvas.getBoundingClientRect();
  const position = positionFurnitureToolbar({
    anchorX: (furnitureToolbarAnchor.x + 1) * 0.5 * canvasRect.width,
    anchorY: (1 - furnitureToolbarAnchor.y) * 0.5 * canvasRect.height,
    toolbarWidth: furnitureToolbar.offsetWidth,
    toolbarHeight: furnitureToolbar.offsetHeight,
    viewportWidth: canvasRect.width,
    viewportHeight: canvasRect.height,
  });
  furnitureToolbar.style.left = `${canvasRect.left + position.left}px`;
  furnitureToolbar.style.top = `${canvasRect.top + position.top}px`;
  furnitureToolbar.style.visibility = "visible";
}
```

`tick()`에서 `controls.update()` 직후 `updateFurnitureFloatingToolbarPosition()`을 호출한다.

- [ ] **Step 6: 도구 이벤트 전파 차단**

```js
for (const eventName of ["pointerdown", "click"]) {
  furnitureToolbar.addEventListener(eventName, event => event.stopPropagation());
}
```

- [ ] **Step 7: 집중 테스트 통과 확인**

Run: `node --test tests_js/furniture-placement.test.mjs`

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: helper와 Three.js 연결 테스트 PASS.

---

### Task 4: 명시적 배치 완료와 좌우 회전 연결

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Produces: `rotateSelectedFurniture(direction: -1 | 1): void`
- Consumes: 기존 `confirmFurniturePlacement()`, `cancelFurnitureInteraction()`, `beginMoveSelectedFurniture()`, `deleteSelectedFurniture()`

- [ ] **Step 1: 자동 확정 금지와 좌우 회전 실패 테스트 작성**

```python
def test_furniture_toolbar_requires_explicit_confirmation_and_supports_both_rotations(self):
    self.assertIn("function rotateSelectedFurniture(direction)", self.html)
    self.assertIn("const rotationDelta = direction * Math.PI / 2", self.html)
    self.assertIn(
        'furnitureRotateLeftButton.addEventListener("click", () => rotateSelectedFurniture(-1))',
        self.html,
    )
    self.assertIn(
        'furnitureRotateRightButton.addEventListener("click", () => rotateSelectedFurniture(1))',
        self.html,
    )
    self.assertIn(
        'furnitureConfirmButton.addEventListener("click", confirmFurniturePlacement)',
        self.html,
    )
    click_body = self.html.split(
        'sceneCanvas.addEventListener("click", event => {', 1
    )[1].split("});", 1)[0]
    self.assertIn("updateFurniturePreview(event)", click_body)
    self.assertNotIn("confirmFurniturePlacement()", click_body)
```

- [ ] **Step 2: 기존 자동 확정 때문에 실패하는지 확인**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: 단방향 회전과 click 자동 확정 때문에 FAIL.

- [ ] **Step 3: 회전 방향 인자 적용**

```js
function rotateSelectedFurniture(direction) {
  if (!selectedFurniture) return;
  const entry = placedFurnitures.find(
    candidate => candidate.placement.id === selectedFurniture.userData.placementId,
  );
  if (!entry) return;
  const rotationDelta = direction * Math.PI / 2;
  selectedFurniture.rotation.y += rotationDelta;
  if (!furnitureFootprintFits(selectedFurniture.position, entry.item, selectedFurniture.rotation.y)) {
    selectedFurniture.rotation.y -= rotationDelta;
    setStatus("회전 후 가구가 실내 바닥을 벗어나므로 회전할 수 없습니다.", "warning");
    return;
  }
  entry.placement.rotationY = selectedFurniture.rotation.y;
  setStatus(direction < 0 ? "가구를 왼쪽으로 90° 회전했습니다." : "가구를 오른쪽으로 90° 회전했습니다.");
}
```

- [ ] **Step 4: 아이콘 버튼 연결**

```js
furnitureMoveButton.addEventListener("click", beginMoveSelectedFurniture);
furnitureRotateLeftButton.addEventListener("click", () => rotateSelectedFurniture(-1));
furnitureRotateRightButton.addEventListener("click", () => rotateSelectedFurniture(1));
furnitureDeleteButton.addEventListener("click", deleteSelectedFurniture);
furnitureCancelButton.addEventListener("click", () => cancelFurnitureInteraction());
furnitureConfirmButton.addEventListener("click", confirmFurniturePlacement);
furnitureResetButton.addEventListener("click", () => resetFurniturePlacements());
```

- [ ] **Step 5: 캔버스 클릭 자동 확정 제거**

```js
if (pendingFurniture) {
  updateFurniturePreview(event);
} else {
  selectFurnitureAt(event);
}
```

기존 `Escape` 취소는 유지한다. `✓`가 유효한 경우에만 기존 `confirmFurniturePlacement()`를 호출한다.

- [ ] **Step 6: 집중 테스트 통과 확인**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider`

Expected: 플로팅 UI, 좌우 회전, 명시적 완료 테스트 PASS.

---

### Task 5: 전체 회귀 및 실제 브라우저 검증

**Files:**
- Verify: `viewer/furniture-placement.mjs`
- Verify: `tests_js/furniture-placement.test.mjs`
- Verify: `viewer/index.html`
- Verify: `tests/test_viewer_shell.py`

**Interfaces:**
- Consumes: Tasks 1–4의 완성된 상태·좌표·이벤트 연결
- Produces: 자동 테스트와 실제 3000 화면 확인 결과

- [ ] **Step 1: 전체 JavaScript 테스트 실행**

Run: `node --test tests_js/*.test.mjs`

Expected: 모든 JavaScript 테스트 PASS.

- [ ] **Step 2: 관련 Python 테스트 실행**

Run: `& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py tests/test_roomlog_viewer_integration.py -q -p no:cacheprovider`

Expected: 모든 관련 Python 테스트 PASS.

- [ ] **Step 3: diff 경계 확인**

Run: `git diff --check -- viewer/index.html viewer/furniture-placement.mjs tests_js/furniture-placement.test.mjs tests/test_viewer_shell.py`

Run: `git status --short -- viewer/index.html viewer/furniture-placement.mjs tests_js/furniture-placement.test.mjs tests/test_viewer_shell.py`

Expected: 공백 오류 없음. 기능 관련 네 파일만 변경되고 커밋되지 않은 상태.

- [ ] **Step 4: 3000 화면 실제 확인**

`http://localhost:3000/floor-plan-3d/mitunet`에서 다음을 확인한다.

1. 선택 가구 위에 이동·좌회전·우회전·삭제 아이콘이 나타난다.
2. 카메라 회전·줌 중 도구가 가구를 따라간다.
3. 이동 후 바닥을 클릭해도 확정되지 않고 포인터를 계속 따라간다.
4. 유효한 위치의 `✓`는 확정하고, 유효하지 않은 위치에서는 비활성화된다.
5. 기존 가구의 `×`는 원위치·원회전을 복구하고 신규 가구의 `×`는 미리보기를 제거한다.
6. 좌우 회전은 각각 90도이고 삭제가 정상 동작한다.
7. 벽·문·창문·바닥·상승 애니메이션이 이전과 동일하다.

- [ ] **Step 5: 결과 전달**

변경 파일, 조작 방식, 테스트 결과와 실제 브라우저 확인 결과를 사용자에게 전달한다. 커밋·푸시는 하지 않는다.
