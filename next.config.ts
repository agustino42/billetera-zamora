import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * PWA: service worker generado por Serwist en el build.
 * El service worker real vive en src/pwa/sw.ts (ver serwist.config.ts).
 */
const withSerwist = withSerwistInit({
  swSrc: "src/pwa/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Las rutas de la billetera viven bajo /dashboard; sin esto, /offline y
  // /comunidad heredan el layout raíz sin la navegación autenticada.
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);