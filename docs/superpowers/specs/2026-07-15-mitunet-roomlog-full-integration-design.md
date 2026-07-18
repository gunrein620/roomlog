# MitUNet 3D 도면 제작기 완전 연동 설계

## 목표

RoomLog 매물 등록 화면의 `3D 도면 만들기` 진입점을 기존 내장 편집기에서 별도 MitUNet 제작기로 교체한다. 사용자는 MitUNet에서 도면 업로드, 벽·문·창 검토, 실측 축척 입력, 3D 확인을 마친 뒤 파일을 내려받아 다시 올리지 않고 `RoomLog에 연결`을 눌러 등록 화면으로 결과를 자동 전달한다. 전달된 결과는 등록 미리보기와 등록된 매물의 3D 상세 화면에서 같은 구조로 보인다.

연동 대상은 다음 두 저장소다.

- RoomLog: `C:\Users\smoun\Jungle\woo-zu\roomlog`
- MitUNet 제작기: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet`

## 선택한 방식

MitUNet 제작기는 독립 서비스로 유지하고, 새 탭과 `window.postMessage`를 이용해 완료 결과만 RoomLog로 전달한다. RoomLog는 MitUNet 폴리곤 형식을 네이티브 도면 형식으로 보존하고 별도 렌더러 어댑터로 표시한다.

이 방식은 다음 이유로 선택한다.

- MitUNet의 Python 추론 서버와 검토 UI를 RoomLog 저장소에 복제하지 않는다.
- 기존 MitUNet 작업 흐름을 그대로 사용한다.
- 벽 폴리곤을 직육면체 벽으로 억지 변환하면서 발생하는 형태 손실을 피한다.
- 기존 RoomLog `walls3D` 도면은 계속 동작하게 하여 이전 매물과 호환성을 유지한다.

iframe 내장은 화면 크기, 포커스, 파일 선택, 개발 서버 장애가 RoomLog 화면 전체에 전파되므로 사용하지 않는다. MitUNet 폴리곤을 기존 `walls3D` 배열로 근사 변환하는 방식도 복잡한 벽과 개구부 형태가 손실되므로 사용하지 않는다.

## 사용자 흐름

1. 사용자가 RoomLog 매물 등록 화면에서 `3D 도면 만들기`를 누른다.
2. RoomLog는 현재 등록 폼과 사진 초안을 보존하고 MitUNet 제작기를 새 탭으로 연다.
3. MitUNet 제작기 URL에는 RoomLog 연동 모드, RoomLog origin, 일회성 요청 ID가 포함된다.
4. 사용자는 기존 흐름대로 도면을 업로드하고 벽·문·창을 수정한 뒤 실측 축척을 입력하고 3D를 확인한다.
5. 3D 결과가 준비되면 `RoomLog에 연결` 버튼이 활성화된다.
6. 버튼을 누르면 MitUNet 제작기가 최소 도면 데이터만 부모 탭에 전달한다.
7. RoomLog는 origin, 요청 ID, 스키마 버전, 좌표와 배열 크기를 검증한다.
8. 검증 성공 시 RoomLog가 도면 초안을 로컬에 저장하고 등록 화면의 3D 미리보기를 갱신한다. MitUNet 탭에는 연결 성공 상태를 표시한 뒤 사용자가 닫을 수 있게 한다.
9. 사용자가 매물을 등록하면 RoomLog API가 MitUNet 도면을 정규화하여 매물 데이터에 저장한다.
10. 매물 상세의 `3D 보기`는 기존 `walls3D` 또는 새 MitUNet 폴리곤 형식에 맞는 렌더러를 선택한다.

## 실행 주소와 설정

RoomLog 웹은 공개 환경 변수 `NEXT_PUBLIC_MITUNET_EDITOR_URL`로 제작기 주소를 읽는다. 로컬 기본값은 `http://127.0.0.1:8012`다. 운영 환경에서는 배포된 HTTPS MitUNet 주소를 명시해야 한다.

