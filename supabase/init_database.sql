-- =========================================================
-- ZAMORA: SCRIPT UNIFICADO DE INICIALIZACION DE BASE DE DATOS
-- Ejecutar en Supabase -> SQL Editor -> New query -> Run
-- =========================================================

-- >>> LIMPIEZA PREVIA DE TABLAS ANTERIORES O INCOMPLETAS <<<
drop table if exists public.activation_codes cascade;
drop table if exists public.ledger_keys cascade;
drop table if exists public.feature_flags cascade;
drop table if exists public.sync_receipts cascade;
drop table if exists public.pending_sync cascade;
drop table if exists public.audit_ledger cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.moderation_logs cascade;
drop table if exists public.community_posts cascade;
drop table if exists public.announcements cascade;
drop table if exists public.teacher_reputation cascade;
drop table if exists public.redemptions cascade;
drop table if exists public.rewards cascade;
drop table if exists public.reward_catalog cascade;
drop table if exists public.transactions cascade;
drop table if exists public.balances cascade;
drop table if exists public.rate_tables cascade;
drop table if exists public.grade_disputes cascade;
drop table if exists public.grades cascade;
drop table if exists public.attendance cascade;
drop table if exists public.enrollments cascade;
drop table if exists public.courses cascade;
drop table if exists public.subjects cascade;
drop table if exists public.programs cascade;
drop table if exists public.rosters cascade;
drop table if exists public.users cascade;
drop table if exists public.profiles cascade;

-- >>> LIMPIEZA PREVIA DE FUNCIONES (evita error 42P13 por cambio de tipo de retorno) <<<
drop function if exists public.current_role cascade;
drop function if exists public.current_status cascade;
drop function if exists public.is_active_user cascade;
drop function if exists public.is_admin cascade;
drop function if exists public.is_teacher_of cascade;
drop function if exists public.is_enrolled cascade;
drop function if exists public.has_active_roster cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists public.prevent_profile_privilege_change cascade;
drop function if exists public.set_updated_at cascade;
drop function if exists public.prevent_audit_mod cascade;
drop function if exists public.set_ledger_secret cascade;
drop function if exists public.canonical_json cascade;
drop function if exists public.sha256_hex cascade;
drop function if exists public.iso_utc cascade;
drop function if exists public.ledger_sign cascade;
drop function if exists public.compute_chain_hash cascade;
drop function if exists public.append_audit cascade;
drop function if exists public.verify_audit_chain cascade;
drop function if exists public.compute_earn cascade;
drop function if exists public.apply_grade_event cascade;
drop function if exists public.apply_attendance_event cascade;
drop function if exists public.apply_adjustment_event cascade;
drop function if exists public.activate_account cascade;
drop function if exists public.open_grade_dispute cascade;
drop function if exists public.resolve_grade_dispute cascade;
drop function if exists public.issue_activation_code cascade;
drop function if exists public.redeem_reward cascade;
drop function if exists public.settle_redemption cascade;
drop function if exists public.moderate_community_post cascade;
drop function if exists public.save_announcement cascade;

-- >>> LIMPIEZA PREVIA DE TIPOS PERSONALIZADOS ANTIGUOS <<<
drop type if exists public.user_role cascade;
drop type if exists public.account_status cascade;
drop type if exists public.grade_type cascade;
drop type if exists public.role cascade;
drop type if exists public.status cascade;


-- >>> INICIO DE 0001_extensions.sql <<<
-- =====================================================================
-- 0001 — Extensiones
-- ZAMORA · Billetera Estudiantil de Rendimiento Académico
-- Ejecutar en Supabase → SQL Editor (en orden ascendente)
-- =====================================================================

-- pgcrypto: gen_random_uuid(), sha256(), digest(), hmac()
-- Nota: en Supabase suele instalarse en el esquema "extensions".
-- Si tu proyecto lo tiene en "extensions", cambia la línea por:
--   create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;

-- Verificación
select extname, extversion from pg_extension where extname = 'pgcrypto';

-- >>> INICIO DE 0002_schema.sql <<<
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

-- >>> INICIO DE 0003_audit_append_only.sql <<<
-- =====================================================================
-- 0003 — audit_ledger: append-only real
-- ZAMORA · trigger de bloqueo + revocación de permisos
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Rechazar UPDATE / DELETE a nivel de trigger
-- ---------------------------------------------------------------------
create or replace function public.prevent_audit_mod()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_ledger es append-only: % no permitido', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_no_mod on public.audit_ledger;
create trigger trg_audit_no_mod
before update or delete on public.audit_ledger
for each row execute function public.prevent_audit_mod();

-- ---------------------------------------------------------------------
-- 2) Revocar permisos directos de escritura
--    Las inserciones solo pueden ocurrir dentro de las funciones
--    SECURITY DEFINER (0004 / 0007 / 0008 / 0009).
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on public.audit_ledger from anon;
revoke insert, update, delete, truncate on public.audit_ledger from authenticated;
revoke insert, update, delete, truncate on public.audit_ledger from public;

-- ---------------------------------------------------------------------
-- 3) Sin TRUNCATE ni drops silenciosos: nadie debe poder vaciar la cadena
-- ---------------------------------------------------------------------
revoke truncate on public.audit_ledger from public;

-- ---------------------------------------------------------------------
-- Verificación de la instalación
-- ---------------------------------------------------------------------
-- Debe fallar (append-only):  update audit_ledger set action='x' where seq=1;
-- Debe fallar (append-only):  delete from audit_ledger where seq=1;
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.audit_ledger'::regclass and not tgisinternal;

