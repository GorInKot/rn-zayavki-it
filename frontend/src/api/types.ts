export type RequestStatus =
  | "review"
  | "clarification"
  | "accepted"
  | "development"
  | "testing"
  | "done"
  | "closed"
  | "rejected"
  | "withdrawn";

export type RequestType = "new" | "upgrade";
export type Frequency = "day" | "week" | "month" | "quarter" | "year" | "irregular";
export type DurationUnit = "minutes" | "hours" | "days";

export interface FieldError {
  path: string;
  message: string;
}

export interface User {
  id: number;
  login: string;
  full_name: string;
  email: string | null;
  department: string | null;
  is_admin: boolean;
}

export interface Me {
  user: User;
  auth_mode: "dev" | "headers" | "jwt";
  unread_notifications: number;
  applicant_defaults: { full_name: string; email: string | null; phone: string | null; department: string | null; region_id: number | null };
  dev_users: { login: string; full_name: string; is_admin: boolean }[] | null;
}

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export interface Dictionaries {
  regions: { id: number; name: string }[];
  topics: { id: number; name: string; requires_detail: boolean }[];
  statuses: Option<RequestStatus>[];
  request_types: Option<RequestType>[];
  frequencies: Option<Frequency>[];
  duration_units: Option<DurationUnit>[];
  max_upload_mb: number;
  max_files_per_request: number;
  allowed_extensions: string[];
  review_business_days: number;
}

export interface DocumentInfo {
  id: string;
  original_name: string;
  extension: string;
  size_bytes: number;
  usage: string | null;
  future_use: string | null;
  created_at: string;
}

export type EventKind = "submitted" | "status_changed" | "resubmitted" | "withdrawn" | "comment" | "assignment_changed";

export interface RequestEvent {
  id: number;
  kind: EventKind;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  comment: string | null;
  is_internal: boolean;
  actor_name: string;
  actor_role: "applicant" | "admin" | "system";
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface Sla {
  state: "ok" | "due_soon" | "overdue" | "paused" | null;
  review_due_date: string | null;
  business_days_left: number | null;
}

export interface RequestAction {
  kind: "transition" | "resubmit" | "withdraw" | "assign";
  label: string;
  to_status: RequestStatus | null;
  comment_required: boolean;
  needs_assignment: boolean;
  tone: "primary" | "secondary" | "danger";
}

export interface RequestListItem {
  id: string;
  number: string;
  status: RequestStatus;
  type: RequestType;
  title: string;
  topic_name: string;
  applicant_name: string;
  applicant_department: string;
  region_name: string;
  submitted_at: string;
  updated_at: string;
  review_due_date: string | null;
  deadline: string | null;
  responsible: string | null;
  is_unviewed: boolean;
  sla: Sla;
}

export interface RequestPage {
  items: RequestListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface RequestDetail extends RequestListItem {
  version: number;
  author_id: number;
  applicant_email: string | null;
  applicant_phone: string;
  region_id: number;
  existing_system_name: string | null;
  topic_id: number;
  topic_other: string | null;
  process: string;
  problem: string;
  desired_result: string;
  method_suggestion: string | null;
  beneficiaries: string;
  result_recipient: string;
  frequency: Frequency;
  duration: string | null;
  duration_unit: DurationUnit | null;
  times_per_period: number | null;
  employees_count: number | null;
  workload_note: string | null;
  workload_hours_month: string | null;
  first_viewed_at: string | null;
  decided_at: string | null;
  closed_at: string | null;
  documents: DocumentInfo[];
  events: RequestEvent[];
  actions: RequestAction[];
  can_comment: boolean;
}

export interface Draft<T = unknown> {
  request_id: string | null;
  data: T;
  version: number;
  updated_at: string;
  documents: DocumentInfo[];
}

export interface NotificationItem {
  id: number;
  request_id: string;
  request_number: string;
  text: string;
  created_at: string;
  read_at: string | null;
}

export interface Dashboard {
  today: string;
  total: number;
  groups: { key: string; label: string; count: number; statuses: RequestStatus[] }[];
  attention: { unviewed: number; overdue: number; due_soon: number };
  by_topic: { label: string; count: number }[];
  by_region: { label: string; count: number }[];
  by_month: { month: string; count: number }[];
  decision: { count: number; avg_business_days: number | null; on_time_share: number | null };
  workload: { active_requests: number; with_estimate: number; total_hours_month: number | null };
  missing_calendar_years: number[];
  review_business_days: number;
}

export interface CalendarDay {
  day: string;
  is_working: boolean;
  note: string | null;
}
