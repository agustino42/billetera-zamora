/**
 * ============================================================================
 *  ZAMORA — Generador de PDF del sub-proyecto "Proyecto de Grado"
 *              Módulos I y II  ·  Capítulos I, II y III
 *
 *  Pipeline de dos pasadas:
 *    1) Ensambla las partes HTML + CSS, mide la página real de cada encabezado
 *       marcado con [data-toc] y de cada rótulo de cuadro/figura.
 *    2) Inyecta los números de página en los índices y genera el PDF final.
 *
 *  Requisitos: Node >= 18  ·  puppeteer
 *  Uso:  node scripts/build-pdf.mjs
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'build');
const OUT_PDF = path.join(ROOT, 'docs', 'Proyecto-de-Grado-ZAMORA-Modulos-I-y-II.pdf');
const OUT_HTML = path.join(ROOT, 'docs', 'Proyecto-de-Grado-ZAMORA-Modulos-I-y-II.html');

// --- Geometría de página (Carta) -------------------------------------------
const CM = 96 / 2.54;                       // px CSS por cm  (96 dpi)
const PAGE_W = 8.5 * 96;                    // 816 px
const PAGE_H = 11 * 96;                     // 1056 px
const M = { top: 2.5 * CM, bottom: 2.5 * CM, left: 4 * CM, right: 2.5 * CM };
const CONTENT_H = PAGE_H - M.top - M.bottom;      // 867.02 px
const CONTENT_W = PAGE_W - M.left - M.right;      // 570.33 px

// --- Partes del documento (en orden) ---------------------------------------
const PARTS = [
  '01-preliminares.html',
  '02-capitulo-I.html',
  '03-capitulo-II.html',
  '04-capitulo-III.html',
];

// --- Resolución de puppeteer -----------------------------------------------
function loadPuppeteer() {
  const candidates = [
    process.env.PUPPETEER_MODULE,
    path.join(process.env.TEMP || '', 'opencode', 'pdfgen', 'node_modules', 'puppeteer'),
    path.join(process.env.LOCALAPPDATA || '', 'Temp', 'opencode', 'pdfgen', 'node_modules', 'puppeteer'),
    path.join(ROOT, 'node_modules', 'puppeteer'),
  ].filter(Boolean);
  for (const base of candidates) {
    try {
      const req = createRequire(path.join(base, 'index.js'));
      return req(base.includes('node_modules') ? 'puppeteer' : base);
    } catch { /* siguiente */ }
  }
  // último recurso: resolución normal
  const req = createRequire(import.meta.url);
  return req('puppeteer');
}

// ---------------------------------------------------------------------------
function readParts() {
  const css = fs.readFileSync(path.join(SRC, 'estilo.css'), 'utf8');
  const bodies = PARTS.map((f) => {
    const p = path.join(SRC, f);
    if (!fs.existsSync(p)) throw new Error(`Falta la parte: ${p}`);
    return `<!-- ===== ${f} ===== -->\n` + fs.readFileSync(p, 'utf8');
  });
  return { css, body: bodies.join('\n\n') };
}

