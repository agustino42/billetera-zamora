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