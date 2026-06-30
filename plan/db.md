Table USER_ACCOUNT {
  Note: 'USER_ACCOUNT (사용자 계정)'
  user_id int [pk]
  email varchar
  password_hash varchar
  name varchar
  phone varchar
  status varchar
  created_at timestamp
  updated_at timestamp
}

Table USER_ROLE {
  Note: 'USER_ROLE (사용자 역할)'
  user_role_id int [pk]
  user_id int
  role varchar
  created_at timestamp
}

Table AUTH_SESSION {
  Note: 'AUTH_SESSION (인증 세션)'
  session_id int [pk]
  user_id int
  refresh_token_hash varchar
  expires_at timestamp
  revoked_at timestamp
  created_at timestamp
}

Table OWNER_PROFILE {
  Note: 'OWNER_PROFILE (임대인 프로필)'
  owner_id int [pk]
  user_id int
  name varchar
  phone varchar
  created_at timestamp
}

Table ADMIN_MEMBER {
  Note: 'ADMIN_MEMBER (관리자/담당자)'
  member_id int [pk]
  owner_id int
  user_id int
  name varchar
  role varchar
  is_active boolean
  created_at timestamp
}

Table TENANT_PROFILE {
  Note: 'TENANT_PROFILE (임차인 프로필)'
  tenant_id int [pk]
  user_id int
  current_room_id int
  name varchar
  phone varchar
  invite_status varchar
  move_in_date date
  move_out_date date
  created_at timestamp
}

Table VENDOR_PROFILE {
  Note: 'VENDOR_PROFILE (협력업체 프로필)'
  vendor_id int [pk]
  user_id int
  business_name varchar
  contact_person varchar
  phone varchar
  service_area varchar
  rating decimal
  available_now boolean
  is_active boolean
  created_at timestamp
}

Table VENDOR_SPECIALTY {
  Note: 'VENDOR_SPECIALTY (업체 전문 분야)'
  specialty_id int [pk]
  vendor_id int
  category varchar
  license_no varchar
  is_active boolean
  created_at timestamp
}

Table VENDOR_BANK_INFO {
  Note: 'VENDOR_BANK_INFO (업체 계좌 정보)'
  bank_info_id int [pk]
  vendor_id int
  bank_name varchar
  account_number varchar
  account_holder varchar
  is_primary boolean
  created_at timestamp
}

Table VENDOR_DOCUMENT {
  Note: 'VENDOR_DOCUMENT (업체 서류)'
  document_id int [pk]
  vendor_id int
  doc_type varchar
  file_url varchar
  issued_at date
  expires_at date
  created_at timestamp
}

Table OWNER_VENDOR {
  Note: 'OWNER_VENDOR (임대인-업체 연결)'
  owner_vendor_id int [pk]
  owner_id int
  vendor_id int
  category varchar
  memo text
  is_active boolean
  created_at timestamp
}

Table BUILDING {
  Note: 'BUILDING (건물)'
  building_id int [pk]
  owner_id int
  name varchar
  address varchar
  building_type varchar
  region varchar
  created_at timestamp
}

Table ROOM {
  Note: 'ROOM (호실)'
  room_id int [pk]
  building_id int
  room_no varchar
  floor varchar
  area decimal
  status varchar
  created_at timestamp
}

Table ROOM_TENANT_LINK {
  Note: 'ROOM_TENANT_LINK (호실-임차인 연결)'
  link_id int [pk]
  room_id int
  tenant_id int
  linked_by int
  start_date date
  end_date date
  status varchar
  created_at timestamp
}

Table TENANT_INVITE {
  Note: 'TENANT_INVITE (임차인 초대)'
  invite_id int [pk]
  room_id int
  tenant_id int
  created_by int
  invite_token varchar
  status varchar
  expires_at timestamp
  accepted_at timestamp
  created_at timestamp
}

Table CONTRACT {
  Note: 'CONTRACT (계약)'
  contract_id int [pk]
  room_id int
  tenant_id int
  uploaded_by int
  contract_date date
  start_date date
  end_date date
  deposit_amount decimal
  monthly_rent decimal
  management_fee_amount decimal
  payment_day int
  status varchar
  file_url varchar
  created_at timestamp
}

Table CONTRACT_OCR {
  Note: 'CONTRACT_OCR (계약서 OCR)'
  ocr_id int [pk]
  contract_id int
  raw_text text
  summary_text text
  confidence_score decimal
  ocr_status varchar
  created_at timestamp
}

Table CONTRACT_CLAUSE {
  Note: 'CONTRACT_CLAUSE (계약 조항)'
  clause_id int [pk]
  contract_id int
  clause_type varchar
  clause_text text
  extracted_value varchar
  confidence_score decimal
  created_at timestamp
}

