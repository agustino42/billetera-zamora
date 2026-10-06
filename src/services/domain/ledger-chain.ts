import { createHash, createHmac } from "node:crypto";

/**
 * Cadena de auditoría — lógica pura (servidor y tests).
 *
 * Réplica exacta de supabase/migrations/0004:
 *   payload_hash = sha256(canonical_json(payload))
 *   hash         = sha256(prev_hash ‖ payload_hash ‖ seq ‖ actor ‖ action
 *                             ‖ entity ‖ entity_id ‖ iso_utc(created_at))
 *   signature    = hmac-sha256(hash, secret)
 *
 * El orden de claves de `canonicalJson` imita el de Postgres en `jsonb`:
 * primero por longitud de la clave y después byte a byte.
 */

export const GENESIS_HASH = "0".repeat(64);

/** ISO-8601 UTC con microsegundos, independiente del TimeZone de la sesión. */
export function isoUtc(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}000Z`
  );
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Claves en el mismo orden que `jsonb`: por longitud, luego byte a byte. */
function compareKeys(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort(compareKeys)
      .reduce<Record<string, JsonValue>>((acc, key) => {
        acc[key] = sortValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/** JSON determinista: mismo payload → mismo texto → mismo hash. */
export function canonicalJson(payload: unknown): string {
  return JSON.stringify(sortValue(payload as JsonValue));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function payloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

export type ChainInput = {
  prev_hash: string;
  payload_hash: string;
  seq: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

export function chainHash(input: ChainInput): string {
  return sha256Hex(
    input.prev_hash +
      input.payload_hash +
      String(input.seq) +
      (input.actor_id ?? "") +
      input.action +
      input.entity +
      (input.entity_id ?? "") +
      isoUtc(input.created_at),
  );
}

export function signHash(hash: string, secret: string): string {
  return hmacSha256Hex(hash, secret);
}

export type LedgerRow = {
  seq: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: unknown;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  signature: string;
  created_at: string;
};

export type ChainReport = {
  seq: number;
  payload_ok: boolean;
  chain_ok: boolean;
  signature_ok: boolean;
  prev_ok: boolean;
  ok: boolean;
  detail: string;
};

/**
 * Reconstruye la cadena desde el génesis y verifica cada eslabón.
 * `secret` es obligatorio para comprobar firmas; sin él se omite ese paso.
 */
export function verifyChain(rows: LedgerRow[], secret?: string): ChainReport[] {
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  const reports: ChainReport[] = [];
  let expectedPrev = GENESIS_HASH;

  for (const row of ordered) {
    const expectedPayload = payloadHash(row.payload);
    const expectedHash = chainHash({
      prev_hash: row.prev_hash,
      payload_hash: row.payload_hash,
      seq: row.seq,
      actor_id: row.actor_id,
      action: row.action,
      entity: row.entity,
      entity_id: row.entity_id,
      created_at: row.created_at,
    });

    const payload_ok = row.payload_hash === expectedPayload;
    const chain_ok = row.hash === expectedHash;
    const signature_ok = secret ? row.signature === signHash(row.hash, secret) : true;
    const prev_ok = row.prev_hash === expectedPrev;

    const ok = payload_ok && chain_ok && signature_ok && prev_ok;
    reports.push({
      seq: row.seq,
      payload_ok,
      chain_ok,
      signature_ok,
      prev_ok,
      ok,
      detail: !payload_ok
        ? "payload_hash no coincide con el payload"
        : !chain_ok
          ? "hash de cadena recalculado no coincide"
          : !signature_ok
            ? "firma HMAC inválida"
            : !prev_ok
              ? "prev_hash no enlaza con la fila anterior"
              : "ok",
    });

    expectedPrev = row.hash;
  }

  return reports;
}