버튼은 단순한 고정 `<a>` 대신 클릭 핸들러에서 새 탭을 연다. RoomLog는 열린 창의 참조와 요청 ID를 보관한다. 현재 링크의 `rel="noopener"`는 부모 탭으로 결과를 보낼 수 없게 하므로 연동 모드에서는 사용하지 않는다. 대신 아래 검증 규칙으로 메시지 수신 범위를 제한한다.

## 메시지 계약

MitUNet 제작기는 다음 형태의 메시지만 보낸다.

```json
{
  "type": "roomlog.floor-plan.completed",
  "schema": "roomlog-mitunet-floor-plan",
  "version": 1,
  "requestId": "일회성 요청 ID",
  "payload": {
    "name": "도면 파일명",
    "canvasSize": [1024, 1024],
    "contentRect": [0, 0, 1024, 1024],
    "millimetersPerPixel": 4.25,
    "polygons": {
      "wall": [{ "outer": [[0, 0], [10, 0], [10, 5]], "holes": [] }],
      "door": [],
      "window": []
    }
  }
}
```

`millimetersPerPixel`은 사용자가 실측 축척을 적용하지 않았을 때 `null`이다. 원본 도면의 base64 이미지와 편집 이력은 매물 데이터에 저장하지 않는다. 이미지가 크고 개인정보가 포함될 수 있으며, 최종 3D 렌더링에는 필요하지 않기 때문이다.

MitUNet 제작기는 쿼리로 받은 RoomLog origin이 `ROOMLOG_ALLOWED_ORIGINS` 설정에 포함될 때만 연동 모드를 활성화하고, `postMessage`의 정확한 `targetOrigin`으로 사용한다. 로컬 기본 허용값은 `http://localhost:3000`과 `http://127.0.0.1:3000`이며 운영 환경에서는 배포된 RoomLog HTTPS origin을 명시한다. `"*"`는 사용하지 않는다.

RoomLog는 다음 조건을 모두 만족하는 메시지만 받아들인다.

- `event.origin`이 설정된 MitUNet 제작기 URL의 origin과 일치한다.
- `event.source`가 RoomLog가 직접 연 제작기 창과 일치한다.
- `requestId`가 현재 대기 중인 일회성 요청 ID와 일치한다.
- `type`, `schema`, `version`이 지원하는 값과 일치한다.
- 캔버스, 좌표, 축척 값이 유한수이며 허용 범위 안에 있다.
- 폴리곤과 점 개수가 서버 제한을 넘지 않는다.

성공하거나 취소하면 요청 ID와 창 참조를 폐기한다. 중복 메시지는 무시한다.

## RoomLog 저장 형식

기존 `ListingFloorPlan3D`의 `walls3D` 형식은 유지한다. 새 도면은 구분 가능한 `mitunet` 필드를 추가한다.

```ts
type ListingFloorPlan3D = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
  mitunet?: {
    schema: "roomlog-mitunet-floor-plan";
    version: 1;
    canvasSize: [number, number];
    contentRect: [number, number, number, number];
    millimetersPerPixel: number | null;
    polygons: MitunetPolygonGroups;
  };
};
```

MitUNet 도면은 `walls3D`가 비어 있어도 `mitunet.polygons.wall`에 유효한 벽이 있으면 연결된 도면으로 취급한다. 기존 도면은 `mitunet` 없이 지금과 동일하게 처리한다.

API 정규화는 허용된 키만 복사하고 다음 상한을 둔다.

- 클래스별 폴리곤 최대 2,000개
- 폴리곤별 외곽점 최대 2,000개
- 폴리곤별 hole 최대 100개
- hole별 점 최대 2,000개
- 좌표는 유한수이며 캔버스의 제한된 여유 범위 안에 있어야 한다.

제한을 넘거나 벽 폴리곤이 없는 데이터는 저장하지 않고 명확한 오류를 반환한다.

## 렌더링

RoomLog 3D 프리뷰와 매물 상세는 도면 형식에 따라 렌더러를 선택한다.

- `mitunet`이 있으면 폴리곤 렌더러를 사용한다.
- 그렇지 않으면 기존 `RoomlogThreeFloorPlanView`의 `walls3D` 렌더링을 사용한다.

