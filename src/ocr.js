// Lettura referti (foto o PDF) interamente sul dispositivo: nessun dato esce dal telefono.
// - PDF con testo: estratto direttamente (preciso)
// - PDF scansionati e immagini: OCR con Tesseract
import { PARAMS } from './params';

const norm = s => String(s)
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9%/\s.,-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Sinonimi e sigle usati dai laboratori → nome canonico usato dall'app
const ALIAS = {
  'Glicemia': ['glicemia', 'glucosio', 'blood glucose', 'glucose', 'glu'],
  'Colesterolo totale': ['colesterolo totale', 'colesterolo tot', 'total cholesterol', 'cholesterol total', 'col tot', 'colesterolo', 'cholesterol'],
  'Colesterolo HDL': ['colesterolo hdl', 'hdl colesterolo', 'hdl cholesterol', 'hdl'],
  'Colesterolo LDL': ['colesterolo ldl', 'ldl colesterolo', 'ldl cholesterol', 'ldl'],
  'Trigliceridi': ['trigliceridi', 'triglyceride', 'tg'],
  'Emoglobina': ['emoglobina', 'hemoglobin', 'hgb', 'hb'],
  'Ematocrito': ['ematocrito', 'hematocrit', 'hct', 'ht'],
  'Globuli bianchi': ['globuli bianchi', 'leucociti', 'white blood', 'wbc'],
  'Globuli rossi': ['globuli rossi', 'eritrociti', 'red blood', 'rbc'],
  'Piastrine': ['piastrine', 'platelets', 'plt'],
  'Creatinina': ['creatinina', 'creatinine', 'crea'],
  'Urea': ['urea', 'azotemia', 'bun'],
  'AST/GOT': ['ast/got', 'ast got', 'transaminasi got', 'got ast', 'ast', 'got'],
  'ALT/GPT': ['alt/gpt', 'alt gpt', 'transaminasi gpt', 'gpt alt', 'alt', 'gpt'],
  'Gamma-GT': ['gamma gt', 'gamma-gt', 'ggt', 'y gt'],
  'TSH': ['tsh reflex', 'tsh'],
  'Ferro': ['ferro', 'sideremia', 'iron'],
  'Ferritina': ['ferritina', 'ferritin'],
  'VES': ['ves', 'velocita di eritrosedimentazione', 'esr'],
  'PCR': ['pcr', 'proteina c reattiva', 'crp'],
  'Vitamina D': ['vitamina d', '25 oh vitamina d', '25-oh', 'vit d'],
  'Vitamina B12': ['vitamina b12', 'cobalamina', 'vit b12', 'b12'],
};

// Prima le etichette lunghe: "colesterolo hdl" deve vincere su "colesterolo"
const ALIAS_LIST = Object.entries(ALIAS)
  .flatMap(([canon, list]) => list.map(a => ({ canon, a: norm(a) })))
  .sort((x, y) => y.a.length - x.a.length);

const num = s => {
  const v = parseFloat(String(s).replace(',', '.'));
  return isNaN(v) ? null : v;
};

// Estrae il primo numero "valore" della riga, ignorando l'intervallo di riferimento (es. "70 - 99")
function valoreDaRiga(riga, dopo) {
  const resto = riga.slice(dopo);
  // toglie gli intervalli tipo "70 - 99" o "70-99" e "< 200" / "> 40"
  const senzaRange = resto
    .replace(/\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?/g, ' ')
    .replace(/[<>]\s*\d+(?:[.,]\d+)?/g, ' ')
    // sigle di unità con numeri, es. "10^3/uL" o "10e3"
    .replace(/10\s*[\^e]\s*\d+/g, ' ');
  const m = senzaRange.match(/\d+(?:[.,]\d+)?/);
  if (m) return num(m[0]);
  const m2 = resto.match(/\d+(?:[.,]\d+)?/);
  return m2 ? num(m2[0]) : null;
}

const plausibile = (def, v) => {
  if (v === null || v < 0) return false;
  if (def.min === undefined) return true;
  const lo = def.min === 0 ? 0 : def.min;
  const hi = (def.max === null || def.max === undefined) ? def.min * 20 + 100 : def.max;
  // accetta valori entro un intervallo molto largo attorno ai riferimenti
  return v >= lo * 0.1 && v <= hi * 10 + 50;
};

/** Cerca nel testo i parametri conosciuti. Ritorna [{n,v,u,min,max}] senza duplicati. */
export function parseReferto(testo) {
  const righe = String(testo || '').split(/\r?\n/).filter(r => r.trim());
  const trovati = new Map();

  for (const rigaRaw of righe) {
    const riga = norm(rigaRaw);
    if (!riga || !/\d/.test(riga)) continue;

    for (const { canon, a } of ALIAS_LIST) {
      if (trovati.has(canon)) continue;
      // confine di parola per evitare che "ht" matchi dentro altre parole
      // "s?" per i plurali inglesi (triglycerides, platelets...)
      const idx = riga.search(new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?([^a-z0-9]|$)`));
      if (idx === -1) continue;

      const def = PARAMS.find(p => p.n === canon);
      const v = valoreDaRiga(riga, idx + a.length);
      if (v === null || !plausibile(def, v)) continue;

      trovati.set(canon, { n: canon, u: def?.u || '', v, min: def?.min, max: def?.max });
      break; // una riga = un parametro
    }
  }
  return [...trovati.values()];
}

/** Testo da PDF con livello testuale (referti scaricati dal portale del laboratorio). */
async function testoDaPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let testo = '';
  const pagine = Math.min(doc.numPages, 10);
  for (let i = 1; i <= pagine; i++) {
    onProgress?.(i / pagine * 0.5);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let y = null, riga = '';
    for (const it of tc.items) {
      const ny = Math.round(it.transform[5]);
      if (y !== null && Math.abs(ny - y) > 3) { testo += riga.trim() + '\n'; riga = ''; }
      riga += it.str + ' ';
      y = ny;
    }
    testo += riga.trim() + '\n';
  }
  return { testo, doc, pdfjs };
}

/** Rende una pagina PDF in immagine per l'OCR (referti scansionati). */
async function pdfPaginaInCanvas(doc, n) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

async function ocr(immagini, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL || '/'}tessdata/`.replace('//', '/');
  const worker = await createWorker(['ita', 'eng'], 1, {
    langPath: base,
    workerPath: `${base}worker.min.js`,
    corePath: base,
    logger: m => { if (m.status === 'recognizing text') onProgress?.(0.5 + m.progress * 0.5); },
  });
  try {
    let testo = '';
    for (const img of immagini) {
      const { data } = await worker.recognize(img);
      testo += data.text + '\n';
    }
    return testo;
  } finally { await worker.terminate(); }
}

/**
 * Legge un referto e ne estrae i parametri.
 * @returns {Promise<{params:Array, testo:string}>}
 */
export async function leggiReferto(file, onProgress) {
  onProgress?.(0.02);

  if (file.type === 'application/pdf') {
    const { testo, doc } = await testoDaPdf(file, onProgress);
    let params = parseReferto(testo);
    if (params.length === 0) {
      // PDF scansionato: niente testo, si passa all'OCR sulle pagine
      const imgs = [];
      const n = Math.min(doc.numPages, 3);
      for (let i = 1; i <= n; i++) imgs.push(await pdfPaginaInCanvas(doc, i));
      const t2 = await ocr(imgs, onProgress);
      params = parseReferto(t2);
      return { params, testo: t2 };
    }
    onProgress?.(1);
    return { params, testo };
  }

  const testo = await ocr([file], onProgress);
  onProgress?.(1);
  return { params: parseReferto(testo), testo };
}
