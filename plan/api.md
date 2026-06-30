# API 기본 명세서 정리

## 1. 기본 구조

이 API 명세서는 민원 접수 단위와 실제 처리 단위를 분리한다.

### complaint
임차인이 접수하고 조회하는 민원 단위.

예시 API:
- createComplaint
- getComplaintDetail
- listTenantComplaints
- addComplaintMessage
- consentVendorInfoShare

### ticket
서버, 임대인, 협력업체가 실제로 처리하는 운영 단위.

사용 범위:
- 상태 관리
- 업체 배정
- 견적 확인
- 결제
- 수리 완료 처리
- 내부 처리 이력 관리

### ID 관계

createComplaint 계열 API는 다음 두 ID를 함께 반환한다.

```json
{
  "complaintId": 3001,
  "ticketId": 5001
}
```

- complaintId: 임차인이 보는 민원 ID
- ticketId: 임대인/서버/업체가 처리하는 티켓 ID

---

## 2. 공통 응답 상태코드

| Status | 의미 | 적용 기준 |
|---|---|---|
| 200 | 성공 | 조회, 수정, 처리 성공 |
| 201 | 생성됨 | 리소스 생성, 등록, 접수 성공 |
| 202 | 접수됨 | 비동기 처리 접수 |
| 400 | 잘못된 요청 | 요청 형식 또는 파라미터 오류 |
| 401 | 인증 필요 | 토큰 없음 또는 만료 |
| 403 | 권한 없음 | 역할/소유자 불일치 |
| 404 | 없음 | 요청한 리소스 없음 |
| 409 | 충돌 | 중복, 이미 처리됨 |
| 422 | 검증 실패 | 필수값 누락, 형식 오류, OCR 실패 등 |
| 500 | 서버 오류 | 서버 내부 오류 |

공통 규칙:
- 인증이 필요한 모든 API는 토큰이 없거나 만료되면 401을 반환한다.
- 본인 계약/민원 또는 담당 건물/호실이 아닌 리소스 접근은 403을 반환한다.
- path parameter의 리소스가 존재하지 않으면 404를 반환한다.

---

# 3. 인증 API

## 3.1 signup

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | signup |
| Method | POST |
| URL | /api/auth/signup |
| 사용자 | 임차인, 임대인, 협력업체 |
| 설명 | 임대인/임차인/협력업체 공통 회원가입. role에 따라 권한이 분기된다. |
| 기타 | 비밀번호는 해시 저장, 이메일/휴대폰 중복 검사 |

### Request Body

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| email | 로그인 이메일 | string | 이메일 형식 | N | user@test.com |
| password | 비밀번호 | string | 8자 이상 | N | pw1234!! |
| name | 이름 | string | - | N | 홍길동 |
| phone | 휴대폰 번호 | string | - | N | 010-1234-5678 |
| role | 가입 역할 | string | TENANT/LANDLORD/VENDOR | N | TENANT |

### Response

```json
{
  "userId": 1001,
  "role": "TENANT"
}
```

### Status

| Status | 내용 |
|---|---|
| 201 | 회원가입 성공 |
| 409 | 이미 존재하는 이메일/휴대폰 |
| 400 | 입력값 검증 실패 |

---

## 3.2 getMyProfile

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | getMyProfile |
| Method | GET |
| URL | /api/auth/me |
| 사용자 | 임차인, 임대인, 협력업체 |
| 설명 | 로그인한 사용자 본인 정보 및 역할 조회 |
| 기타 | 역할별 접근 범위 분기 기준 정보 |

### Header

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| Authorization | 액세스 토큰 | string | Bearer | N | Bearer eyJ... |

### Response

```json
{
  "userId": 1001,
  "name": "홍길동",
  "role": "TENANT",
  "roomId": 305
}
```

### Response Field

| key | 설명 | 타입 | Nullable |
|---|---|---|---|
| userId | 사용자 ID | long | N |
| name | 이름 | string | N |
| role | 역할 | string | N |
| roomId | 연결 호실 ID, 임차인일 때 사용 | long | Y |

