// Prepara i file OCR in public/ così l'app funziona completamente offline.
// Copia worker e core di Tesseract da node_modules e scarica i dati lingua (solo la prima volta).
import { mkdir, copyFile, access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tessdata');
const nm = join(root, 'node_modules');

const exists = async p => { try { await access(p, constants.F_OK); return true; } catch { return false; } };

const COPY = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
];

// ita = referti italiani, eng = sigle e referti in inglese
const LANGS = ['ita', 'eng'];
const BASE = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';

async function main() {
  await mkdir(out, { recursive: true });

  for (const [src, dest] of COPY) {
    const from = join(nm, src);
    if (await exists(from)) await copyFile(from, join(out, dest));
    else console.warn(`[setup-ocr] manca ${src} (esegui npm install)`);
  }

  for (const lang of LANGS) {
    const dest = join(out, `${lang}.traineddata.gz`);
    if (await exists(dest)) continue;
    const url = `${BASE}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`[setup-ocr] scaricato ${lang}.traineddata.gz`);
    } catch (e) {
      console.warn(`[setup-ocr] impossibile scaricare ${lang}: ${e.message}`);
    }
  }
  console.log('[setup-ocr] pronto');
}

main().catch(e => { console.error('[setup-ocr]', e); process.exit(0); });
