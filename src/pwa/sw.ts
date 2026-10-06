import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type RuntimeCaching,
} from "serwist";

/**
 * Service worker de ZAMORA.
 *
 * Decisión de diseño: los datos vivos de Supabase (saldo, notas) NUNCA se
 * cachean. Mostrar un saldo desactualizado en una billetera es peor que
 * mostrar un error honesto; el modo sin conexión cubre la captura, no la
 * consulta de saldos.
 *
 * El scope se tipa de forma local en vez de declarar `webworker` global,
 * porque el proyecto compila con la librería DOM y las declaraciones
 * globales de WebWorker colisionarían con ella.
 */
type PushEventLike = {
  data?: { json(): unknown } | null;
  waitUntil(promise: Promise<unknown>): void;
};

type NotificationEventLike = {
  notification: { data?: unknown; close(): void };
  waitUntil(promise: Promise<unknown>): void;
};

type ServiceWorkerScope = {
  __SW_MANIFEST?: (PrecacheEntry | string)[] | undefined;
  registration: {
    showNotification(
      title: string,
      options?: Record<string, unknown>,
    ): Promise<void>;
  };
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(type: string, listener: (event: never) => void): void;
};

const sw = self as unknown as ServiceWorkerScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // Documentos: red primero, caché como respaldo (permite abrir /offline).
    matcher: ({ request }) => request.destination === "document",
    handler: new NetworkFirst({
      cacheName: "zamora-pages",
      networkTimeoutSeconds: 5,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
      ],
    }),
  },
  {
    // Datos vivos de Supabase: nunca desde caché.
    matcher: ({ url, request }) =>
      url.hostname.endsWith("supabase.co") &&
      request.destination !== "document",
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, request }) =>
      url.pathname.startsWith("/api") && request.method === "GET",
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request }) => request.destination === "font",
    handler: new CacheFirst({
      cacheName: "zamora-fonts",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  // IMPORTANTE: esta expresión debe quedar escrita tal cual. Serwist
  // reemplaza el literal `self.__SW_MANIFEST` durante el build; usar un
  // alias (por ejemplo `sw.__SW_MANIFEST`) hace fallar la compilación.
  precacheEntries: (
    self as unknown as {
      __SW_MANIFEST?: (PrecacheEntry | string)[] | undefined;
    }
  ).__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

sw.addEventListener("push", ((event: PushEventLike) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; url?: string };
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = {};
  }

  event.waitUntil(
    sw.registration.showNotification(payload.title ?? "ZAMORA", {
      body: payload.body ?? "Tienes una novedad en tu billetera.",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: payload.url ?? "/dashboard/estudiante" },
    }),
  );
}) as (event: never) => void);

sw.addEventListener("notificationclick", ((event: NotificationEventLike) => {
  event.notification.close();
  const url =
    (event.notification.data as { url?: string } | undefined)?.url ??
    "/dashboard/estudiante";
  event.waitUntil(sw.clients.openWindow(url));
}) as (event: never) => void);