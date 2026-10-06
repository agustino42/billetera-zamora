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