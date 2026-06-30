# Roomlog MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하자 처리 E2E를 중심으로 세입자, 관리인, 협력업체가 하나의 백엔드와 공용 데이터 모델 위에서 작동하는 Roomlog MVP를 만든다.

**Architecture:** 백엔드는 `apps/api`의 단일 NestJS API 서버로 유지하고, 프론트엔드는 `apps/tenant`, `apps/manager`, `apps/vendor` 3개의 Next.js App Router 앱으로 분리한다. DB는 PostgreSQL + Prisma를 사용하고, 파일 저장과 AI 분석은 각각 어댑터 인터페이스 뒤에 둬서 로컬 개발과 운영 확장을 분리한다.

**Tech Stack:** pnpm workspace, Next.js App Router, React, NestJS, Prisma, PostgreSQL, JWT auth, OpenAI text analysis, local file storage with S3-compatible abstraction, Docker Compose.

---

## 1. 제품 기준과 원천 자료

### 1.1 핵심 문제

Roomlog는 임차인과 임대인이 같은 문제를 서로 다른 화면에서 처리하게 만드는 AI 주거관리 플랫폼이다. MVP는 전체 제품 중 하자 처리만 구현한다.

- 기록의 부재: 계약서, 입주 전 사진, 하자 사진, 처리 기록이 흩어져 분쟁 근거가 약하다.
- 책임 판별 불가: 임차인과 임대인 모두 누가 처리해야 하는지 명확히 판단하기 어렵다.
- 소통의 어려움: 전화, 문자, 채팅이 흩어지고 처리 상태가 누락된다.

### 1.2 MVP 사용자

- `TENANT`: 세입자. 본인 호실의 하자를 신고하고 처리 상태를 확인한다.
- `LANDLORD`: 관리인 또는 집주인. 담당 건물/호실의 티켓을 검토하고 업체를 배정한다.
- `VENDOR`: 협력업체. 관리자 초대를 통해 가입하고 배정된 수리건만 처리한다.

### 1.3 반영할 자료

- `/Users/kunwoopark/Downloads/301호_4팀_룸로그.pdf`
  - Roomlog의 문제 정의, 3자 가치 구조, AI 방향, 아키텍처 그림을 반영한다.
  - PDF의 아키텍처 방향은 Web/App Client -> NestJS API on EC2 -> PostgreSQL RDS/S3/OpenAI/Bedrock 구조다.
- `DESIGN.md`
  - UI 디자인 기준의 1순위다.
  - Calendly식 light theme, `#0b3558` navy heading, `#006bff` primary action, white surfaces, 4px button/input radius, 8px cards, product-card shadow, clean SaaS tone을 앱 UI에 적용한다.
- `plan/api.md`
  - `complaint`와 `ticket` 분리를 그대로 채택한다.
  - 임차인은 `complaintId`, 관리인/업체/서버는 `ticketId`와 `repairId`를 중심으로 처리한다.
- `plan/db.md`
  - 전체 DB 설계 중 MVP에 필요한 테이블만 Prisma 스키마로 먼저 구현한다.
- `plan/tenant.md`, `plan/renter-manager.md`
  - 하자 접수, AI 분석, 관리자 검토, 업체 배정, 완료 승인 흐름을 MVP 기준으로 축소해 반영한다.
- `/Users/kunwoopark/Downloads/룸로그 임대인 와이어프레임/`
  - `M-DASH`, `M-CALL`, `M-BILL`, `M-MSG` 구조를 참고한다.
  - MVP에서는 `M-DASH`의 티켓 처리 흐름만 본 구현 범위에 넣는다.
- `/Users/kunwoopark/Downloads/룸로그 임차인 하자 처리 와이어프레임/`
  - `T-HOME`, `T-DEF`, `T-PAY`, `T-MSG` 구조를 참고한다.
  - MVP에서는 `T-HOME`의 기본 진입, `T-DEF`의 하자 처리, 티켓 메시지만 구현한다.

### 1.4 MVP에서 제외하는 범위

아래 기능은 설계상 남겨두되 이번 구현 단계에는 넣지 않는다.

- 청구, 수금, 연체, 납부 신고, orphan 입금 매칭
- 공지/받은함/커뮤니케이션 허브
- 관리자 모바일 Voice 통화비서와 OpenAI Realtime
- VLM 사진 분석, 계약서 OCR, RAG 근거 검색, AWS Bedrock Guardrails
- 실제 PG 결제, 에스크로, 환불, 업체 송금
- 퇴실 리포트, 정산, 데이터 삭제/비식별화 운영 화면
- 다중 건물 리포트, 관리자 질의 챗봇

