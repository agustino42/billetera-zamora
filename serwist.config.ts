import type { InjectManifestOptions } from "@serwist/build";

/**
 * Opciones de BUILD del service worker (las consume @serwist/next al
 * compilar src/pwa/sw.ts). El comportamiento de cachés en runtime vive en
 * src/pwa/sw.ts, junto a la instancia de Serwist.
 */
const config: InjectManifestOptions = {
  swSrc: "src/pwa/sw.ts",
  globDirectory: "public",
  globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/offline", revision: "1" },
    { url: "/manifest.json", revision: "1" },
  ],
};

export default config;