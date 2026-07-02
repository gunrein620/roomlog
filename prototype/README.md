# 룸로그 prototype (클릭투어 셸)

임차인·관리인·수리업체 3역할의 화면·라우팅·전이가 **클릭으로 동작하는 껍데기**입니다.
**Next.js(web) + NestJS(api) pnpm 모노레포.** 지금은 기능 스텁 · 데이터 인메모리 · 인증 없음 — 여기에 살을 붙여 진짜 제품으로 키우는 게 목표(전략 A).

## 빠른 시작
```bash
pnpm install
pnpm dev:api     # NestJS  http://localhost:4000/api
pnpm dev         # Next     http://localhost:3000   ← 홈에서 도메인별로 클릭 투어
```
`bash scripts/verify.sh` = 전체 빌드 + api 스모크 한 방 검증.

## 구조
```
apps/web        Next 16 App Router (PWA 목표) — 화면
apps/api        NestJS — 도메인별 모듈(인메모리)
packages/ui     디자인 토큰 + 공용 컴포넌트
packages/types  web·api 공유 도메인 모델
```

## 담은 것
- **임차인 7**: 홈·하자·계약·납부·메시징·입주·퇴실
- **관리인 10**: 홈/Voice·티켓·청구·소통·계약·퇴실·비용·리포트·업체관리
- **업체 1**: 수리(V-JOB)
- 화면은 기획 화면그래프에서 도출, 횡단 원칙(존엄·false-agency 금지·티켓≠수리 등) 반영.

## 더 읽기
- **`AGENTS.md`** — AI 에이전트(Codex/Claude)용 작업 가이드: 컨벤션·빌드 함정·**다음 단계 로드맵**.
- **`KNOWN-GAPS.md`** — 셸에서 이월한 항목(서버측 원칙 게이트·일부 API 배선 등) = 실물 결선 체크리스트.

## 다음 단계 (요약)
DB 영속화 → 인증/권한(D18 OTP) → 서버측 원칙 게이트 → 위험 seam(Bedrock 분석·결제·음성 정산 사가). 첫 실물 슬라이스 = 티켓/하자 권장.