---

## 2. 목표 아키텍처

### 2.1 모노레포 구조

현재 `apps/web` 단일 프론트 방향을 역할별 앱 3개로 대체한다.

```text
roomlog/
├─ apps/
│  ├─ api/                 # NestJS single backend
│  ├─ tenant/              # Next.js PWA for tenants
│  ├─ manager/             # Next.js responsive web/PWA for landlords/managers
│  └─ vendor/              # Next.js PWA for repair vendors
├─ packages/
│  ├─ config/              # shared tsconfig/eslint/prettier if introduced
│  ├─ types/               # shared DTO/status/type definitions
│  └─ ui/                  # shared design tokens/components if introduced
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ uploads/                # local dev file storage, gitignored
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ plan.md
```

### 2.2 App responsibilities

`apps/tenant`:
- 세입자 회원가입/로그인
- 본인 호실 홈
- 하자 신고 작성
- 사진 업로드
- AI 분석 결과 확인
- 하자 처리 상태 조회
- 티켓 메시지와 추가 정보 제출

`apps/manager`:
- 관리인 회원가입/로그인
- 티켓 큐
- 티켓 상세와 AI 분석 검토
- 책임 가능성/긴급도 수정
- 협력업체 초대
- 티켓에 업체 배정
- 견적/일정/완료 보고 확인
- 최종 완료 승인

`apps/vendor`:
- 관리자 초대 링크 기반 가입/로그인
- 배정된 수리 목록
- 수리 상세 확인
- 견적 제출
- 방문 일정 입력
- 작업 로그/완료 사진/완료 보고 제출

`apps/api`:
- 인증, 권한, 도메인 API, 파일 저장, AI 분석, 상태 변경 기록을 단일 서버에서 처리한다.
- 모든 클라이언트는 `/api` prefix 아래 NestJS API만 호출한다.

### 2.3 Deployment direction

- Local: `pnpm dev:api`, `pnpm dev:tenant`, `pnpm dev:manager`, `pnpm dev:vendor`
- Docker local: API + 3 frontends exposed on their own ports, no nginx
- Production: ALB -> EC2 Docker Compose services + RDS PostgreSQL + S3-compatible storage later

Recommended local ports:

| App | Port |
| --- | ---: |
| API | 4000 |
| Tenant | 3001 |
| Manager | 3002 |
| Vendor | 3003 |

---

## 3. Backend domain model

### 3.1 MVP Prisma model subset

Implement only the subset required for defect E2E.

