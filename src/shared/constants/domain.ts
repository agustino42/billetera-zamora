import type { AttendanceStatus, GradeType, Role } from "@/shared/types/domain";

export const ROLES = ["student", "teacher", "admin"] as const satisfies readonly Role[];

export const ROLE_LABEL: Record<Role, string> = {
  student: "Estudiante",
  teacher: "Profesor",
  admin: "Administración",
};

export const GRADE_TYPES = [
  "exam",
  "quiz",
  "assignment",
  "practice",
  "other",
] as const satisfies readonly GradeType[];

export const GRADE_TYPE_LABEL: Record<GradeType, string> = {
  exam: "Examen",
  quiz: "Cuestionario",
  assignment: "Trabajo",
  practice: "Práctica",
  other: "Otro",
};

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "justified",
] as const satisfies readonly AttendanceStatus[];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Tardanza",
  justified: "Justificada",
};

export const DISPUTE_STATUS_LABEL = {
  open: "Abierta",
  in_review: "En revisión",
  resolved_upheld: "Resuelta a favor",
  resolved_corrected: "Corregida",
  rejected: "Rechazada",
  closed: "Cerrada",
} as const;

export const SYNC_STATUS_LABEL = {
  queued: "En cola",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  failed: "Fallido",
  cancelled: "Cancelado",
} as const;