Table CONTRACT_REVIEW {
  Note: 'CONTRACT_REVIEW (계약 검토)'
  review_id int [pk]
  contract_id int
  reviewed_by int
  review_status varchar
  note text
  reviewed_at timestamp
  created_at timestamp
}

Table ATTACHMENT {
  Note: 'ATTACHMENT (첨부파일)'
  attachment_id int [pk]
  uploaded_by int
  room_id int
  tenant_id int
  file_url varchar
  file_type varchar
  category varchar
  masked_file_url varchar
  is_masked boolean
  created_at timestamp
}

Table ATTACHMENT_MASKING {
  Note: 'ATTACHMENT_MASKING (첨부파일 마스킹)'
  masking_id int [pk]
  attachment_id int
  requested_by int
  mask_type varchar
  status varchar
  result_url varchar
  created_at timestamp
}

Table CONSENT_RECORD {
  Note: 'CONSENT_RECORD (동의 기록)'
  consent_id int [pk]
  user_id int
  tenant_id int
  ticket_id int
  consent_type varchar
  scope text
  consent_status varchar
  consented_at timestamp
  created_at timestamp
}

Table COMPLAINT_INTAKE_SESSION {
  Note: 'COMPLAINT_INTAKE_SESSION (민원 접수 세션)'
  session_id int [pk]
  tenant_id int
  room_id int
  source_channel varchar
  current_status varchar
  ai_draft text
  created_at timestamp
  finalized_at timestamp
}

Table INTAKE_MESSAGE {
  Note: 'INTAKE_MESSAGE (접수 메시지)'
  intake_message_id int [pk]
  session_id int
  sender_user_id int
  message_type varchar
  message_text text
  transcript_text text
  attachment_id int
  created_at timestamp
}

Table CALL_SESSION {
  Note: 'CALL_SESSION (콜봇 통화 세션)'
  call_session_id int [pk]
  tenant_id int
  room_id int
  phone_number varchar
  status varchar
  ai_summary text
  created_at timestamp
  ended_at timestamp
}

Table CALL_TRANSCRIPT {
  Note: 'CALL_TRANSCRIPT (통화 전사)'
  transcript_id int [pk]
  call_session_id int
  speaker_type varchar
  transcript_text text
  bot_reply text
  created_at timestamp
}

Table CALL_PHOTO_REQUEST {
  Note: 'CALL_PHOTO_REQUEST (통화 사진 요청)'
  photo_request_id int [pk]
  call_session_id int
  ticket_id int
  request_url varchar
  status varchar
  created_at timestamp
}

Table COMPLAINT {
  Note: 'COMPLAINT (임차인 민원)'
  complaint_id int [pk]
  tenant_id int
  room_id int
  session_id int
  call_session_id int
  category varchar
  title varchar
  description text
  tenant_status varchar
  created_at timestamp
}

Table COMPLAINT_MESSAGE {
  Note: 'COMPLAINT_MESSAGE (민원 메시지)'
  complaint_message_id int [pk]
  complaint_id int
  sender_user_id int
  message_text text
  attachment_id int
  created_at timestamp
}

Table TICKET {
  Note: 'TICKET (처리 티켓)'
  ticket_id int [pk]
  complaint_id int
  room_id int
  tenant_id int
  assigned_member_id int
  source_channel varchar
  category varchar
  priority varchar
  status varchar
  responsibility_hint varchar
  ai_summary text
  due_at timestamp
  created_at timestamp
  updated_at timestamp
}

Table TICKET_STATUS_HISTORY {
  Note: 'TICKET_STATUS_HISTORY (티켓 상태 이력)'
  history_id int [pk]
  ticket_id int
  changed_by int
  from_status varchar
  to_status varchar
  note text
  created_at timestamp
}

Table TICKET_REPLY {
  Note: 'TICKET_REPLY (티켓 답변)'
  reply_id int [pk]
  ticket_id int
  sender_user_id int
  message_text text
  reply_type varchar
  created_at timestamp
}

Table ADDITIONAL_INFO_REQUEST {
  Note: 'ADDITIONAL_INFO_REQUEST (추가정보 요청)'
  request_info_id int [pk]
  ticket_id int
  requested_by int
  tenant_id int
  request_text text
  status varchar
  created_at timestamp
  completed_at timestamp
}

Table TICKET_OBJECTION {
  Note: 'TICKET_OBJECTION (티켓 이의제기)'
  objection_id int [pk]
  ticket_id int
  tenant_id int
  reviewed_by int
  objection_type varchar
  reason text
  status varchar
  review_note text
  created_at timestamp
  reviewed_at timestamp
}

Table DUPLICATE_TICKET_CANDIDATE {
  Note: 'DUPLICATE_TICKET_CANDIDATE (중복 티켓 후보)'
  candidate_id int [pk]
  ticket_id int
  candidate_ticket_id int
  score decimal
  reason text
  created_at timestamp
}