```prisma
enum UserRole {
  TENANT
  LANDLORD
  VENDOR
}

enum UserStatus {
  ACTIVE
  INVITED
  DISABLED
}

enum InviteStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}

enum ComplaintStatus {
  SUBMITTED
  REVIEWING
  ADDITIONAL_INFO_REQUESTED
  VENDOR_ASSIGNED
  REPAIR_IN_PROGRESS
  COMPLETED
  REOPENED
}

enum TicketStatus {
  RECEIVED
  REVIEWING
  ADDITIONAL_INFO_REQUESTED
  VENDOR_ASSIGNMENT_PENDING
  VENDOR_ASSIGNED
  ESTIMATE_REVIEW
  REPAIR_IN_PROGRESS
  COMPLETION_REPORTED
  COMPLETED
  REOPENED
  CANCELLED
}

enum RepairStatus {
  REQUESTED
  ACCEPTED
  ESTIMATE_SUBMITTED
  ESTIMATE_APPROVED
  SCHEDULED
  IN_PROGRESS
  COMPLETION_REPORTED
  COMPLETED
  CANCELLED
}

enum AttachmentCategory {
  COMPLAINT_PHOTO
  ADDITIONAL_PHOTO
  WORK_PHOTO
  COMPLETION_PHOTO
}

enum AiAnalysisType {
  COMPLAINT_TEXT
}

model UserAccount {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String
  phone        String?
  role         UserRole
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  tenantProfile   TenantProfile?
  landlordProfile LandlordProfile?
  vendorProfile   VendorProfile?
}

model LandlordProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  name      String
  phone     String?
  createdAt DateTime @default(now())

  user      UserAccount @relation(fields: [userId], references: [id])
  buildings Building[]
  vendorInvites VendorInvite[]
}

model TenantProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  currentRoomId String?
  name          String
  phone         String?
  createdAt     DateTime @default(now())

  user          UserAccount @relation(fields: [userId], references: [id])
  currentRoom   Room? @relation(fields: [currentRoomId], references: [id])
  complaints    Complaint[]
  tickets       Ticket[]
}

model VendorProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  businessName  String
  contactPerson String
  phone         String?
  serviceArea   String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  user          UserAccount @relation(fields: [userId], references: [id])
  repairRequests RepairRequest[]
}

model Building {
  id         String   @id @default(cuid())
  landlordId String
  name       String
  address    String
  region     String?
  createdAt  DateTime @default(now())

  landlord   LandlordProfile @relation(fields: [landlordId], references: [id])
  rooms      Room[]
}

model Room {
  id         String   @id @default(cuid())
  buildingId String
  roomNo     String
  floor      String?
  status     String   @default("OCCUPIED")
  createdAt  DateTime @default(now())

  building   Building @relation(fields: [buildingId], references: [id])
  tenants    TenantProfile[]
  complaints Complaint[]
  tickets    Ticket[]
}

model VendorInvite {
  id           String       @id @default(cuid())
  landlordId   String
  email        String
  businessName String
  inviteToken  String       @unique
  status       InviteStatus @default(PENDING)
  expiresAt    DateTime
  acceptedAt   DateTime?
  createdAt    DateTime     @default(now())

  landlord     LandlordProfile @relation(fields: [landlordId], references: [id])
}

model Complaint {
  id          String          @id @default(cuid())
  tenantId    String
  roomId      String
  title       String
  description String
  location    String
  occurredAt  DateTime?
  status      ComplaintStatus @default(SUBMITTED)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  tenant      TenantProfile @relation(fields: [tenantId], references: [id])
  room        Room @relation(fields: [roomId], references: [id])
  ticket      Ticket?
  attachments Attachment[]
  messages    TicketMessage[]
}

model Ticket {
  id                 String       @id @default(cuid())
  complaintId        String       @unique
  roomId             String
  tenantId           String
  assignedVendorId   String?
  category           String
  priority           Int
  status             TicketStatus @default(RECEIVED)
  responsibilityHint String
  aiSummary          String
  dueAt              DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  complaint          Complaint @relation(fields: [complaintId], references: [id])
  room               Room @relation(fields: [roomId], references: [id])
  tenant             TenantProfile @relation(fields: [tenantId], references: [id])
  repairRequests     RepairRequest[]
  aiAnalyses         AiAnalysis[]
  messages           TicketMessage[]
  statusHistory      TicketStatusHistory[]
}

model RepairRequest {
  id          String       @id @default(cuid())
  ticketId    String
  vendorId    String
  status      RepairStatus @default(REQUESTED)
  title       String
  description String
  estimateAmount Int?
  estimateDescription String?
  scheduledAt DateTime?
  completedAt DateTime?
  completionNote String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  ticket      Ticket @relation(fields: [ticketId], references: [id])
  vendor      VendorProfile @relation(fields: [vendorId], references: [id])
  attachments Attachment[]
}

model Attachment {
  id              String             @id @default(cuid())
  uploadedByUserId String
  complaintId     String?
  repairRequestId String?
  category        AttachmentCategory
  fileName        String
  fileUrl         String
  mimeType        String
  sizeBytes       Int
  createdAt       DateTime @default(now())

  complaint       Complaint? @relation(fields: [complaintId], references: [id])
  repairRequest   RepairRequest? @relation(fields: [repairRequestId], references: [id])
}

model AiAnalysis {
  id                 String         @id @default(cuid())
  ticketId            String
  analysisType        AiAnalysisType
  resultSummary       String
  category            String
  priority            Int
  responsibilityHint  String
  confidenceScore     Float
  rawResponseJson     Json
  createdAt           DateTime @default(now())

  ticket              Ticket @relation(fields: [ticketId], references: [id])
}

model TicketMessage {
  id          String   @id @default(cuid())
  ticketId    String
  complaintId String?
  senderUserId String
  messageText String
  createdAt   DateTime @default(now())

  ticket      Ticket @relation(fields: [ticketId], references: [id])
  complaint   Complaint? @relation(fields: [complaintId], references: [id])
}

model TicketStatusHistory {
  id          String   @id @default(cuid())
  ticketId    String
  changedByUserId String
  fromStatus  TicketStatus?
  toStatus    TicketStatus
  note        String?
  createdAt   DateTime @default(now())

  ticket      Ticket @relation(fields: [ticketId], references: [id])
}
```

### 3.2 Status display mapping

Tenant-facing complaint status:

| Internal ticket status | Tenant display |
| --- | --- |
| `RECEIVED` | 접수됨 |
| `REVIEWING` | 검토중 |
| `ADDITIONAL_INFO_REQUESTED` | 추가정보 요청 |
| `VENDOR_ASSIGNMENT_PENDING` | 처리 준비중 |
| `VENDOR_ASSIGNED` | 업체 배정 |
| `ESTIMATE_REVIEW` | 처리 준비중 |
| `REPAIR_IN_PROGRESS` | 수리중 |
| `COMPLETION_REPORTED` | 완료 확인중 |
| `COMPLETED` | 완료 |
| `REOPENED` | 재요청 |
| `CANCELLED` | 취소됨 |

