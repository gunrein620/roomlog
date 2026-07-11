# Manager Messaging Thread Location Design

## Goal

관리자 메시징 티켓에서 호실만 표시하던 위치 정보를 실제 건물명과 호실이 함께 보이도록 확장한다. 목록(`/manager/messaging/00`)과 상세(`/manager/messaging/04`)가 동일한 위치 표기 규칙을 사용한다.

## Scope

- 공유 `Thread` 계약에 선택적 `buildingName`을 추가한다.
- API의 관리자·임차인 메시징 스레드 응답이 연결된 방의 건물명과 호실 번호를 제공하게 한다.
- 관리자 메시징 데모 폴백 스레드에 건물명을 추가한다.
- 관리자 메시징 목록 카드와 상세 화면의 제목, 위치 배지, 삭제 버튼 접근성 문구에 건물·호실을 표시한다.
- 기존 라우팅, 정렬, 답장 필요 계산, 삭제 기능, 공지 탭은 변경하지 않는다.
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.

## Data Contract

`packages/types/src/messaging.ts`의 `Thread`에 다음 필드를 추가한다.

```ts
buildingName?: string;
```

필드는 기존 저장 데이터 및 데모 호환성을 위해 선택적으로 둔다. `unitId`는 기존 계약을 유지한다.

API는 스레드 저장 모델의 `roomId`를 이용해 방을 찾고, 외부 응답을 만들 때 다음 값을 투영한다.

- `buildingName`: 방의 실제 `buildingName`
- `unitId`: 방의 실제 `roomNo`

건물 정보가 없는 과거 응답은 web에서 `unitId`만 사용한다.

## Presentation

web에 위치 라벨 생성 함수를 둔다.

```ts
formatThreadLocation(thread) // "테스트 건물1 · 101호" 또는 "101호"
```

표기 규칙은 다음과 같다.

1. 건물명과 호실이 모두 있으면 `{buildingName} · {unitId}호`
2. 건물명이 없으면 `{unitId}호`
3. 건물명 앞뒤 공백은 제거한다.

목록 카드에서는 기존 첫 번째 호실 배지를 이 위치 라벨로 교체한다. 상세 화면에서는 페이지 제목, 위치 배지, 삭제 버튼 `aria-label`에 같은 라벨을 사용한다. 맥락 배지와 답장 필요 배지는 그대로 유지한다.

## Error Handling and Compatibility

- 기존 스레드에 `buildingName`이 없어도 목록과 상세 화면은 기존 호실 표기로 정상 렌더링한다.
- API가 연결된 방을 찾지 못하는 경우 기존 접근 제어 및 Not Found 동작을 유지한다.
- web API 실패 시 사용하는 데모 폴백에도 건물명을 포함해 실제 화면에서 요구사항을 확인할 수 있게 한다.

## Testing

TDD 순서는 다음과 같다.

1. 공유 타입 및 API 투영 테스트에 건물명·호실 응답 계약을 추가하고 실패를 확인한다.
2. web 테스트에 목록과 상세가 공용 위치 라벨을 사용하는 계약을 추가하고 실패를 확인한다.
3. 최소 구현 후 집중 테스트를 통과시킨다.
4. `packages/types`를 빌드한다.
5. `pnpm test:api`, `pnpm test:web`, `bash scripts/verify.sh`를 실행한다.
6. 현재 Docker 스택을 재시작하지 않고, 실행 중일 때만 로컬 화면 응답을 확인한다. Docker Desktop 재시작이 필요하면 먼저 사용자에게 보고한다.

## Success Criteria

- `/manager/messaging/00`의 모든 티켓 카드에 실제 건물명과 호실이 함께 표시된다.
- `/manager/messaging/04`의 제목과 위치 정보에도 같은 건물명·호실이 표시된다.
- 건물명이 없는 스레드는 기존 호실 표기로 안전하게 폴백한다.
- 다른 메시징 기능과 다른 관리자 화면의 동작은 변하지 않는다.
- 전체 검증을 통과한 변경만 `kms-commu`에 커밋·푸시한다.
