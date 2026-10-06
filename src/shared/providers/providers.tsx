"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/shared/lib/supabase/client";
import { useQueueSync } from "@/shared/hooks/use-queue-sync";

/**
 * Efectos de cliente que deben existir una sola vez en la app:
 * caché de React Query, sesión de Supabase y cola de sincronización offline.
 */
function ClientEffects() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  useQueueSync();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries();
    });

    return () => subscription.unsubscribe();
  }, [supabase, queryClient]);

  // Registro del service worker (PWA). Solo en producción: en desarrollo
  // el service worker cachearía el código y haría imposible iterar.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // La app funciona igual sin service worker; no es un error fatal.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientEffects />
      {children}
    </QueryClientProvider>
  );
}