Manager ticket status:

```text
RECEIVED -> REVIEWING -> ADDITIONAL_INFO_REQUESTED
REVIEWING -> VENDOR_ASSIGNMENT_PENDING -> VENDOR_ASSIGNED -> ESTIMATE_REVIEW
ESTIMATE_REVIEW -> REPAIR_IN_PROGRESS -> COMPLETION_REPORTED -> COMPLETED
COMPLETED -> REOPENED -> REVIEWING
```

Vendor repair status:

```text
REQUESTED -> ACCEPTED -> ESTIMATE_SUBMITTED -> ESTIMATE_APPROVED -> SCHEDULED
SCHEDULED -> IN_PROGRESS -> COMPLETION_REPORTED -> COMPLETED
```

### 3.3 Authorization rules

- `TENANT`
  - Can access only `TenantProfile.userId = currentUser.id`.
  - Can read only complaints where `Complaint.tenantId = currentTenant.id`.
  - Can upload only complaint/additional photos for own complaint.
- `LANDLORD`
  - Can read tickets whose `Ticket.room.building.landlord.userId = currentUser.id`.
  - Can assign vendors only to owned tickets.
  - Can approve completion only for owned repair requests.
- `VENDOR`
  - Can read only repair requests where `RepairRequest.vendor.userId = currentUser.id`.
  - Cannot read tenant contract, payment, full address, or unrelated tickets.
  - In MVP, vendor sees room label, symptom summary, uploaded defect photos, visit notes, and manager request text.

---

## 4. Backend modules

### 4.1 Module list

Create or extend these NestJS modules:

```text
apps/api/src/auth/
apps/api/src/users/
apps/api/src/properties/
apps/api/src/complaints/
apps/api/src/tickets/
apps/api/src/repairs/
apps/api/src/vendors/
apps/api/src/attachments/
apps/api/src/ai/
apps/api/src/messages/
apps/api/src/notifications/
apps/api/src/activity-log/
apps/api/src/prisma/
apps/api/src/storage/
```

### 4.2 Auth module

Responsibilities:
- Password hashing with `bcrypt` or `argon2`.
- JWT access token issuing.
- Role guard: `TENANT`, `LANDLORD`, `VENDOR`.
- `GET /api/auth/me`.
- Social login UI compatibility: return `501` or mock response for Google/Kakao endpoints only if frontend needs a callback route.

API:

```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "tenant@test.com",
  "password": "password123!",
  "name": "김민수",
  "phone": "010-0000-0000",
  "role": "TENANT"
}
```

```json
{
  "userId": "usr_...",
  "role": "TENANT",
  "accessToken": "jwt..."
}
```

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "tenant@test.com",
  "password": "password123!"
}
```

```http
GET /api/auth/me
Authorization: Bearer <token>
```

### 4.3 Complaints module

Responsibilities:
- Tenant creates complaint.
- Server creates linked ticket.
- Server calls AI text analysis after complaint text is accepted.
- Attachments are linked before or after creation.
- Tenant reads own complaint list/detail.

API:

```http
POST /api/tenant/complaints
Authorization: Bearer <tenant-token>
Content-Type: application/json

