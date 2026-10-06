"use client";

import { useEffect } from "react";
import { useOfflineQueue } from "@/stores/offline-queue";

/** Sincroniza la cola: al montar, al volver la conexión y cada 60 s. */
export function useQueueSync() {
  const hydrate = useOfflineQueue((s) => s.hydrate);
  const sync = useOfflineQueue((s) => s.sync);
  const setOnline = useOfflineQueue((s) => s.setOnline);
  const online = useOfflineQueue((s) => s.online);
  const hydrated = useOfflineQueue((s) => s.hydrated);

  useEffect(() => {
    void hydrate();

    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    const interval = window.setInterval(() => void sync(), 60_000);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [hydrate, sync, setOnline]);

  return { online, hydrated };
}
