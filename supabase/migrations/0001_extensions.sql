-- =====================================================================
-- 0001 — Extensiones
-- ZAMORA · Billetera Estudiantil de Rendimiento Académico
-- Ejecutar en Supabase → SQL Editor (en orden ascendente)
-- =====================================================================

-- pgcrypto: gen_random_uuid(), sha256(), digest(), hmac()
-- Nota: en Supabase suele instalarse en el esquema "extensions".
-- Si tu proyecto lo tiene en "extensions", cambia la línea por:
--   create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;

-- Verificación
select extname, extversion from pg_extension where extname = 'pgcrypto';