function wrapHtml(css, body, tocHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>ZAMORA: Billetera Estudiantil de Rendimiento Académico — Mecanismo de registro y reconocimiento verificable del desempeño curricular y extracurricular</title>
<style>
${css}
</style>
</head>
<body>
${tocHtml || '<!--TOC-PLACEHOLDER-->'}
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Construcción del índice general
// ---------------------------------------------------------------------------
function buildGeneralToc(entries) {
  const lines = [];
  for (const e of entries) {
    if (e.list !== 'general') continue;
    const cls = e.level === 1 ? 'n1' : e.level === 2 ? 'n2' : 'n3';
    lines.push(
      `<div class="toc-linea ${cls}">` +
      `<span class="txt">${e.text}</span>` +
      `<span class="dots"></span>` +
      `<span class="pg">${e.page}</span>` +
      `</div>`
    );
  }
  return lines.join('\n');
}

function buildSimpleList(title, entries, listName) {
  const items = entries.filter((e) => e.list === listName);
  if (!items.length) return '';
  const lines = items.map(
    (e) =>
      `<div class="toc-linea n2">` +
      `<span class="txt">${e.text}</span>` +
      `<span class="dots"></span>` +
      `<span class="pg">${e.page}</span>` +
      `</div>`
  );
  return (
    `<div class="bloque"><h2>${title}</h2>\n${lines.join('\n')}\n</div>`
  );
}

// ---------------------------------------------------------------------------
async function main() {
  const puppeteer = loadPuppeteer();
  const { css, body } = readParts();

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();

    // El viewport replica exactamente el área de contenido imprimible:
    // así el salto de línea del measurement coincide con el del PDF.
    await page.setViewport({
      width: Math.round(CONTENT_W),
      height: Math.round(CONTENT_H),
      deviceScaleFactor: 1,
    });

    // ---------------- PASADA 1: medición ---------------------------------
    await page.setContent(wrapHtml(css, body, null), { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');

    const entries = await page.evaluate((CONTENT_H) => {
      // Positions absolutas de todos los saltos de página forzados
      const breaks = [...document.querySelectorAll('[data-break="page"]')]
        .map((el) => el.getBoundingClientRect().top + window.scrollY)
        .sort((a, b) => a - b);

      // página -> punto de inicio
      const breakAt = [];
      let pageNo = 1;
      let lastRef = 0;
      for (const b of breaks) {
        pageNo += Math.floor((b - lastRef) / CONTENT_H) + 1;
        lastRef = b;
        breakAt.push({ y: b, page: pageNo });
      }

      function pageOf(y) {
        let base = 1;
        let ref = 0;
        for (const bp of breakAt) {
          if (bp.y <= y + 0.5) { base = bp.page; ref = bp.y; }
        }
        return base + Math.floor((y - ref) / CONTENT_H);
      }

      return [...document.querySelectorAll('[data-toc]')].map((el) => {
        const y = el.getBoundingClientRect().top + window.scrollY;
        return {
          key: el.dataset.toc,
          level: Number(el.dataset.level || 2),
          list: el.dataset.list || 'general',
          text: (el.dataset.text || el.textContent).replace(/\s+/g, ' ').trim(),
          page: pageOf(y),
        };
      });
    }, CONTENT_H);

    // ---------------- ÍNDICES -------------------------------------------
    const general = buildGeneralToc(entries);
    const indices =
      `<div class="toc-slot" id="slot-general">${general}</div>` +
      buildSimpleList('Índice de cuadros', entries, 'cuadros') +
      buildSimpleList('Índice de figuras', entries, 'figuras');

    // ---------------- PASADA 2: PDF final --------------------------------
    const htmlFinal = wrapHtml(css, body, indices);
    fs.writeFileSync(OUT_HTML, htmlFinal, 'utf8');

    // Chrome sustituye .pageNumber y .totalPages al imprimir.
    const footer =
      `<div style="width:100%;font-family:'Times New Roman',Times,serif;font-size:9pt;color:#555;` +
      `padding:0 4cm 0 4cm;text-align:center;display:flex;justify-content:center;gap:3pt;">` +
      `<span class="pageNumber"></span>` +
      `</div>`;

    await page.setContent(htmlFinal, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');

    await page.pdf({
      path: OUT_PDF,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      margin: {
        top: `${(M.top / 96).toFixed(4)}in`,
        bottom: `${(M.bottom / 96).toFixed(4)}in`,
        left: `${(M.left / 96).toFixed(4)}in`,
        right: `${(M.right / 96).toFixed(4)}in`,
      },
      preferCSSPageSize: false,
    });

    // ---------------- Diagnóstico ----------------------------------------
    const stat = fs.statSync(OUT_PDF);
    const totalEstimado = Math.max(...entries.map((e) => e.page), 0);
    console.log('──────────────────────────────────────────────');
    console.log(' PDF generado :', OUT_PDF);
    console.log(' Tamaño       :', (stat.size / 1024).toFixed(0), 'KB');
    console.log(' Entradas TOC :', entries.length);
    console.log(' Páginas (idx):', totalEstimado);
    console.log('──────────────────────────────────────────────');

    const dump = entries
      .map((e) => `${String(e.page).padStart(3)}  [${e.level}] ${e.list.padEnd(8)} ${e.text}`)
      .join('\n');
    fs.writeFileSync(path.join(SRC, '_indice-debug.txt'), dump, 'utf8');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
