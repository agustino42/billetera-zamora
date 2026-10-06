/**
 * Tipos del esquema PostgreSQL de ZAMORA (supabase/migrations).
 * Reflejan exactamente lo definido en 0002_schema.sql.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Role = "student" | "teacher" | "admin";
export type ProfileStatus = "pending" | "active" | "suspended";
export type GradeType = "exam" | "quiz" | "assignment" | "practice" | "other";
export type AttendanceStatus = "present" | "absent" | "late" | "justified";
export type GradeStatus = "active" | "voided";
export type DisputeStatus =
  | "open"
  | "in_review"
  | "resolved_upheld"
  | "resolved_corrected"
  | "rejected"
  | "closed";
export type TransactionType = "earn" | "redeem" | "adjust";
export type SyncStatus = "queued" | "syncing" | "synced" | "failed" | "cancelled";
export type AuditAlg = "hmac-sha256" | "ed25519";

export type RateTableRules = {
  version: string;
  sem_per_uc: number;
  factor_by_grade_type: Record<GradeType, number>;
  zam_ratio_over_sem: number;
  rounding: "floor";
  attendance_points: Record<AttendanceStatus, number>;
  caps: { zam_per_period: number; sem_per_period: number };
  redemption_currency: "zam" | "sem";
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: ProfileStatus;
  career: string | null;
  campus: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Roster = {
  id: string;
  profile_id: string;
  career: string;
  campus: string;
  active: boolean;
  activation_code_hash: string | null;
  activation_expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Subject = {
  id: string;
  code: string;
  name: string;
  teacher_id: string | null;
  uc: number;
  period: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Enrollment = {
  id: string;
  subject_id: string;
  student_id: string;
  enrolled_at: string;
  active: boolean;
};

export type Grade = {
  id: string;
  subject_id: string;
  student_id: string;
  teacher_id: string;
  type: GradeType;
  value: number;
  max_value: number;
  normalized: number;
  period: string;
  status: GradeStatus;
  corrects_grade_id: string | null;
  verified: boolean;
  note: string | null;
  registered_at: string;
  created_by: string;
  client_event_id: string;
};

export type Attendance = {
  id: string;
  subject_id: string;
  session_date: string;
  student_id: string;
  teacher_id: string;
  status: AttendanceStatus;
  note: string | null;
  registered_at: string;
  created_by: string;
  client_event_id: string;
};

export type GradeDispute = {
  id: string;
  grade_id: string;
  student_id: string;
  teacher_id: string;
  reason: string;
  evidence: string | null;
  status: DisputeStatus;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RateTable = {
  id: string;
  name: string;
  version: string;
  effective_from: string;
  effective_to: string | null;
  rules: RateTableRules;
  active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Balance = {
  profile_id: string;
  zam: number;
  sem: number;
  updated_at: string;
};

export type Transaction = {
  id: string;
  profile_id: string;
  type: TransactionType;
  amount_zam: number;
  amount_sem: number;
  ref_type: "grade" | "attendance" | "adjustment" | "redemption" | "dispute" | null;
  ref_id: string | null;
  period: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  client_event_id: string;
};

export type Reward = {
  id: string;
  name: string;
  description: string | null;
  cost_zam: number;
  stock: number | null;
  stock_type: "unlimited" | "limited";
  active: boolean;
  requires_approval: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Redemption = {
  id: string;
  student_id: string;
  reward_id: string;
  cost_zam: number;
  status: "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  fulfilled_at: string | null;
  created_at: string;
  client_event_id: string;
};

export type TeacherReputation = {
  teacher_id: string;
  visibility: number;
  punctuality: number;
  coverage: number;
  continuity: number;
  availability: number;
  total: number;
  updated_by: string | null;
  updated_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  author_id: string;
  target: "all" | "students" | "teachers" | "admins";
  status: "draft" | "published" | "archived";
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityPost = {
  id: string;
  author_id: string;
  title: string | null;
  body: string;
  status: "published" | "pending" | "blocked" | "removed";
  moderated_by: string | null;
  moderated_at: string | null;
  moderation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditEntry = {
  id: number;
  seq: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Json;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  signature: string;
  alg: AuditAlg;
  signed_at: string;
  created_at: string;
};

export type PendingSyncRow = {
  id: string;
  user_id: string;
  type: "grade" | "attendance";
  payload: Json;
  status: SyncStatus;
  retries: number;
  max_retries: number;
  last_attempt_at: string | null;
  error: string | null;
  client_event_id: string;
  created_at: string;
  updated_at: string;
};

export type SyncReceipt = {
  id: string;
  client_event_id: string;
  user_id: string | null;
  event_type: "grade" | "attendance" | "adjustment" | "redemption";
  entity_id: string | null;
  applied_at: string;
  transaction_id: string | null;
  ledger_id: number | null;
  ok: boolean;
};

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
};

/** Respuesta común de los RPC de aplicación de eventos. */
export type ApplyEventResult = {
  ok: boolean;
  deduped: boolean;
  kind: "grade" | "attendance" | "adjustment";
  grade_id?: string;
  attendance_id?: string;
  transaction_id?: string | null;
  ledger_id?: number | null;
  sem?: number;
  zam?: number;
  normalized?: number;
  period?: string;
  balance_after?: { zam: number; sem: number };
  applied_at: string;
};

export type ChainVerificationRow = {
  seq: number;
  payload_ok: boolean;
  chain_ok: boolean;
  signature_ok: boolean;
  prev_ok: boolean;
  ok: boolean;
  detail: string;
};
