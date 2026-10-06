import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { globalIgnores } from "eslint/config";

/**
 * eslint-config-next@15 sigue publicando su configuración en formato
 * eslintrc (no flat), así que se adapta con FlatCompat. El import debe
 * incluir la extensión porque el paquete no define "exports".
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Generado por Serwist en cada build: no es código fuente.
    "public/sw.js",
    "public/swe-worker-*.js",
  ]),
];

export default eslintConfig;