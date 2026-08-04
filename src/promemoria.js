// Promemoria delle visite tramite notifiche locali del telefono.
// Tutto resta sul dispositivo: nessun server, nessun invio di dati.
import { t } from './i18n';

let plugin = null;
async function getPlugin() {
  if (plugin !== null) return plugin;
  try {
    const m = await import('@capacitor/local-notifications');
    plugin = m.LocalNotifications || null;
  } catch { plugin = null; }
  return plugin;
}

/** Le notifiche funzionano solo nell'app installata, non nel browser. */
export async function notificheDisponibili() {
  const p = await getPlugin();
  if (!p) return false;
  try { return typeof p.schedule === 'function'; } catch { return false; }
}

export async function chiediPermesso() {
  const p = await getPlugin();
  if (!p) return false;
  try {
    const r = await p.requestPermissions();
    return r.display === 'granted';
  } catch { return false; }
}

// id numerico stabile a partire dall'id del record
const notifId = id => Math.abs(Number(String(id).slice(-8))) % 2000000000;

// Le notifiche delle terapie usano id in una fascia separata, per non pestarsi con le visite
const idTerapia = (terapiaId, i) => 1000000000 + (Math.abs(Number(String(terapiaId).slice(-7))) % 900000) * 100 + i;

/**
 * Riprogramma tutti i promemoria: visite (giorno prima, ore 9) e terapie (ogni giorno agli orari scelti).
 * Cancella prima quelli vecchi così non restano doppioni.
 * @param {Array} visite
 * @param {boolean} attivoVisite
 * @param {Array} terapie  ognuna può avere { orari: ['08:00','20:00'], promemoria: true }
 */
export async function aggiornaPromemoria(visite, attivoVisite, terapie = []) {
  const p = await getPlugin();
  if (!p) return { ok: false, n: 0, nTerapie: 0 };

  try {
    const pend = await p.getPending();
    if (pend?.notifications?.length) {
      await p.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    }
  } catch { /* niente da cancellare */ }

  const adesso = new Date();
  const oggi = adesso.toISOString().slice(0, 10);
  const da = [];

  // --- Visite: una notifica il giorno prima ---
  if (attivoVisite) {
    for (const v of visite) {
      if (!v.data) continue;
      const [a, m, g] = v.data.split('-').map(Number);
      const quando = new Date(a, m - 1, g - 1, 9, 0, 0);
      if (quando <= adesso) continue;
      da.push({
        id: notifId(v.id),
        title: t('notif_title'),
        body: t('notif_body', v.medico, tOra(v.data)),
        schedule: { at: quando, allowWhileIdle: true },
      });
    }
  }

  // --- Terapie: ogni giorno agli orari indicati, finché la terapia è in corso ---
  let nTerapie = 0;
  for (const x of terapie) {
    if (!x.promemoria || !x.orari?.length) continue;
    if (x.fine && x.fine < oggi) continue;          // terapia già conclusa
    x.orari.forEach((ora, i) => {
      const [h, min] = String(ora).split(':').map(Number);
      if (isNaN(h) || isNaN(min)) return;
      da.push({
        id: idTerapia(x.id, i),
        title: t('med_notif_title'),
        body: t('med_notif_body', x.farmaco, x.dose || ''),
        schedule: { on: { hour: h, minute: min }, allowWhileIdle: true, repeats: true },
      });
      nTerapie++;
    });
  }

  if (da.length === 0) return { ok: true, n: 0, nTerapie: 0 };
  try {
    await p.schedule({ notifications: da.slice(0, 60) });   // iOS ne consente 64 in sospeso
    return { ok: true, n: da.length, nTerapie };
  } catch (e) {
    console.error('[promemoria]', e);
    return { ok: false, n: 0, nTerapie: 0 };
  }
}

const tOra = d => { const p = String(d).split('-'); return `${p[2]}/${p[1]}`; };
