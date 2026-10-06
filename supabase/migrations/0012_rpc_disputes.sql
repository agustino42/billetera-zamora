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
