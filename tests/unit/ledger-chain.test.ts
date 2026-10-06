import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  canonicalJson,
  chainHash,
  isoUtc,
  payloadHash,
  sha256Hex,
  signHash,
  verifyChain,
  type LedgerRow,
} from "@/services/domain/ledger-chain";

const SECRET = "a".repeat(64);

/** Construye una fila encadenada como lo haría el RPC. */
function buildRow(
  seq: number,
  prevHash: string,
  payload: unknown,
  createdAt: string,
): LedgerRow {
  const ph = payloadHash(payload);
  const hash = chainHash({
    prev_hash: prevHash,
    payload_hash: ph,
    seq,
    actor_id: null,
    action: "grade.created",
    entity: "grade",
    entity_id: null,
    created_at: createdAt,
  });
  return {
    seq,
    actor_id: null,
    action: "grade.created",
    entity: "grade",
    entity_id: null,
    payload,
    payload_hash: ph,
    prev_hash: prevHash,
    hash,
    signature: signHash(hash, SECRET),
    created_at: createdAt,
  };
}

describe("canonicalJson", () => {
  it("ordena claves por longitud y luego alfabéticamente (como jsonb)", () => {
    expect(canonicalJson({ b: 1, aa: 2, a: 3 })).toBe('{"a":3,"b":1,"aa":2}');
  });

  it("es estable ante distintos órdenes de entrada", () => {
    const a = canonicalJson({ subject_id: "x", value: 8.5, type: "exam" });
    const b = canonicalJson({ type: "exam", value: 8.5, subject_id: "x" });
    expect(a).toBe(b);
  });

  it("ordena también las claves anidadas", () => {
    expect(canonicalJson({ z: { b: 1, a: 2 } })).toBe('{"z":{"a":2,"b":1}}');
  });
});

describe("isoUtc", () => {
  it("no depende del huso horario local", () => {
    expect(isoUtc("2026-10-04T15:04:05.123Z")).toBe("2026-10-04T15:04:05.123000Z");
  });

  it("interpreta offsets y los normaliza a UTC", () => {
    expect(isoUtc("2026-10-04T11:04:05.123-04:00")).toBe("2026-10-04T15:04:05.123000Z");
  });
});

describe("payloadHash", () => {
  it("mismo payload → mismo hash", () => {
    const p = { student_id: "a", zam: 5 };
    expect(payloadHash(p)).toBe(payloadHash({ student_id: "a", zam: 5 }));
  });

  it("payload distinto → hash distinto", () => {
    expect(payloadHash({ zam: 5 })).not.toBe(payloadHash({ zam: 6 }));
  });
});

describe("verifyChain", () => {
  const t1 = "2026-10-04T15:00:00.000000Z";
  const t2 = "2026-10-04T15:05:00.000000Z";
  const t3 = "2026-10-04T15:10:00.000000Z";

  it("valida una cadena íntegra desde el génesis", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r2 = buildRow(2, r1.hash, { n: 2 }, t2);
    const r3 = buildRow(3, r2.hash, { n: 3 }, t3);

    const report = verifyChain([r3, r1, r2], SECRET);
    expect(report).toHaveLength(3);
    expect(report.every((r) => r.ok)).toBe(true);
    expect(report.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it("detecta un payload alterado", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r2 = buildRow(2, r1.hash, { n: 2 }, t2);
    const tampered = { ...r2, payload: { n: 999 } };

    const report = verifyChain([r1, tampered], SECRET);
    expect(report[1].payload_ok).toBe(false);
    expect(report[1].ok).toBe(false);
    expect(report[1].detail).toMatch(/payload_hash/);
  });

  it("detecta un hash reescrito", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r2 = buildRow(2, r1.hash, { n: 2 }, t2);
    const forged = { ...r2, hash: sha256Hex("forged") };

    const report = verifyChain([r1, forged], SECRET);
    expect(report[1].chain_ok).toBe(false);
    expect(report[1].signature_ok).toBe(false);
  });

  it("detecta un eslabón roto", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r2 = buildRow(2, r1.hash, { n: 2 }, t2);
    const r3 = buildRow(3, r2.hash, { n: 3 }, t3);
    const huérfano = buildRow(4, sha256Hex("otro"), { n: 4 }, t3);

    const report = verifyChain([r1, r2, r3, huérfano], SECRET);
    expect(report[3].prev_ok).toBe(false);
    expect(report[3].ok).toBe(false);
  });

  it("detecta una firma hecha con otra clave", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r1Falsa = { ...r1, signature: signHash(r1.hash, "b".repeat(64)) };

    const report = verifyChain([r1Falsa], SECRET);
    expect(report[0].signature_ok).toBe(false);
  });

  it("omite la verificación de firma si no se pasa el secreto", () => {
    const r1 = buildRow(1, GENESIS_HASH, { n: 1 }, t1);
    const r1Falsa = { ...r1, signature: "deadbeef" };

    const report = verifyChain([r1Falsa]);
    expect(report[0].signature_ok).toBe(true);
    expect(report[0].ok).toBe(true);
  });
});
