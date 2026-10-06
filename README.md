# ZAMORA — Billetera Estudiantil de Rendimiento Académico

> Billetera web3 estudiantil de **reconocimiento verificable del desempeño curricular**: convierte notas y asistencia en una moneda académica (SEM → ZAM) respaldada por un libro de auditoría append-only, encadenado por hash y firmado criptográficamente.

Proyecto de la Universidad Nacional Experimental de los Llanos Occidentales "Ezequiel Zamora" (UNELLEZ — Zamora, Venezuela).

---

## Índice

1. [Qué es ZAMORA](#qué-es-zamora)
2. [Funcionalidades](#funcionalidades)
3. [Motor de conversión ZAM/SEM](#motor-de-conversión-zamsem)
4. [Arquitectura](#arquitectura)
5. [Estructura del proyecto](#estructura-del-proyecto)
6. [Requisitos previos](#requisitos-previos)
7. [Instalación](#instalación)
8. [Configuración de la base de datos](#configuración-de-la-base-de-datos)
9. [Variables de entorno](#variables-de-entorno)
10. [Comandos](#comandos)
11. [Roles y flujos](#roles-y-flujos)
12. [Modo sin conexión (PWA)](#modo-sin-conexión-pwa)
13. [Seguridad](#seguridad)
14. [Pruebas](#pruebas)
15. [Documentación relacionada](#documentación-relacionada)

---

## Qué es ZAMORA

ZAMORA es una aplicación web (PWA) que permite a la comunidad universitaria **registrar, verificar y canjear el desempeño académico**:

- Los **profesores** registran calificaciones y asistencia.
- Cada evento convierte automáticamente la nota en **SEM** (Semi-token de desempeño) y **ZAM** (moneda del ecosistema) según una **tabla de tasas versionada y pública**.
- Los **estudiantes** ven su saldo, su historial de movimientos, disputan notas que consideren incorrectas y canjean ZAM por recompensas.
- Los **administradores** acreditan usuarios por padrón con códigos temporales, moderan la comunidad, resuelven disputas y **verifican la integridad de la cadena de auditoría**.

Ningún saldo se escribe desde el cliente: todo el dinero académico se mueve dentro de funciones `SECURITY DEFINER` de PostgreSQL, con idempotencia por `client_event_id` y firma en un ledger inmutable.

## Funcionalidades

| Módulo | Descripción |
|---|---|
| **Autenticación y acreditación** | Registro con confirmación de correo; activación mediante código temporal (`ZAMORA-XXXXXXXX`) emitido solo por el admin contra el padrón (`rosters`). Vigencia de 24 h, un solo uso, se guarda únicamente su SHA-256. |
| **Billetera (estudiante)** | Saldo ZAM/SEM, últimos movimientos, notas, anuncios dirigidos por rol y catálogo de recompensas. |
| **Registro de notas (profesor)** | `GradeForm` con proyección en vivo de SEM/ZAM según la tabla de tasas activa; funciona sin conexión. |
| **Asistencia** | Hoja de asistencia por materia y fecha, idempotente y con validación de unicidad por sesión. |
| **Disputas de calificación** | El estudiante abre una disputa con motivo y evidencia; el profesor la marca *en revisión* y el admin la resuelve (`resolved_upheld`, `resolved_corrected`, `rejected`, `closed`), con ajuste compensatorio de saldo firmado en el ledger. |
| **Recompensas** | Catálogo con stock limitado/ilimitado, aprobación manual, canje que descuenta ZAM y devolución vía movimiento `adjust` si se rechaza. |
| **Comunidad moderada** | Publicaciones que entran en estado `pending`; moderación (aprobar/bloquear/retirar/restaurar) registrada en `moderation_logs` y firmada en el ledger. |
| **Anuncios institucionales** | Publicados por el admin con destinatario (`all`, `students`, `teachers`, `admins`) y vigencia. |
| **Auditoría verificable** | `audit_ledger` append-only: cada evento encadena `prev_hash` + `payload_hash` + `seq` + metadatos y se firma con HMAC-SHA256. Verificación desde SQL (`verify_audit_chain`) y desde la app (`ChainVerifier`). |
| **Modo sin conexión** | Captura de notas/asistencia en IndexedDB con reenvío automático a `/api/sync` y reintentos con backoff exponencial. |
| **PWA** | Service worker con Serwist, manifest, íconos y pantalla offline propia. |

## Motor de conversión ZAM/SEM

La tabla de tasas activa es la **única fuente de verdad** (tabla `rate_tables`, versión vigente `mvp-1`):

```
normalized = value / max_value

SEM = floor( UC × sem_per_uc × factor_tipo × normalized )
ZAM = floor( SEM × zam_ratio_over_sem )
```

| Parámetro | Valor (`mvp-1`) |
|---|---|
| `sem_per_uc` | 1 |
| `factor_by_grade_type` | exam 1.0 · quiz 0.6 · assignment 0.4 · practice 0.2 · other 0.5 |
| `zam_ratio_over_sem` | 0.10 |
| Topes por período | 300 ZAM · 400 SEM |
| Puntos de asistencia | 0 (premio de awarding reservado para futuras versiones) |
| Moneda de canje | solo ZAM |

La regla es reproducible por cualquier usuario autenticado: la función SQL `compute_earn` es inmutable y pública, y su réplica exacta en TypeScript vive en `src/services/domain/zam-sem.ts` (cubierta por tests de paridad).

> Cambiar la conversión exige **una nueva versión** de la tabla de tasas, no editar código.

## Arquitectura

```
┌─────────────── Next.js 15 (App Router) ───────────────┐
│  Landing · /auth · /dashboard/{estudiante,profesor,   │
│  admin} · /comunidad · /offline · /api/sync           │
│  /api/audit/verify                                    │
├───────────────────────┬───────────────────────────────┤
│  src/features (UI +   │  src/services (lógica pura:   │
│  server actions)      │  zam-sem, ledger-chain,       │
│                       │  cola offline IndexedDB)      │
│  src/stores (Zustand) │  src/shared (ui, schemas,     │
│                       │  types, hooks, lib/supabase)  │
└───────────┬───────────┴──────────────┬────────────────┘
            │  RLS + RPC SECURITY      │  service_role
            │  DEFINER (sesión usr)    │  (solo servidor)
┌───────────▼──────────────────────────▼────────────────┐
│              Supabase (PostgreSQL)                    │
│  20 tablas · 14 migraciones · ledger append-only      │
│  balances/transactions solo dentro de RPC             │
└───────────────────────────────────────────────────────┘
```

Principios:

- **El saldo solo se calcula en la base de datos**, dentro de los RPC `apply_grade_event`, `apply_attendance_event`, `apply_adjustment_event` y `redeem_reward`. El cliente nunca escribe `balances`.
- **Idempotencia total**: todo evento lleva un `client_event_id` (UUID v4); reintentar nunca duplica ni cobra dos veces (`sync_receipts` + advisory locks).
- **Denegación por defecto (RLS)**: todas las tablas con RLS habilitado; las tablas críticas no tienen política de escritura, solo se acceden por RPC.
- **Ledger inmutable**: `prevent_audit_mod` bloquea `UPDATE`/`DELETE` incluso para el owner; la escritura ocurre únicamente vía `append_audit`, serializada con un advisory lock transaccional.

## Estructura del proyecto

```
├── middleware.ts              # guard de sesión y roles por prefijo de ruta
├── next.config.ts             # build de la PWA con Serwist
├── serwist.config.ts          # precache (public/**, /offline, /manifest)
├── vitest.config.mts · playwright.config.ts
├── public/
│   ├── icons/                 # iconos PWA generados por scripts/generate-icons.mjs
│   ├── manifest.json          # manifest PWA (start_url: /dashboard/estudiante)
│   └── sw.js                  # generado en build (no versionado)
├── src/
│   ├── app/
│   │   ├── page.tsx           # landing con la fórmula de conversión pública
│   │   ├── (auth)/auth/       # login · register · activate
│   │   ├── (dashboard)/       # portales por rol + /comunidad + /offline
│   │   └── api/               # /api/sync · /api/audit/verify
│   ├── features/              # auth · admin · teacher · student · wallet ·
│   │                          # ledger · offline · community
│   ├── shared/
│   │   ├── ui/                # shadcn (importar como @/shared/ui)
│   │   ├── lib/supabase/      # client · server · middleware
│   │   ├── schemas/           # validaciones zod
│   │   ├── types/             # domain.ts (espejo del esquema Postgres)
│   │   └── constants/         # routes.ts · domain.ts
│   ├── services/
│   │   ├── domain/zam-sem.ts  # motor ZAM/SEM (paridad con SQL)
│   │   ├── domain/ledger-chain.ts  # verificación de cadena en Node
│   │   └── offline/queue.ts   # cola IndexedDB (idb-keyval)
│   ├── stores/offline-queue.ts # estado de la cola (Zustand)
│   └── pwa/sw.ts              # service worker fuente
├── supabase/
│   ├── migrations/0001…0014   # aplicar en orden ascendente
│   └── init_database.sql      # drop + recreate completo (generado)
├── tests/unit/                # 29 pruebas (Vitest): zam-sem · ledger-chain
├── e2e/                       # 6 pruebas (Playwright): rutas públicas
└── docs/
    ├── QA.md                  # runbook: migraciones, verificación, checklist
    └── Proyecto-de-Grado-…    # proyecto de grado (módulos I y II)
```

## Requisitos previos

- **Node.js** ≥ 20 (recomendado 22 LTS)
- **npm** ≥ 10
- Un proyecto **Supabase** (Plan Free es suficiente para desarrollo)
- Navegador con soporte de IndexedDB y Service Workers

## Instalación

```bash
# 1. Clonar e instalar
git clone <tu-repositorio> Billetera-web3
cd Billetera-web3
npm install

# 2. Configurar variables de entorno
copy .env.example .env.local     # Windows
# cp .env.example .env.local     # macOS/Linux
# … y editar con tus claves de Supabase

# 3. Levantar el desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Configuración de la base de datos

Opción A — **script unificado** (rápida, borra y recrea todo):

1. Supabase → **SQL Editor** → *New query*.
2. Pegar el contenido de `supabase/init_database.sql` → **Run**.

Opción B — **migraciones** (recomendada para mantenimiento):

1. SQL Editor → ejecutar `supabase/migrations/0001_…` … `0014_…` **en orden ascendente**.
2. `supabase/init_database.sql` se regenera con `node scripts/build_init_sql.js`.

### Obligatorio: llave del ledger

La cadena de auditoría no funciona sin su secreto de firma (una sola vez, desde el SQL Editor):

```sql
-- Generar un secreto de al menos 32 caracteres:
select encode(gen_random_bytes(32), 'hex');

-- Configurarlo:
select public.set_ledger_secret('<pegar-el-secreto-aqui>');
```

Verificación posterior:

```sql
select * from public.verify_audit_chain(1, 20);   -- ok = true en todas las filas
```

### Flujo inicial de usuarios

1. Un usuario se registra → el trigger crea `profiles` con `status = 'pending'`.
2. El admin lo agrega al padrón (`rosters`) y emite un código en `/dashboard/admin/rosters` (RPC `issue_activation_code`, solo `service_role`).
3. El usuario entra a `/auth/activate` y usa el código (RPC `activate_account`, vigencia 24 h).

## Variables de entorno

`.env.example`:

| Variable | Descripción | Cliente |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anon (respeta RLS) | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor únicamente: `/api/audit/verify` e `issue_activation_code` | **no** |
| `NEXT_PUBLIC_SITE_URL` | opcional: origen para builds, PWA y `emailRedirectTo` | sí |

> La llave del ledger **no** es variable de entorno: vive solo en `public.ledger_keys` dentro de la base de datos.

## Comandos

```bash
npm run dev         # servidor de desarrollo
npm run build       # build de producción (genera public/sw.js con Serwist)
npm run start       # servir el build
npm run lint        # ESLint 9
npm run typecheck   # tsc --noEmit
npm run test        # Vitest — 29 pruebas de dominio (ZAM/SEM y cadena)
npm run test:watch  # Vitest en watch
npm run test:e2e    # Playwright — 6 pruebas (rutas públicas)
```

## Roles y flujos

### `student` — `pending` → `active`
- Portal en `/dashboard/estudiante`: saldo, movimientos, notas, disputas, recompensas y anuncios.
- Abre disputas con `open_grade_dispute`; canjea con `redeem_reward`.
- Sin acreditación (código válido + padrón activo) no puede operar.

### `teacher`
- Portal en `/dashboard/profesor` (+ `/dashboard/profesor/asistencia`).
- Registra notas con `apply_grade_event` y asistencia con `apply_attendance_event`.
- Ambos RPC revalidan sesión, rol, materia asignada, inscripción y acreditación del estudiante.
- Funcionan **sin conexión**: los eventos quedan en la cola IndexedDB.

### `admin`
- Portal en `/dashboard/admin` con secciones: KPIs, **Padrón** (códigos y ajustes), **Auditoría** (ledger + verificador de cadena), **Disputas**, **Canjes**, **Comunidad y anuncios**, **Tasas**.
- Acciones sensibles pasan por RPC (`apply_adjustment_event`, `settle_redemption`, `resolve_grade_dispute`, `moderate_community_post`, `save_announcement`) para quedar firmadas en el ledger.

### Rutas protegidas

`middleware.ts` redirige: sin sesión → `/auth/login`; perfil no `active` → `/auth/activate`; cada portal exige su rol (`ROLE_PREFIX`); `/dashboard` lleva al portal del rol correspondiente.

## Modo sin conexión (PWA)

**Regla de oro: los datos vivos (saldo, notas, RPC) nunca se cachean.** Un saldo desactualizado es peor que un error.

- **Captura offline**: `src/services/offline/queue.ts` persiste eventos en IndexedDB (`zamora-offline`) con su `client_event_id`.
- **Reenvío**: `use-queue-sync` sincroniza al montar, al recuperar conexión y cada 60 s vía `POST /api/sync`, que aplica cada ítem con el **RPC y la sesión del usuario** (validación zod + deduplicación).
- **Reintentos**: backoff exponencial de 1 s a 30 s, `MAX_RETRIES = 10`; los fallos quedan en `pending_sync`.
- **Service worker** (`src/pwa/sw.ts`): documentos con `NetworkFirst` + fallback a `/offline`; `*.supabase.co` y `/api/*` con `NetworkOnly`; fuentes `CacheFirst`; push y `notificationclick` implementados.
- Pantalla offline dedicada en `/offline` con el panel de estado de la cola.

## Seguridad

- **RLS deny-by-default** en las 20 tablas; sin política = denegado.
- **Anti-escalación**: un usuario no puede cambiar su propio `role`, `status` o `email`; solo la administración, los RPC con la bandera transaccional `zamora.allow_profile_write` o el mantenimiento directo de `postgres`.
- **Ledger append-only** con `TRIGGER` de bloqueo y revocación de permisos de escritura.
- **Clave del ledger** inaccesible desde el cliente (`revoke all` a `anon` y `authenticated`).
- **`SUPABASE_SERVICE_ROLE_KEY`** solo en el servidor; nunca se expone al cliente.
- **Códigos de activación** guardados como SHA-256, un solo uso, expiran en 24 h y no revelan si un correo existe en el padrón.
- **Validación con zod** en formularios y en `/api/sync`.
- **Auditoría firmada**: HMAC-SHA256 sobre hash canónico JSON; cualquier alteración del payload, del orden o de la clave se detecta con `verify_audit_chain`.

## Pruebas

| Tipo | Herramienta | Cobertura |
|---|---|---|
| **Unitarias** — 29 | Vitest + jsdom (`tests/unit/`) | Motor ZAM/SEM: normalización, topes, asistencia, paridad con `compute_earn` (16). Cadena de ledger: JSON canónico, timestamps UTC, payload alterado, eslabón roto, firma inválida (13). |
| **E2E** — 6 | Playwright (`e2e/public.spec.ts`, chromium) | Landing, redirección sin sesión, login, validación de registro, manifest PWA, accesibilidad de `/offline`. Solo rutas públicas: los flujos autenticados requieren entorno real (ver `docs/QA.md`). |

```bash
npm run test         # unitarias
npm run test:e2e     # e2e (levanta el servidor de forma automática)
```

## Documentación relacionada

- **`docs/QA.md`** — runbook operativo: orden de migraciones, verificación de la cadena (SQL + Node), recorrido manual de 8 pasos y checklist de publicación. **Consúltalo antes de tocar SQL o desplegar.**
- **`AGENTS.md`** — reglas del repositorio para contribuyentes y agentes (estructura, dominio, comandos).
- **`docs/Proyecto-de-Grado-ZAMORA-Modulos-I-y-II`** — proyecto de grado (HTML/PDF).
- **`.env.example`** — plantilla de variables de entorno.

---

Universidad Nacional Experimental de los Llanos Occidentales "Ezequiel Zamora" · Billetera Estudiantil de Rendimiento Académico
