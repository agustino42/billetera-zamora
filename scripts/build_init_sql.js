const fs = require('fs');
const path = require('path');

const files = [
  '0001_extensions.sql',
  '0002_schema.sql',
  '0003_audit_append_only.sql',
  '0004_audit_chain.sql',
  '0005_rls.sql',
  '0006_seed_catalogs.sql',
  '0007_rpc_grade_event.sql',
  '0008_rpc_attendance_event.sql',
  '0009_rpc_adjustment_event.sql',
  '0011_rpc_activate_account.sql',
  '0012_rpc_disputes.sql',
  '0013_activation_codes.sql',
  '0014_rewards.sql'
];

let out = '-- =========================================================\n';
out += '-- ZAMORA: SCRIPT UNIFICADO DE INICIALIZACION DE BASE DE DATOS\n';
out += '-- Ejecutar en Supabase -> SQL Editor -> New query -> Run\n';
out += '-- =========================================================\n\n';

// 1. Limpieza de tablas previas
out += `-- >>> LIMPIEZA PREVIA DE TABLAS ANTERIORES O INCOMPLETAS <<<\n`;
out += `drop table if exists public.activation_codes cascade;
drop table if exists public.ledger_keys cascade;
drop table if exists public.feature_flags cascade;
drop table if exists public.sync_receipts cascade;
drop table if exists public.pending_sync cascade;
drop table if exists public.audit_ledger cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.moderation_logs cascade;
drop table if exists public.community_posts cascade;
drop table if exists public.announcements cascade;
drop table if exists public.teacher_reputation cascade;
drop table if exists public.redemptions cascade;
drop table if exists public.rewards cascade;
drop table if exists public.reward_catalog cascade;
drop table if exists public.transactions cascade;
drop table if exists public.balances cascade;
drop table if exists public.rate_tables cascade;
drop table if exists public.grade_disputes cascade;
drop table if exists public.grades cascade;
drop table if exists public.attendance cascade;
drop table if exists public.enrollments cascade;
drop table if exists public.courses cascade;
drop table if exists public.subjects cascade;
drop table if exists public.programs cascade;
drop table if exists public.rosters cascade;
drop table if exists public.users cascade;
drop table if exists public.profiles cascade;

-- >>> LIMPIEZA PREVIA DE FUNCIONES (evita error 42P13 por cambio de tipo de retorno) <<<
drop function if exists public.current_role cascade;
drop function if exists public.current_status cascade;
drop function if exists public.is_active_user cascade;
drop function if exists public.is_admin cascade;
drop function if exists public.is_teacher_of cascade;
drop function if exists public.is_enrolled cascade;
drop function if exists public.has_active_roster cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists public.prevent_profile_privilege_change cascade;
drop function if exists public.set_updated_at cascade;
drop function if exists public.prevent_audit_mod cascade;
drop function if exists public.set_ledger_secret cascade;
drop function if exists public.canonical_json cascade;
drop function if exists public.sha256_hex cascade;
drop function if exists public.iso_utc cascade;
drop function if exists public.ledger_sign cascade;
drop function if exists public.compute_chain_hash cascade;
drop function if exists public.append_audit cascade;
drop function if exists public.verify_audit_chain cascade;
drop function if exists public.compute_earn cascade;
drop function if exists public.apply_grade_event cascade;
drop function if exists public.apply_attendance_event cascade;
drop function if exists public.apply_adjustment_event cascade;
drop function if exists public.activate_account cascade;
drop function if exists public.open_grade_dispute cascade;
drop function if exists public.resolve_grade_dispute cascade;
drop function if exists public.issue_activation_code cascade;
drop function if exists public.redeem_reward cascade;
drop function if exists public.settle_redemption cascade;
drop function if exists public.moderate_community_post cascade;
drop function if exists public.save_announcement cascade;

-- >>> LIMPIEZA PREVIA DE TIPOS PERSONALIZADOS ANTIGUOS <<<
drop type if exists public.user_role cascade;
drop type if exists public.account_status cascade;
drop type if exists public.grade_type cascade;
drop type if exists public.role cascade;
drop type if exists public.status cascade;
\n`;

for (const f of files) {
  const filePath = path.join(__dirname, '../supabase/migrations', f);
  if (fs.existsSync(filePath)) {
    out += `\n-- >>> INICIO DE ${f} <<<\n`;
    out += fs.readFileSync(filePath, 'utf8') + '\n';
  }
}

out += '\n-- =========================================================\n';
out += '-- CONFIGURACION INICIAL OBLIGATORIA DEL LEDGER\n';
out += '-- =========================================================\n';
out += "select public.set_ledger_secret('zamora_secret_ledger_key_segura_unellez_2026');\n\n";

out += '-- =========================================================\n';
out += '-- SINCRONIZAR Y ACTIVAR USUARIOS REGISTRADOS PREVIAMENTE\n';
out += '-- =========================================================\n';
out += `insert into public.profiles (id, email, full_name, role, status)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  'student',
  'active'
from auth.users u
on conflict (id) do update set status = 'active';

insert into public.balances (profile_id)
select u.id from auth.users u
on conflict (profile_id) do nothing;
`;

const dest = path.join(__dirname, '../supabase/init_database.sql');
fs.writeFileSync(dest, out, 'utf8');
console.log(`Script unificado actualizado en: ${dest} (${out.length} bytes)`);
