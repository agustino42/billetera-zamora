import type {
  AttendanceStatus,
  GradeType,
  RateTableRules,
} from "@/shared/types/domain";

/**
 * Motor ZAM/SEM — lógica pura, sin React ni acceso a datos.
 *
 * Réplica exacta de `public.compute_earn` (supabase/migrations/0007).
 * Si cambias la regla en SQL, cámbiala aquí también: los tests de
 * paridad son la garantía de que ambas implementaciones coinciden.
 *
 *   normalized = value / max_value
 *   SEM        = floor( UC × sem_per_uc × factor_tipo × normalized )
 *   ZAM        = floor( SEM × zam_ratio_over_sem )
 */

export type EarnInput = {
  rules: RateTableRules;
  uc: number;
  gradeType: GradeType;
  value: number;
  maxValue: number;
};

export type EarnResult = {
  normalized: number;
  sem: number;
  zam: number;
};

export type PeriodUsage = {
  sem: number;
  zam: number;
};

export type CappedResult = EarnResult & {
  cappedSem: boolean;
  cappedZam: boolean;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Normaliza la calificación sobre su escala (8.5/10 → 0.85). */
export function normalize(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
    throw new Error("maxValue debe ser mayor que 0");
  }
  return round4(value / maxValue);
}

/** Factor del tipo de evaluación en la tabla de tasas activa. */
export function factorFor(rules: RateTableRules, gradeType: GradeType): number {
  const factor = rules.factor_by_grade_type[gradeType];
  if (typeof factor !== "number") {
    throw new Error(`La tabla de tasas no define un factor para "${gradeType}"`);
  }
  return factor;
}

/** Cálculo base (sin topes). */
export function computeEarn(input: EarnInput): EarnResult {
  const { rules, uc, gradeType, value, maxValue } = input;
  const normalized = normalize(value, maxValue);
  const factor = factorFor(rules, gradeType);

  const sem = Math.floor(uc * rules.sem_per_uc * factor * Math.max(normalized, 0));
  const zam = Math.floor(sem * rules.zam_ratio_over_sem);

  return { normalized, sem, zam };
}

/**
 * Aplica los topes por período. Lo ya consumido se descuenta del tope,
 * de modo que el saldo final nunca supera el máximo de la tasa.
 */
export function applyCaps(
  rules: RateTableRules,
  earned: EarnResult,
  used: PeriodUsage,
): CappedResult {
  const semRoom = Math.max(rules.caps.sem_per_period - used.sem, 0);
  const zamRoom = Math.max(rules.caps.zam_per_period - used.zam, 0);

  const sem = Math.min(earned.sem, semRoom);
  const zam = Math.min(earned.zam, zamRoom);

  return {
    ...earned,
    sem,
    zam,
    cappedSem: sem < earned.sem,
    cappedZam: zam < earned.zam,
  };
}

/** Puntos de una sesión de asistencia (0 en la tasa MVP-1). */
export function attendancePoints(
  rules: RateTableRules,
  status: AttendanceStatus,
): number {
  return rules.attendance_points[status] ?? 0;
}

/** Regla completa: calcula y topa en un solo paso. */
export function earnGrade(
  input: EarnInput,
  used: PeriodUsage = { sem: 0, zam: 0 },
): CappedResult {
  return applyCaps(input.rules, computeEarn(input), used);
}

/** Proyección para la UI: "esta nota otorga X ZAM / Y SEM". */
export function previewEarn(input: EarnInput): string {
  const { sem, zam } = computeEarn(input);
  return `${zam} ZAM · ${sem} SEM`;
}
