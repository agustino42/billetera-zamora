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