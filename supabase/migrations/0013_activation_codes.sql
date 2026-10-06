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