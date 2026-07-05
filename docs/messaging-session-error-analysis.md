# 메시징 전송 403 에러 분석

작성일: 2026-07-04

## 요약

세입자 메시지 상세 화면(`/tenant/messaging/01?id=mth_demo_general`)에서 메시지를 보낼 때 Next.js 기본 에러 화면과 `ERROR 2053871845`가 표시되는 현상이 확인됐다.

원인은 메시징 API 연결 자체가 아니라, 세입자 메시지 전송 서버 액션이 API의 권한 오류(`403`)를 처리하지 못하고 예외를 그대로 던지는 구조다.

특히 같은 Chrome 일반 창 2개에서 세입자와 관리자를 각각 로그인하면, 두 창은 같은 `localhost:3000` 쿠키를 공유한다. 한 창에서 관리자로 로그인하면 기존 세입자 쿠키가 관리자 토큰으로 덮일 수 있고, 그 상태에서 세입자 화면에서 메시지를 보내면 API는 "세입자 API에 관리자 토큰이 들어왔다"고 판단해 `403 이 역할로 접근할 수 없습니다.`를 반환한다.

## 확인된 현상

- 화면 URL: `/tenant/messaging/01?id=mth_demo_general`
- 사용자 화면: `This page couldn't load`
- 브라우저 표시 에러: `ERROR 2053871845`
- 웹 컨테이너 로그 원문:
  - `ApiError: 이 역할로 접근할 수 없습니다.`
  - `status: 403`
  - `digest: '2053871845'`

`2053871845`는 Next.js가 서버 예외를 클라이언트에 노출할 때 붙인 digest이며, 실제 원인은 웹 컨테이너 로그의 `ApiError status: 403`이다.

## 재현 원리

같은 브라우저의 일반 창들은 쿠키와 세션을 공유한다.

예시:

1. Chrome 일반 창 A에서 세입자로 로그인한다.
2. Chrome 일반 창 B에서 관리자로 로그인한다.
3. 같은 `localhost:3000`의 인증 쿠키가 관리자 토큰으로 덮인다.
4. 창 A의 세입자 메시지 화면은 그대로 떠 있을 수 있다.
5. 창 A에서 메시지 보내기를 누르면 서버 액션은 현재 쿠키의 관리자 토큰으로 tenant 전송 API를 호출한다.
6. API가 `403 이 역할로 접근할 수 없습니다.`를 반환한다.
7. 현재 메시징 서버 액션이 이 예외를 catch하지 않아 Next.js 에러 화면으로 떨어진다.

## API 연결 확인 결과

로컬 Docker 네트워크 내부에서 API를 직접 확인했다.

- tenant 계정으로 로그인 후 `POST /api/tenant/messaging/threads/mth_demo_general/messages`
  - 결과: `201 Created`
  - 의미: 세입자 토큰으로는 메시지 전송 API가 정상 동작한다.

- manager 계정으로 로그인 후 같은 tenant 메시지 전송 API 호출
  - 결과: `403 Forbidden`
  - 응답: `이 역할로 접근할 수 없습니다.`
  - 의미: 역할이 다른 토큰이면 API가 정상적으로 차단한다.

따라서 이 문제는 API 라우트가 깨진 문제가 아니라, 잘못된 역할 세션 또는 만료된 세션이 들어왔을 때 웹 화면이 권한 오류를 사용자 흐름으로 처리하지 못하는 문제다.

## 현재 코드상 문제 지점

세입자 메시지 전송 액션:

- `apps/web/src/app/tenant/messaging/01/page.tsx`
- `sendTenantMessage`
- `await addTenantThreadMessage(threadId, { body })`

현재 상세 페이지 조회 함수는 `401/403`을 잡아서 `/tenant/login`으로 redirect한다.

반면 메시지 전송 서버 액션은 `addTenantThreadMessage`에서 발생한 `ApiError`를 catch하지 않는다. 그래서 API가 `401`, `403`, `404`를 반환하면 사용자에게 로그인 화면이나 목록 화면을 보여주지 못하고 Next.js 기본 에러 화면이 표시된다.

관리인 메시지 전송도 같은 구조를 가진다.

- `apps/web/src/app/manager/messaging/04/page.tsx`
- `sendManagerMessage`
- `await addManagerThreadMessage(threadId, { body })`

## 로그인 담당 영역과의 관계

이 현상은 로그인 담당자가 반드시 고쳐야 하는 문제로 보기 어렵다.

같은 브라우저 일반 창에서 역할별 로그인을 동시에 테스트하면 쿠키가 공유되는 것은 브라우저의 정상 동작이다. 역할별 동시 테스트는 아래처럼 분리하는 것이 안전하다.

- 세입자: Chrome 일반 창
- 관리자: Chrome 시크릿 창
- 또는 세입자/관리자를 서로 다른 브라우저에서 테스트

다만 제품 코드에서는 세션이 없거나 역할이 맞지 않는 상황을 정상적으로 처리해야 한다. 따라서 메시징 담당 영역에서는 전송 액션의 권한 오류 처리를 보강해야 한다.

## 현재 브랜치 기준 충돌 가능성

현재 `kms-massage-test` 브랜치에서 로그인/인증 핵심 파일은 app 기준으로 변경되지 않았다.

변경 없음:

- `apps/web/src/app/tenant/login/page.tsx`
- `apps/web/src/app/manager/login/page.tsx`
- `apps/web/src/app/vendor/login/page.tsx`
- `apps/web/src/app/api/auth/**`
- `apps/web/src/lib/auth-cookie.ts`
- `apps/web/src/lib/server-api.ts`

따라서 메시징 전송 오류 처리는 로그인 담당자 작업과 직접 충돌할 가능성이 낮다.

## 메시징 담당 수정 범위

권장 수정 파일:

- `apps/web/src/app/tenant/messaging/01/page.tsx`
- `apps/web/src/app/manager/messaging/04/page.tsx`
- `apps/web/property-shell.spec.mjs` 또는 관련 메시징 테스트

권장 처리:

- tenant 전송 액션
  - `ApiError 401/403` -> `/tenant/login` redirect
  - `ApiError 404` -> `/tenant/messaging/00` redirect
  - 그 외 예외 -> 기존처럼 throw

- manager 전송 액션
  - `ApiError 401/403` -> `/manager/login` redirect
  - `ApiError 404` -> `/manager/messaging/00` redirect
  - 그 외 예외 -> 기존처럼 throw

## 로그인 담당자와 조율이 필요한 경우

아래 인증 계약이 변경될 경우 메시징 쪽도 함께 맞춰야 한다.

- 인증 쿠키 이름 변경
- `/tenant/login`, `/manager/login` 경로 변경
- 역할 값 변경: `TENANT`, `LANDLORD`
- API가 `401/403` 대신 다른 상태코드를 반환하도록 변경
- 역할별 세션을 같은 브라우저에서 동시에 유지하는 구조로 변경

이 경우 메시징 전송 액션의 redirect 조건과 목적지를 새 인증 계약에 맞춰 갱신해야 한다.

## 결론

현재 현상은 "로그인 정보가 유지되지 않는다"라기보다, 같은 브라우저 세션에서 역할 토큰이 덮이거나 세션이 맞지 않는 상황에서 메시징 서버 액션이 권한 오류를 처리하지 못해 발생한다.

API는 올바른 세입자 토큰으로 정상 전송된다. 배포 환경에서도 같은 브라우저 세션 공유 조건이나 만료 세션 조건이 발생하면 동일한 에러 화면이 나올 수 있으므로, 메시징 화면의 서버 액션에서 `401/403/404` 처리 보강이 필요하다.