Table TICKET_MERGE {
  Note: 'TICKET_MERGE (티켓 병합)'
  merge_id int [pk]
  target_ticket_id int
  merged_ticket_id int
  merged_by int
  reason text
  created_at timestamp
}

Table AI_ANALYSIS {
  Note: 'AI_ANALYSIS (AI 분석)'
  analysis_id int [pk]
  ticket_id int
  complaint_id int
  contract_id int
  analysis_type varchar
  result_summary text
  urgency_score decimal
  responsibility_hint varchar
  confidence_score decimal
  created_at timestamp
}

Table DEFECT_PHOTO_ANALYSIS {
  Note: 'DEFECT_PHOTO_ANALYSIS (하자 사진 분석)'
  defect_analysis_id int [pk]
  ticket_id int
  attachment_id int
  analysis_id int
  defect_type varchar
  comparison_status varchar
  result_text text
  created_at timestamp
}

Table AI_FEEDBACK {
  Note: 'AI_FEEDBACK (AI 피드백)'
  feedback_id int [pk]
  analysis_id int
  ticket_id int
  corrected_by int
  correction_type varchar
  original_value varchar
  corrected_value varchar
  created_at timestamp
}

Table MOVE_IN_CHECKLIST {
  Note: 'MOVE_IN_CHECKLIST (입주 체크리스트)'
  checklist_id int [pk]
  room_id int
  tenant_id int
  contract_id int
  status varchar
  created_at timestamp
}

Table MOVE_IN_ITEM {
  Note: 'MOVE_IN_ITEM (입주 체크 항목)'
  item_id int [pk]
  checklist_id int
  attachment_id int
  space_name varchar
  item_name varchar
  condition_status varchar
  memo text
  recorded_at timestamp
  created_at timestamp
}

Table NOTICE {
  Note: 'NOTICE (공지)'
  notice_id int [pk]
  owner_id int
  created_by int
  title varchar
  content text
  notice_type varchar
  created_at timestamp
}

Table NOTICE_TARGET {
  Note: 'NOTICE_TARGET (공지 대상)'
  notice_target_id int [pk]
  notice_id int
  room_id int
  tenant_id int
  target_type varchar
  is_read boolean
  read_at timestamp
  created_at timestamp
}

Table NOTIFICATION {
  Note: 'NOTIFICATION (알림)'
  notification_id int [pk]
  user_id int
  room_id int
  ticket_id int
  title varchar
  content text
  is_read boolean
  created_at timestamp
}

Table TRANSLATION {
  Note: 'TRANSLATION (번역)'
  translation_id int [pk]
  notice_id int
  complaint_message_id int
  ticket_reply_id int
  vendor_message_id int
  target_language varchar
  translated_text text
  created_at timestamp
}

Table BILLING {
  Note: 'BILLING (청구)'
  billing_id int [pk]
  room_id int
  tenant_id int
  contract_id int
  billing_month varchar
  title varchar
  total_amount decimal
  due_date date
  status varchar
  created_at timestamp
}

Table BILLING_ITEM {
  Note: 'BILLING_ITEM (청구 항목)'
  billing_item_id int [pk]
  billing_id int
  item_type varchar
  description text
  amount decimal
  created_at timestamp
}

Table PAYMENT {
  Note: 'PAYMENT (납부)'
  payment_id int [pk]
  billing_id int
  tenant_id int
  room_id int
  payer_user_id int
  paid_amount decimal
  paid_at timestamp
  payment_method varchar
  pg_provider varchar
  pg_transaction_id varchar
  match_status varchar
  receipt_url varchar
  created_at timestamp
}

Table PAYMENT_MATCH {
  Note: 'PAYMENT_MATCH (입금 매칭)'
  payment_match_id int [pk]
  payment_id int
  billing_id int
  matched_by int
  match_type varchar
  status varchar
  created_at timestamp
}

Table OVERDUE_CASE {
  Note: 'OVERDUE_CASE (연체 건)'
  overdue_case_id int [pk]
  billing_id int
  tenant_id int
  room_id int
  severity varchar
  overdue_days int
  unpaid_amount decimal
  notice_sent_at timestamp
  status varchar
  created_at timestamp
}

Table EXPENSE {
  Note: 'EXPENSE (지출)'
  expense_id int [pk]
  room_id int
  ticket_id int
  repair_request_id int
  vendor_id int
  uploaded_by int
  expense_type varchar
  amount decimal
  receipt_url varchar
  ocr_status varchar
  expense_date date
  created_at timestamp
}

