# ZAMORA — reglas del repositorio

Billetera estudiantil de reconocimiento verificable del desempeño curricular.
Next.js 15.5 (App Router), TypeScript strict, Tailwind 4, shadcn/ui, Supabase.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción (genera public/sw.js con Serwist)
npm run lint       # ESLint 9 (flat config con FlatCompat)
npm run typecheck  # tsc --noEmit
npm run test       # Vitest (29 pruebas de dominio: ZAM/SEM y cadena)
npm run test:e2e   # Playwright
```

## Estructura

- `src/app/(auth)/auth/*` → `/auth/login`, `/auth/register`, `/auth/activate`
- `src/app/(dashboard)/dashboard/*` → portales por rol
- `src/app/(dashboard)/offline`, `/comunidad` → pantallas compartidas con el
  layout autenticado. **Ojo:** los route groups `(auth)` y `(dashboard)` no
  aportan segmento de URL; por eso las páginas viven dentro de un segmento
  real (`auth/`, `dashboard/`).
- `src/features/*` → componentes con lógica de negocio
- `src/shared/ui` → shadcn; `src/shared/lib` → utilidades; nunca importar de
  `components/ui`
- `src/services/*` → lógica pura y de servidor (dominio, supabase, offline)
- `src/stores/*` → estado de cliente (Zustand)
- `supabase/migrations/` → 0001–0014, aplicar en orden

## Reglas del dominio

- El saldo solo se calcula en la base de datos, dentro de los RPC
  `SECURITY DEFINER` (`apply_grade_event`, `apply_attendance_event`,
  `apply_adjustment_event`, `redeem_reward`). El cliente nunca escribe en
  `balances`.
- El canje de recompensas descuenta ZAM alERMETER el canje y lo devuelve con
  un movimiento compensatorio `adjust` si se rechaza; nunca se edita el saldo
  de forma directa. Resuelve con `settle_redemption`.
- Toda decisión que la RLS ya permitiría hacer al admin (moderar comunidad,
  publicar anuncios) pasa por un RPC para que quede en `moderation_logs` y
  firmada en el ledger: `moderate_community_post`, `save_announcement`.
- La tabla de tasas activa es la única fuente de verdad de la conversión
  nota → SEM → ZAM. Cambiarla exige nueva versión, no editar el código.
- Todo evento lleva `client_event_id` (UUID del cliente) para que reintentar
  sea idempotente.
- El ledger es append-only: `prevent_audit_mod` bloquea UPDATE y DELETE
  incluso para el owner de la tabla.
- El trigger anti-escalación de `profiles` solo admite tres vías: admin,
  RPC internos con la bandera transaccional
  `set_config('zamora.allow_profile_write','on',true)`, y mantenimiento
  directo con sesión `postgres`. No se relaxes sin revisar `0005`.

## Offline

- Los datos vivos (saldo, notas,Rpc) **nunca** se cachean en el service
  worker: un saldo desactualizado es peor que un error.
- El modo sin conexión cubre la *captura*: la cola en IndexedDB
  (`src/services/offline/queue.ts`) reenvía a `/api/sync` con deduplicación.
- `src/pwa/sw.ts` debe conservar la expresión literal `self.__SW_MANIFEST`;
  Serwist la reemplaza en el build y falla si se usa un alias.

## Entorno

El usuario gestiona `.env.local` (ver `.env.example`). La llave del ledger se
configura una sola vez en la base de datos:

```sql
select public.set_ledger_secret('<al menos 32 caracteres>');
```

## Runbook

`docs/QA.md` contiene el orden de migraciones, la verificación de la cadena, el
recorrido de prueba manual y el checklist de publicación. Consúltalo antes de
tocar SQL o desplegar.

`npm run test:e2e` inyecta credenciales placeholder si no hay `.env.local`: solo
recorre rutas públicas. Cualquier prueba de flujo autenticado exige entorno real.

## Dependencias

`npm audit --omit=dev` debe dar 0. Los avisos restantes vienen de `shadcn` y
`eslint-config-next` vía `braces`, que no tiene versión parcheada y solo se usa
en CLI de desarrollo. Hay un `overrides` de `postcss` a `^8.5.28` en
`package.json`: no lo quites sin revisar el aviso de `next`.