# Manager Announcement Target Prompt Visibility Design

## Goal

관리자 신규 공지 작성 화면은 대상이 없는 상태로 시작하고, 유효한 공지 대상을 선택하면 `공지 대상을 선택하세요.` 안내 박스를 숨긴다.

## State Model

- `hasScopeSelection`으로 사용자가 대상 범위를 선택했는지 관리한다.
- 신규 작성은 `hasScopeSelection = false`로 시작한다.
- 기존 저장 초안 수정은 `hasScopeSelection = true`로 시작한다.
- 기존 `buildAnnouncementTarget` 결과는 `calculatedTarget`으로 유지한다.
- 실제 렌더링·저장·검증에 사용하는 `target`은 선택 전 `{ targetRoomIds: [], targetLabel: "" }`로 게이트한다.
- `hasValidTarget`은 게이트된 `target.targetRoomIds.length > 0`으로 계산한다.
- 범위 radio의 checked 상태와 건물·호실 controls는 `hasScopeSelection`을 반영한다.

## Behavior

- 신규 작성 첫 화면에서는 대상 radio가 선택되지 않고 안내 박스만 표시한다.
- `전체`를 선택하면 관리 세대가 존재하는 경우 대상 결과를 표시하고 안내를 숨긴다.
- `건물`을 선택하면 기본 건물의 관리 세대가 존재하는 경우 대상 결과를 표시하고 안내를 숨긴다.
- `호실`을 선택한 직후에는 호실이 없으므로 안내를 유지한다.
- 호실을 하나 이상 선택하면 대상 결과를 표시하고 안내를 숨긴다.
- 선택한 마지막 호실을 해제하면 대상 결과를 숨기고 안내를 다시 표시한다.
- 기존 초안에 유효한 대상이 있으면 첫 렌더부터 대상 결과만 표시한다.
- 신규 작성에서 대상을 선택하지 않고 저장·검토하면 기존 `발송 대상을 선택해 주세요.` 검증이 동작한다.

## Rendering

- `targetSummary` 안에서 `hasValidTarget`이 참이면 `targetBox`만 렌더한다.
- `hasValidTarget`이 거짓이면 `targetHint`만 렌더한다.
- 두 박스가 동시에 표시되지 않으므로 선택 완료 후 안내 박스가 남지 않는다.
- 기존 데스크톱·모바일 `targetSummary` 레이아웃 CSS는 유지한다.

## Scope

- `AnnouncementComposer.tsx`의 대상 범위 초기 상태, checked 조건, controls 노출, 결과·안내 조건부 렌더링만 변경한다.
- `buildAnnouncementTarget`, 저장 payload 형식, 검증 정책과 API는 변경하지 않는다.
- 선택 전에는 기존 저장 payload와 검증에 빈 대상 ID와 라벨을 전달한다.
- 다른 메시징 화면과 인프라 파일은 변경하지 않는다.

## Testing

기존 `apps/web/property-shell.spec.mjs` 관리자 공지 작성 계약 테스트에서 다음을 검증한다.

- 신규 작성 여부에 따라 `hasScopeSelection` 초기값이 달라진다.
- 범위 선택 시 선택 시작 상태가 설정된다.
- `hasValidTarget`은 실제 수신 호실 ID가 존재해야 참이다.
- 선택 전 저장·검증에 빈 대상이 전달된다.
- 결과 박스와 안내 박스가 상호 배타적으로 렌더된다.
- unit 마지막 선택 해제 시 안내 상태로 돌아갈 수 있다.
- 기존 대상 계산, 저장 및 검토 이동 계약은 유지된다.

관련 회귀 테스트를 RED→GREEN으로 실행하고 web 프로덕션 빌드, Docker web 재빌드와 실제 브라우저 신규·기존 화면을 확인한다. 이번 작업 검증이 통과한 경우에만 `kms-manager-chat` 브랜치에 커밋하고 푸시한다.

## Non-goals

- 대상 선택 UI 전체 재설계
- 공지 대상 계산 함수 또는 서버 권한 정책 변경
- 안내 문구 또는 대상 결과 문구 변경
- 인프라 설정 변경