### Status

| Status | 내용 |
|---|---|
| 200 | 조회 성공 |
| 401 | 인증 필요 |

---

# 4. 임차인 민원 API

## 4.1 createRealtimeComplaintSession

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | createRealtimeComplaintSession |
| Method | POST |
| URL | /api/tenant/complaints/intake/sessions |
| 사용자 | 임차인 |
| 설명 | 리얼타임 민원 접수 챗봇 세션을 시작하고 sessionId를 발급 |
| 기타 | 챗봇 접수 흐름의 시작점. 이후 sendComplaintIntakeMessage, finalize의 기준 세션 |

### Header

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| Authorization | 액세스 토큰 | string | Bearer | N | Bearer eyJ... |

### Request Body

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| roomId | 대상 호실 ID, 본인 거주 호실 | long | Y | 305 |

### Response

```json
{
  "sessionId": "sess_123",
  "startedAt": "2026-06-28T14:00:00"
}
```

### Status

| Status | 내용 |
|---|---|
| 201 | 세션 생성 성공 |
| 401 | 인증 필요 |

---

## 4.2 createComplaintFromCall

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | createComplaintFromCall |
| Method | POST |
| URL | /api/tenant/complaints/from-call |
| 사용자 | 임차인 |
| 설명 | 콜봇 통화 종료 시 누적된 전사, 녹음, AI 요약, 세션 사진을 민원으로 접수하고 처리 티켓을 생성 |
| 기타 | complaintId와 ticketId를 함께 반환 |

### Request Body

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| callSessionId | 통화 세션 ID | string | N | call_789 |
| recordingUrl | 통화 녹음 파일 URL | string | Y | https://example.com/recordings/rec-001.mp3 |
| roomId | 연결 호실 ID, 미지정 시 발신번호 매핑 | long | Y | 305 |

### Response

```json
{
  "complaintId": 3020,
  "ticketId": 5020,
  "channel": "콜봇",
  "summary": "305호 화장실 천장 누수, 통화 중 사진 1장 수신",
  "needPhoto": false,
  "status": "접수"
}
```

### Status

| Status | 내용 |
|---|---|
| 201 | 민원 접수 및 처리 티켓 생성 |
| 404 | 통화 세션 없음 |

---

## 4.3 listTenantComplaints

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | listTenantComplaints |
| Method | GET |
| URL | /api/tenant/complaints |
| 사용자 | 임차인 |
| 설명 | 본인이 접수한 민원/하자 내역을 기간별로 조회 |
| 기타 | 1/3/6개월 기간 필터, 반복 민원 감지, 내부 상태를 임차인 표시 상태로 매핑 |

### Header

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| Authorization | 액세스 토큰 | string | Bearer | N | Bearer eyJ... |

### Query Parameter

| key | 설명 | 타입 | 옵션 | Nullable |
|---|---|---|---|---|
| period | 조회 기간 | string | 1m / 3m / 6m | Y |
| status | 상태 필터 | string | - | Y |

### Response

```json
{
  "complaints": [
    {
      "complaintId": 3001,
      "ticketId": 5001,
      "category": "하자",
      "status": "수리중",
      "isRepeated": false
    }
  ]
}
```

### Status

| Status | 내용 |
|---|---|
| 200 | 조회 성공 |
| 401 | 인증 필요 |

---

## 4.4 getComplaintDetail

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | getComplaintDetail |
| Method | GET |
| URL | /api/tenant/complaints/{complaintId} |
| 사용자 | 임차인 |
| 설명 | 민원별 사진, 채팅, 임대인 답변, 수리 완료 여부 상세 조회 |
| 기타 | complaint는 임차인 접수 단위이며, 내부 처리 티켓은 ticketId로 연결 |

### Path Parameter

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| complaintId | 민원 ID | long | N | 3001 |

