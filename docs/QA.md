# QA y despliegue — ZAMORA

Runbook operativo. Todo lo que aparece aquí está verificado contra el
código del repositorio; lo que depende de un entorno real está marcado
como **requiere entorno**.

## 1. Requisitos

- Node 20 LTS o superior.
- Un proyecto Supabase con Postgres 15 o superior.
- `git` no es necesario para operar, pero sí para desplegar.

## 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

| Variable | Uso | Visible en cliente |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto | sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anon (RLS) | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | verificación de auditoría y emisión de códigos | **no** |
| `NEXT_PUBLIC_SITE_URL` | origen absoluto para PWA y redirecciones | sí |

La `service_role` solo se usa en servidor (`src/app/api/audit/verify`,
`src/features/auth/activate/server.ts`). Si una variable `NEXT_PUBLIC_*`
aparece en un componente cliente, se filtra al bundle: no la coloques ahí.

## 3. Migraciones

Aplica **en orden**, porque cada archivo depende del anterior:

```bash
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  npx supabase db push --include-all   # o pega el archivo en el SQL Editor
done
```

Lista y propósito:

| Migración | Contenido |
| --- | --- |
| `0001_extensions.sql` | `pgcrypto`, `pgjwt` y utilidades |
| `0002_schema.sql` | tablas, índices, restricciones de dominio |
| `0003_audit_append_only.sql` | trigger `prevent_audit_mod` sobre el ledger |
| `0004_audit_chain.sql` | encadenamiento por hash, HMAC y `verify_audit_chain` |
| `0005_rls.sql` | RLS en todas las tablas y trigger anti-escalación |
| `0006_seed_catalogs.sql` | catálogos base (materias, tipos de desempeño, comunidad) |
| `0007_rpc_grade_event.sql` | `apply_grade_event` |
| `0008_rpc_attendance_event.sql` | `apply_attendance_event` |
| `0009_rpc_adjustment_event.sql` | `apply_adjustment_event` |
| `0010_dev_seed.sql` | **solo desarrollo**: usuarios de prueba |
| `0011_rpc_activate_account.sql` | `activate_account` |
| `0012_rpc_disputes.sql` | `open_grade_dispute`, `resolve_grade_dispute` |
| `0013_activation_codes.sql` | `issue_activation_code` (solo `service_role`) |
| `0014_rewards.sql` | canje, resolución de canjes, moderación y anuncios |

> `0010_dev_seed.sql` no debe ejecutarse en producción: crea cuentas con
> contraseñas conocidas.

## 4. Llave del ledger

Se configura **una sola vez** por entorno. Sin ella, `append_audit` falla y
ningún evento se registra:

```sql
select public.set_ledger_secret('<al menos 32 caracteres aleatorios>');
```

Para verificar que quedó activa:

```sql
select public.verify_audit_chain(1, 20);
```

Las columnas `payload_ok`, `chain_ok`, `signature_ok` y `prev_ok` deben ser
todas `true`. Un `false` en `signature_ok` significa llave distinta o ledger
manipulado.

## 5. Verificación de la cadena

Desde la interfaz, `/dashboard/admin/auditoria` ejecuta **dos** chequeos:

1. `verify_audit_chain` en Postgres (hash, HMAC y eslabón anterior).
2. Recálculo estructural en Node sobre las filas devueltas.

Si divergen, el panel lo indica. El segundo cálculo no conoce la llave: es
una comprobación independiente de que la secuencia de saldos narrada por el
ledger coincide con las transacciones reales.

Desde consola:

```bash
curl -H "Authorization: Bearer <access_token_admin>" \
  http://localhost:3000/api/audit/verify?from=1&to=100
```

## 6. Comandos de calidad

```bash
npm run lint       # ESLint 9 (flat config)
npm run typecheck  # tsc --noEmit
npm run test       # Vitest: 29 pruebas de dominio (ZAM/SEM y cadena)
npm run test:e2e   # Playwright: 6 pruebas públicas
npm run build      # build de producción + genera public/sw.js
```

Un PR se considera verde cuando las cinco pasan.

## 7. Dependencias

`npm audit --omit=dev` debe reportar **0 vulnerabilidades**. El resto de los
avisos provienen de `shadcn` y `eslint-config-next` a través de `braces`,
que no tiene versión parcheada; son herramientas de línea de comandos y no
se despliegan.

## 8. PWA

- El build genera `public/sw.js`. Está en `.gitignore`: nunca se versiona a
  mano.
- `src/pwa/sw.ts` debe conservar la expresión literal `self.__SW_MANIFEST`.
  Serwist la reemplaza en el build y falla si se usa un alias.
- Supabase y `/api` son `NetworkOnly`. Un saldo desactualizado es peor que un
  error, así que nunca se cachean datos vivos.
- Los iconos se regeneran con `node scripts/generate-icons.mjs`.

## 9. Recorrido de prueba manual (requiere entorno)

1. Registrarse en `/auth/register` y comprobar que la cuenta queda `pending`.
2. Como admin, abrir `/dashboard/admin/rosters`, emitir un código y activarlo en
   `/auth/activate`.
3. El estudiante entra a `/dashboard/estudiante`: saldo en cero, sin notas.
4. El docente registra una nota en `/dashboard/profesor` y el estudiante la ve
   con su equivalente ZAM/SEM derivado de la tasa activa.
5. Cortar la red, registrar otra nota: la captura entra en la cola y se
   sincroniza al volver, sin duplicar el movimiento.
6. El estudiante abre una disputa; el admin la resuelve como «corregida» y
   revierte el saldo con un ajuste negativo desde el padrón.
7. El estudiante canjea una recompensa en su billetera; el admin aprueba o
   rechaza el canje en `/dashboard/admin/canjes` y comprueba que el rechazo
   devuelve el ZAM.
8. Verificar la cadena en `/dashboard/admin/auditoria` y comparar el saldo con
   la suma de sus transacciones.

## 10. Checklist antes de publicar

- [ ] Migraciones aplicadas en orden, sin `0010` en producción.
- [ ] `set_ledger_secret` ejecutado con un valor de 32 caracteres o más.
- [ ] `npm audit --omit=dev` en cero.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` ausente del bundle cliente.
- [ ] `npm run build` regenera `public/sw.js`.
- [ ] Recorrido de la sección 9 completo.
- [ ] ROL, `NEXT_PUBLIC_SITE_URL` y dominio de Supabase correctos.