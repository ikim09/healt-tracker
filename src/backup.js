// Backup e ripristino di tutti i dati dell'app in un unico file.
// Il file resta tuo: non passa da nessun server.

export const FORMATO = 1;
const PREFISSO = 'ht-';
const PREFISSO_ALLEGATI = 'ht-att-';

const tutteLeChiavi = async () => {
  const k = await window.storage.keys();
  return (k || []).filter(x => String(x).startsWith(PREFISSO));
};

/** Crea il file di backup. @returns {Promise<{blob:Blob, nome:string, voci:number}>} */
export async function creaBackup({ includiAllegati = true } = {}) {
  const chiavi = (await tutteLeChiavi())
    .filter(k => includiAllegati || !String(k).startsWith(PREFISSO_ALLEGATI));

  const dati = {};
  for (const k of chiavi) {
    const r = await window.storage.get(k);
    if (r && r.value !== undefined) dati[k] = r.value;
  }

  const contenuto = {
    app: 'HealthTracker',
    formato: FORMATO,
    creato: new Date().toISOString(),
    conAllegati: includiAllegati,
    dati,
  };

  const blob = new Blob([JSON.stringify(contenuto)], { type: 'application/json' });
  const nome = `healthtracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
  return { blob, nome, voci: chiavi.length };
}

/** Legge e verifica un file di backup, senza applicarlo. */
export async function leggiBackup(file) {
  const testo = await file.text();
  let j;
  try { j = JSON.parse(testo); } catch { throw new Error('formato'); }
  if (j?.app !== 'HealthTracker' || !j.dati || typeof j.dati !== 'object') throw new Error('formato');
  if (Number(j.formato) > FORMATO) throw new Error('versione');

  const chiavi = Object.keys(j.dati);
  const conta = tipo => { try { return JSON.parse(j.dati[tipo] || '[]').length; } catch { return 0; } };

  return {
    contenuto: j,
    creato: j.creato,
    conAllegati: !!j.conAllegati,
    riepilogo: {
      visite: conta('ht-visite'), analisi: conta('ht-analisi'), vitali: conta('ht-vitali'),
      allenamenti: conta('ht-allenamenti'), ricette: conta('ht-ricette'), note: conta('ht-note'),
      terapie: conta('ht-terapie'), problemi: conta('ht-problemi'), allergie: conta('ht-allergie'),
      allegati: chiavi.filter(k => k.startsWith(PREFISSO_ALLEGATI)).length,
    },
  };
}

/**
 * Sostituisce i dati attuali con quelli del backup.
 * Attenzione: quello che c'è ora viene rimosso.
 */
export async function applicaBackup(contenuto) {
  const nuove = Object.keys(contenuto.dati);

  // Via i dati attuali, così non restano avanzi di record cancellati nel frattempo.
  // Se il backup è senza allegati, quelli esistenti si tengono: sono comunque agganciati agli id.
  const vecchie = await tutteLeChiavi();
  for (const k of vecchie) {
    if (!contenuto.conAllegati && String(k).startsWith(PREFISSO_ALLEGATI)) continue;
    if (!nuove.includes(k)) await window.storage.delete(k);
  }

  for (const k of nuove) await window.storage.set(k, contenuto.dati[k]);
  return nuove.length;
}