{
  "roomId": "room_302",
  "title": "천장에서 물이 떨어져요",
  "description": "어젯밤부터 안방 천장 모서리에서 물이 떨어지고 얼룩이 커지고 있어요.",
  "location": "안방 천장",
  "occurredAt": "2026-06-29T21:10:00.000Z",
  "attachmentIds": ["att_1", "att_2"]
}
```

```json
{
  "complaintId": "cmp_...",
  "ticketId": "tkt_...",
  "status": "접수됨",
  "analysis": {
    "summary": "안방 천장 누수로 보이는 신고입니다.",
    "category": "누수",
    "priority": 1,
    "responsibilityHint": "임대인 책임 가능성",
    "confidenceScore": 0.72
  }
}
```

### 4.4 Tickets module

Responsibilities:
- Manager lists and reads tickets.
- Manager edits AI-derived values.
- Manager requests additional info.
- Manager assigns vendor.
- Manager approves completion.
- Status history is recorded for every transition.

API:

```http
GET /api/manager/tickets?status=REVIEWING&priority=1
Authorization: Bearer <manager-token>
```

```http
PATCH /api/manager/tickets/:ticketId
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "category": "누수",
  "priority": 1,
  "responsibilityHint": "임대인 책임 가능성",
  "status": "REVIEWING",
  "note": "사진상 천장 얼룩이 확산 중이라 긴급 검토"
}
```

### 4.5 Vendors module

Responsibilities:
- Manager invites vendor by email/business name.
- Vendor accepts invite and creates account.
- Manager can list invited/active vendors.

API:

```http
POST /api/manager/vendors/invites
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "email": "vendor@test.com",
  "businessName": "한빛 누수설비",
  "contactPerson": "박기사",
  "serviceArea": "서울 강남구"
}
```

```json
{
  "inviteId": "vinv_...",
  "inviteUrl": "http://localhost:3003/invite/vinv_token..."
}
```

### 4.6 Repairs module

Responsibilities:
- Manager creates `RepairRequest` by assigning vendor to ticket.
- Vendor accepts/rejects assignment.
- Vendor submits estimate.
- Manager approves estimate and moves ticket to repair progress.
- Vendor submits completion report.
- Manager approves completion and completes ticket.

API:

```http
POST /api/manager/tickets/:ticketId/assign-vendor
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "vendorId": "ven_...",
  "title": "302호 천장 누수 확인",
  "description": "하자 사진과 증상 요약을 확인하고 방문 가능 시간을 제안해주세요."
}
```

```http
GET /api/vendor/repairs
Authorization: Bearer <vendor-token>
```

```http
POST /api/vendor/repairs/:repairId/estimate
Authorization: Bearer <vendor-token>
Content-Type: application/json

{
  "amount": 180000,
  "description": "누수 원인 점검 및 방수 보수",
  "scheduledAt": "2026-07-01T05:00:00.000Z"
}
```

```http
POST /api/vendor/repairs/:repairId/complete
Authorization: Bearer <vendor-token>
Content-Type: application/json

{
  "completionNote": "천장 모서리 누수 부위 방수 보수 완료",
  "attachmentIds": ["att_work_1"]
}
```

```http
POST /api/manager/repairs/:repairId/confirm
Authorization: Bearer <manager-token>
Content-Type: application/json

{
  "approved": true,
  "comment": "완료 보고와 사진 확인 완료"
}
```

### 4.7 Attachments and storage modules

Responsibilities:
- Upload image files from tenant/vendor apps.
- Store locally in dev under `/uploads`.
- Save metadata in `Attachment`.
- Return stable URL through API.
- Keep `StorageService` interface compatible with future S3 implementation.

Storage interface:

```ts
export interface StoredFile {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageService {
  saveFile(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    category: string;
  }): Promise<StoredFile>;
}
```

### 4.8 AI module

Responsibilities:
- Analyze complaint text with OpenAI.
- Return deterministic JSON shape.
- Fallback safely when OpenAI fails.
- Store raw response in `AiAnalysis.rawResponseJson`.

OpenAI analysis output contract:

```ts
export type ComplaintTextAnalysis = {
  summary: string;
  category: "하자" | "소음" | "설비" | "납부" | "계약" | "공용공간" | "기타";
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  responsibilityHint: "임대인 책임 가능성" | "임차인 책임 가능성" | "판단 어려움";
  confidenceScore: number;
  reasons: string[];
  recommendedAction: string;
};
```

Prompt rules:
- AI never states legal responsibility as final.
- Use `가능성`, `확인 필요`, `참고` wording.
- If safety keywords appear, increase priority to `1`.
- Safety keywords: `가스 냄새`, `불꽃`, `누전`, `물이 계속 샘`, `천장에서 물`, `보일러 완전 고장`, `수도 안 나옴`, `문이 안 잠김`, `침수`, `화재`.

Fallback output:

```json
{
  "summary": "접수 내용을 관리자 확인이 필요한 하자로 기록했습니다.",
  "category": "하자",
  "detailCategory": "확인 필요",
  "priority": 3,
  "responsibilityHint": "판단 어려움",
  "confidenceScore": 0,
  "reasons": ["AI 분석 실패 또는 응답 형식 오류"],
  "recommendedAction": "관리자가 내용을 확인하고 긴급도를 수정하세요."
}
```

Reference docs:
- OpenAI text generation: `https://platform.openai.com/docs/guides/text`
- OpenAI structured outputs: `https://platform.openai.com/docs/guides/structured-outputs`

---

## 5. Frontend route maps

### 5.1 `apps/tenant`

```text
/login
/signup
/
/defects
/defects/new
/defects/:complaintId
/defects/:complaintId/messages
/settings
```