### Response

```json
{
  "complaintId": 3001,
  "ticketId": 5001,
  "category": "하자",
  "priority": 1,
  "responsibility": "임대인 확인 필요",
  "status": "수리중"
}
```

### Response Field

| key | 설명 | 타입 | Nullable |
|---|---|---|---|
| complaintId | 민원 ID | long | N |
| ticketId | 연결 처리 티켓 ID | long | N |
| responsibility | 책임 가능성 | string | N |
| history | 처리 이력/채팅 | array | Y |

### Status

| Status | 내용 |
|---|---|
| 200 | 조회 성공 |
| 403 | 본인 민원 아님 |
| 404 | 민원 없음 |

---

# 5. 임대인/관리자 티켓 API

## 5.1 getTicketDetail

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | getTicketDetail |
| Method | GET |
| URL | /api/admin/tickets/{ticketId} |
| 사용자 | 임대인 |
| 설명 | AI 요약, 유형 분류, 긴급도, 사진 분석, 책임 가능성을 포함한 티켓 상세 조회 |
| 기타 | 임대인은 AI 결과를 그대로 확정하거나 수정 가능 |

### Path Parameter

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| ticketId | 티켓 ID | long | N | 5001 |

### Response

```json
{
  "ticketId": 5001,
  "summary": "안방 천장 누수",
  "priority": 1,
  "responsibility": "임대인 확인 필요",
  "channel": "리얼타임 챗봇",
  "photoComparison": {
    "previousPhotoId": 1201,
    "currentPhotoId": 3401,
    "comparisonStatus": "NEW_DAMAGE_POSSIBLE",
    "summary": "입주 전 사진에는 동일 증상 없음",
    "isComparable": true,
    "needRetake": false
  }
}
```

### Response Field

| key | 설명 | 타입 | Nullable |
|---|---|---|---|
| ticketId | 티켓 ID | long | N |
| summary | AI 요약 | string | N |
| priority | 긴급도 | int | N |
| responsibility | 책임 가능성 | string | N |
| channel | 접수 채널 | string | N |
| intake | 접수 자료 | object | Y |
| photoCandidates | 사진 분석 후보 | array | Y |
| photoComparison | 사진 비교 결과 | object | Y |
| status | 티켓 상태 | string | N |
| timeline | 처리 이력 타임라인 | array | Y |

### Status

| Status | 내용 |
|---|---|
| 200 | 조회 성공 |
| 404 | 티켓 없음 |

---

## 5.2 listVendors

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | listVendors |
| Method | GET |
| URL | /api/admin/vendors |
| 사용자 | 임대인 |
| 설명 | 등록된 협력업체 목록과 견적/수리 이력을 조회 |
| 기타 | 분야별 필터 지원 |

### Header

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| Authorization | 액세스 토큰 | string | Bearer | N | Bearer eyJ... |

### Query Parameter

| key | 설명 | 타입 | Nullable |
|---|---|---|---|
| field | 담당 분야 필터 | string | Y |

### Response

```json
{
  "vendors": [
    {
      "vendorId": 3001,
      "name": "행복설비",
      "field": "누수",
      "rating": 4.5
    }
  ]
}
```

### Status

| Status | 내용 |
|---|---|
| 200 | 조회 성공 |
| 401 | 인증 필요 |

---

## 5.3 assignVendorToTicket

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | assignVendorToTicket |
| Method | POST |
| URL | /api/admin/tickets/{ticketId}/assign-vendor |
| 사용자 | 임대인 |
| 설명 | 티켓을 협력업체에 배정하고 출동을 요청 |
| 기타 | 업체에는 수리에 필요한 범위만 전달. 응답의 repairId는 협력업체 수리 API에서 사용 |

### Path Parameter

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| ticketId | 티켓 ID | long | N | 5001 |

### Request Body

