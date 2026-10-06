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