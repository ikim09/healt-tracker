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

/**
 * Riprogramma i promemoria: una notifica alle 9:00 del giorno prima di ogni visita futura.
 * Cancella prima quelle vecchie così non restano doppioni.
 */
export async function aggiornaPromemoria(visite, attivo) {
  const p = await getPlugin();
  if (!p) return { ok: false, n: 0 };

  try {
    const pend = await p.getPending();
    if (pend?.notifications?.length) {
      await p.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    }
  } catch { /* niente da cancellare */ }

  if (!attivo) return { ok: true, n: 0 };

  const adesso = new Date();
  const da = [];
  for (const v of visite) {
    if (!v.data) continue;
    const [a, m, g] = v.data.split('-').map(Number);
    const quando = new Date(a, m - 1, g - 1, 9, 0, 0); // giorno prima, ore 9
    if (quando <= adesso) continue;
    da.push({
      id: notifId(v.id),
      title: t('notif_title'),
      body: t('notif_body', v.medico, tOra(v.data)),
      schedule: { at: quando, allowWhileIdle: true },
    });
  }

  if (da.length === 0) return { ok: true, n: 0 };
  try {
    await p.schedule({ notifications: da.slice(0, 60) });
    return { ok: true, n: da.length };
  } catch (e) {
    console.error('[promemoria]', e);
    return { ok: false, n: 0 };
  }
}

const tOra = d => { const p = String(d).split('-'); return `${p[2]}/${p[1]}`; };