| key | 설명 | 타입 | 옵션 | Nullable | 예시 |
|---|---|---|---|---|---|
| vendorId | 배정할 업체 ID | long | - | N | 3001 |
| autoDispatch | 자동 출동 여부 | boolean | - | Y | false |
| costBearer | 비용 주체 | string | 미정/임대인/임차인 | Y | 미정 |
| autoPayByOwner | 긴급 시 임대인 선결제 | boolean | - | Y | true |

### Response

```json
{
  "ticketId": 5001,
  "repairId": 4501,
  "sharedScope": [
    "사진",
    "증상 요약",
    "방문 가능 시간",
    "대략적 위치"
  ]
}
```

### Status

| Status | 내용 |
|---|---|
| 201 | 배정/출동 요청 완료 |
| 401 | 인증 필요 |
| 403 | 담당 권한 없음 |
| 404 | 티켓/업체 없음 |
| 409 | 이미 배정됨 |

---

## 5.4 confirmRepairCompletion

### 기본 정보

| 항목 | 내용 |
|---|---|
| 기능명 | confirmRepairCompletion |
| Method | POST |
| URL | /api/admin/repairs/{repairId}/confirm |
| 사용자 | 임대인 |
| 설명 | 협력업체의 수리 완료 보고를 임대인이 최종 승인해 티켓을 완료 처리 |
| 기타 | 완료 시 임차인 화면에 반영 |

### Path Parameter

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| repairId | 수리 건 ID | long | N | 4801 |

### Request Body

| key | 설명 | 타입 | Nullable | 예시 |
|---|---|---|---|---|
| approved | 승인 여부 | boolean | N | true |
| comment | 확인 코멘트 | string | Y | 재방문 확인 완료 |

### Response

```json
{
  "repairId": 4801,
  "ticketStatus": "완료"
}
```

### Status

| Status | 내용 |
|---|---|
| 200 | 완료 승인 처리 |
| 401 | 인증 필요 |
| 403 | 담당 권한 없음 |
| 404 | 수리 건 없음 |
| 409 | 이미 완료 승인됨 |

---

# 6. API 설계 메모

## complaint와 ticket 분리 이유

임차인 입장에서는 “내 민원”을 보면 되고,
임대인/서버/업체 입장에서는 “처리 티켓”을 기준으로 움직여야 한다.

따라서 다음처럼 분리한다.

```text
임차인
  -> complaint 생성/조회

서버
  -> complaint 기반 ticket 자동 생성

임대인
  -> ticket 확인, 상태 변경, 업체 배정, 완료 승인

협력업체
  -> repairId 기준으로 수리 진행
```

## 주요 흐름

```text
1. 임차인이 앱/챗봇/콜봇으로 민원 접수
2. 서버가 complaintId 생성
3. 서버가 내부 처리용 ticketId 생성
4. AI가 요약, 유형, 긴급도, 책임 가능성, 사진 분석 수행
5. 임대인이 ticket 상세 확인
6. 임대인이 협력업체 배정
7. 협력업체 수리 진행
8. 협력업체 완료 보고
9. 임대인이 완료 승인
10. 임차인 화면에 완료 상태 반영
```

## 핵심 ID 정리

| ID | 의미 | 사용 주체 |
|---|---|---|
| userId | 사용자 ID | 전체 |
| roomId | 호실 ID | 임차인/임대인 |
| complaintId | 임차인 민원 ID | 임차인 |
| ticketId | 처리 티켓 ID | 서버/임대인 |
| vendorId | 협력업체 ID | 임대인 |
| repairId | 수리 건 ID | 협력업체/임대인 |

## 권한 기준

| 역할 | 가능 작업 |
|---|---|
| TENANT | 본인 민원 접수/조회 |
| LANDLORD | 담당 건물/호실의 티켓 조회, 업체 배정, 완료 승인 |
| VENDOR | 배정받은 수리 건 처리 |

## 상태 예시

```text
접수
검토
추가 정보 요청
업체 배정
견적 확인
수리 중
완료 보고
완료
재요청
```