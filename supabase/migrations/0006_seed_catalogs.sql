-- =====================================================================
-- 0006 — Catálogo de tasas (versión MVP-1), flags y recompensas de ejemplo
-- ZAMORA
--
-- Tabla de tasas aprobada — REGLA DE CONVERSIÓN PÚBLICA Y VERIFICABLE
--
--   SEM = floor( UC × sem_per_uc × factor_tipo × normalized )
--   ZAM = floor( SEM × zam_ratio_over_sem )
--
--   normalized = value / max_value      (ej. 8.5 / 10 = 0.85)
--   UC         = unidades crédito de la materia (subjects.uc)
--   Topes      = 300 ZAM y 400 SEM por período académico
--   Canje      = solo ZAM
-- =====================================================================

create unique index if not exists idx_rate_tables_name_version
  on public.rate_tables (name, version);

insert into public.rate_tables (name, version, effective_from, rules, active)
values (
  'zamora-default',
  'mvp-1',
  current_date - 1,
  '{
    "version": "mvp-1",
    "sem_per_uc": 1,
    "factor_by_grade_type": {
      "exam": 1.0,
      "quiz": 0.6,
      "assignment": 0.4,
      "practice": 0.2,
      "other": 0.5
    },
    "zam_ratio_over_sem": 0.10,
    "rounding": "floor",
    "attendance_points": {
      "present": 0,
      "late": 0,
      "absent": 0,
      "justified": 0
    },
    "caps": {
      "zam_per_period": 300,
      "sem_per_period": 400
    },
    "redemption_currency": "zam"
  }'::jsonb,
  true
)
on conflict (name, version) do nothing;

-- ---------------------------------------------------------------------
-- Feature flags
-- ---------------------------------------------------------------------
insert into public.feature_flags (key, enabled, description) values
  ('offline_sync',   true,  'Captura de notas y asistencia sin conexión con sincronización diferida'),
  ('grade_disputes', true,  'Disputas de calificación creadas por el estudiante'),
  ('community',      true,  'Comunidad cerrada y moderada'),
  ('redemptions',    false, 'Canje de ZAM por recompensas del catálogo (fase posterior al MVP)'),
  ('announcements',  true,  'Anuncios dirigidos por rol')
on conflict (key) do update
  set enabled     = excluded.enabled,
      description = excluded.description;

-- ---------------------------------------------------------------------
-- Recompensas de ejemplo (visibles cuando redemptions se active)
-- ---------------------------------------------------------------------
insert into public.reward_catalog (name, description, cost_zam, stock, stock_type, active, requires_approval)
select * from (values
  ('Puntos extra en un parcial', '1 punto adicional sobre la próxima evaluación escrita', 25, null::integer, 'unlimited', true,  true),
  ('Certificado de reconocimiento', 'Constancia institucional por desempeño sostenido',        120, 50::integer,   'limited',    true,  true),
  ('Reserva de espacio en biblioteca', 'Reserva preferente en salas de estudio',               40, null::integer, 'unlimited', true,  false)
) as v(name, description, cost_zam, stock, stock_type, active, requires_approval)
where not exists (select 1 from public.reward_catalog);

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select name, version, effective_from, active, jsonb_pretty(rules) as rules
from public.rate_tables
order by effective_from desc;

select key, enabled from public.feature_flags order by key;