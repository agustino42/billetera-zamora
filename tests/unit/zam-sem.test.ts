import { describe, expect, it } from "vitest";
import {
  applyCaps,
  attendancePoints,
  computeEarn,
  earnGrade,
  factorFor,
  normalize,
  previewEarn,
} from "@/services/domain/zam-sem";
import type { RateTableRules } from "@/shared/types/domain";

const RULES: RateTableRules = {
  version: "mvp-1",
  sem_per_uc: 1,
  factor_by_grade_type: {
    exam: 1,
    quiz: 0.6,
    assignment: 0.4,
    practice: 0.2,
    other: 0.5,
  },
  zam_ratio_over_sem: 0.1,
  rounding: "floor",
  attendance_points: { present: 0, late: 0, absent: 0, justified: 0 },
  caps: { zam_per_period: 300, sem_per_period: 400 },
  redemption_currency: "zam",
};

describe("normalize", () => {
  it("normaliza sobre la escala de la evaluación", () => {
    expect(normalize(8.5, 10)).toBe(0.85);
    expect(normalize(10, 10)).toBe(1);
    expect(normalize(0, 10)).toBe(0);
  });

  it("acepta escalas distintas de 10", () => {
    expect(normalize(85, 100)).toBe(0.85);
    expect(normalize(17, 20)).toBe(0.85);
  });

  it("redondea a 4 decimales", () => {
    expect(normalize(7, 9)).toBe(0.7778);
  });

  it("rechaza maxValue inválido", () => {
    expect(() => normalize(1, 0)).toThrow();
  });
});

describe("computeEarn", () => {
  it("aplica la fórmula aprobada: SEM = floor(UC × factor × normalized)", () => {
    // 4 UC × 1.0 (exam) × 0.85 = 3.4 → floor = 3
    const r = computeEarn({ rules: RULES, uc: 4, gradeType: "exam", value: 8.5, maxValue: 10 });
    expect(r.normalized).toBe(0.85);
    expect(r.sem).toBe(3);
    // ZAM = floor(3 × 0.10) = 0
    expect(r.zam).toBe(0);
  });

  it("redondea hacia abajo siempre (nunca regala ZAM)", () => {
    // 3 UC × 0.6 (quiz) × 1.0 = 1.8 → 1 SEM → 0 ZAM
    const r = computeEarn({ rules: RULES, uc: 3, gradeType: "quiz", value: 10, maxValue: 10 });
    expect(r.sem).toBe(1);
    expect(r.zam).toBe(0);

    // 3 UC × 1.0 (exam) × 1.0 = 3 SEM → 0 ZAM (floor de 0.3)
    const r2 = computeEarn({ rules: RULES, uc: 3, gradeType: "exam", value: 10, maxValue: 10 });
    expect(r2.sem).toBe(3);
    expect(r2.zam).toBe(0);
  });

  it("distingue cada tipo de evaluación", () => {
    const base = { rules: RULES, uc: 5, value: 10, maxValue: 10 } as const;
    expect(computeEarn({ ...base, gradeType: "exam" }).sem).toBe(5);
    expect(computeEarn({ ...base, gradeType: "quiz" }).sem).toBe(3);
    expect(computeEarn({ ...base, gradeType: "assignment" }).sem).toBe(2);
    expect(computeEarn({ ...base, gradeType: "practice" }).sem).toBe(1);
    expect(computeEarn({ ...base, gradeType: "other" }).sem).toBe(2);
  });

  it("una calificación de 0 no otorga nada", () => {
    const r = computeEarn({ rules: RULES, uc: 4, gradeType: "exam", value: 0, maxValue: 10 });
    expect(r).toEqual({ normalized: 0, sem: 0, zam: 0 });
  });

  it("lanza error si el tipo no está en la tabla de tasas", () => {
    expect(() =>
      computeEarn({
        rules: RULES,
        uc: 4,
        gradeType: "seminario" as never,
        value: 10,
        maxValue: 10,
      }),
    ).toThrow(/no define un factor/);
  });
});

describe("applyCaps", () => {
  it("recorta al tope del período", () => {
    const earned = { normalized: 0.85, sem: 3, zam: 5 };
    const capped = applyCaps(RULES, earned, { sem: 399, zam: 298 });
    expect(capped.sem).toBe(1);
    expect(capped.zam).toBe(2);
    expect(capped.cappedSem).toBe(true);
    expect(capped.cappedZam).toBe(true);
  });

  it("no recorta cuando hay margen", () => {
    const earned = { normalized: 0.85, sem: 3, zam: 5 };
    const capped = applyCaps(RULES, earned, { sem: 0, zam: 0 });
    expect(capped).toMatchObject({ sem: 3, zam: 5, cappedSem: false, cappedZam: false });
  });

  it("nunca otorga un saldo negativo si el período ya está lleno", () => {
    const capped = applyCaps(RULES, { normalized: 1, sem: 5, zam: 9 }, { sem: 400, zam: 300 });
    expect(capped.sem).toBe(0);
    expect(capped.zam).toBe(0);
  });
});

describe("attendancePoints", () => {
  it("la tasa MVP-1 no otorga puntos por asistencia", () => {
    expect(attendancePoints(RULES, "present")).toBe(0);
    expect(attendancePoints(RULES, "late")).toBe(0);
    expect(attendancePoints(RULES, "absent")).toBe(0);
    expect(attendancePoints(RULES, "justified")).toBe(0);
  });
});

describe("earnGrade", () => {
  it("integra cálculo y topes", () => {
    const r = earnGrade(
      { rules: RULES, uc: 4, gradeType: "exam", value: 8.5, maxValue: 10 },
      { sem: 0, zam: 0 },
    );
    expect(r.sem).toBe(3);
    expect(r.zam).toBe(0);
  });
});

describe("previewEarn", () => {
  it("describe el otorgamiento para la UI", () => {
    const text = previewEarn({ rules: RULES, uc: 4, gradeType: "exam", value: 10, maxValue: 10 });
    expect(text).toBe("0 ZAM · 4 SEM");
  });
});

describe("factorFor", () => {
  it("lee el factor de la tabla activa", () => {
    expect(factorFor(RULES, "exam")).toBe(1);
    expect(factorFor(RULES, "practice")).toBe(0.2);
  });
});
