-- =====================================================================
-- 0003 — audit_ledger: append-only real
-- ZAMORA · trigger de bloqueo + revocación de permisos
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Rechazar UPDATE / DELETE a nivel de trigger
-- ---------------------------------------------------------------------
create or replace function public.prevent_audit_mod()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_ledger es append-only: % no permitido', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_no_mod on public.audit_ledger;
create trigger trg_audit_no_mod
before update or delete on public.audit_ledger
for each row execute function public.prevent_audit_mod();

-- ---------------------------------------------------------------------
-- 2) Revocar permisos directos de escritura
--    Las inserciones solo pueden ocurrir dentro de las funciones
--    SECURITY DEFINER (0004 / 0007 / 0008 / 0009).
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate on public.audit_ledger from anon;
revoke insert, update, delete, truncate on public.audit_ledger from authenticated;
revoke insert, update, delete, truncate on public.audit_ledger from public;

-- ---------------------------------------------------------------------
-- 3) Sin TRUNCATE ni drops silenciosos: nadie debe poder vaciar la cadena
-- ---------------------------------------------------------------------
revoke truncate on public.audit_ledger from public;

-- ---------------------------------------------------------------------
-- Verificación de la instalación
-- ---------------------------------------------------------------------
-- Debe fallar (append-only):  update audit_ledger set action='x' where seq=1;
-- Debe fallar (append-only):  delete from audit_ledger where seq=1;
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.audit_ledger'::regclass and not tgisinternal;