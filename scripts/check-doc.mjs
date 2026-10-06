/**
 * Validador de integridad del contenido del documento.
 * Detecta: caracteres no latinos, mojibake, caracteres de reemplazo,
 * líneas duplicadas consecutivas y prosa truncada.
 *
 * Uso: node scripts/check-doc.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'docs', 'build');

const PERMITIDOS_FUERA_DE_LATIN1 = new Set([
  0x2013, 0x2014,            // – —
  0x2018, 0x2019,            // ‘ ’
  0x201c, 0x201d,            // “ ”
  0x2026,                    // …
  0x00a1, 0x00bf,            // ¡ ¿
  0x00b0,                    // °
  0x2192,                    // →
  0x2713,                    // ✓
]);

const PATRONES_SOSPECHOSOS = [
  { re: /\uFFFD/,                              nombre: 'caracter de reemplazo (U+FFFD)' },
  { re: /[\u00C2\u00C3][\u0080-\u00BF]/,       nombre: 'mojibake UTF-8 leido como Latin-1' },
  { re: /\u00E2[\u0080-\u00BF\u20AC]/,         nombre: 'mojibake de comilla/raya' },
  { re: /[\u3000-\u9FFF\u3400-\u4DBF]/,        nombre: 'caracteres CJK (chino/japones)' },
  { re: /[\uAC00-\uD7AF]/,                     nombre: 'caracteres coreanos' },
  { re: /[\u0400-\u04FF]/,                     nombre: 'caracteres cirlicos' },
  { re: /[\u0600-\u06FF]/,                     nombre: 'caracteres arabes' },
  { re: /\b(theirs|bitmap|wager|discrete|finally|Appearance|Compensation)\b/, nombre: 'token inyectado en español' },
];

/* Palabras de otro idioma que se han colado en la prosa castellana. */
const TOKENS_EXTRANOS = [
  'h�ritera', 'h�ritero', 'involved', 'berbasis', 'defended', 'Chapter',
  'socially', 'strengthening', 'verified', 'apiendo',
  'Environments', 'theirs', 'wager', 'bitmap', 'offline_de',
  'plataforma', 'plataformas', 'sistema web', 'sistemas web',
  'inventario', 'blog',
];
const RE_EXTRANOS = new RegExp('\\b(' + TOKENS_EXTRANOS.join('|') + ')\\b');
/* Union con guion bajo dentro de prosa (p. ej. "considerarlo_apiendo"). */
const RE_GUION_BAJO = /[a-záéíóúñ]_[a-záéíóúñ]/i;

function esc(s) {
  return s
    .replace(/\uFFFD/g, '<?>')
    .replace(/[\u3000-\u9FFF\u3400-\u4DBF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF]/g, '<?>')
    .replace(/[\u0080-\u009F]/g, '.');
}

let totalProblemas = 0;

for (const archivo of fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort()) {
  const ruta = path.join(SRC, archivo);
  const lineas = fs.readFileSync(ruta, 'utf8').split(/\r?\n/);
  const problemas = [];

  // El Abstract se redacta en ingles: se desactiva la deteccion de palabras
  // extranjeras mientras el bloque este abierto.
  let enAbstract = false;

  lineas.forEach((linea, i) => {
    const n = i + 1;

    if (/<h1>\s*Abstract\s*<\/h1>/i.test(linea)) enAbstract = true;
    else if (enAbstract && /data-break="page"/.test(linea)) enAbstract = false;

    // 1) caracteres no permitidos fuera del rango Latin-1
    for (const ch of linea) {
      const cp = ch.codePointAt(0);
      if (cp > 0xff && !PERMITIDOS_FUERA_DE_LATIN1.has(cp)) {
        problemas.push({ n, tipo: `caracter no permitido U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, linea });
        break;
      }
    }

    // 2) patrones sospechosos
    for (const { re, nombre } of PATRONES_SOSPECHOSOS) {
      if (re.test(linea)) {
        problemas.push({ n, tipo: nombre, linea });
        break;
      }
    }

    // 2b) palabras en otro idioma o fragmentos pegados con guion bajo
    if (!enAbstract && !linea.includes('<') && !linea.trim().startsWith('<!--')) {
      if (RE_EXTRANOS.test(linea)) {
        problemas.push({ n, tipo: 'palabra de otro idioma en la prosa', linea });
      } else if (RE_GUION_BAJO.test(linea)) {
        problemas.push({ n, tipo: 'fragmento pegado con guion bajo', linea });
      }
    }

    // 3) prosa truncada: termina en ; , : … sin cerrar
    const t = linea.trim();
    if (
      t.length > 25 &&
      !t.startsWith('<') &&
      !t.endsWith('.') &&
      !t.endsWith(':') &&
      !t.endsWith(',') &&
      /[a-zA-Z\u00C0-\u017F)]$/.test(t) &&
      !/^(Cuadro|Figura|Nota|Fuente|Palabras clave|Keywords)/i.test(t)
    ) {
      // permitimos lineas que son la primera mitad de un parrafo partido
      const sig = (lineas[i + 1] || '').trim();
      if (sig && !sig.startsWith('</') && /^[a-z\u00C0-\u017F]/.test(sig)) return;
      if (/[,;:]$/.test(t)) problemas.push({ n, tipo: 'prosa truncada (termina en puntuacion de continuacion)', linea });
    }
  });

  // 4) lineas duplicadas consecutivas (ignora vacias, HTML de una linea y comments)
  for (let i = 1; i < lineas.length; i++) {
    const a = lineas[i - 1].trim();
    const b = lineas[i].trim();
    if (a.length > 30 && a === b) problemas.push({ n: i + 1, tipo: 'linea duplicada consecutiva', linea: b });
  }

  if (problemas.length) {
    console.log(`\n=== ${archivo} — ${problemas.length} problema(s) ===`);
    for (const p of problemas.slice(0, 40)) {
      console.log(`  L${p.n}  [${p.tipo}]`);
      console.log(`       ${esc(p.linea.trim().slice(0, 110))}`);
    }
    if (problemas.length > 40) console.log(`  ... y ${problemas.length - 40} mas`);
    totalProblemas += problemas.length;
  } else {
    console.log(`OK  ${archivo}`);
  }
}

console.log(`\n──────────────────────────────────────────`);
console.log(totalProblemas === 0 ? 'SIN PROBLEMAS DETECTADOS' : `TOTAL: ${totalProblemas} problema(s)`);
process.exit(totalProblemas === 0 ? 0 : 1);
