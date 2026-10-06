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