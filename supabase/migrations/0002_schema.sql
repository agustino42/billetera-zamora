-- =====================================================================
-- 0002 — Esquema relacional completo
-- ZAMORA · 18 tablas + índices + constraints
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. profiles — identidad verificada (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text        not null,
  role        text        not null default 'student'
                        check (role in ('student', 'teacher', 'admin')),
  status      text        not null default 'pending'
                        check (status in ('pending', 'active', 'suspended')),
  career      text,
  campus      text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_profiles_role   on public.profiles (role);
create index idx_profiles_status on public.profiles (status);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. rosters — padrón de acreditación + código temporal de activación
-- ---------------------------------------------------------------------
create table public.rosters (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid        not null references public.profiles (id) on delete cascade,
  career                text        not null,
  campus                text        not null default 'UNELLEZ-ZAMORA',
  active                boolean     not null default true,
  -- SHA-256 del código; el texto plano solo existe en el momento del alta
  activation_code_hash  text,
  activation_expires_at timestamptz,
  activated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (profile_id, career, campus)
);
create index idx_rosters_profile on public.rosters (profile_id);
create index idx_rosters_active  on public.rosters (active);

create trigger trg_rosters_updated_at
before update on public.rosters
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. subjects — materias (la UC vive aquí: base del motor ZAM/SEM)
-- ---------------------------------------------------------------------
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  code       text        not null unique,
  name       text        not null,
  teacher_id uuid        references public.profiles (id) on delete set null,
  uc         numeric(6,2) not null default 3 check (uc > 0),
  period     text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_subjects_teacher on public.subjects (teacher_id);
create index idx_subjects_period  on public.subjects (period);

create trigger trg_subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. enrollments — inscripción estudiante ↔ materia
-- ---------------------------------------------------------------------
create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid        not null references public.subjects (id) on delete cascade,
  student_id  uuid        not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  active      boolean     not null default true,
  unique (subject_id, student_id)
);
create index idx_enrollments_student on public.enrollments (student_id);

-- ---------------------------------------------------------------------
-- 5. attendance — asistencia (idempotente por client_event_id)
-- ---------------------------------------------------------------------
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid        not null references public.subjects (id) on delete cascade,
  session_date    date        not null,
  student_id      uuid        not null references public.profiles (id) on delete cascade,
  teacher_id      uuid        not null references public.profiles (id),
  status          text        not null check (status in ('present', 'absent', 'late', 'justified')),
  note            text,
  registered_at   timestamptz not null default now(),
  created_by      uuid        not null,
  client_event_id uuid        not null unique
);
create index idx_attendance_subject_date on public.attendance (subject_id, session_date);
create index idx_attendance_student      on public.attendance (student_id, registered_at);
create unique index idx_attendance_unique_session
  on public.attendance (subject_id, session_date, student_id)
  where status is not null;

-- ---------------------------------------------------------------------
-- 6. grades — calificaciones (idempotente por client_event_id)
--    status/corrects_grade_id soportan la corrección por disputa
-- ---------------------------------------------------------------------
create table public.grades (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid        not null references public.subjects (id) on delete cascade,
  student_id        uuid        not null references public.profiles (id) on delete cascade,
  teacher_id        uuid        not null references public.profiles (id),
  type              text        not null check (type in ('exam', 'quiz', 'assignment', 'practice', 'other')),
  value             numeric(6,2) not null check (value >= 0),
  max_value         numeric(6,2) not null default 10 check (max_value > 0),
  normalized        numeric(6,4)
                    generated always as (round(value / nullif(max_value, 0), 4)) stored,
  period            text        not null,
  status            text        not null default 'active' check (status in ('active', 'voided')),
  corrects_grade_id uuid        references public.grades (id),
  verified          boolean     not null default false,
  note              text,
  registered_at     timestamptz not null default now(),
  created_by        uuid        not null,
  client_event_id   uuid        not null unique
);
create index idx_grades_subject_student on public.grades (subject_id, student_id, registered_at desc);
create index idx_grades_student         on public.grades (student_id, registered_at desc);
create index idx_grades_teacher         on public.grades (teacher_id);

