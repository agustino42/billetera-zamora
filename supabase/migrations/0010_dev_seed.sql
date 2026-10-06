-- =====================================================================
-- 0010 — Datos de desarrollo (ejecutar SOLO en desarrollo / defensa)
-- ZAMORA
--
-- ⚠️  PRERREQUISITO: primero crea estos 3 usuarios en
--     Supabase → Authentication → Users (con email confirmado ON):
--
--       admin@zamora.test      → rol admin
--       docente@zamora.test    → rol teacher
--       estudiante@zamora.test → rol student
--
--     Luego edita las 3 variables de abajo y ejecuta este archivo.
--     Es idempotente: puedes ejecutarlo las veces que quieras.
-- =====================================================================

-- ⚠️  Si usaste otros correos, reemplaza las 3 comparaciones
--     'admin@zamora.test' / 'docente@zamora.test' / 'estudiante@zamora.test'
--     por los correos reales antes de ejecutar.

begin;

-- Autoriza el mantenimiento directo sobre profiles.status / role dentro de
-- esta transacción (mismo mecanismo que usan los RPC de acreditación).
-- Sin esto, el trigger anti-escalación rechaza el seed si el SQL Editor no
-- conecta como el rol postgres.
select set_config('zamora.allow_profile_write', 'on', true);

-- ---------------------------------------------------------------------
-- 1) Promover roles (el trigger de registro deja todo como student/pending)
-- ---------------------------------------------------------------------
update public.profiles
set role = 'admin', status = 'active'
where email = 'admin@zamora.test';

update public.profiles
set role = 'teacher', status = 'active'
where email = 'docente@zamora.test';

-- El estudiante queda 'pending': debe pasar por /auth/activate
update public.profiles
set status = 'active'
where email = 'estudiante@zamora.test';

-- ---------------------------------------------------------------------
-- 2) Padrón de acreditación (rosters)
-- ---------------------------------------------------------------------
insert into public.rosters (profile_id, career, campus, active, activated_at)
select p.id, 'Ingeniería en Computación', 'UNELLEZ-ZAMORA', true, now()
from public.profiles p
where p.email = 'estudiante@zamora.test'
on conflict (profile_id, career, campus) do update
  set active       = true,
      activated_at = coalesce(public.rosters.activated_at, now());

-- ---------------------------------------------------------------------
-- 3) Materia + inscripción
-- ---------------------------------------------------------------------
insert into public.subjects (code, name, teacher_id, uc, period, active)
select 'CI-501', 'Algoritmos y Estructuras de Datos', p.id, 4, '2026-1', true
from public.profiles p
where p.email = 'docente@zamora.test'
on conflict (code) do update set teacher_id = excluded.teacher_id;

insert into public.enrollments (subject_id, student_id, active)
select s.id, p.id, true
from public.subjects s, public.profiles p
where s.code = 'CI-501' and p.email = 'estudiante@zamora.test'
on conflict (subject_id, student_id) do update set active = true;

-- ---------------------------------------------------------------------
-- 4) Código de activación temporal para probar /auth/activate
--    El texto plano se muestra una vez; la BD solo guarda el SHA-256.
-- ---------------------------------------------------------------------
do $$
declare
  v_student uuid;
  v_code    text := 'ZAMORA-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
begin
  select id into v_student from public.profiles where email = 'estudiante@zamora.test';
  if v_student is null then
    raise notice 'No existe el usuario estudiante@zamora.test: crea los usuarios primero';
    return;
  end if;

  update public.rosters
  set activation_code_hash  = encode(digest(v_code, 'sha256'), 'hex'),
      activation_expires_at = now() + interval '24 hours',
      activated_at          = null
  where profile_id = v_student;

  update public.profiles set status = 'pending' where id = v_student;

  raise notice 'Código de activación temporal: %', v_code;
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- 5) Emitir códigos de activación
-- ---------------------------------------------------------------------
-- El RPC reutilizable vive en 0013_activation_codes.sql:
--   select public.issue_activation_code('estudiante@zamora.test');

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select p.email, p.role, p.status, b.zam, b.sem
from public.profiles p
left join public.balances b on b.profile_id = p.id
order by p.role desc, p.email;

select code, name, uc, period, teacher_id from public.subjects order by code;