import { z } from "zod";
import { GRADE_TYPES, ATTENDANCE_STATUSES } from "@/shared/constants/domain";
import { DEFAULT_GRADE_MAX } from "@/shared/constants/routes";

export const loginSchema = z.object({
  email: z.email("Correo institucional inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const registerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, "Indica tu nombre completo")
    .max(120, "Nombre demasiado largo"),
  email: z.email("Correo institucional inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "Contraseña demasiado larga"),
  career: z.string().trim().min(2, "Indica tu carrera").max(120),
  campus: z.string().trim().min(2, "Indica tu sede").max(120).default("UNELLEZ-ZAMORA"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export const activateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "El código tiene al menos 6 caracteres")
    .max(64)
    .transform((v) => v.toUpperCase()),
});

export type ActivateInput = z.infer<typeof activateSchema>;

/** Formulario de registro de calificación (profesor). */
export const gradeFormSchema = z.object({
  subject_id: z.uuid("Selecciona la materia"),
  student_id: z.uuid("Selecciona el estudiante"),
  type: z.enum(GRADE_TYPES, { message: "Selecciona el tipo de evaluación" }),
  value: z.coerce
    .number({ message: "Ingresa un valor numérico" })
    .min(0, "No puede ser negativo")
    .max(DEFAULT_GRADE_MAX, `El máximo es ${DEFAULT_GRADE_MAX}`),
  max_value: z.coerce.number().positive().default(DEFAULT_GRADE_MAX),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  registered_at: z.string().optional(),
});

export type GradeFormInput = z.infer<typeof gradeFormSchema>;

export const attendanceFormSchema = z.object({
  subject_id: z.uuid("Selecciona la materia"),
  session_date: z.string().min(1, "Selecciona la fecha de la sesión"),
  records: z
    .array(
      z.object({
        student_id: z.uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, "Registra al menos un estudiante"),
});

export type AttendanceFormInput = z.infer<typeof attendanceFormSchema>;

/** Disputa de calificación (estudiante). */
export const disputeSchema = z.object({
  grade_id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, "Explica el motivo con al menos 10 caracteres")
    .max(1000, "Motivo demasiado largo"),
  evidence: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type DisputeInput = z.infer<typeof disputeSchema>;

export const resolveDisputeSchema = z.object({
  dispute_id: z.uuid(),
  status: z.enum([
    "resolved_upheld",
    "resolved_corrected",
    "rejected",
    "closed",
  ]),
  resolution: z
    .string()
    .trim()
    .min(10, "Documenta la resolución con al menos 10 caracteres")
    .max(1000),
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

/**
 * Ajuste manual de saldo (solo administración). Acepta negativos porque el
 * caso habitual es revertir saldo otorgado por una nota corregida.
 */
export const adjustmentSchema = z
  .object({
    student_id: z.uuid("Selecciona al estudiante"),
    amount_zam: z.coerce.number("Indica el ajuste en ZAM").refine((v) => v !== 0, {
      message: "El ajuste no puede ser cero en ZAM",
    }),
    amount_sem: z.coerce
      .number("Indica el ajuste en SEM")
      .default(0),
    reason: z
      .string()
      .trim()
      .min(10, "Documenta el motivo con al menos 10 caracteres")
      .max(500),
  })
  .refine(
    (v) => v.amount_zam !== 0 || v.amount_sem !== 0,
    "El ajuste debe mover al menos un saldo",
  );

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