-- ---------------------------------------------------------------------
-- 7. grade_disputes — verificación y corrección por el estudiante
--    (Limitación 1 de la especificación; no existe API del sistema central)
-- ---------------------------------------------------------------------
create table public.grade_disputes (
  id           uuid primary key default gen_random_uuid(),
  grade_id     uuid        not null references public.grades (id) on delete cascade,
  student_id   uuid        not null references public.profiles (id) on delete cascade,
  teacher_id   uuid        not null references public.profiles (id),
  reason       text        not null check (length(trim(reason)) >= 10),
  evidence     text,
  status       text        not null default 'open'
                         check (status in ('open', 'in_review', 'resolved_upheld',
                                           'resolved_corrected', 'rejected', 'closed')),
  resolution   text,
  resolved_at  timestamptz,
  resolved_by  uuid        references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_disputes_grade  on public.grade_disputes (grade_id);
create index idx_disputes_status on public.grade_disputes (status, created_at desc);
-- Una sola disputa abierta por calificación y estudiante
create unique index idx_disputes_one_open
  on public.grade_disputes (grade_id, student_id)
  where status in ('open', 'in_review');

create trigger trg_disputes_updated_at
before update on public.grade_disputes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 8. rate_tables — tabla de tasas versionada (rules jsonb)
-- ---------------------------------------------------------------------
create table public.rate_tables (
  id             uuid primary key default gen_random_uuid(),
  name           text        not null,
  version        text        not null,
  effective_from date        not null,
  effective_to   date,
  rules          jsonb       not null check (jsonb_typeof(rules) = 'object'),
  active         boolean     not null default true,
  updated_by     uuid        references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create index idx_rate_tables_active on public.rate_tables (active, effective_from desc);

create trigger trg_rate_tables_updated_at
before update on public.rate_tables
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. balances — saldos (solo la función transaccional los modifica)
-- ---------------------------------------------------------------------
create table public.balances (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  zam        numeric(12,2) not null default 0 check (zam >= 0),
  sem        numeric(12,2) not null default 0 check (sem >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. transactions — libro de movimientos (idempotente)
-- ---------------------------------------------------------------------
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid        not null references public.profiles (id) on delete cascade,
  type            text        not null check (type in ('earn', 'redeem', 'adjust')),
  amount_zam      numeric(12,2) not null default 0,
  amount_sem      numeric(12,2) not null default 0,
  ref_type        text        check (ref_type in ('grade', 'attendance', 'adjustment',
                                                  'redemption', 'dispute')),
  ref_id          uuid,
  period          text,
  reason          text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  client_event_id uuid        not null unique,
  check (amount_zam <> 0 or amount_sem <> 0)
);
create index idx_transactions_profile on public.transactions (profile_id, created_at desc);
create index idx_transactions_period  on public.transactions (period, ref_type);

-- ---------------------------------------------------------------------
-- 11. reward_catalog — catálogo de recompensas
-- ---------------------------------------------------------------------
create table public.reward_catalog (
  id                uuid primary key default gen_random_uuid(),
  name              text        not null,
  description       text,
  cost_zam          numeric(12,2) not null check (cost_zam > 0),
  stock             integer,
  stock_type        text        not null default 'unlimited'
                                check (stock_type in ('unlimited', 'limited')),
  active            boolean     not null default true,
  requires_approval boolean     not null default true,
  created_by        uuid        references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (stock_type = 'unlimited' or stock is not null)
);
create trigger trg_rewards_updated_at
before update on public.reward_catalog
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 12. redemptions — canjes
-- ---------------------------------------------------------------------
create table public.redemptions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid        not null references public.profiles (id) on delete cascade,
  reward_id       uuid        not null references public.reward_catalog (id),
  cost_zam        numeric(12,2) not null check (cost_zam > 0),
  status          text        not null default 'pending'
                              check (status in ('pending', 'approved', 'rejected',
                                                'fulfilled', 'cancelled')),
  approved_by     uuid        references public.profiles (id),
  approved_at     timestamptz,
  rejected_reason text,
  fulfilled_at    timestamptz,
  created_at      timestamptz not null default now(),
  client_event_id uuid        not null unique
);
create index idx_redemptions_student on public.redemptions (student_id, created_at desc);
create index idx_redemptions_status  on public.redemptions (status);

-- ---------------------------------------------------------------------
-- 13. teacher_reputation — 5 métricas × 0..200, total 0..1000
-- ---------------------------------------------------------------------
create table public.teacher_reputation (
  teacher_id   uuid primary key references public.profiles (id) on delete cascade,
  visibility   integer not null default 0 check (visibility   between 0 and 200),
  punctuality  integer not null default 0 check (punctuality  between 0 and 200),
  coverage     integer not null default 0 check (coverage     between 0 and 200),
  continuity   integer not null default 0 check (continuity   between 0 and 200),
  availability integer not null default 0 check (availability between 0 and 200),
  total        integer generated always as
                 (visibility + punctuality + coverage + continuity + availability) stored,
  updated_by   uuid references public.profiles (id),
  updated_at   timestamptz not null default now(),
  check (total between 0 and 1000)
);

-- ---------------------------------------------------------------------
-- 14. announcements — anuncios por rol
-- ---------------------------------------------------------------------
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text        not null,
  body         text        not null,
  author_id    uuid        not null references public.profiles (id),
  target       text        not null default 'all'
                         check (target in ('all', 'students', 'teachers', 'admins')),
  status       text        not null default 'draft'
                         check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_announcements_status on public.announcements (status, published_at desc);
create trigger trg_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 15. community_posts — comunidad cerrada y moderada
-- ---------------------------------------------------------------------
create table public.community_posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid        not null references public.profiles (id) on delete cascade,
  title             text,
  body              text        not null check (length(trim(body)) >= 1),
  status            text        not null default 'published'
                                check (status in ('published', 'pending', 'blocked', 'removed')),
  moderated_by      uuid        references public.profiles (id),
  moderated_at      timestamptz,
  moderation_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_posts_status  on public.community_posts (status, created_at desc);
create index idx_posts_author  on public.community_posts (author_id);
create trigger trg_posts_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 16. moderation_logs
-- ---------------------------------------------------------------------
create table public.moderation_logs (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid        not null references public.profiles (id),
  post_id      uuid        not null references public.community_posts (id) on delete cascade,
  action       text        not null check (action in ('approve', 'block', 'remove', 'restore')),
  reason       text,
  created_at   timestamptz not null default now()
);
create index idx_moderation_post on public.moderation_logs (post_id, created_at desc);

-- ---------------------------------------------------------------------
-- 17. audit_ledger — registro append-only encadenado y firmado
-- ---------------------------------------------------------------------
create table public.audit_ledger (
  id           bigint generated always as identity primary key,
  seq          bigint      not null unique,
  actor_id     uuid        references public.profiles (id),
  action       text        not null,
  entity       text        not null check (entity in ('grade', 'attendance', 'redemption',
                                                      'adjustment', 'dispute', 'moderation',
                                                      'profile', 'roster', 'announcement',
                                                      'post', 'reward', 'rate_table')),
  entity_id    uuid,
  payload      jsonb       not null,
  payload_hash text        not null,
  prev_hash    text        not null,
  hash         text        not null,
  signature    text        not null,
  alg          text        not null default 'hmac-sha256'
                         check (alg in ('hmac-sha256', 'ed25519')),
  signed_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index idx_audit_created on public.audit_ledger (created_at desc);
create index idx_audit_entity  on public.audit_ledger (entity, entity_id);
create index idx_audit_actor   on public.audit_ledger (actor_id, created_at desc);

-- ---------------------------------------------------------------------
-- 18. pending_sync — espejo servidor de la cola offline
-- ---------------------------------------------------------------------
create table public.pending_sync (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  type            text        not null check (type in ('grade', 'attendance')),
  payload         jsonb       not null,
  status          text        not null default 'queued'
                              check (status in ('queued', 'syncing', 'synced', 'failed', 'cancelled')),
  retries         integer     not null default 0 check (retries >= 0),
  max_retries     integer     not null default 10 check (max_retries > 0),
  last_attempt_at timestamptz,
  error           text,
  client_event_id uuid        not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_pending_status on public.pending_sync (status, created_at);

create trigger trg_pending_sync_updated_at
before update on public.pending_sync
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 19. sync_receipts — idempotencia (una fila por client_event_id)
-- ---------------------------------------------------------------------
create table public.sync_receipts (
  id              uuid primary key default gen_random_uuid(),
  client_event_id uuid        not null unique,
  user_id         uuid        references public.profiles (id),
  event_type      text        not null check (event_type in ('grade', 'attendance', 'adjustment', 'redemption')),
  entity_id       uuid,
  applied_at      timestamptz not null default now(),
  transaction_id  uuid        references public.transactions (id),
  ledger_id       bigint      references public.audit_ledger (id),
  ok              boolean     not null default true
);
create index idx_receipts_user on public.sync_receipts (user_id, applied_at desc);

-- ---------------------------------------------------------------------
-- 20. feature_flags
-- ---------------------------------------------------------------------
create table public.feature_flags (
  key         text primary key,
  enabled     boolean     not null default false,
  description text,
  updated_by  uuid        references public.profiles (id),
  updated_at  timestamptz not null default now()
);
create trigger trg_flags_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;