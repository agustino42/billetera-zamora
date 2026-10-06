import type {
  Announcement,
  Attendance,
  AttendanceStatus,
  AuditEntry,
  Balance,
  CommunityPost,
  Enrollment,
  Grade,
  GradeDispute,
  GradeStatus,
  GradeType,
  Json,
  PendingSyncRow,
  Profile,
  ProfileStatus,
  RateTable,
  Redemption,
  Reward,
  Role,
  Subject,
  SyncReceipt,
  SyncStatus,
  TeacherReputation,
  Transaction,
  TransactionType,
  ApplyEventResult,
  ChainVerificationRow,
} from "./domain";

/**
 * Definición de tabla para el cliente de Supabase.
 * `Insert` exige `R` (claves obligatorias) y admite el resto como opcional.
 */
type Def<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

/** Igual que `Insert` pero excluye columnas generadas por Postgres. */
type InsertWithout<Row, R extends keyof Row, G extends keyof Row = never> = Pick<
  Row,
  R
> &
  Partial<Omit<Row, R | G>>;

type Tables = {
  profiles: Def<
    Profile,
    InsertWithout<Profile, "id" | "email" | "full_name", "created_at" | "updated_at">
  >;
  rosters: Def<
    import("./domain").Roster,
    InsertWithout<
      import("./domain").Roster,
      "profile_id" | "career",
      "id" | "created_at" | "updated_at"
    >
  >;
  subjects: Def<Subject, InsertWithout<Subject, "code" | "name", "id" | "created_at" | "updated_at">>;
  enrollments: Def<Enrollment, InsertWithout<Enrollment, "subject_id" | "student_id", "id" | "enrolled_at">>;
  grades: Def<
    Grade,
    InsertWithout<
      Grade,
      "subject_id" | "student_id" | "type" | "value" | "max_value" | "period" | "created_by" | "client_event_id",
      "id" | "normalized" | "registered_at"
    >
  >;
  attendance: Def<
    Attendance,
    InsertWithout<
      Attendance,
      "subject_id" | "session_date" | "student_id" | "teacher_id" | "status" | "created_by" | "client_event_id",
      "id" | "registered_at"
    >
  >;
  grade_disputes: Def<
    GradeDispute,
    InsertWithout<
      GradeDispute,
      "grade_id" | "student_id" | "teacher_id" | "reason",
      "id" | "created_at" | "updated_at" | "status"
    >
  >;
  rate_tables: Def<
    RateTable,
    InsertWithout<RateTable, "name" | "version" | "effective_from" | "rules", "id" | "created_at" | "updated_at">
  >;
  balances: Def<Balance, InsertWithout<Balance, "profile_id", "updated_at">>;
  transactions: Def<
    Transaction,
    InsertWithout<
      Transaction,
      "profile_id" | "type" | "client_event_id",
      "id" | "created_at"
    >
  >;
  reward_catalog: Def<
    Reward,
    InsertWithout<Reward, "name" | "cost_zam", "id" | "created_at" | "updated_at">
  >;
  redemptions: Def<
    Redemption,
    InsertWithout<Redemption, "student_id" | "reward_id" | "cost_zam" | "client_event_id", "id" | "created_at">
  >;
  teacher_reputation: Def<
    TeacherReputation,
    InsertWithout<TeacherReputation, "teacher_id", "total" | "updated_at">
  >;
  announcements: Def<
    Announcement,
    InsertWithout<Announcement, "title" | "body" | "author_id", "id" | "created_at" | "updated_at">
  >;
  community_posts: Def<
    CommunityPost,
    InsertWithout<CommunityPost, "author_id" | "body", "id" | "created_at" | "updated_at">
  >;
  audit_ledger: Def<AuditEntry, never>;
  pending_sync: Def<
    PendingSyncRow,
    InsertWithout<
      PendingSyncRow,
      "user_id" | "type" | "payload" | "client_event_id",
      "id" | "created_at" | "updated_at" | "max_retries"
    >
  >;
  sync_receipts: Def<SyncReceipt, never>;
  feature_flags: Def<
    import("./domain").FeatureFlag,
    InsertWithout<import("./domain").FeatureFlag, "key", "updated_at">
  >;
};