Required screens:
- Login/signup:
  - Email/password fields.
  - Google/Kakao buttons visible as temporary mock buttons with "준비 중" toast.
- Home:
  - Current room summary.
  - Primary action: `새 하자 신고`.
  - Active complaint cards, max 2 visible.
- New defect:
  - Title, description, location, occurredAt.
  - Photo upload.
  - Submit button.
- Analysis result:
  - Summary, category, priority, responsibilityHint, recommendedAction.
  - Clear copy: "AI 분석은 참고용이며 최종 확인은 관리인이 진행합니다."
- Complaint detail:
  - Tenant-facing status.
  - Timeline.
  - Attachments.
  - Ticket messages.
  - Additional info request state.

### 5.2 `apps/manager`

```text
/login
/signup
/
/tickets
/tickets/:ticketId
/vendors
/vendors/invite
/repairs/:repairId
/settings
```

Required screens:
- Login/signup:
  - Manager-specific signup copy.
  - Google/Kakao mock buttons.
- Ticket dashboard:
  - Search by room/ticket/tenant.
  - Filters: all, urgent, reviewing, vendor assigned, completion reported.
  - Table columns: room, title, category, priority, responsibilityHint, ticket status, repair status, createdAt.
- Ticket detail:
  - AI summary and editable fields.
  - Complaint photos.
  - Tenant text.
  - Status timeline.
  - Primary action based on status.
  - Secondary action: vendor assignment.
- Vendor management:
  - Vendor list.
  - Invite form.
- Repair detail:
  - Estimate amount.
  - Schedule.
  - Completion note/photos.
  - Complete approval button.

### 5.3 `apps/vendor`

```text
/login
/invite/:token
/
/repairs
/repairs/:repairId
/settings
```

Required screens:
- Invite accept:
  - Shows business name and inviting manager.
  - Creates vendor account with password.
- Repair list:
  - Assigned jobs only.
  - Status badges.
- Repair detail:
  - Ticket symptom summary.
  - Shared photos.
  - Visit notes.
  - Estimate form.
  - Schedule form.
  - Completion report form.

### 5.4 Shared UI rules

- Use `DESIGN.md` tokens first.
- Use `#0b3558` for major headings and navigation identity.
- Use `#006bff` for primary CTAs and active states.
- Use white surfaces, `#f8f9fb` canvas, subtle borders, 4px button/input radius, 8px cards.
- Tenant/vendor mobile PWA screens prioritize one primary action per screen.
- Manager desktop dashboard may use dense tables but must keep primary action visible and status badges readable.

---

## 6. Implementation phases

### Phase 1: Workspace restructure

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Replace: `apps/web` with `apps/tenant`, `apps/manager`, `apps/vendor`

- [ ] Add workspace scripts:

```json
{
  "scripts": {
    "dev:tenant": "pnpm --filter tenant dev",
    "dev:manager": "pnpm --filter manager dev",
    "dev:vendor": "pnpm --filter vendor dev",
    "dev:api": "pnpm --filter api start:dev",
    "build:tenant": "pnpm --filter tenant build",
    "build:manager": "pnpm --filter manager build",
    "build:vendor": "pnpm --filter vendor build",
    "build:api": "pnpm --filter api build",
    "docker:up": "docker compose up --build",
    "docker:down": "docker compose down",
    "docker:prod": "docker compose -f docker-compose.prod.yml up -d --build"
  }
}
```

- [ ] Create each frontend as Next.js App Router TypeScript app.
- [ ] Set ports:
  - tenant: `3001`
  - manager: `3002`
  - vendor: `3003`
- [ ] Keep API at `4000`.
- [ ] Configure local Docker Compose without nginx:
  - tenant app -> `localhost:3001`
  - manager app -> `localhost:3002`
  - vendor app -> `localhost:3003`
  - NestJS API -> `localhost:4000`
- [ ] Verify:

```bash
pnpm install
pnpm build:api
pnpm build:tenant
pnpm build:manager
pnpm build:vendor
```

Expected: all builds complete without TypeScript errors.