Table EXPENSE_RECEIPT_OCR {
  Note: 'EXPENSE_RECEIPT_OCR (지출 영수증 OCR)'
  expense_ocr_id int [pk]
  expense_id int
  raw_text text
  extracted_amount decimal
  extracted_date date
  confidence_score decimal
  created_at timestamp
}

Table MANAGEMENT_FEE_USAGE {
  Note: 'MANAGEMENT_FEE_USAGE (관리비 사용내역)'
  usage_id int [pk]
  billing_id int
  expense_id int
  category varchar
  description text
  amount decimal
  created_at timestamp
}

Table COLLECTION_SNAPSHOT {
  Note: 'COLLECTION_SNAPSHOT (수금 현황 스냅샷)'
  collection_snapshot_id int [pk]
  owner_id int
  building_id int
  period_month varchar
  target_amount decimal
  collected_amount decimal
  overdue_amount decimal
  vacancy_loss_amount decimal
  created_at timestamp
}

Table REPAIR_REQUEST {
  Note: 'REPAIR_REQUEST (수리 요청)'
  repair_request_id int [pk]
  ticket_id int
  vendor_id int
  assigned_by int
  status varchar
  dispatch_status varchar
  title varchar
  description text
  requested_at timestamp
  accepted_at timestamp
  completed_at timestamp
  created_at timestamp
}

Table REPAIR_ESTIMATE {
  Note: 'REPAIR_ESTIMATE (수리 견적)'
  estimate_id int [pk]
  repair_request_id int
  vendor_id int
  amount decimal
  description text
  valid_until timestamp
  status varchar
  created_at timestamp
}

Table REPAIR_SCHEDULE {
  Note: 'REPAIR_SCHEDULE (수리 일정)'
  schedule_id int [pk]
  repair_request_id int
  vendor_id int
  scheduled_at timestamp
  location_note varchar
  status varchar
  created_at timestamp
}

Table VISIT_SCHEDULE_RESPONSE {
  Note: 'VISIT_SCHEDULE_RESPONSE (방문 일정 응답)'
  visit_response_id int [pk]
  schedule_id int
  ticket_id int
  tenant_id int
  response_status varchar
  requested_time timestamp
  note text
  created_at timestamp
}

Table REPAIR_CONTRACT {
  Note: 'REPAIR_CONTRACT (수리 계약)'
  repair_contract_id int [pk]
  repair_request_id int
  estimate_id int
  contract_amount decimal
  start_date date
  end_date date
  status varchar
  created_at timestamp
}

Table WORK_LOG {
  Note: 'WORK_LOG (작업 로그)'
  work_log_id int [pk]
  repair_request_id int
  worker_user_id int
  work_type varchar
  description text
  duration_hour decimal
  created_at timestamp
}

Table WORK_PHOTO {
  Note: 'WORK_PHOTO (작업 사진)'
  work_photo_id int [pk]
  work_log_id int
  attachment_id int
  description text
  created_at timestamp
}

Table COMPLETION_REPORT {
  Note: 'COMPLETION_REPORT (완료 보고)'
  completion_report_id int [pk]
  repair_request_id int
  submitted_by int
  approved_by int
  result_text text
  status varchar
  completed_at timestamp
  approved_at timestamp
  created_at timestamp
}

Table TICKET_COMPLETION_CONFIRMATION {
  Note: 'TICKET_COMPLETION_CONFIRMATION (티켓 완료 확인)'
  confirmation_id int [pk]
  ticket_id int
  tenant_id int
  repair_request_id int
  status varchar
  satisfaction_score int
  note text
  created_at timestamp
}

Table VENDOR_CHAT_THREAD {
  Note: 'VENDOR_CHAT_THREAD (업체 채팅방)'
  thread_id int [pk]
  ticket_id int
  repair_request_id int
  tenant_id int
  owner_id int
  vendor_id int
  chat_status varchar
  opened_at timestamp
  closed_at timestamp
  created_at timestamp
}

Table VENDOR_CHAT_MESSAGE {
  Note: 'VENDOR_CHAT_MESSAGE (업체 채팅 메시지)'
  vendor_message_id int [pk]
  thread_id int
  sender_user_id int
  attachment_id int
  message_text text
  created_at timestamp
}

Table ESCROW_PAYMENT {
  Note: 'ESCROW_PAYMENT (에스크로 결제)'
  escrow_id int [pk]
  ticket_id int
  repair_request_id int
  estimate_id int
  payer_user_id int
  tenant_id int
  owner_id int
  vendor_id int
  payee_vendor_id int
  amount decimal
  escrow_status varchar
  held_at timestamp
  released_at timestamp
  refunded_at timestamp
  created_at timestamp
}

Table VENDOR_PAYMENT {
  Note: 'VENDOR_PAYMENT (업체 지급)'
  vendor_payment_id int [pk]
  escrow_id int
  repair_contract_id int
  repair_request_id int
  vendor_id int
  amount decimal
  paid_at timestamp
  status varchar
  created_at timestamp
}

