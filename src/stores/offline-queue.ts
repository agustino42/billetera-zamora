"use client";

import { create } from "zustand";
import {
  enqueue,
  markAttempt,
  readQueue,
  removeItem,
  summarize,
  updateItem,
  type PendingEventType,
  type PendingItem,
} from "@/services/offline/queue";
import type {
  AttendanceEventPayload,
  GradeEventPayload,
} from "@/shared/schemas/sync";
import type { ApplyEventResult } from "@/shared/types/domain";

type QueueState = {
  items: PendingItem[];
  hydrated: boolean;
  online: boolean;
  syncing: boolean;
  hydrate: () => Promise<void>;
  setOnline: (online: boolean) => void;
  add: (
    type: PendingEventType,
    payload: GradeEventPayload | AttendanceEventPayload,
  ) => Promise<PendingItem>;
  applyResult: (
    clientEventId: string,
    result: ApplyEventResult | null,
    error?: string,
  ) => Promise<void>;
  sync: () => Promise<{ sent: number; applied: number; failed: number }>;
};

const isBrowser = typeof window !== "undefined";

export const useOfflineQueue = create<QueueState>((set, get) => ({
  items: [],
  hydrated: false,
  online: isBrowser ? navigator.onLine : true,
  syncing: false,

  hydrate: async () => {
    if (!isBrowser) return;
    const items = await readQueue();
    set({ items, hydrated: true });
  },

  setOnline: (online) => set({ online }),

  add: async (type, payload) => {
    const item = await enqueue(type, payload);
    const items = await readQueue();
    set({ items, hydrated: true });
    return item;
  },

  applyResult: async (clientEventId, result, error) => {
    if (error || !result?.ok) {
      await markAttempt(clientEventId, error ?? "Respuesta no válida del servidor");
    } else {
      await removeItem(clientEventId);
    }
    set({ items: await readQueue() });
  },

  /**
   * Envía la cola a /api/sync. El servidor deduplica por
   * client_event_id, así que reintentar es seguro.
   */
  sync: async () => {
    if (!isBrowser || !navigator.onLine) {
      return { sent: 0, applied: 0, failed: 0 };
    }

    set({ syncing: true });
    const items = await readQueue();
    const batch = items.filter((i) => i.status === "queued" || i.status === "syncing");

    if (batch.length === 0) {
      set({ syncing: false });
      return { sent: 0, applied: 0, failed: 0 };
    }

    await Promise.all(
      batch.map((i) => updateItem(i.client_event_id, { status: "syncing" })),
    );

    let applied = 0;
    let failed = 0;

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: batch.map((i) => ({
            client_event_id: i.client_event_id,
            type: i.type,
            payload: i.payload,
            created_at: i.created_at,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`El servidor respondió ${response.status}`);
      }

      const data = (await response.json()) as {
        results: Record<
          string,
          { ok: boolean; result?: ApplyEventResult; error?: string }
        >;
      };

      for (const item of batch) {
        const outcome = data.results[item.client_event_id];
        await get().applyResult(
          item.client_event_id,
          outcome?.result ?? null,
          outcome?.error ?? "Sin respuesta del servidor",
        );
        if (outcome?.ok) applied += 1;
        else failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red";
      for (const item of batch) {
        await get().applyResult(item.client_event_id, null, message);
        failed += 1;
      }
    } finally {
      set({ items: await readQueue(), syncing: false });
    }

    return { sent: batch.length, applied, failed };
  },
}));

export const selectPendingCount = (state: QueueState) =>
  summarize(state.items).total;