폴리곤 렌더러는 MitUNet 제작기의 최종 3D와 같은 좌표 정규화 및 벽 높이 규칙을 사용한다. 벽 폴리곤은 `THREE.Shape`로 만들고 hole을 적용한 뒤 압출한다. 문과 창 폴리곤은 기존 MitUNet 결과 표현과 동일한 재질·높이 규칙으로 표시한다.

실측 축척이 있으면 `millimetersPerPixel / 1000`을 미터 단위 변환에 사용한다. 축척이 없으면 전체 도면이 일정한 화면 크기에 맞도록 정규화하고, UI에 `실측 축척 미설정` 상태를 표시한다. 원본 좌표는 수정하지 않고 렌더링 변환에서만 중심을 맞춘다.

이번 연동에서 MitUNet 폴리곤을 기존 직육면체 벽으로 변환하지 않는다. 따라서 기존 `walls3D` 전용 벽 편집 기능은 MitUNet 도면에 적용하지 않는다. MitUNet 도면 수정은 `다시 열기`로 제작기에서 수행한다.

## 실패 처리와 대체 경로

- MitUNet 서버가 실행되지 않았으면 새 탭에 연결 오류가 나타나며 RoomLog 초안은 그대로 유지된다.
- 팝업이 차단되면 RoomLog에 팝업 허용 안내를 표시한다.
- 잘못된 메시지는 저장하지 않고 `3D 도면 연결에 실패했습니다` 안내를 표시한다.
- 사용자가 탭을 닫거나 취소하면 기존 RoomLog 도면을 덮어쓰지 않는다.
- 자동 전달이 실패해도 기존 `Save` JSON 다운로드를 유지한다.
- RoomLog의 JSON 업로드는 새 `roomlog-mitunet-floor-plan` 형식도 읽을 수 있게 하여 수동 복구 경로를 제공한다.
- 등록 폼과 선택 사진은 현재 IndexedDB·초안 보존 동작을 그대로 사용한다.

## 테스트

MitUNet 제작기에는 다음 테스트를 추가한다.

- RoomLog 연동 쿼리 파싱
- 완료 메시지 생성 시 base64 원본 이미지 제외
- 정확한 target origin과 요청 ID 사용
- 결과가 없을 때 `RoomLog에 연결` 비활성화
- 기존 JSON 저장 동작 유지

RoomLog 웹에는 다음 테스트를 추가한다.

- 버튼이 설정된 MitUNet URL과 일회성 요청 ID로 새 탭을 여는지 확인
- 허용되지 않은 origin, 창, 요청 ID, 스키마 버전 메시지 거부
- 유효한 메시지를 로컬 도면 초안으로 저장하고 즉시 미리보기 상태 갱신
- 새 JSON 형식 업로드 지원
- 기존 `walls3D` 도면 동작 유지
- MitUNet 도면의 폴리곤 렌더러 선택

RoomLog API에는 다음 테스트를 추가한다.

- 유효한 MitUNet 폴리곤 저장 및 조회
- 유한수가 아닌 좌표와 제한 초과 데이터 거부
- 원본 이미지나 알 수 없는 필드 제거
- 기존 `walls3D` 저장과 구버전 매물 로드 유지

구현 후 두 저장소의 관련 단위 테스트와 RoomLog `bash scripts/verify.sh`를 실행한다. 로컬에서는 RoomLog `:3000`, API `:4000`, MitUNet `:8012`를 함께 실행하여 버튼 진입부터 매물 상세 3D 표시까지 실제 브라우저 흐름을 검증한다.

## 변경 경계

이번 작업은 3D 도면 생성 진입, 결과 전달, 저장, 렌더링만 변경한다. MitUNet 모델 추론 방식, Roboflow/로컬 YOLO 검출 방식, RoomLog 매물 등록의 다른 필드, 인증·권한, 기존 가구 배치 기능의 동작은 변경하지 않는다.

두 저장소에 이미 존재하는 미커밋 변경은 사용자 작업으로 간주한다. 구현은 해당 변경을 보존하면서 필요한 부분만 추가하고, 관련 없는 파일을 포맷하거나 되돌리지 않는다.