Table VENDOR_RATING {
  Note: 'VENDOR_RATING (업체 평가)'
  rating_id int [pk]
  repair_request_id int
  vendor_id int
  tenant_id int
  owner_id int
  score int
  comment text
  created_at timestamp
}

Table MOVE_OUT_REPORT {
  Note: 'MOVE_OUT_REPORT (퇴실 리포트)'
  report_id int [pk]
  tenant_id int
  room_id int
  contract_id int
  generated_by int
  move_out_date date
  summary_text text
  created_at timestamp
}

Table SETTLEMENT_PREVIEW {
  Note: 'SETTLEMENT_PREVIEW (정산 미리보기)'
  preview_id int [pk]
  report_id int
  tenant_id int
  room_id int
  deposit_amount decimal
  unpaid_amount decimal
  repair_candidate_amount decimal
  expected_refund decimal
  created_at timestamp
}

Table DATA_DELETION_REQUEST {
  Note: 'DATA_DELETION_REQUEST (데이터 삭제 요청)'
  deletion_request_id int [pk]
  tenant_id int
  requested_by int
  reviewed_by int
  status varchar
  request_scope text
  retention_reason text
  created_at timestamp
  reviewed_at timestamp
}

Table ACTIVITY_LOG {
  Note: 'ACTIVITY_LOG (감사 로그)'
  activity_log_id int [pk]
  actor_user_id int
  room_id int
  ticket_id int
  entity_type varchar
  entity_id int
  action varchar
  before_value text
  after_value text
  created_at timestamp
}

Table PERIODIC_REPORT {
  Note: 'PERIODIC_REPORT (정기 리포트)'
  periodic_report_id int [pk]
  owner_id int
  building_id int
  period_type varchar
  period_start date
  period_end date
  report_url varchar
  summary_text text
  created_at timestamp
}

Table ROOM_REPORT {
  Note: 'ROOM_REPORT (호실 리포트)'
  room_report_id int [pk]
  room_id int
  tenant_id int
  generated_by int
  report_type varchar
  report_url varchar
  created_at timestamp
}

Table IMPORT_BATCH {
  Note: 'IMPORT_BATCH (일괄 가져오기)'
  import_batch_id int [pk]
  owner_id int
  uploaded_by int
  source_type varchar
  status varchar
  total_rows int
  success_rows int
  error_rows int
  created_at timestamp
}

Table ASSISTANT_QUERY_LOG {
  Note: 'ASSISTANT_QUERY_LOG (관리자 챗봇 질의 로그)'
  assistant_query_id int [pk]
  owner_id int
  user_id int
  query_text text
  result_text text
  created_at timestamp
}