-- >>> INICIO DE 0004_audit_chain.sql <<<
-- =====================================================================
-- 0004 — Cadena de auditoría: clave, hash canónico, encadenado y firma
-- ZAMORA
--
-- ⚠️  ACCIÓN REQUERIDA DESPUÉS DE EJECUTAR ESTE ARCHIVO:
--     select public.set_ledger_secret('PEGA_AQUI_UN_SECRETO_DE_64_HEX');
--     (genera uno con:  select encode(gen_random_bytes(32),'hex');)
--
-- Algoritmo: hmac-sha256 (pgcrypto no expone ed25519; la columna
-- `alg` deja constancia explícita del algoritmo usado en cada fila).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Almacén de la clave de firma — nadie del cliente puede leerlo
-- ---------------------------------------------------------------------
create table if not exists public.ledger_keys (
  id         smallint primary key default 1 check (id = 1),
  secret     text        not null check (length(secret) >= 32),
  alg        text        not null default 'hmac-sha256'
                         check (alg in ('hmac-sha256', 'ed25519')),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.ledger_keys enable row level security;
revoke all on public.ledger_keys from anon;
revoke all on public.ledger_keys from authenticated;
revoke all on public.ledger_keys from public;

-- Configuración de la clave: solo el propietario de la BD (SQL Editor)
create or replace function public.set_ledger_secret(new_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new_secret is null or length(new_secret) < 32 then
    raise exception 'El secreto debe tener al menos 32 caracteres';
  end if;

  insert into public.ledger_keys (id, secret, alg)
  values (1, new_secret, 'hmac-sha256')
  on conflict (id) do update
    set secret     = excluded.secret,
        alg        = excluded.alg,
        rotated_at = now();
end;
$$;
revoke all on function public.set_ledger_secret(text) from public, anon, authenticated;
grant execute on function public.set_ledger_secret(text) to service_role;

-- ---------------------------------------------------------------------
-- 2) Helpers deterministas (inmutables)
-- ---------------------------------------------------------------------

-- JSON canónico: jsonb ya normaliza claves (orden: longitud, luego byte a
-- byte) y elimina duplicados, por lo que su representación textual es estable.
create or replace function public.canonical_json(j jsonb)
returns text
language sql
immutable
strict
as $$
  select (j)::text;
$$;

-- SHA-256 en hexadecimal
create or replace function public.sha256_hex(t text)
returns text
language sql
immutable
strict
as $$
  select encode(digest(convert_to(t, 'UTF8'), 'sha256'), 'hex');
$$;

-- Timestamp determinista (independiente de TimeZone / DateStyle de la sesión)
create or replace function public.iso_utc(ts timestamptz)
returns text
language sql
immutable
strict
as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

-- ---------------------------------------------------------------------
-- 3) Firma HMAC de un hash
-- ---------------------------------------------------------------------
create or replace function public.ledger_sign(p_hash text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_alg    text;
begin
  select secret, alg into v_secret, v_alg
  from public.ledger_keys
  where id = 1;

  if v_secret is null then
    raise exception
      'Llave de auditoría no configurada: ejecuta select public.set_ledger_secret(''<secreto>'')';
  end if;

  return encode(hmac(convert_to(p_hash, 'UTF8'), v_secret), 'hex');
end;
$$;
revoke all on function public.ledger_sign(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Hash de una entrada: liga payload + posición + metadatos + tiempo
-- ---------------------------------------------------------------------
create or replace function public.compute_chain_hash(
  p_prev_hash    text,
  p_payload_hash text,
  p_seq          bigint,
  p_actor_id     uuid,
  p_action       text,
  p_entity       text,
  p_entity_id    uuid,
  p_created_at   timestamptz
)
returns text
language sql
immutable
as $$
  select public.sha256_hex(
    p_prev_hash
    || p_payload_hash
    || p_seq::text
    || coalesce(p_actor_id::text, '')
    || p_action
    || p_entity
    || coalesce(p_entity_id::text, '')
    || public.iso_utc(p_created_at)
  );
$$;
revoke all on function public.compute_chain_hash(text, text, bigint, uuid, text, text, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Append encadenado (única vía de escritura del ledger)
--
--  El bloqueo consultivo transaccional serializa a los escritores:
--  sin él, dos transactions concurrentes podrían leer el mismo
--  prev_hash y partir la cadena.
-- ---------------------------------------------------------------------
create or replace function public.append_audit(
  p_actor_id  uuid,
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_payload   jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_prev_hash    text;
  v_prev_seq     bigint;
  v_seq          bigint;
  v_payload_hash text;
  v_hash         text;
  v_signature    text;
  v_alg          text;
  v_created_at   timestamptz := clock_timestamp();
  v_ledger_id    bigint;
begin
  -- Serializa los appends concurrentes durante esta transacción
  perform pg_advisory_xact_lock(hashtext('zamora.audit_ledger.chain'));

  select hash, seq into v_prev_hash, v_prev_seq
  from public.audit_ledger
  order by seq desc
  limit 1;

  -- Génesis: cadena vacía = 64 ceros
  v_prev_hash := coalesce(v_prev_hash, repeat('0', 64));
  v_seq       := coalesce(v_prev_seq, 0) + 1;

  v_payload_hash := public.sha256_hex(public.canonical_json(p_payload));
  v_hash := public.compute_chain_hash(
    v_prev_hash, v_payload_hash, v_seq,
    p_actor_id, p_action, p_entity, p_entity_id, v_created_at
  );
  v_signature := public.ledger_sign(v_hash);

  select alg into v_alg from public.ledger_keys where id = 1;

  insert into public.audit_ledger (
    seq, actor_id, action, entity, entity_id, payload,
    payload_hash, prev_hash, hash, signature, alg, signed_at, created_at
  )
  values (
    v_seq, p_actor_id, p_action, p_entity, p_entity_id, p_payload,
    v_payload_hash, v_prev_hash, v_hash, v_signature,
    coalesce(v_alg, 'hmac-sha256'), v_created_at, v_created_at
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;
revoke all on function public.append_audit(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_audit(uuid, text, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 6) Verificación de la cadena (reconstruye desde seq = 1)
-- ---------------------------------------------------------------------
create or replace function public.verify_audit_chain(
  p_from bigint default 1,
  p_to   bigint default null
)
returns table (
  seq           bigint,
  payload_ok    boolean,
  chain_ok      boolean,
  signature_ok  boolean,
  prev_ok       boolean,
  ok            boolean,
  detail        text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  r            record;
  v_prev_hash  text := repeat('0', 64);
  v_exp_payload text;
  v_exp_chain   text;
begin
  for r in
    select * from public.audit_ledger
    where seq >= p_from
      and (p_to is null or seq <= p_to)
    order by seq asc
  loop
    v_exp_payload := public.sha256_hex(public.canonical_json(r.payload));
    v_exp_chain   := public.compute_chain_hash(
      r.prev_hash, r.payload_hash, r.seq,
      r.actor_id, r.action, r.entity, r.entity_id, r.created_at
    );

    seq          := r.seq;
    payload_ok   := (r.payload_hash = v_exp_payload);
    chain_ok     := (r.hash = v_exp_chain);
    signature_ok := (r.signature = public.ledger_sign(r.hash));
    prev_ok      := (r.prev_hash = v_prev_hash);
    ok           := payload_ok and chain_ok and signature_ok and prev_ok;
    detail       := case
      when not payload_ok   then 'payload_hash no coincide con el payload'
      when not chain_ok     then 'hash de cadena recalculado no coincide'
      when not signature_ok then 'firma HMAC inválida'
      when not prev_ok      then 'prev_hash no enlaza con la fila anterior'
      else 'ok'
    end;

    v_prev_hash := r.hash;
    return next;
  end loop;

  if v_prev_hash = repeat('0', 64) then
    seq          := p_from;
    payload_ok   := false;
    chain_ok     := false;
    signature_ok := false;
    prev_ok      := false;
    ok           := false;
    detail       := 'cadena vacía';
    return next;
  end if;
end;
$$;
revoke all on function public.verify_audit_chain(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.verify_audit_chain(bigint, bigint) to service_role;

-- ---------------------------------------------------------------------
-- Prueba de humo (opcional, descomentar):
--   select public.append_audit(null, 'smoke.test', 'rate_table', null, '{"ok":true}');
--   select * from public.verify_audit_chain();
--   -- luego borrar la fila es imposible (append-only). Déjala o crea
--   --    una BD nueva de pruebas: el ledger no admite borrados.
-- =====================================================================

-- >>> INICIO DE 0005_rls.sql <<<
-- =====================================================================
-- 0005 — Row Level Security (deny-by-default) + aprovisionamiento de perfiles
-- ZAMORA
--
-- Principio: RLS habilitado en TODAS las tablas. Sin política = denegado.
-- Las escrituras críticas (grades, attendance, balances, transactions,
-- audit_ledger) NO tienen política de escritura: solo entran por los RPC
-- SECURITY DEFINER (0007–0009), que revalidan sesión, rol y pertenencia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funciones de contexto (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.profiles where id = auth.uid();
$$;

-- Usuario acreditado: existe y está activo
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_teacher_of(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subjects
    where id = p_subject_id and teacher_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled(p_subject_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where subject_id = p_subject_id
      and student_id = p_student_id
      and active
  );
$$;

-- El estudiante debe estar acreditado en el padrón para operar
create or replace function public.has_active_roster(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rosters
    where profile_id = p_profile_id and active
  );
$$;

revoke all on function public.current_role()      from public;
revoke all on function public.current_status()    from public;
revoke all on function public.is_active_user()    from public;
revoke all on function public.is_admin()          from public;
revoke all on function public.is_teacher_of(uuid) from public;
revoke all on function public.is_enrolled(uuid, uuid)      from public;
revoke all on function public.has_active_roster(uuid)      from public;

-- Las políticas se evalúan con los privilegios del usuario que consulta,
-- así que hay que devolverles EXECUTE explícitamente. Sin estos GRANT,
-- cualquier SELECT del cliente falla con "permission denied for function".
grant execute on function public.current_role()      to authenticated;
grant execute on function public.current_status()    to authenticated;
grant execute on function public.is_active_user()    to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.is_teacher_of(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid, uuid)      to authenticated;
grant execute on function public.has_active_roster(uuid)      to authenticated;

-- ---------------------------------------------------------------------
-- 2) Aprovisionamiento: registro → profile pendiente + saldo en cero
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'student',
    'pending'
  )
  on conflict (id) do nothing;

  insert into public.balances (profile_id) values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3) Anti-escalación: el usuario no puede cambiar su propio rol/estado
-- ---------------------------------------------------------------------
-- Tres vías legítimas de escritura sobre profiles.status / profiles.role:
--   a) administración (is_admin) desde el panel;
--   b) los RPC SECURITY DEFINER del propio flujo de acreditación
--      (activate_account, issue_activation_code), que levantan una bandera
--      transaccional de un solo uso: set_config('zamora.allow_profile_write',
--      'on', true). El tercer argumento la acota a la transacción, así que
--      nunca sobrevive al commit;
--   c) mantenimiento directo en la base de datos (migraciones, SQL Editor),
--      donde no hay sesión de usuario (auth.uid() IS NULL) y la conexión
--      es del rol postgres.
create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (c) Mantenimiento directo: sin sesión de usuario y conexión local de postgres
  if auth.uid() is null and session_user = 'postgres' then
    return new;
  end if;

  -- (b) RPC interno autorizado (bandera transaccional)
  if coalesce(current_setting('zamora.allow_profile_write', true), 'off') = 'on' then
    return new;
  end if;

  -- (a) Administración acreditada
  if public.is_admin() then
    return new;
  end if;

  if new.role <> old.role or new.status <> old.status or new.email <> old.email then
    raise exception
      'Cambio de rol, estado o email permitido únicamente para administración'
    using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_no_privilege_change
before update on public.profiles
for each row execute function public.prevent_profile_privilege_change();

-- ---------------------------------------------------------------------
-- 4) Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.rosters             enable row level security;
alter table public.subjects            enable row level security;
alter table public.enrollments         enable row level security;
alter table public.attendance          enable row level security;
alter table public.grades              enable row level security;
alter table public.grade_disputes      enable row level security;
alter table public.rate_tables         enable row level security;
alter table public.balances            enable row level security;
alter table public.transactions        enable row level security;
alter table public.reward_catalog      enable row level security;
alter table public.redemptions         enable row level security;
alter table public.teacher_reputation  enable row level security;
alter table public.announcements       enable row level security;
alter table public.community_posts     enable row level security;
alter table public.moderation_logs     enable row level security;
alter table public.audit_ledger        enable row level security;
alter table public.pending_sync        enable row level security;
alter table public.sync_receipts       enable row level security;
alter table public.feature_flags       enable row level security;
alter table public.ledger_keys         enable row level security;

-- ---------------------------------------------------------------------
-- 5) Políticas de lectura
-- ---------------------------------------------------------------------

-- profiles: propio o admin
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (id = auth.uid() or public.is_admin());

-- profiles: actualización de campos propios (rol/estado bloqueados por trigger)
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- rosters: el propio docente/admin/estudiante ve su padrón; escritura admin
drop policy if exists rosters_select on public.rosters;
create policy rosters_select on public.rosters
for select using (profile_id = auth.uid() or public.is_admin());
drop policy if exists rosters_write_admin on public.rosters;
create policy rosters_write_admin on public.rosters
for all using (public.is_admin()) with check (public.is_admin());

-- subjects: lectura para cualquier autenticado; escritura admin
drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects
for select using (public.is_active_user() or public.is_admin());
drop policy if exists subjects_write_admin on public.subjects;
create policy subjects_write_admin on public.subjects
for all using (public.is_admin()) with check (public.is_admin());

-- enrollments: estudiante dueño, profesor de la materia o admin
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
for select using (
  student_id = auth.uid()
  or public.is_admin()
  or public.is_teacher_of(subject_id)
);
drop policy if exists enrollments_write_admin on public.enrollments;
create policy enrollments_write_admin on public.enrollments
for all using (public.is_admin()) with check (public.is_admin());

-- grades: solo lectura directa (la escritura va por RPC)
drop policy if exists grades_select on public.grades;
create policy grades_select on public.grades
for select using (
  student_id = auth.uid()
  or teacher_id = auth.uid()
  or public.is_admin()
);

-- attendance: solo lectura directa (la escritura va por RPC)
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
for select using (
  student_id = auth.uid()
  or teacher_id = auth.uid()
  or public.is_admin()
);

-- grade_disputes
drop policy if exists disputes_select on public.grade_disputes;
create policy disputes_select on public.grade_disputes
for select using (
  student_id = auth.uid() or teacher_id = auth.uid() or public.is_admin()
);

drop policy if exists disputes_insert_own on public.grade_disputes;
create policy disputes_insert_own on public.grade_disputes
for insert with check (
  student_id = auth.uid()
  and public.is_active_user()
  and exists (
    select 1 from public.grades g
    where g.id = grade_id
      and g.student_id = auth.uid()
      and g.status = 'active'
      and g.value is not null
  )
);

-- El profesor marca "en revisión"; admin resuelve o cierra
drop policy if exists disputes_update_teacher on public.grade_disputes;
create policy disputes_update_teacher on public.grade_disputes
for update using (teacher_id = auth.uid() and status = 'open')
with check (teacher_id = auth.uid() and status = 'in_review');

drop policy if exists disputes_update_admin on public.grade_disputes;
create policy disputes_update_admin on public.grade_disputes
for update using (public.is_admin()) with check (public.is_admin());

-- rate_tables: la regla debe ser PÚBLICA y verificable
drop policy if exists rate_tables_select on public.rate_tables;
create policy rate_tables_select on public.rate_tables
for select using (auth.uid() is not null);
drop policy if exists rate_tables_write_admin on public.rate_tables;
create policy rate_tables_write_admin on public.rate_tables
for all using (public.is_admin()) with check (public.is_admin());

-- balances: propietario o admin (escritura solo por RPC)
drop policy if exists balances_select on public.balances;
create policy balances_select on public.balances
for select using (profile_id = auth.uid() or public.is_admin());

-- transactions: propietario o admin (escritura solo por RPC)
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
for select using (profile_id = auth.uid() or public.is_admin());

-- reward_catalog
drop policy if exists rewards_select on public.reward_catalog;
create policy rewards_select on public.reward_catalog
for select using ((active and auth.uid() is not null) or public.is_admin());
drop policy if exists rewards_write_admin on public.reward_catalog;
create policy rewards_write_admin on public.reward_catalog
for all using (public.is_admin()) with check (public.is_admin());

-- redemptions: estudiante dueño o admin (alta y saldo vía RPC)
drop policy if exists redemptions_select on public.redemptions;
create policy redemptions_select on public.redemptions
for select using (student_id = auth.uid() or public.is_admin());
drop policy if exists redemptions_update_admin on public.redemptions;
create policy redemptions_update_admin on public.redemptions
for update using (public.is_admin()) with check (public.is_admin());

-- teacher_reputation: pública para autenticados
drop policy if exists reputation_select on public.teacher_reputation;
create policy reputation_select on public.teacher_reputation
for select using (auth.uid() is not null);
drop policy if exists reputation_write_admin on public.teacher_reputation;
create policy reputation_write_admin on public.teacher_reputation
for all using (public.is_admin()) with check (public.is_admin());

-- announcements: publicado, vigente y dirigido al rol del usuario
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
for select using (
  public.is_active_user()
  and status = 'published'
  and (expires_at is null or expires_at > now())
  and (
    target = 'all'
    or (target = 'students' and public.current_role() = 'student')
    or (target = 'teachers' and public.current_role() = 'teacher')
    or (target = 'admins'  and public.current_role() = 'admin')
  )
);
drop policy if exists announcements_write_admin on public.announcements;
create policy announcements_write_admin on public.announcements
for all using (public.is_admin()) with check (public.is_admin());

-- community_posts: comunidad cerrada (solo usuarios activos)
drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts
for select using (
  public.is_active_user()
  and (status = 'published' or author_id = auth.uid() or public.is_admin())
);

-- Toda publicación nueva entra "pending" (comunidad moderada)
drop policy if exists posts_insert_pending on public.community_posts;
create policy posts_insert_pending on public.community_posts
for insert with check (author_id = auth.uid() and status = 'pending' and public.is_active_user());

drop policy if exists posts_update_admin on public.community_posts;
create policy posts_update_admin on public.community_posts
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists posts_delete_admin on public.community_posts;
create policy posts_delete_admin on public.community_posts
for delete using (public.is_admin());

-- moderation_logs
drop policy if exists moderation_select_admin on public.moderation_logs;
create policy moderation_select_admin on public.moderation_logs
for select using (public.is_admin());
drop policy if exists moderation_insert_admin on public.moderation_logs;
create policy moderation_insert_admin on public.moderation_logs
for insert with check (moderator_id = auth.uid() and public.is_admin());

-- audit_ledger: SOLO lectura de admin. Cero políticas de escritura.
drop policy if exists audit_select_admin on public.audit_ledger;
create policy audit_select_admin on public.audit_ledger
for select using (public.is_admin());

-- pending_sync: espejo servidor, solo su dueño
drop policy if exists pending_sync_owner on public.pending_sync;
create policy pending_sync_owner on public.pending_sync
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sync_receipts: lectura del propio usuario (inserción solo por RPC)
drop policy if exists receipts_select_own on public.sync_receipts;
create policy receipts_select_own on public.sync_receipts
for select using (user_id = auth.uid() or public.is_admin());

-- feature_flags
drop policy if exists flags_select on public.feature_flags;
create policy flags_select on public.feature_flags
for select using (auth.uid() is not null);
drop policy if exists flags_write_admin on public.feature_flags;
create policy flags_write_admin on public.feature_flags
for all using (public.is_admin()) with check (public.is_admin());

-- ledger_keys: sin políticas a propósito. Nadie del cliente la lee.

-- ---------------------------------------------------------------------
-- Verificación: lista de políticas creadas
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- >>> INICIO DE 0006_seed_catalogs.sql <<<
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

-- >>> INICIO DE 0007_rpc_grade_event.sql <<<
-- =====================================================================
-- 0007 — Motor ZAM/SEM + RPC transaccional apply_grade_event
-- ZAMORA
--
-- compute_earn() es INMUTABLE y pública a propósito: cualquier usuario
-- autenticado puede auditar la regla y reproducir el cálculo.
--
-- apply_grade_event() es la ÚNICA vía de escritura de calificaciones:
--   1. idempotencia por client_event_id (advisory lock + sync_receipts)
--   2. revalidación de sesión, rol y pertenencia a la materia
--   3. estudiante acreditado (roster activo) e inscrito
--   4. cálculo desde rate_tables (versión activa)
--   5. topes por período
--   6. nota + transaction + balances + ledger encadenado + recibo
-- Todo en una sola transacción: o se aplica completo, o nada.
-- =====================================================================

alter table public.sync_receipts
  add column if not exists entity_id uuid;

-- ---------------------------------------------------------------------
-- 1) Regla de conversión (pura, inmutable, auditable)
-- ---------------------------------------------------------------------
create or replace function public.compute_earn(
  p_rules      jsonb,
  p_uc         numeric,
  p_grade_type text,
  p_normalized numeric
)
returns table (sem numeric, zam numeric)
language sql
immutable
as $$
  with raw as (
    select floor(
      coalesce(p_uc, 0)
      * coalesce((p_rules ->> 'sem_per_uc')::numeric, 1)
      * coalesce((p_rules -> 'factor_by_grade_type' ->> p_grade_type)::numeric, 0)
      * greatest(coalesce(p_normalized, 0), 0)
    ) as sem_raw
  )
  select
    sem_raw::numeric as sem,
    floor(sem_raw * coalesce((p_rules ->> 'zam_ratio_over_sem')::numeric, 0))::numeric as zam
  from raw;
$$;

grant execute on function public.compute_earn(jsonb, numeric, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 2) RPC: registrar calificación
-- ---------------------------------------------------------------------
create or replace function public.apply_grade_event(
  p_client_event_id uuid,
  p_subject_id      uuid,
  p_student_id      uuid,
  p_grade_type      text,
  p_value           numeric,
  p_max_value       numeric   default 10,
  p_registered_at   timestamptz default null,
  p_note            text      default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor       uuid := auth.uid();
  v_role        text;
  v_uc          numeric;
  v_period      text;
  v_rules       jsonb;
  v_sem         numeric := 0;
  v_zam         numeric := 0;
  v_sem_used    numeric;
  v_zam_used    numeric;
  v_sem_cap     numeric;
  v_zam_cap     numeric;
  v_grade_id    uuid;
  v_tx_id       uuid;
  v_ledger_id   bigint;
  v_receipt     record;
  v_normalized  numeric;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Serializa requests con el mismo client_event_id
  perform pg_advisory_xact_lock(hashtextextended(p_client_event_id::text, 0));

  -- ¿Ya se aplicó?
  select * into v_receipt
  from public.sync_receipts
  where client_event_id = p_client_event_id;

  if found then
    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'grade',
      'grade_id', v_receipt.entity_id,
      'transaction_id', v_receipt.transaction_id,
      'ledger_id', v_receipt.ledger_id,
      'applied_at', v_receipt.applied_at
    );
  end if;

  -- --- Autenticación reforzada -------------------------------------
  select role into v_role from public.profiles where id = v_actor and status = 'active';
  if v_role is null or v_role <> 'teacher' then
    raise exception 'Solo un profesor acreditado puede registrar calificaciones'
      using errcode = '42501';
  end if;

  if p_value is null or p_max_value is null or p_max_value <= 0
     or p_value < 0 or p_value > p_max_value then
    raise exception 'Valor fuera de rango: 0 <= value <= max_value';
  end if;

  if p_grade_type is null
     or p_grade_type not in ('exam', 'quiz', 'assignment', 'practice', 'other') then
    raise exception 'Tipo de evaluación inválido: %', p_grade_type;
  end if;

  -- Materia activa y asignada al profesor
  select s.uc, s.period into v_uc, v_period
  from public.subjects s
  where s.id = p_subject_id and s.active and s.teacher_id = v_actor;

  if not found then
    raise exception 'Materia inexistente, inactiva o no asignada al profesor'
      using errcode = '42501';
  end if;

  -- Estudiante acreditado y inscrito
  if not exists (
    select 1 from public.profiles
    where id = p_student_id and role = 'student' and status = 'active'
  ) then
    raise exception 'El estudiante no está acreditado' using errcode = '42501';
  end if;

  if not public.has_active_roster(p_student_id) then
    raise exception 'El estudiante no figura activo en el padrón' using errcode = '42501';
  end if;

  if not public.is_enrolled(p_subject_id, p_student_id) then
    raise exception 'El estudiante no está inscrito en la materia' using errcode = '42501';
  end if;

  -- --- Cálculo ------------------------------------------------------
  select rules into v_rules
  from public.rate_tables
  where active
    and effective_from <= current_date
    and (effective_to is null or effective_to > current_date)
  order by effective_from desc
  limit 1;

  if v_rules is null then
    raise exception 'No hay tabla de tasas activa vigente';
  end if;

  if (v_rules -> 'factor_by_grade_type' ->> p_grade_type) is null then
    raise exception 'La tabla de tasas no define un factor para el tipo %', p_grade_type;
  end if;

  v_normalized := round(p_value / p_max_value, 4);

  select sem, zam into v_sem, v_zam
  from public.compute_earn(v_rules, v_uc, p_grade_type, v_normalized);

  -- Topes por período
  v_sem_cap := coalesce((v_rules #>> '{caps,sem_per_period}')::numeric, 1000000000);
  v_zam_cap := coalesce((v_rules #>> '{caps,zam_per_period}')::numeric, 1000000000);

  select coalesce(sum(amount_sem), 0), coalesce(sum(amount_zam), 0)
    into v_sem_used, v_zam_used
  from public.transactions
  where profile_id = p_student_id
    and period = v_period
    and type in ('earn', 'adjust');

  v_sem := least(v_sem, greatest(v_sem_cap - v_sem_used, 0));
  v_zam := least(v_zam, greatest(v_zam_cap - v_zam_used, 0));

  -- --- Persistencia --------------------------------------------------
  insert into public.grades (
    subject_id, student_id, teacher_id, type, value, max_value, period,
    status, note, registered_at, created_by, client_event_id
  )
  values (
    p_subject_id, p_student_id, v_actor, p_grade_type, p_value, p_max_value, v_period,
    'active', p_note, coalesce(p_registered_at, now()), v_actor, p_client_event_id
  )
  on conflict (client_event_id) do nothing
  returning id into v_grade_id;

  if v_grade_id is null then
    -- Carrera perdida: el evento ya existe
    select id into v_grade_id
    from public.grades where client_event_id = p_client_event_id;

    select * into v_receipt
    from public.sync_receipts where client_event_id = p_client_event_id;

    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'grade',
      'grade_id', v_grade_id,
      'transaction_id', v_receipt.transaction_id,
      'ledger_id', v_receipt.ledger_id,
      'applied_at', v_receipt.applied_at
    );
  end if;

  if v_sem <> 0 or v_zam <> 0 then
    insert into public.transactions (
      profile_id, type, amount_zam, amount_sem, ref_type, ref_id,
      period, reason, created_by, created_at, client_event_id
    )
    values (
      p_student_id, 'earn', v_zam, v_sem, 'grade', v_grade_id,
      v_period,
      format('%s en %s (normalizada %s)', p_grade_type, v_period, v_normalized),
      v_actor, coalesce(p_registered_at, now()), p_client_event_id
    )
    on conflict (client_event_id) do nothing
    returning id into v_tx_id;

    insert into public.balances (profile_id, zam, sem)
    values (p_student_id, v_zam, v_sem)
    on conflict (profile_id) do update set
      zam        = public.balances.zam + excluded.zam,
      sem        = public.balances.sem + excluded.sem,
      updated_at = now();
  end if;

  -- --- Auditoría ------------------------------------------------------
  v_ledger_id := public.append_audit(
    v_actor,
    'grade.created',
    'grade',
    v_grade_id,
    jsonb_build_object(
      'grade_id', v_grade_id,
      'subject_id', p_subject_id,
      'student_id', p_student_id,
      'teacher_id', v_actor,
      'type', p_grade_type,
      'value', p_value,
      'max_value', p_max_value,
      'normalized', v_normalized,
      'uc', v_uc,
      'period', v_period,
      'sem', v_sem,
      'zam', v_zam,
      'client_event_id', p_client_event_id
    )
  );

  insert into public.sync_receipts (
    client_event_id, user_id, event_type, entity_id, transaction_id, ledger_id, ok
  )
  values (
    p_client_event_id, v_actor, 'grade', v_grade_id, v_tx_id, v_ledger_id, true
  )
  on conflict (client_event_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'deduped', false, 'kind', 'grade',
    'grade_id', v_grade_id,
    'transaction_id', v_tx_id,
    'ledger_id', v_ledger_id,
    'sem', v_sem, 'zam', v_zam,
    'normalized', v_normalized,
    'period', v_period,
    'applied_at', now()
  );
end;
$$;

revoke all on function public.apply_grade_event(uuid, uuid, uuid, text, numeric, numeric, timestamptz, text)
  from public, anon;
grant execute on function public.apply_grade_event(uuid, uuid, uuid, text, numeric, numeric, timestamptz, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Auditoría de la regla (usable desde el cliente para verificación)
--   select * from compute_earn(rules, 3, 'exam', 0.85);
-- =====================================================================

-- >>> INICIO DE 0008_rpc_attendance_event.sql <<<
-- =====================================================================
-- 0008 — RPC transaccional apply_attendance_event
-- ZAMORA
--
-- Misma arquitectura que 0007: idempotente, revalida sesión/rol/materia,
-- escribe asistencia + auditoría encadenada. Con la tabla de tasas MVP-1
-- los puntos de asistencia son 0 (por diseño: ZAM se gana por desempeño
-- curricular verificado), pero el punto de awarding ya queda implementado
-- para futuras versiones de la tasa.
-- =====================================================================

create or replace function public.apply_attendance_event(
  p_client_event_id uuid,
  p_subject_id      uuid,
  p_student_id      uuid,
  p_session_date    date,
  p_status          text,
  p_note            text default null,
  p_registered_at   timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor      uuid := auth.uid();
  v_role       text;
  v_period     text;
  v_rules      jsonb;
  v_points     numeric := 0;
  v_sem        numeric := 0;
  v_zam        numeric := 0;
  v_att_id     uuid;
  v_tx_id      uuid;
  v_ledger_id  bigint;
  v_receipt    record;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_event_id::text, 0));

  select * into v_receipt
  from public.sync_receipts
  where client_event_id = p_client_event_id;

  if found then
    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'attendance',
      'attendance_id', v_receipt.entity_id,
      'transaction_id', v_receipt.transaction_id,
      'ledger_id', v_receipt.ledger_id,
      'applied_at', v_receipt.applied_at
    );
  end if;

  -- --- Autenticación reforzada -------------------------------------
  select role into v_role from public.profiles where id = v_actor and status = 'active';
  if v_role is null or v_role <> 'teacher' then
    raise exception 'Solo un profesor acreditado puede registrar asistencia'
      using errcode = '42501';
  end if;

  if p_status not in ('present', 'absent', 'late', 'justified') then
    raise exception 'Estado de asistencia inválido: %', p_status;
  end if;

  if p_session_date is null or p_session_date > current_date + 1 then
    raise exception 'Fecha de sesión inválida';
  end if;

  select s.period into v_period
  from public.subjects s
  where s.id = p_subject_id and s.active and s.teacher_id = v_actor;

  if not found then
    raise exception 'Materia inexistente, inactiva o no asignada al profesor'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_student_id and role = 'student' and status = 'active'
  ) then
    raise exception 'El estudiante no está acreditado' using errcode = '42501';
  end if;

  if not public.is_enrolled(p_subject_id, p_student_id) then
    raise exception 'El estudiante no está inscrito en la materia' using errcode = '42501';
  end if;

  -- --- Reglas --------------------------------------------------------
  select rules into v_rules
  from public.rate_tables
  where active
    and effective_from <= current_date
    and (effective_to is null or effective_to > current_date)
  order by effective_from desc
  limit 1;

  v_points := coalesce((v_rules #>> array['attendance_points', p_status])::numeric, 0);
  v_sem    := floor(v_points * coalesce((v_rules ->> 'sem_per_uc')::numeric, 1));
  v_zam    := floor(v_sem  * coalesce((v_rules ->> 'zam_ratio_over_sem')::numeric, 0));

  -- --- Persistencia --------------------------------------------------
  -- Idempotencia por client_event_id. La unicidad de la sesión
  -- (subject, fecha, estudiante) impide registrar dos veces la misma.
  begin
    insert into public.attendance (
      subject_id, session_date, student_id, teacher_id, status, note,
      registered_at, created_by, client_event_id
    )
    values (
      p_subject_id, p_session_date, p_student_id, v_actor, p_status, p_note,
      coalesce(p_registered_at, now()), v_actor, p_client_event_id
    )
    on conflict (client_event_id) do nothing
    returning id into v_att_id;
  exception when unique_violation then
    raise exception
      'Ya existe un registro de asistencia para el % en esta materia; corrige el existente en lugar de duplicarlo',
      p_session_date using errcode = '23505';
  end;

  if v_att_id is null then
    select id into v_att_id
    from public.attendance where client_event_id = p_client_event_id;

    select * into v_receipt
    from public.sync_receipts where client_event_id = p_client_event_id;

    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'attendance',
      'attendance_id', v_att_id,
      'transaction_id', v_receipt.transaction_id,
      'ledger_id', v_receipt.ledger_id,
      'applied_at', v_receipt.applied_at
    );
  end if;

  if v_points <> 0 or v_zam <> 0 then
    insert into public.transactions (
      profile_id, type, amount_zam, amount_sem, ref_type, ref_id,
      period, reason, created_by, created_at, client_event_id
    )
    values (
      p_student_id, 'earn', v_zam, v_sem, 'attendance', v_att_id,
      v_period, 'asistencia: ' || p_status, v_actor,
      coalesce(p_registered_at, now()), p_client_event_id
    )
    on conflict (client_event_id) do nothing
    returning id into v_tx_id;

    insert into public.balances (profile_id, zam, sem)
    values (p_student_id, v_zam, v_sem)
    on conflict (profile_id) do update set
      zam        = public.balances.zam + excluded.zam,
      sem        = public.balances.sem + excluded.sem,
      updated_at = now();
  end if;

  v_ledger_id := public.append_audit(
    v_actor,
    'attendance.created',
    'attendance',
    v_att_id,
    jsonb_build_object(
      'attendance_id', v_att_id,
      'subject_id', p_subject_id,
      'student_id', p_student_id,
      'teacher_id', v_actor,
      'session_date', p_session_date,
      'status', p_status,
      'sem', v_sem,
      'zam', v_zam,
      'client_event_id', p_client_event_id
    )
  );

  insert into public.sync_receipts (
    client_event_id, user_id, event_type, entity_id, transaction_id, ledger_id, ok
  )
  values (
    p_client_event_id, v_actor, 'attendance', v_att_id, v_tx_id, v_ledger_id, true
  )
  on conflict (client_event_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'deduped', false, 'kind', 'attendance',
    'attendance_id', v_att_id,
    'transaction_id', v_tx_id,
    'ledger_id', v_ledger_id,
    'sem', v_sem, 'zam', v_zam,
    'applied_at', now()
  );
end;
$$;

revoke all on function public.apply_attendance_event(uuid, uuid, uuid, date, text, text, timestamptz)
  from public, anon;
grant execute on function public.apply_attendance_event(uuid, uuid, uuid, date, text, text, timestamptz)
  to authenticated;

-- >>> INICIO DE 0009_rpc_adjustment_event.sql <<<
-- =====================================================================
-- 0009 — RPC apply_adjustment_event (corrección por disputa + canjes)
-- ZAMORA
--
-- Uso:
--   • dispute.resolved_corrected → el admin revierte el saldo de la nota
--     original y registra el ajuste compensatorio.
--   • redeem.approved/fulfilled  → descuenta ZAM por un canje.
--
-- Reglas duras:
--   • Solo admin activo.
--   • Nunca deja saldos negativos (respeta el CHECK de balances).
--   • Idempotente por client_event_id.
--   • Todo ajuste queda en el ledger encadenado con su payload completo.
-- =====================================================================

create or replace function public.apply_adjustment_event(
  p_client_event_id uuid,
  p_profile_id      uuid,
  p_amount_zam      numeric,
  p_amount_sem      numeric,
  p_ref_type        text,
  p_ref_id          uuid,
  p_reason          text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor     uuid := auth.uid();
  v_role      text;
  v_tx_id     uuid;
  v_ledger_id bigint;
  v_receipt   record;
  v_zam       numeric;
  v_sem       numeric;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_event_id::text, 0));

  select * into v_receipt
  from public.sync_receipts
  where client_event_id = p_client_event_id;

  if found then
    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'adjustment',
      'transaction_id', v_receipt.transaction_id,
      'ledger_id', v_receipt.ledger_id,
      'applied_at', v_receipt.applied_at
    );
  end if;

  -- --- Autenticación reforzada -------------------------------------
  select role into v_role from public.profiles where id = v_actor and status = 'active';
  if v_role is distinct from 'admin' then
    raise exception 'Solo la administración puede ajustar saldos'
      using errcode = '42501';
  end if;

  if p_ref_type is null
     or p_ref_type not in ('grade', 'attendance', 'adjustment', 'redemption', 'dispute') then
    raise exception 'Tipo de referencia inválido: %', p_ref_type;
  end if;

  if p_amount_zam is null and p_amount_sem is null
     or coalesce(p_amount_zam, 0) = 0 and coalesce(p_amount_sem, 0) = 0 then
    raise exception 'El ajuste debe mover al menos un saldo';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_profile_id and status = 'active'
  ) then
    raise exception 'El estudiante no está acreditado' using errcode = '42501';
  end if;

  -- --- Verificación de saldo suficiente ------------------------------
  select coalesce(sum(amount_zam), 0), coalesce(sum(amount_sem), 0)
    into v_zam, v_sem
  from public.transactions
  where profile_id = p_profile_id;

  if coalesce(p_amount_zam, 0) + v_zam < 0 then
    raise exception 'ZAM insuficiente: saldo % y ajuste %', v_zam, p_amount_zam;
  end if;

  if coalesce(p_amount_sem, 0) + v_sem < 0 then
    raise exception 'SEM insuficiente: saldo % y ajuste %', v_sem, p_amount_sem;
  end if;

  -- --- Persistencia --------------------------------------------------
  insert into public.transactions (
    profile_id, type, amount_zam, amount_sem, ref_type, ref_id,
    reason, created_by, client_event_id
  )
  values (
    p_profile_id, 'adjust', coalesce(p_amount_zam, 0), coalesce(p_amount_sem, 0),
    p_ref_type, p_ref_id, p_reason, v_actor, p_client_event_id
  )
  on conflict (client_event_id) do nothing
  returning id into v_tx_id;

  insert into public.balances (profile_id, zam, sem)
  values (p_profile_id, coalesce(p_amount_zam, 0), coalesce(p_amount_sem, 0))
  on conflict (profile_id) do update set
    zam        = public.balances.zam + excluded.zam,
    sem        = public.balances.sem + excluded.sem,
    updated_at = now();

  v_ledger_id := public.append_audit(
    v_actor,
    'balance.adjusted',
    'adjustment',
    v_tx_id,
    jsonb_build_object(
      'profile_id', p_profile_id,
      'amount_zam', coalesce(p_amount_zam, 0),
      'amount_sem', coalesce(p_amount_sem, 0),
      'ref_type', p_ref_type,
      'ref_id', p_ref_id,
      'reason', p_reason,
      'balance_after', jsonb_build_object('zam', v_zam + coalesce(p_amount_zam, 0),
                                           'sem', v_sem + coalesce(p_amount_sem, 0)),
      'client_event_id', p_client_event_id
    )
  );

  insert into public.sync_receipts (
    client_event_id, user_id, event_type, transaction_id, ledger_id, ok
  )
  values (
    p_client_event_id, v_actor, 'adjustment', v_tx_id, v_ledger_id, true
  )
  on conflict (client_event_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'deduped', false, 'kind', 'adjustment',
    'transaction_id', v_tx_id,
    'ledger_id', v_ledger_id,
    'balance_after', jsonb_build_object(
      'zam', v_zam + coalesce(p_amount_zam, 0),
      'sem', v_sem + coalesce(p_amount_sem, 0)
    ),
    'applied_at', now()
  );
