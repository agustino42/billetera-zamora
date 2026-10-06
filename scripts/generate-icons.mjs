/**
 * Genera los iconos PNG de la PWA a partir del SVG de marca.
 * Uso: node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

/** Marca ZAMORA: monograma sobre fondo verde institucional. */
const mark = (size, { maskable = false } = {}) => {
  const padding = maskable ? Math.round(size * 0.14) : 0;
  const inner = size - padding * 2;
  const fontSize = Math.round(inner * 0.44);
  const radius = maskable ? inner * 0.18 : inner * 0.22;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0f7a4f"/>
  <rect x="${padding + inner * 0.08}" y="${padding + inner * 0.08}" width="${inner * 0.84}" height="${inner * 0.84}" rx="${radius}" fill="#ffffff" opacity="0.08"/>
  <text x="50%" y="50%" dy="0.36em" text-anchor="middle"
    font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-size="${fontSize}" font-weight="700" letter-spacing="${fontSize * 0.04}"
    fill="#ffffff">Z</text>
  <text x="50%" y="${padding + inner * 0.78}" text-anchor="middle"
    font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    font-size="${Math.round(inner * 0.11)}" font-weight="600" letter-spacing="${inner * 0.02}"
    fill="#b8860b">ZAMORA</text>
</svg>`);
};

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "badge-72.png", size: 72 },
];

await mkdir(outDir, { recursive: true });

for (const target of targets) {
  const buffer = await sharp(mark(target.size, { maskable: target.maskable }))
    .png()
    .toBuffer();
  await writeFile(join(outDir, target.file), buffer);
  console.log(`✓ ${target.file} (${target.size}×${target.size}, ${buffer.length} bytes)`);
}