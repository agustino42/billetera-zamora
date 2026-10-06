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
