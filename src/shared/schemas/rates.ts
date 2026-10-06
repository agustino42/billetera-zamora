import { z } from "zod";
import { GRADE_TYPES, ATTENDANCE_STATUSES } from "@/shared/constants/domain";

/**
 * Valida el shape de `rate_tables.rules` (jsonb).
 * Si esta definición y la de SQL divergen, la migración 0006 deja de aplicar.
 */
export const rateTableRulesSchema = z.object({
  version: z.string().min(1),
  sem_per_uc: z.number().nonnegative(),
  factor_by_grade_type: z.record(
    z.enum(GRADE_TYPES),
    z.number().nonnegative(),
  ),
  zam_ratio_over_sem: z.number().nonnegative(),
  rounding: z.literal("floor"),
  attendance_points: z.record(z.enum(ATTENDANCE_STATUSES), z.number().nonnegative()),
  caps: z.object({
    zam_per_period: z.number().nonnegative(),
    sem_per_period: z.number().nonnegative(),
  }),
  redemption_currency: z.enum(["zam", "sem"]),
});

export type ValidatedRateRules = z.infer<typeof rateTableRulesSchema>;
