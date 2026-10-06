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