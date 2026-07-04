# agent.md

로컬 작업용 에이전트 메모. 이 파일은 `.gitignore`에 포함되어 저장소에는 커밋하지 않는다.

# 배포환경 서버컴 접속

```bash
ssh rlog
```

```bash

## 로컬 개발환경 조건
- docker compose 사용한다.

## 작업 전 확인
- 공식 작업 지침은 `AGENTS.md`를 따른다.
- 미완/이월 항목은 `KNOWN-GAPS.md`를 먼저 확인한다.
- 화면/도메인 작업은 `packages/types` 공유 타입 계약을 먼저 맞춘다.

## 핵심 원칙
- 도메인 수직 슬라이스 단위로 작게 진행한다.
- 임차인/업체 화면은 `PhoneFrame`, 관리인 화면은 `ManagerShell`을 사용한다.
- 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용하고 raw hex는 쓰지 않는다.
- `packages/types`를 수정하면 `pnpm --filter @roomlog/types build`를 실행한다.

## 검증
- 기본 검증은 `bash scripts/verify.sh`.
- API 미기동 상태에서도 web은 데모 폴백으로 렌더되어야 한다.
