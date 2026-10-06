import { z } from "zod";
import { GRADE_TYPES, ATTENDANCE_STATUSES } from "@/shared/constants/domain";

/** Payload de una calificación pendiente de sincronizar. */
export const gradeEventSchema = z.object({
  subject_id: z.uuid(),
  student_id: z.uuid(),
  type: z.enum(GRADE_TYPES),
  value: z.number().min(0),
  max_value: z.number().positive().default(10),
  note: z.string().max(500).optional(),
  registered_at: z.string().optional(),
});

export const attendanceEventSchema = z.object({
  subject_id: z.uuid(),
  student_id: z.uuid(),
  session_date: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  note: z.string().max(300).optional(),
  registered_at: z.string().optional(),
});

export const pendingItemSchema = z.object({
  client_event_id: z.uuid(),
  type: z.enum(["grade", "attendance"]),
  payload: z.union([gradeEventSchema, attendanceEventSchema]),
  created_at: z.string(),
});

export const syncBatchSchema = z.object({
  items: z.array(pendingItemSchema).min(1).max(100),
});

export type GradeEventPayload = z.infer<typeof gradeEventSchema>;
export type AttendanceEventPayload = z.infer<typeof attendanceEventSchema>;
export type PendingItemInput = z.infer<typeof pendingItemSchema>;
