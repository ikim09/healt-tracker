// Genera un PDF riepilogativo da portare in visita.
// Tutto avviene sul dispositivo: nessun dato viene inviato da nessuna parte.
import { t, tv, locale } from './i18n';

const fmtD = d => { if(!d) return '-'; const p=String(d).split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
const oggiTesto = () => new Date().toLocaleDateString(locale(), {day:'2-digit', month:'long', year:'numeric'});
const isAbn = p => p.min!==undefined && (p.v<p.min || (p.max!==null && p.max!==undefined && p.v>p.max));
const rif = p => {
  if (p.min===undefined) return '';
  if (p.max===null || p.max===undefined) return `> ${p.min}`;
  if (p.min===0) return `< ${p.max}`;
  return `${p.min} - ${p.max}`;
};

/**
 * @param {object} d   dati dell'app { cartella, allergie, terapie, analisi, visite, vitali, problemi }
 * @param {object} op  { sezioni: Set<string>, mesi: number|null }
 * @returns {Promise<Blob>}
 */
export async function generaReferto(d, op = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const sez = op.sezioni || new Set(['dati','allergie','terapie','analisi','visite','vitali','percorsi']);
  const limite = op.mesi ? new Date(Date.now() - op.mesi*30*24*3600*1000).toISOString().slice(0,10) : null;
  const recente = data => !limite || String(data) >= limite;

  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const M = 14;                     // margine
  const W = doc.internal.pageSize.getWidth();
  let y = M;

  const nuovaPagina = h => {
    if (y + h < doc.internal.pageSize.getHeight() - 16) return;
    doc.addPage(); y = M;
  };
  const titoloSezione = txt => {
    nuovaPagina(14);
    y += 4;
    doc.setFont('helvetica','bold').setFontSize(11).setTextColor(30,64,175);
    doc.text(txt, M, y);
    y += 1.5;
    doc.setDrawColor(219,234,254).setLineWidth(0.4).line(M, y, W-M, y);
    y += 4;
    doc.setTextColor(31,41,55);
  };
  const tabella = (head, body, opzioni={}) => {
    if (!body.length) return;
    autoTable(doc, {
      startY: y, margin:{left:M, right:M},
      head:[head], body,
      styles:{ font:'helvetica', fontSize:8.5, cellPadding:1.8, textColor:[31,41,55] },
      headStyles:{ fillColor:[239,246,255], textColor:[30,64,175], fontStyle:'bold' },
      alternateRowStyles:{ fillColor:[250,250,252] },
      ...opzioni,
    });
    y = doc.lastAutoTable.finalY + 2;
  };

  // ---- Intestazione ----
  doc.setFillColor(30,58,138).rect(0, 0, W, 26, 'F');
  doc.setFont('helvetica','bold').setFontSize(15).setTextColor(255,255,255);
  doc.text(t('pdf_title'), M, 12);
  doc.setFont('helvetica','normal').setFontSize(9).setTextColor(191,219,254);
  doc.text(`${t('pdf_generated')} ${oggiTesto()}`, M, 19);
  y = 34;
  doc.setTextColor(31,41,55);

  // ---- Dati personali ----
  const c = d.cartella;
  if (sez.has('dati') && c) {
    titoloSezione(t('pdf_personal'));
    const righe = [
      [t('rec_name'), c.nome], [t('rec_birth'), c.nascita?fmtD(c.nascita):''],
      [t('rec_blood'), c.gruppo], [t('rec_height'), c.altezza?`${c.altezza} cm`:''],
      [t('rec_weight'), c.peso?`${c.peso} kg`:''],
      [t('rec_doctor'), [c.medicoNome, c.medicoTel].filter(Boolean).join(' - ')],
      [t('rec_emergency'), [c.emergenzaNome, c.emergenzaTel].filter(Boolean).join(' - ')],
    ].filter(r=>r[1]);
    if (c.note) righe.push([t('rec_notes'), c.note]);
    tabella([t('pdf_field'), t('pdf_value')], righe, {columnStyles:{0:{cellWidth:45, fontStyle:'bold'}}});
  }

  // ---- Allergie ----
  if (sez.has('allergie') && d.allergie?.length) {
    titoloSezione(t('allergies_title'));
    const ord = [...d.allergie].sort((a,b)=>(b.gravita==='Grave')-(a.gravita==='Grave'));
    tabella(
      [t('substance_l').replace(' *',''), t('allergy_type_l'), t('severity_l'), t('symptoms_l')],
      ord.map(a=>[a.sostanza, tv(a.tipo), tv(a.gravita), a.sintomi||'']),
      { didParseCell: h => { if (h.section==='body' && ord[h.row.index]?.gravita==='Grave') {
          h.cell.styles.textColor=[190,18,60]; h.cell.styles.fontStyle='bold'; } } }
    );
  }

  // ---- Terapie in corso ----
  if (sez.has('terapie') && d.terapie?.length) {
    const oggi = new Date().toISOString().slice(0,10);
    const attive = d.terapie.filter(x=>!x.fine || x.fine>=oggi);
    if (attive.length) {
      titoloSezione(t('pdf_therapies'));
      tabella(
        [t('drug_l').replace(' *',''), t('dose_l'), t('freq_l'), t('start_l').replace(' *','')],
        attive.map(x=>[x.farmaco, x.dose||'', tv(x.frequenza), fmtD(x.inizio)])
      );
    }
  }

  // ---- Analisi ----
  if (sez.has('analisi') && d.analisi?.length) {
    const valori = d.analisi.flatMap(a=>(a.params||[]).map(p=>({p, data:p.d||a.data})))
      .filter(x=>recente(x.data))
      .sort((x,y)=>String(y.data).localeCompare(String(x.data)));
    if (valori.length) {
      titoloSezione(t('tests_title'));
      tabella(
        [t('h_date'), t('h_param'), t('h_value'), t('h_unit'), t('ref')],
        valori.map(x=>[fmtD(x.data), tv(x.p.n), String(x.p.v), x.p.u||'', rif(x.p)]),
        { didParseCell: h => { if (h.section==='body' && isAbn(valori[h.row.index]?.p)) {
            h.cell.styles.textColor=[190,18,60]; h.cell.styles.fontStyle='bold'; } } }
      );
      doc.setFontSize(7.5).setTextColor(150,150,150);
      nuovaPagina(6);
      doc.text(t('pdf_abn_note'), M, y+3); y += 6;
      doc.setTextColor(31,41,55);
    }
  }

  // ---- Visite ----
  if (sez.has('visite') && d.visite?.length) {
    const v = d.visite.filter(x=>recente(x.data));
    if (v.length) {
      titoloSezione(t('visits_title'));
      tabella(
        [t('h_date'), t('h_doctor'), t('h_spec'), t('h_diag')],
        v.map(x=>[fmtD(x.data), `Dr. ${x.medico}`, tv(x.spec), x.diagnosi||''])
      );
    }
  }

  // ---- Dati vitali ----
  if (sez.has('vitali') && d.vitali?.length) {
    const v = d.vitali.filter(x=>recente(x.data));
    if (v.length) {
      titoloSezione(t('vitals_title'));
      tabella(
        [t('h_date'), t('h_type'), t('h_value'), t('h_notes')],
        v.map(x=>[fmtD(x.data), tv(x.tipo),
          x.tipo==='Pressione' ? `${x.massima??''}/${x.minima??''} mmHg` : `${x.valore} ${x.u||''}`.trim(),
          x.note||''])
      );
    }
  }

  // ---- Percorsi aperti ----
  if (sez.has('percorsi') && d.problemi?.length) {
    const aperti = d.problemi.filter(p=>p.stato!=='risolto');
    if (aperti.length) {
      titoloSezione(t('pdf_journeys'));
      for (const p of aperti) {
        nuovaPagina(18);
        doc.setFont('helvetica','bold').setFontSize(9.5);
        doc.text(`${p.titolo}  (${t('since')} ${fmtD(p.data)})`, M, y); y += 4.5;
        doc.setFont('helvetica','normal').setFontSize(8.5).setTextColor(80,80,80);
        if (p.descrizione) {
          const righe = doc.splitTextToSize(p.descrizione, W-2*M);
          nuovaPagina(righe.length*4);
          doc.text(righe, M, y); y += righe.length*4 + 1;
        }
        const agg = [...(p.aggiornamenti||[])].sort((a,b)=>String(b.data).localeCompare(String(a.data))).slice(0,5);
        for (const a of agg) {
          const testo = `${fmtD(a.data)}${a.livello!=null?` [${a.livello}/10]`:''} - ${a.testo}`;
          const righe = doc.splitTextToSize(testo, W-2*M-4);
          nuovaPagina(righe.length*4);
          doc.text(righe, M+4, y); y += righe.length*4;
        }
        doc.setTextColor(31,41,55);
        y += 3;
      }
    }
  }

  // ---- Piè di pagina su ogni pagina ----
  const tot = doc.internal.getNumberOfPages();
  for (let i=1; i<=tot; i++) {
    doc.setPage(i);
    doc.setFont('helvetica','normal').setFontSize(7.5).setTextColor(160,160,160);
    doc.text(t('pdf_footer'), M, doc.internal.pageSize.getHeight()-8);
    doc.text(`${i} / ${tot}`, W-M, doc.internal.pageSize.getHeight()-8, {align:'right'});
  }

  return doc.output('blob');
}