### Phase 2: Prisma and seed data

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`

- [ ] Install Prisma dependencies in API workspace.
- [ ] Add MVP schema from section 3.1.
- [ ] Add seed users:
  - `tenant@test.com` / `password123!`
  - `manager@test.com` / `password123!`
  - `vendor@test.com` / `password123!`
- [ ] Add seed building `룸로그 빌라`, room `302호`, and one pending complaint/ticket sample.
- [ ] Verify:

```bash
pnpm --filter api prisma generate
pnpm --filter api prisma migrate dev --name init_roomlog_mvp
pnpm --filter api prisma db seed
```

Expected: Prisma client generated, migration applied, seed records present.

### Phase 3: Auth and role guards

**Files:**
- Create: `apps/api/src/auth/*`
- Create: `apps/api/src/users/*`
- Modify: `apps/api/src/app.module.ts`

- [ ] Implement signup/login/me.
- [ ] Implement JWT strategy and role guard.
- [ ] Implement profile creation based on role.
- [ ] Add vendor invite acceptance path to create `VENDOR` account.
- [ ] API tests:
  - tenant login returns tenant role.
  - manager login returns manager role.
  - vendor login returns vendor role.
  - invalid password returns `401`.

### Phase 4: Attachments and storage

**Files:**
- Create: `apps/api/src/storage/*`
- Create: `apps/api/src/attachments/*`
- Modify: `.gitignore`

- [ ] Add `/uploads` to `.gitignore`.
- [ ] Implement local storage adapter.
- [ ] Implement `POST /api/attachments`.
- [ ] Enforce image MIME types for MVP: `image/jpeg`, `image/png`, `image/webp`.
- [ ] Return `attachmentId` and `fileUrl`.
- [ ] API tests:
  - authenticated user can upload image.
  - unauthenticated upload returns `401`.
  - non-image upload returns `400`.

### Phase 5: Complaint and ticket creation

**Files:**
- Create: `apps/api/src/complaints/*`
- Create: `apps/api/src/tickets/*`
- Modify: `apps/api/src/app.module.ts`

- [ ] Implement tenant complaint create/list/detail.
- [ ] On complaint creation, create linked ticket.
- [ ] Link uploaded attachments to complaint.
- [ ] Store initial status history.
- [ ] API tests:
  - tenant creates complaint and receives both `complaintId` and `ticketId`.
  - tenant cannot list another tenant's complaints.
  - manager can see generated ticket.

### Phase 6: OpenAI text analysis adapter

**Files:**
- Create: `apps/api/src/ai/ai.module.ts`
- Create: `apps/api/src/ai/ai.service.ts`
- Create: `apps/api/src/ai/openai-complaint-analysis.adapter.ts`
- Create: `apps/api/src/ai/complaint-analysis.types.ts`
- Modify: `.env.example`

- [ ] Add `OPENAI_API_KEY` env support.
- [ ] Implement text-only complaint analysis.
- [ ] Use structured JSON response shape from section 4.8.
- [ ] Store `AiAnalysis`.
- [ ] Apply fallback result when OpenAI request fails or response does not match shape.
- [ ] Tests:
  - parser accepts valid structured output.
  - parser rejects invalid shape and returns fallback.
  - dangerous keyword raises priority to `1`.

### Phase 7: Manager ticket workflow

**Files:**
- Create: `apps/api/src/tickets/manager-tickets.controller.ts`
- Create: `apps/api/src/vendors/*`
- Create: `apps/api/src/repairs/manager-repairs.controller.ts`

- [ ] Implement manager ticket queue/detail.
- [ ] Implement ticket field update.
- [ ] Implement vendor invite/list.
- [ ] Implement assign vendor to ticket.
- [ ] Implement manager repair confirm endpoint.
- [ ] Tests:
  - manager cannot access ticket outside own building.
  - manager assignment creates repair request.
  - completion approval moves ticket to `COMPLETED` and tenant display to `완료`.

### Phase 8: Vendor repair workflow

**Files:**
- Create: `apps/api/src/repairs/vendor-repairs.controller.ts`

- [ ] Implement vendor repair list/detail.
- [ ] Implement estimate submission.
- [ ] Implement schedule update.
- [ ] Implement completion report.
- [ ] Tests:
  - vendor sees only assigned repair requests.
  - vendor cannot update another vendor's repair.
  - completion report moves repair to `COMPLETION_REPORTED`.

### Phase 9: Ticket messages

**Files:**
- Create: `apps/api/src/messages/*`

- [ ] Implement ticket-scoped message list/create.
- [ ] Allow tenant and manager messages on owned ticket.
- [ ] Allow vendor messages only on assigned repair ticket.
- [ ] Keep full inbox and broadcast notices out of MVP.
- [ ] Tests:
  - tenant message appears in manager ticket detail.
  - vendor message appears only on assigned repair.
  - unauthorized ticket message returns `403`.

### Phase 10: Frontend implementation

**Tenant app:**
- [ ] Build login/signup.
- [ ] Build home.
- [ ] Build defect creation with image upload.
- [ ] Build complaint detail and timeline.
- [ ] Build ticket messages.

**Manager app:**
- [ ] Build login/signup.
- [ ] Build ticket table.
- [ ] Build ticket detail with editable AI fields.
- [ ] Build vendor invite/list.
- [ ] Build assignment and completion approval flow.

**Vendor app:**
- [ ] Build invite acceptance.
- [ ] Build repair list/detail.
- [ ] Build estimate and completion report forms.

**Frontend verification:**

```bash
pnpm build:tenant
pnpm build:manager
pnpm build:vendor
```

Expected: all frontend builds pass.

### Phase 11: E2E verification

- [ ] Start API and 3 apps locally.
- [ ] Tenant creates complaint with photo.
- [ ] API creates complaint, ticket, AI analysis.
- [ ] Manager reviews ticket.
- [ ] Manager invites or selects vendor.
- [ ] Manager assigns vendor.
- [ ] Vendor submits estimate and schedule.
- [ ] Manager approves estimate.
- [ ] Vendor submits completion report.
- [ ] Manager confirms completion.
- [ ] Tenant sees status `완료`.
- [ ] Activity/status history shows the full chain.

---

## 7. Test plan

### 7.1 Unit tests

- Status mapping:
  - `TicketStatus.RECEIVED` -> `접수됨`
  - `TicketStatus.ESTIMATE_REVIEW` -> `처리 준비중`
  - `TicketStatus.COMPLETED` -> `완료`
- Role guards:
  - `TENANT` cannot call manager route.
  - `LANDLORD` cannot call vendor route.
  - `VENDOR` cannot call tenant route.
- AI parser:
  - valid structured JSON accepted.
  - invalid shape returns fallback.
  - safety keywords force `priority = 1`.
- Storage adapter:
  - local file save returns stable URL.
  - invalid MIME rejected.

### 7.2 API integration tests

- Tenant creates complaint and linked ticket.
- Tenant cannot access another tenant's complaint.
- Manager can access only owned building tickets.
- Vendor can access only assigned repair requests.
- Manager assignment creates `RepairRequest`.
- Vendor completion report updates repair status but does not complete ticket until manager confirmation.

### 7.3 UI smoke tests

- Tenant mobile:
  - login
  - create defect
  - upload photo
  - see AI result
  - see status timeline
- Manager desktop:
  - login
  - ticket queue
  - ticket detail
  - vendor assignment
  - completion approval
- Vendor mobile:
  - invite signup
  - repair list
  - submit estimate
  - submit completion report

### 7.4 Regression commands

```bash
pnpm build:api
pnpm build:tenant
pnpm build:manager
pnpm build:vendor
```

If test scripts are added:

```bash
pnpm --filter api test
pnpm --filter tenant test
pnpm --filter manager test
pnpm --filter vendor test
```

---

## 8. Environment variables

Root `.env.example` should include:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/roomlog
JWT_SECRET=replace-with-local-dev-secret
OPENAI_API_KEY=replace-with-openai-api-key
LOCAL_UPLOAD_DIR=uploads
PUBLIC_UPLOAD_BASE_URL=http://localhost:4000/api/files
TENANT_APP_URL=http://localhost:3001
MANAGER_APP_URL=http://localhost:3002
VENDOR_APP_URL=http://localhost:3003
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=roomlog-files
```

Production notes:
- `DATABASE_URL`, `JWT_SECRET`, and `OPENAI_API_KEY` are required.
- S3 values are optional until S3 adapter is enabled.
- Google/Kakao OAuth secrets are not required for MVP because social login is a UI placeholder.

---

## 9. Future roadmap

### Next after MVP

1. Billing and collection:
   - `BILLING`, `PAYMENT`, `PAYMENT_MATCH`, `OVERDUE_CASE`
   - Tenant `T-PAY`
   - Manager `M-BILL`
2. Messaging hub and notices:
   - Tenant `T-MSG`
   - Manager `M-MSG`
   - Broadcast notice read/confirm state
3. Manager mobile Voice:
   - `M-CALL`
   - OpenAI Realtime session/token API
   - Voice-first one-decision screens
4. Real AI expansion:
   - VLM defect photo analysis
   - Contract OCR
   - RAG responsibility evidence
   - Guardrails
5. Payment expansion:
   - PG integration
   - escrow status
   - vendor payout
   - refund/dispute state
6. Data governance:
   - masking
   - deletion request
   - audit-log UI
   - tenant-safe projection

### Non-negotiable product rules

- AI never makes final legal responsibility decisions.
- Automation never sends external messages, dispatches vendors, or approves payment without explicit user/admin action.
- Vendor sees only the minimum information needed for the repair.
- Tenant-facing copy does not expose manager-only severity labels or blame language.
- Every state transition that changes responsibility, urgency, vendor assignment, or completion is recorded in history.
