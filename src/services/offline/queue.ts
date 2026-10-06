import { createStore, get, set } from "idb-keyval";
import type { SyncStatus } from "@/shared/types/domain";
import { MAX_RETRIES, retryDelayMs } from "@/shared/constants/routes";
import type {
  AttendanceEventPayload,
  GradeEventPayload,
} from "@/shared/schemas/sync";

/**
 * Cola offline persistente en IndexedDB.
 *
 * Cada evento nace con un `client_event_id` (UUID v4) que el servidor usa
 * para deduplicar: reintentar el mismo evento nunca duplica una nota.
 */

export type PendingEventType = "grade" | "attendance";

export type PendingItem = {
  client_event_id: string;
  type: PendingEventType;
  payload: GradeEventPayload | AttendanceEventPayload;
  status: SyncStatus;
  retries: number;
  max_retries: number;
  last_attempt_at: string | null;
  error: string | null;
  created_at: string;
};

const db = createStore("zamora-offline", "sync");
const ITEMS_KEY = "items";

export function newClientEventId(): string {
  const c = globalThis.crypto;

  if (typeof c?.randomUUID === "function") {
    return c.randomUUID();
  }

  // Respaldo para navegadores sin randomUUID
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readQueue(): Promise<PendingItem[]> {
  return (await get<PendingItem[]>(ITEMS_KEY, db)) ?? [];
}

async function writeQueue(items: PendingItem[]): Promise<void> {
  await set(ITEMS_KEY, items, db);
}

export async function enqueue(
  type: PendingEventType,
  payload: GradeEventPayload | AttendanceEventPayload,
): Promise<PendingItem> {
  const item: PendingItem = {
    client_event_id: newClientEventId(),
    type,
    payload,
    status: "queued",
    retries: 0,
    max_retries: MAX_RETRIES,
    last_attempt_at: null,
    error: null,
    created_at: new Date().toISOString(),
  };

  const items = await readQueue();
  await writeQueue([...items, item]);
  return item;
}

export async function updateItem(
  clientEventId: string,
  patch: Partial<PendingItem>,
): Promise<PendingItem | null> {
  const items = await readQueue();
  const index = items.findIndex((i) => i.client_event_id === clientEventId);
  if (index === -1) return null;

  const updated = { ...items[index], ...patch };
  items[index] = updated;
  await writeQueue(items);
  return updated;
}

export async function removeItem(clientEventId: string): Promise<void> {
  const items = await readQueue();
  await writeQueue(items.filter((i) => i.client_event_id !== clientEventId));
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}

/** Marca el intento fallido y calcula el siguiente reintento con backoff. */
export async function markAttempt(
  clientEventId: string,
  error: string,
): Promise<PendingItem | null> {
  const item = (await readQueue()).find(
    (i) => i.client_event_id === clientEventId,
  );
  if (!item) return null;

  const retries = item.retries + 1;
  const exhausted = retries >= item.max_retries;

  return updateItem(clientEventId, {
    retries,
    last_attempt_at: new Date().toISOString(),
    error,
    status: exhausted ? "failed" : "queued",
  });
}

/** Próximo instante en que un evento puede reintentarse. */
export function nextAttemptAt(item: PendingItem): number {
  if (item.status !== "queued") return 0;
  if (!item.last_attempt_at) return 0;
  return new Date(item.last_attempt_at).getTime() + retryDelayMs(item.retries);
}

/** Eventos listos para enviar ahora. */
export function readyItems(items: PendingItem[], now = Date.now()): PendingItem[] {
  return items.filter((i) => nextAttemptAt(i) <= now);
}

export function summarize(items: PendingItem[]) {
  return {
    total: items.length,
    queued: items.filter((i) => i.status === "queued").length,
    syncing: items.filter((i) => i.status === "syncing").length,
    failed: items.filter((i) => i.status === "failed").length,
    synced: items.filter((i) => i.status === "synced").length,
  };
}
