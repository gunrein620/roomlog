# Manager Ticket Parent Toggle Implementation Plan

> **Goal:** 관리자 사이드바의 `민원·하자` 상위 행 전체를 접기/펼치기 버튼으로 만들고, 실제 화면 이동은 하위 링크만 담당하게 한다.

## Scope

- 수정: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- 수정: `apps/web/src/app/manager/globals.css`
- 수정: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- 수정: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts` (사이드바 승인 해시)
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.

## Task 1: 상위 행 전체 토글 회귀 테스트

1. `manager-workspace-shell.spec.ts`에 ticket 항목이 단일 버튼으로 렌더되는지, 비활성 관리자 경로에서도 펼칠 수 있는지, 버튼이 전체 너비 스타일을 쓰는지 검증을 추가한다.
2. 아래 집중 테스트를 실행해 새 검증이 현재 구현에서 의도대로 실패하는지 확인한다.

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/manager-workspace-shell.spec.ts
```

## Task 2: 최소 구현

1. `ManagerSidebar.tsx`에서 ticket 부모 링크와 별도 화살표 버튼을 하나의 버튼으로 교체한다.
2. ticket 하위 메뉴 표시 조건을 현재 경로 활성 여부가 아니라 `ticketExpanded` 상태로 결정한다.
3. 다른 메뉴 항목의 링크 동작과 ticket 하위 링크 이동은 유지한다.
4. `globals.css`에서 ticket 버튼을 전체 너비 flex 행으로 만들고 활성 상태와 화살표 회전을 유지한다.
5. 집중 테스트를 다시 실행해 통과를 확인한다.

## Task 3: 전체 검증과 로컬 화면 확인

1. web 단위 테스트와 저장소 기본 검증을 실행한다.

```bash
pnpm --filter web test:unit
bash scripts/verify.sh
```

2. 인프라 파일 수정 없이 기존 Docker 설정으로 web 이미지를 재빌드한다.

```bash
docker compose up -d --build web
```

3. 브라우저에서 다른 관리자 화면의 `민원·하자` 전체 행을 클릭해 펼침/접힘을 반복 확인한다.
4. 하위 `민원 대시보드` 링크로 `/manager/ticket/dash/00` 이동을 확인하고 콘솔 오류를 점검한다.

## Task 4: 커밋과 푸시

1. 변경 범위와 새 raw hex 부재를 확인한다.
2. 이번 기능 파일만 stage한다.
3. `fix(ticket): toggle sidebar submenu from parent row`로 커밋한다.
4. `origin/kms-commu`에 푸시한다.