type Functions = {
  compute_earn: {
    Args: {
      p_rules: Json;
      p_uc: number;
      p_grade_type: GradeType;
      p_normalized: number;
    };
    Returns: { sem: number; zam: number }[];
  };
  apply_grade_event: {
    Args: {
      p_client_event_id: string;
      p_subject_id: string;
      p_student_id: string;
      p_grade_type: GradeType;
      p_value: number;
      p_max_value?: number;
      p_registered_at?: string | null;
      p_note?: string | null;
    };
    Returns: ApplyEventResult;
  };
  apply_attendance_event: {
    Args: {
      p_client_event_id: string;
      p_subject_id: string;
      p_student_id: string;
      p_session_date: string;
      p_status: AttendanceStatus;
      p_note?: string | null;
      p_registered_at?: string | null;
    };
    Returns: ApplyEventResult;
  };
  apply_adjustment_event: {
    Args: {
      p_client_event_id: string;
      p_profile_id: string;
      p_amount_zam: number;
      p_amount_sem: number;
      p_ref_type: "grade" | "attendance" | "adjustment" | "redemption" | "dispute";
      p_ref_id?: string | null;
      p_reason: string;
    };
    Returns: ApplyEventResult;
  };
  append_audit: {
    Args: {
      p_actor_id: string;
      p_action: string;
      p_entity: string;
      p_entity_id?: string;
      p_payload: Json;
    };
    Returns: number;
  };
  activate_account: {
    Args: { p_code: string };
    Returns: {
      ok: boolean;
      career: string;
      campus: string;
      ledger_id: number;
      activated_at: string;
    };
  };
  issue_activation_code: {
    Args: { p_email: string };
    Returns: string;
  };
  open_grade_dispute: {
    Args: { p_grade_id: string; p_reason: string; p_evidence?: string | null };
    Returns: {
      ok: boolean;
      dispute_id: string;
      teacher_id: string;
      ledger_id: number;
      created_at: string;
    };
  };
  resolve_grade_dispute: {
    Args: { p_dispute_id: string; p_status: string; p_resolution: string };
    Returns: { ok: boolean; dispute_id: string; ledger_id: number; resolved_at: string };
  };
  redeem_reward: {
    Args: { p_reward_id: string; p_client_event_id: string };
    Returns: {
      ok: boolean;
      deduped: boolean;
      kind: "redemption";
      redemption_id: string;
      transaction_id: string;
      status: string;
      cost_zam: number;
      balance_after: { zam: number };
      ledger_id: number;
      applied_at: string;
    };
  };
  settle_redemption: {
    Args: { p_redemption_id: string; p_action: string; p_reason?: string | null };
    Returns: {
      ok: boolean;
      redemption_id: string;
      action: string;
      ledger_id: number;
    };
  };
  moderate_community_post: {
    Args: { p_post_id: string; p_action: string; p_reason?: string | null };
    Returns: {
      ok: boolean;
      post_id: string;
      status: string;
      moderated_by: string;
      ledger_id: number;
    };
  };
  save_announcement: {
    Args: {
      p_id: string | null;
      p_title: string;
      p_body: string;
      p_target: string;
      p_status: string;
      p_expires_at?: string | null;
    };
    Returns: string;
  };
  verify_audit_chain: {
    Args: { p_from?: number; p_to?: number };
    Returns: ChainVerificationRow[];
  };
};

export type Database = {
  public: {
    Tables: Tables;
    Views: Record<never, never>;
    Functions: Functions;
    Enums: {
      role: Role;
      profile_status: ProfileStatus;
      grade_type: GradeType;
      grade_status: GradeStatus;
      attendance_status: AttendanceStatus;
      transaction_type: TransactionType;
      sync_status: SyncStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type TablesKeys = keyof Tables;
export type TablesRow<T extends TablesKeys> = Tables[T]["Row"];