// Relationships
Ref: USER_ROLE.user_id > USER_ACCOUNT.user_id
Ref: AUTH_SESSION.user_id > USER_ACCOUNT.user_id
Ref: OWNER_PROFILE.user_id > USER_ACCOUNT.user_id
Ref: ADMIN_MEMBER.owner_id > OWNER_PROFILE.owner_id
Ref: ADMIN_MEMBER.user_id > USER_ACCOUNT.user_id
Ref: TENANT_PROFILE.user_id > USER_ACCOUNT.user_id
Ref: TENANT_PROFILE.current_room_id > ROOM.room_id
Ref: VENDOR_PROFILE.user_id > USER_ACCOUNT.user_id
Ref: VENDOR_SPECIALTY.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_BANK_INFO.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_DOCUMENT.vendor_id > VENDOR_PROFILE.vendor_id
Ref: OWNER_VENDOR.owner_id > OWNER_PROFILE.owner_id
Ref: OWNER_VENDOR.vendor_id > VENDOR_PROFILE.vendor_id
Ref: BUILDING.owner_id > OWNER_PROFILE.owner_id
Ref: ROOM.building_id > BUILDING.building_id
Ref: ROOM_TENANT_LINK.room_id > ROOM.room_id
Ref: ROOM_TENANT_LINK.tenant_id > TENANT_PROFILE.tenant_id
Ref: ROOM_TENANT_LINK.linked_by > USER_ACCOUNT.user_id
Ref: TENANT_INVITE.room_id > ROOM.room_id
Ref: TENANT_INVITE.tenant_id > TENANT_PROFILE.tenant_id
Ref: TENANT_INVITE.created_by > USER_ACCOUNT.user_id
Ref: CONTRACT.room_id > ROOM.room_id
Ref: CONTRACT.tenant_id > TENANT_PROFILE.tenant_id
Ref: CONTRACT.uploaded_by > USER_ACCOUNT.user_id
Ref: CONTRACT_OCR.contract_id > CONTRACT.contract_id
Ref: CONTRACT_CLAUSE.contract_id > CONTRACT.contract_id
Ref: CONTRACT_REVIEW.contract_id > CONTRACT.contract_id
Ref: CONTRACT_REVIEW.reviewed_by > USER_ACCOUNT.user_id
Ref: ATTACHMENT.uploaded_by > USER_ACCOUNT.user_id
Ref: ATTACHMENT.room_id > ROOM.room_id
Ref: ATTACHMENT.tenant_id > TENANT_PROFILE.tenant_id
Ref: ATTACHMENT_MASKING.attachment_id > ATTACHMENT.attachment_id
Ref: ATTACHMENT_MASKING.requested_by > USER_ACCOUNT.user_id
Ref: CONSENT_RECORD.user_id > USER_ACCOUNT.user_id
Ref: CONSENT_RECORD.tenant_id > TENANT_PROFILE.tenant_id
Ref: CONSENT_RECORD.ticket_id > TICKET.ticket_id
Ref: COMPLAINT_INTAKE_SESSION.tenant_id > TENANT_PROFILE.tenant_id
Ref: COMPLAINT_INTAKE_SESSION.room_id > ROOM.room_id
Ref: INTAKE_MESSAGE.session_id > COMPLAINT_INTAKE_SESSION.session_id
Ref: INTAKE_MESSAGE.sender_user_id > USER_ACCOUNT.user_id
Ref: INTAKE_MESSAGE.attachment_id > ATTACHMENT.attachment_id
Ref: CALL_SESSION.tenant_id > TENANT_PROFILE.tenant_id
Ref: CALL_SESSION.room_id > ROOM.room_id
Ref: CALL_TRANSCRIPT.call_session_id > CALL_SESSION.call_session_id
Ref: CALL_PHOTO_REQUEST.call_session_id > CALL_SESSION.call_session_id
Ref: CALL_PHOTO_REQUEST.ticket_id > TICKET.ticket_id
Ref: COMPLAINT.tenant_id > TENANT_PROFILE.tenant_id
Ref: COMPLAINT.room_id > ROOM.room_id
Ref: COMPLAINT.session_id > COMPLAINT_INTAKE_SESSION.session_id
Ref: COMPLAINT.call_session_id > CALL_SESSION.call_session_id
Ref: COMPLAINT_MESSAGE.complaint_id > COMPLAINT.complaint_id
Ref: COMPLAINT_MESSAGE.sender_user_id > USER_ACCOUNT.user_id
Ref: COMPLAINT_MESSAGE.attachment_id > ATTACHMENT.attachment_id
Ref: TICKET.complaint_id > COMPLAINT.complaint_id
Ref: TICKET.room_id > ROOM.room_id
Ref: TICKET.tenant_id > TENANT_PROFILE.tenant_id
Ref: TICKET.assigned_member_id > ADMIN_MEMBER.member_id
Ref: TICKET_STATUS_HISTORY.ticket_id > TICKET.ticket_id
Ref: TICKET_STATUS_HISTORY.changed_by > USER_ACCOUNT.user_id
Ref: TICKET_REPLY.ticket_id > TICKET.ticket_id
Ref: TICKET_REPLY.sender_user_id > USER_ACCOUNT.user_id
Ref: ADDITIONAL_INFO_REQUEST.ticket_id > TICKET.ticket_id
Ref: ADDITIONAL_INFO_REQUEST.requested_by > USER_ACCOUNT.user_id
Ref: ADDITIONAL_INFO_REQUEST.tenant_id > TENANT_PROFILE.tenant_id
Ref: TICKET_OBJECTION.ticket_id > TICKET.ticket_id
Ref: TICKET_OBJECTION.tenant_id > TENANT_PROFILE.tenant_id
Ref: TICKET_OBJECTION.reviewed_by > USER_ACCOUNT.user_id
Ref: DUPLICATE_TICKET_CANDIDATE.ticket_id > TICKET.ticket_id
Ref: DUPLICATE_TICKET_CANDIDATE.candidate_ticket_id > TICKET.ticket_id
Ref: TICKET_MERGE.target_ticket_id > TICKET.ticket_id
Ref: TICKET_MERGE.merged_ticket_id > TICKET.ticket_id
Ref: TICKET_MERGE.merged_by > USER_ACCOUNT.user_id
Ref: AI_ANALYSIS.ticket_id > TICKET.ticket_id
Ref: AI_ANALYSIS.complaint_id > COMPLAINT.complaint_id
Ref: AI_ANALYSIS.contract_id > CONTRACT.contract_id
Ref: DEFECT_PHOTO_ANALYSIS.ticket_id > TICKET.ticket_id
Ref: DEFECT_PHOTO_ANALYSIS.attachment_id > ATTACHMENT.attachment_id
Ref: DEFECT_PHOTO_ANALYSIS.analysis_id > AI_ANALYSIS.analysis_id
Ref: AI_FEEDBACK.analysis_id > AI_ANALYSIS.analysis_id
Ref: AI_FEEDBACK.ticket_id > TICKET.ticket_id
Ref: AI_FEEDBACK.corrected_by > USER_ACCOUNT.user_id
Ref: MOVE_IN_CHECKLIST.room_id > ROOM.room_id
Ref: MOVE_IN_CHECKLIST.tenant_id > TENANT_PROFILE.tenant_id
Ref: MOVE_IN_CHECKLIST.contract_id > CONTRACT.contract_id
Ref: MOVE_IN_ITEM.checklist_id > MOVE_IN_CHECKLIST.checklist_id
Ref: MOVE_IN_ITEM.attachment_id > ATTACHMENT.attachment_id
Ref: NOTICE.owner_id > OWNER_PROFILE.owner_id
Ref: NOTICE.created_by > USER_ACCOUNT.user_id
Ref: NOTICE_TARGET.notice_id > NOTICE.notice_id
Ref: NOTICE_TARGET.room_id > ROOM.room_id
Ref: NOTICE_TARGET.tenant_id > TENANT_PROFILE.tenant_id
Ref: NOTIFICATION.user_id > USER_ACCOUNT.user_id
Ref: NOTIFICATION.room_id > ROOM.room_id
Ref: NOTIFICATION.ticket_id > TICKET.ticket_id
Ref: TRANSLATION.notice_id > NOTICE.notice_id
Ref: TRANSLATION.complaint_message_id > COMPLAINT_MESSAGE.complaint_message_id
Ref: TRANSLATION.ticket_reply_id > TICKET_REPLY.reply_id
Ref: TRANSLATION.vendor_message_id > VENDOR_CHAT_MESSAGE.vendor_message_id
Ref: BILLING.room_id > ROOM.room_id
Ref: BILLING.tenant_id > TENANT_PROFILE.tenant_id
Ref: BILLING.contract_id > CONTRACT.contract_id
Ref: BILLING_ITEM.billing_id > BILLING.billing_id
Ref: PAYMENT.billing_id > BILLING.billing_id
Ref: PAYMENT.tenant_id > TENANT_PROFILE.tenant_id
Ref: PAYMENT.room_id > ROOM.room_id
Ref: PAYMENT.payer_user_id > USER_ACCOUNT.user_id
Ref: PAYMENT_MATCH.payment_id > PAYMENT.payment_id
Ref: PAYMENT_MATCH.billing_id > BILLING.billing_id
Ref: PAYMENT_MATCH.matched_by > USER_ACCOUNT.user_id
Ref: OVERDUE_CASE.billing_id > BILLING.billing_id
Ref: OVERDUE_CASE.tenant_id > TENANT_PROFILE.tenant_id
Ref: OVERDUE_CASE.room_id > ROOM.room_id
Ref: EXPENSE.room_id > ROOM.room_id
Ref: EXPENSE.ticket_id > TICKET.ticket_id
Ref: EXPENSE.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: EXPENSE.vendor_id > VENDOR_PROFILE.vendor_id
Ref: EXPENSE.uploaded_by > USER_ACCOUNT.user_id
Ref: EXPENSE_RECEIPT_OCR.expense_id > EXPENSE.expense_id
Ref: MANAGEMENT_FEE_USAGE.billing_id > BILLING.billing_id
Ref: MANAGEMENT_FEE_USAGE.expense_id > EXPENSE.expense_id
Ref: COLLECTION_SNAPSHOT.owner_id > OWNER_PROFILE.owner_id
Ref: COLLECTION_SNAPSHOT.building_id > BUILDING.building_id
Ref: REPAIR_REQUEST.ticket_id > TICKET.ticket_id
Ref: REPAIR_REQUEST.vendor_id > VENDOR_PROFILE.vendor_id
Ref: REPAIR_REQUEST.assigned_by > USER_ACCOUNT.user_id
Ref: REPAIR_ESTIMATE.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: REPAIR_ESTIMATE.vendor_id > VENDOR_PROFILE.vendor_id
Ref: REPAIR_SCHEDULE.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: REPAIR_SCHEDULE.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VISIT_SCHEDULE_RESPONSE.schedule_id > REPAIR_SCHEDULE.schedule_id
Ref: VISIT_SCHEDULE_RESPONSE.ticket_id > TICKET.ticket_id
Ref: VISIT_SCHEDULE_RESPONSE.tenant_id > TENANT_PROFILE.tenant_id
Ref: REPAIR_CONTRACT.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: REPAIR_CONTRACT.estimate_id > REPAIR_ESTIMATE.estimate_id
Ref: WORK_LOG.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: WORK_LOG.worker_user_id > USER_ACCOUNT.user_id
Ref: WORK_PHOTO.work_log_id > WORK_LOG.work_log_id
Ref: WORK_PHOTO.attachment_id > ATTACHMENT.attachment_id
Ref: COMPLETION_REPORT.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: COMPLETION_REPORT.submitted_by > USER_ACCOUNT.user_id
Ref: COMPLETION_REPORT.approved_by > USER_ACCOUNT.user_id
Ref: TICKET_COMPLETION_CONFIRMATION.ticket_id > TICKET.ticket_id
Ref: TICKET_COMPLETION_CONFIRMATION.tenant_id > TENANT_PROFILE.tenant_id
Ref: TICKET_COMPLETION_CONFIRMATION.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: VENDOR_CHAT_THREAD.ticket_id > TICKET.ticket_id
Ref: VENDOR_CHAT_THREAD.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: VENDOR_CHAT_THREAD.tenant_id > TENANT_PROFILE.tenant_id
Ref: VENDOR_CHAT_THREAD.owner_id > OWNER_PROFILE.owner_id
Ref: VENDOR_CHAT_THREAD.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_CHAT_MESSAGE.thread_id > VENDOR_CHAT_THREAD.thread_id
Ref: VENDOR_CHAT_MESSAGE.sender_user_id > USER_ACCOUNT.user_id
Ref: VENDOR_CHAT_MESSAGE.attachment_id > ATTACHMENT.attachment_id
Ref: ESCROW_PAYMENT.ticket_id > TICKET.ticket_id
Ref: ESCROW_PAYMENT.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: ESCROW_PAYMENT.estimate_id > REPAIR_ESTIMATE.estimate_id
Ref: ESCROW_PAYMENT.payer_user_id > USER_ACCOUNT.user_id
Ref: ESCROW_PAYMENT.tenant_id > TENANT_PROFILE.tenant_id
Ref: ESCROW_PAYMENT.owner_id > OWNER_PROFILE.owner_id
Ref: ESCROW_PAYMENT.vendor_id > VENDOR_PROFILE.vendor_id
Ref: ESCROW_PAYMENT.payee_vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_PAYMENT.escrow_id > ESCROW_PAYMENT.escrow_id
Ref: VENDOR_PAYMENT.repair_contract_id > REPAIR_CONTRACT.repair_contract_id
Ref: VENDOR_PAYMENT.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: VENDOR_PAYMENT.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_RATING.repair_request_id > REPAIR_REQUEST.repair_request_id
Ref: VENDOR_RATING.vendor_id > VENDOR_PROFILE.vendor_id
Ref: VENDOR_RATING.tenant_id > TENANT_PROFILE.tenant_id
Ref: VENDOR_RATING.owner_id > OWNER_PROFILE.owner_id
Ref: MOVE_OUT_REPORT.tenant_id > TENANT_PROFILE.tenant_id
Ref: MOVE_OUT_REPORT.room_id > ROOM.room_id
Ref: MOVE_OUT_REPORT.contract_id > CONTRACT.contract_id
Ref: MOVE_OUT_REPORT.generated_by > USER_ACCOUNT.user_id
Ref: SETTLEMENT_PREVIEW.report_id > MOVE_OUT_REPORT.report_id
Ref: SETTLEMENT_PREVIEW.tenant_id > TENANT_PROFILE.tenant_id
Ref: SETTLEMENT_PREVIEW.room_id > ROOM.room_id
Ref: DATA_DELETION_REQUEST.tenant_id > TENANT_PROFILE.tenant_id
Ref: DATA_DELETION_REQUEST.requested_by > USER_ACCOUNT.user_id
Ref: DATA_DELETION_REQUEST.reviewed_by > USER_ACCOUNT.user_id
Ref: ACTIVITY_LOG.actor_user_id > USER_ACCOUNT.user_id
Ref: ACTIVITY_LOG.room_id > ROOM.room_id
Ref: ACTIVITY_LOG.ticket_id > TICKET.ticket_id
Ref: PERIODIC_REPORT.owner_id > OWNER_PROFILE.owner_id
Ref: PERIODIC_REPORT.building_id > BUILDING.building_id
Ref: ROOM_REPORT.room_id > ROOM.room_id
Ref: ROOM_REPORT.tenant_id > TENANT_PROFILE.tenant_id
Ref: ROOM_REPORT.generated_by > USER_ACCOUNT.user_id
Ref: IMPORT_BATCH.owner_id > OWNER_PROFILE.owner_id
Ref: IMPORT_BATCH.uploaded_by > USER_ACCOUNT.user_id
Ref: ASSISTANT_QUERY_LOG.owner_id > OWNER_PROFILE.owner_id
Ref: ASSISTANT_QUERY_LOG.user_id > USER_ACCOUNT.user_id