end;
$$;

revoke all on function public.apply_adjustment_event(uuid, uuid, numeric, numeric, text, uuid, text)
  from public, anon;
grant execute on function public.apply_adjustment_event(uuid, uuid, numeric, numeric, text, uuid, text)
  to authenticated;

-- >>> INICIO DE 0011_rpc_activate_account.sql <<<
-- =====================================================================
-- 0011 — RPC activate_account
-- ZAMORA · acreditación por padrón + código temporal
--
-- El usuario NO puede activar su propia cuenta con UPDATE directo:
--   · RLS no permite escribir en rosters
--   · el trigger anti-escalación bloquea cambiar profiles.status
-- Por eso la activación es una función SECURITY DEFINER que valida
-- el código contra el padrón del propio solicitante.
-- =====================================================================

create or replace function public.activate_account(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor    uuid := auth.uid();
  v_roster   record;
  v_ledger   bigint;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_code is null or length(trim(p_code)) < 6 then
    raise exception 'Código de activación inválido';
  end if;

  select * into v_roster
  from public.rosters
  where profile_id = v_actor
    and active
    and activation_code_hash = encode(digest(trim(p_code), 'sha256'), 'hex')
  order by activation_expires_at desc nulls last
  limit 1;

  if not found then
    raise exception
      'El código no corresponde a tu registro en el padrón' using errcode = '42501';
  end if;

  if v_roster.activation_expires_at is not null
     and v_roster.activation_expires_at < now() then
    raise exception
      'El código expiró el %; solicita uno nuevo a la administración',
      to_char(v_roster.activation_expires_at, 'DD/MM/YYYY HH24:MI') using errcode = '42501';
  end if;

  -- Roaster acreditado: el código se consume (un solo uso)
  update public.rosters
  set activated_at          = now(),
      activation_code_hash  = null,
      activation_expires_at = null,
      updated_at            = now()
  where id = v_roster.id;

  -- El trigger anti-escalación admite esta escritura porque la bandera es
  -- local a esta transacción (tercer argumento = true) y muere en el COMMIT.
  perform set_config('zamora.allow_profile_write', 'on', true);

  update public.profiles
  set status = 'active', updated_at = now()
  where id = v_actor;

  v_ledger := public.append_audit(
    v_actor,
    'profile.activated',
    'profile',
    v_actor,
    jsonb_build_object(
      'profile_id', v_actor,
      'career', v_roster.career,
      'campus', v_roster.campus,
      'roster_id', v_roster.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'career', v_roster.career,
    'campus', v_roster.campus,
    'ledger_id', v_ledger,
    'activated_at', now()
  );
end;
$$;

revoke all on function public.activate_account(text) from public, anon;
grant execute on function public.activate_account(text) to authenticated;

-- ---------------------------------------------------------------------
-- Verificación del flujo (requiere el rol student autenticado)
--   select public.activate_account('ZAMORA-XXXXXXXX');
--   select status from profiles where id = auth.uid();  -- 'active'
-- =====================================================================


-- >>> INICIO DE 0012_rpc_disputes.sql <<<
-- =====================================================================
-- 0012 — RPC open_grade_dispute
-- ZAMORA · verificación y corrección de discrepancias por el estudiante
--
-- El estudiante no puede escribir directamente en grade_disputes (RLS),
-- y no le corresponde decidir a quién pertenece la calificación: la
-- función completa student_id y teacher_id a partir de la nota.
--
-- Justificación: Limitación 1 de la especificación — no existe API del
-- sistema central que permita corregir notas, por lo que ZAMORA resuelve
-- la discrepancia internamente y deja constancia en el ledger.
-- =====================================================================

create or replace function public.open_grade_dispute(
  p_grade_id  uuid,
  p_reason    text,
  p_evidence  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor   uuid := auth.uid();
  v_grade   record;
  v_dispute uuid;
  v_ledger  bigint;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'El motivo debe tener al menos 10 caracteres';
  end if;

  select * into v_grade
  from public.grades
  where id = p_grade_id
    and student_id = v_actor
    and status = 'active';

  if not found then
    raise exception 'La calificación no existe o no te pertenece' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.grade_disputes
    where grade_id = p_grade_id
      and student_id = v_actor
      and status in ('open', 'in_review')
  ) then
    raise exception 'Ya tienes una disputa abierta para esta calificación'
      using errcode = '23505';
  end if;

  insert into public.grade_disputes (grade_id, student_id, teacher_id, reason, evidence)
  values (p_grade_id, v_actor, v_grade.teacher_id, trim(p_reason), p_evidence)
  returning id into v_dispute;

  v_ledger := public.append_audit(
    v_actor,
    'dispute.opened',
    'dispute',
    v_dispute,
    jsonb_build_object(
      'dispute_id', v_dispute,
      'grade_id', p_grade_id,
      'student_id', v_actor,
      'teacher_id', v_grade.teacher_id,
      'reason', trim(p_reason),
      'evidence_present', p_evidence is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dispute_id', v_dispute,
    'teacher_id', v_grade.teacher_id,
    'ledger_id', v_ledger,
    'created_at', now()
  );
end;
$$;

revoke all on function public.open_grade_dispute(uuid, text, text) from public, anon;
grant execute on function public.open_grade_dispute(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Resolución por administración (deja constancia en el ledger)
-- ---------------------------------------------------------------------
create or replace function public.resolve_grade_dispute(
  p_dispute_id uuid,
  p_status     text,
  p_resolution text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor   uuid := auth.uid();
  v_role    text;
  v_dispute record;
  v_ledger  bigint;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select role into v_role from public.profiles where id = v_actor and status = 'active';
  if v_role is distinct from 'admin' then
    raise exception 'Solo la administración puede resolver una disputa'
      using errcode = '42501';
  end if;

  if p_status not in ('resolved_upheld', 'resolved_corrected', 'rejected', 'closed') then
    raise exception 'Estado de resolución inválido: %', p_status;
  end if;

  if p_resolution is null or length(trim(p_resolution)) < 10 then
    raise exception 'La resolución debe documentarse con al menos 10 caracteres';
  end if;

  select * into v_dispute from public.grade_disputes where id = p_dispute_id;
  if not found then
    raise exception 'La disputa no existe' using errcode = '42501';
  end if;

  if v_dispute.status not in ('open', 'in_review') then
    raise exception 'La disputa ya fue resuelta';
  end if;

  update public.grade_disputes
  set status      = p_status,
      resolution  = trim(p_resolution),
      resolved_at = now(),
      resolved_by = v_actor,
      updated_at  = now()
  where id = p_dispute_id;

  v_ledger := public.append_audit(
    v_actor,
    'dispute.resolved',
    'dispute',
    p_dispute_id,
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'grade_id', v_dispute.grade_id,
      'status', p_status,
      'resolution', trim(p_resolution)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dispute_id', p_dispute_id,
    'ledger_id', v_ledger,
    'resolved_at', now()
  );
end;
$$;

revoke all on function public.resolve_grade_dispute(uuid, text, text) from public, anon;
grant execute on function public.resolve_grade_dispute(uuid, text, text) to authenticated;


-- >>> INICIO DE 0013_activation_codes.sql <<<
-- =====================================================================
-- 0013 — RPC issue_activation_code
-- ZAMORA · emisión de códigos temporales de acreditación
--
-- Lo invoca exclusivamente el portal de administración, a través del
-- server action `issueActivationCode` con la service_role key: el cliente
-- nunca obtiene EXECUTE, de modo que ningún usuario puede autoemitirse un
-- código ni ascertain si una dirección está en el padrón.
--
-- La base de datos solo guarda el SHA-256 del código; el texto plano
-- se devuelve una única vez al panel y expire en 24 horas.
-- =====================================================================

create or replace function public.issue_activation_code(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_profile uuid;
  v_roster  uuid;
  v_code    text;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Correo requerido';
  end if;

  select id into v_profile
  from public.profiles
  where lower(email) = lower(btrim(p_email));

  if v_profile is null then
    raise exception 'No existe un perfil con ese correo';
  end if;

  select id into v_roster
  from public.rosters
  where profile_id = v_profile and active
  order by created_at desc
  limit 1;

  if v_roster is null then
    raise exception
      'El usuario no tiene una entrada activa en el padrón; agrégalo primero';
  end if;

  v_code := 'ZAMORA-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));

  update public.rosters
  set activation_code_hash  = encode(digest(v_code, 'sha256'), 'hex'),
      activation_expires_at = now() + interval '24 hours',
      activated_at          = null,
      updated_at            = now()
  where id = v_roster;

  -- Reemitir un código reactiva la acreditación pendiente: el trigger
  -- anti-escalación lo permite solo con esta bandera transaccional.
  perform set_config('zamora.allow_profile_write', 'on', true);

  update public.profiles
  set status = 'pending', updated_at = now()
  where id = v_profile and status = 'suspended';

  perform public.append_audit(
    null,
    'roster.activation_code_issued',
    'roster',
    v_roster,
    jsonb_build_object(
      'profile_id', v_profile,
      'expires_at', now() + interval '24 hours'
    )
  );

  return v_code;
end;
$$;

revoke all on function public.issue_activation_code(text) from public, anon, authenticated;
grant execute on function public.issue_activation_code(text) to service_role;

-- ---------------------------------------------------------------------
-- Verificación (solo service_role / SQL Editor):
--   select public.issue_activation_code('estudiante@zamora.test');
--   select profile_id, activation_expires_at, activated_at from rosters;
-- =====================================================================

-- >>> INICIO DE 0014_rewards.sql <<<
-- =====================================================================
-- 0014 — Canje de recompensas (ZAM)
-- ZAMORA
--
-- El canje es el único movimiento que resta saldo. Por diseño vive en un
-- RPC SECURITY DEFINER y nunca en una escritura directa del cliente:
--   • valida sesión, acreditación (padrón activo) y saldo suficiente;
--   • descuenta el stock si la recompensa es limitada;
--   • es idempotente por client_event_id (reintentar el canje no cobra dos
--     veces);
--   • deja el descuento y la resolución firmados en el ledger encadenado.
--
-- Estados: pending (requiere aprobación) → approved → fulfilled
--           rejected / cancelled → devuelve el ZAM en depósito.
-- =====================================================================

create or replace function public.redeem_reward(
  p_reward_id      uuid,
  p_client_event_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor     uuid := auth.uid();
  v_reward    record;
  v_redemption uuid;
  v_tx_id     uuid;
  v_ledger_id bigint;
  v_receipt   record;
  v_zam       numeric;
  v_status    text;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_event_id::text, 0));

  -- Reintento del mismo canje: se devuelve el resultado original
  select r.* into v_receipt
  from public.sync_receipts s
  join public.redemptions r on r.id = s.entity_id::uuid
  where s.client_event_id = p_client_event_id;

  if found then
    return jsonb_build_object(
      'ok', true, 'deduped', true, 'kind', 'redemption',
      'redemption_id', v_receipt.id,
      'status', v_receipt.status,
      'ledger_id', (select ledger_id from public.sync_receipts
                     where client_event_id = p_client_event_id),
      'applied_at', now()
    );
  end if;

  -- --- Autenticación reforzada ---------------------------------------
  if not public.is_active_user() then
    raise exception 'Tu cuenta no está acreditada' using errcode = '42501';
  end if;

  if not public.has_active_roster(v_actor) then
    raise exception 'No figuras en el padrón activo: no puedes canjear'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles where id = v_actor and role = 'student'
  ) then
    raise exception 'Solo los estudiantes pueden canjear recompensas'
      using errcode = '42501';
  end if;

  select * into v_reward
  from public.reward_catalog
  where id = p_reward_id and active;

  if not found then
    raise exception 'La recompensa no está disponible';
  end if;

  if v_reward.stock_type = 'limited' and coalesce(v_reward.stock, 0) <= 0 then
    raise exception 'No quedan unidades de "%"', v_reward.name;
  end if;

  -- --- Saldo suficiente ------------------------------------------------
  select coalesce(zam, 0) into v_zam
  from public.balances
  where profile_id = v_actor;

  if v_zam < v_reward.cost_zam then
    raise exception
      'ZAM insuficiente: tienes %, necesitas % para "%"',
      v_zam, v_reward.cost_zam, v_reward.name;
  end if;

  v_status := case when v_reward.requires_approval then 'pending' else 'approved' end;

  -- --- Persistencia ----------------------------------------------------
  insert into public.redemptions (student_id, reward_id, cost_zam, status, client_event_id)
  values (v_actor, v_reward.id, v_reward.cost_zam, v_status, p_client_event_id)
  returning id into v_redemption;

  insert into public.transactions (
    profile_id, type, amount_zam, amount_sem, ref_type, ref_id,
    reason, created_by, client_event_id
  )
  values (
    v_actor, 'redeem', -v_reward.cost_zam, 0, 'redemption', v_redemption,
    'Canje: ' || v_reward.name, v_actor, p_client_event_id
  )
  returning id into v_tx_id;

  update public.balances
  set zam = zam - v_reward.cost_zam, updated_at = now()
  where profile_id = v_actor;

  if v_reward.stock_type = 'limited' then
    update public.reward_catalog
    set stock = stock - 1, updated_at = now()
    where id = v_reward.id;
  end if;

  v_ledger_id := public.append_audit(
    v_actor,
    'reward.redeemed',
    'redemption',
    v_redemption,
    jsonb_build_object(
      'reward_id', v_reward.id,
      'reward_name', v_reward.name,
      'cost_zam', v_reward.cost_zam,
      'status', v_status,
      'requires_approval', v_reward.requires_approval,
      'transaction_id', v_tx_id,
      'balance_after', jsonb_build_object('zam', v_zam - v_reward.cost_zam),
      'client_event_id', p_client_event_id
    )
  );

  insert into public.sync_receipts (
    client_event_id, user_id, event_type, entity_id, transaction_id, ledger_id, ok
  )
  values (p_client_event_id, v_actor, 'redemption', v_redemption, v_tx_id, v_ledger_id, true)
  on conflict (client_event_id) do nothing;

  return jsonb_build_object(
    'ok', true, 'deduped', false, 'kind', 'redemption',
    'redemption_id', v_redemption,
    'transaction_id', v_tx_id,
    'status', v_status,
    'cost_zam', v_reward.cost_zam,
    'balance_after', jsonb_build_object('zam', v_zam - v_reward.cost_zam),
    'ledger_id', v_ledger_id,
    'applied_at', now()
  );
end;
$$;

revoke all on function public.redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- Resolución del canje por parte de la administración.
-- Al rechazar se devuelve el ZAM como movimiento 'adjust' con ref_type
-- 'redemption', de modo que el saldo siempre se explica con la suma de sus
-- transacciones (no con un UPDATE suelto).
-- ---------------------------------------------------------------------
create or replace function public.settle_redemption(
  p_redemption_id uuid,
  p_action        text,
  p_reason        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor    uuid := auth.uid();
  v_red      record;
  v_reward   text;
  v_tx_id    uuid;
  v_ledger_id bigint;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_action not in ('approve', 'reject', 'fulfill') then
    raise exception 'Acción inválida: %', p_action;
  end if;

  select * into v_red
  from public.redemptions
  where id = p_redemption_id
  for update;

  if not found then
    raise exception 'El canje no existe';
  end if;

  if not public.is_admin() then
    raise exception 'Solo la administración puede resolver canjes'
      using errcode = '42501';
  end if;

  if v_red.status not in ('pending', 'approved') then
    raise exception 'El canje ya está en estado %', v_red.status;
  end if;

  if p_action = 'reject' and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'Explica el motivo del rechazo';
  end if;

  select name into v_reward
  from public.reward_catalog
  where id = v_red.reward_id;

  if p_action = 'approve' then
    update public.redemptions
    set status = 'approved', approved_by = v_actor, approved_at = now()
    where id = v_red.id;

  elsif p_action = 'fulfill' then
    update public.redemptions
    set status = 'fulfilled',
        approved_by = coalesce(approved_by, v_actor),
        approved_at = coalesce(approved_at, now()),
        fulfilled_at = now()
    where id = v_red.id;

  else -- reject
    update public.redemptions
    set status = 'rejected', rejected_reason = p_reason,
        approved_by = v_actor, approved_at = now()
    where id = v_red.id;

    -- Devolución del ZAM retenido
    insert into public.transactions (
      profile_id, type, amount_zam, amount_sem, ref_type, ref_id,
      reason, created_by, client_event_id
    )
    values (
      v_red.student_id, 'adjust', v_red.cost_zam, 0, 'redemption', v_red.id,
      'Devolución por canje rechazado: ' || coalesce(v_reward, 'recompensa'),
      v_actor, gen_random_uuid()
    )
    returning id into v_tx_id;

    update public.balances
    set zam = zam + v_red.cost_zam, updated_at = now()
    where profile_id = v_red.student_id;

    if exists (
      select 1 from public.reward_catalog
      where id = v_red.reward_id and stock_type = 'limited'
    ) then
      update public.reward_catalog
      set stock = stock + 1, updated_at = now()
      where id = v_red.reward_id;
    end if;
  end if;

  v_ledger_id := public.append_audit(
    v_actor,
    'redemption.' || p_action,
    'redemption',
    v_red.id,
    jsonb_build_object(
      'student_id', v_red.student_id,
      'reward_id', v_red.reward_id,
      'cost_zam', v_red.cost_zam,
      'from_status', v_red.status,
      'to_status', case p_action
                     when 'approve' then 'approved'
                     when 'fulfill' then 'fulfilled'
                     else 'rejected'
                   end,
      'reason', p_reason,
      'refund_transaction_id', v_tx_id
    )
  );

  return jsonb_build_object(
    'ok', true, 'redemption_id', v_red.id,
    'action', p_action, 'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.settle_redemption(uuid, text, text) from public, anon;
grant execute on function public.settle_redemption(uuid, text, text) to authenticated;


-- =====================================================================
-- Moderación de la comunidad
--
-- La política `posts_update_admin` permite a un admin escribir la tabla
-- directamente, pero eso dejaría la moderación fuera del ledger. El panel
-- usa este RPC para que cada decisión quede en `moderation_logs` y firmada
-- en la cadena: publicar, bloquear, restaurar y retirar son todos
-- reversibles y documentados.
-- =====================================================================
create or replace function public.moderate_community_post(
  p_post_id uuid,
  p_action  text,
  p_reason  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_post  record;
  v_status text;
  v_log   text;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Solo la administración modera la comunidad'
      using errcode = '42501';
  end if;

  case p_action
    when 'approve' then v_status := 'published'; v_log := 'approve';
    when 'block'   then v_status := 'blocked';   v_log := 'block';
    when 'remove'  then v_status := 'removed';  v_log := 'remove';
    when 'restore' then v_status := 'published'; v_log := 'restore';
    else raise exception 'Acción de moderación inválida: %', p_action;
  end case;

  if p_action in ('block', 'remove')
     and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'Bloquear o retirar exige un motivo (mínimo 5 caracteres)';
  end if;

  select * into v_post
  from public.community_posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'La publicación no existe';
  end if;

  update public.community_posts
  set status = v_status,
      moderated_by = v_actor,
      moderated_at = now(),
      moderation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_post_id;

  insert into public.moderation_logs (moderator_id, post_id, action, reason)
  values (v_actor, p_post_id, v_log, nullif(trim(coalesce(p_reason, '')), ''));

  return jsonb_build_object(
    'ok', true,
    'post_id', p_post_id,
    'status', v_status,
    'moderated_by', v_actor,
    'ledger_id', public.append_audit(
      v_actor,
      'community.' || p_action,
      'community_post',
      p_post_id,
      jsonb_build_object(
        'author_id', v_post.author_id,
        'from_status', v_post.status,
        'to_status', v_status,
        'reason', p_reason
      )
    )
  );
end;
$$;

revoke all on function public.moderate_community_post(uuid, text, text)
  from public, anon;
grant execute on function public.moderate_community_post(uuid, text, text) to authenticated;


-- =====================================================================
-- Anuncios institucionales
-- Crear o actualizar un anuncio desde el panel, firmando la publicación.
-- =====================================================================
create or replace function public.save_announcement(
  p_id         uuid,
  p_title      text,
  p_body       text,
  p_target     text,
  p_status     text,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
  v_prev  text;
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Solo la administración publica anuncios'
      using errcode = '42501';
  end if;

  if coalesce(length(trim(p_title)), 0) < 5
     or coalesce(length(trim(p_body)), 0) < 10 then
    raise exception 'El anuncio necesita un título y un mensaje con contenido';
  end if;

  if p_target not in ('all', 'students', 'teachers', 'admins') then
    raise exception 'Destinatario inválido: %', p_target;
  end if;

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Estado inválido: %', p_status;
  end if;

  -- Editar un anuncio existente nunca debe duplicarlo.
  if p_id is not null then
    select status into v_prev
    from public.announcements
    where id = p_id
    for update;

    if v_prev is not null then
      update public.announcements
      set title = trim(p_title),
          body = trim(p_body),
          target = p_target,
          status = p_status,
          expires_at = p_expires_at,
          published_at = case
            when p_status = 'published' and published_at is null then now()
            else published_at
          end
      where id = p_id
      returning id into v_id;

      v_id := p_id;
    end if;
  end if;

  if v_id is null then
    insert into public.announcements (
      title, body, author_id, target, status, expires_at, published_at
    )
    values (
      trim(p_title), trim(p_body), v_actor, p_target, p_status, p_expires_at,
      case when p_status = 'published' then now() else null end
    )
    returning id into v_id;
  end if;

  perform public.append_audit(
    v_actor,
    case when v_prev is null then 'announcement.created'
         else 'announcement.' || p_status
    end,
    'announcement',
    v_id,
    jsonb_build_object(
      'title', trim(p_title),
      'target', p_target,
      'from_status', v_prev,
      'to_status', p_status,
      'expires_at', p_expires_at
    )
  );

  return v_id;
end;
$$;

revoke all on function public.save_announcement(uuid, text, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.save_announcement(uuid, text, text, text, text, timestamptz)
  to authenticated;


-- ---------------------------------------------------------------------
-- Verificación (requiere service_role / SQL Editor):
--   select * from public.reward_catalog order by cost_zam;
--   select public.settle_redemption('<uuid>', 'reject', 'Sin stock real');
--   select public.moderate_community_post('<uuid>', 'approve', null);
--   select public.save_announcement(null, 'Convocatoria', 'Texto del aviso…',
--                                   'all', 'published', now() + interval '30 days');
-- =====================================================================

-- =========================================================
-- CONFIGURACION INICIAL OBLIGATORIA DEL LEDGER
-- =========================================================
select public.set_ledger_secret('zamora_secret_ledger_key_segura_unellez_2026');

-- =========================================================
-- SINCRONIZAR Y ACTIVAR USUARIOS REGISTRADOS PREVIAMENTE
-- =========================================================
insert into public.profiles (id, email, full_name, role, status)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  'student',
  'active'
from auth.users u
on conflict (id) do update set status = 'active';

insert into public.balances (profile_id)
select u.id from auth.users u
on conflict (profile_id) do nothing;
