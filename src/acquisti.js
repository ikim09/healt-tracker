// Acquisto in-app "Allegati illimitati".
// Parla direttamente con l'App Store di Apple: nessun servizio esterno, nessun account.
// Lo stato di sblocco è salvato sul dispositivo così funziona anche senza rete.

// Interruttore generale: finché è false l'app non mostra nulla di acquistabile
// e gli allegati restano illimitati per tutti. Metterlo a true quando il prodotto
// sarà configurato su App Store Connect e i contratti firmati.
export const ACQUISTI_ATTIVI = true;

export const PRODOTTO = 'com.ikim.healthtracker.allegati';
export const MAX_GRATIS = 4;
export const MAX_PREMIUM = 50;

let premium = false;
let pronto = false;

export const isPremium = () => (ACQUISTI_ATTIVI ? premium : true);
export const maxAllegati = () => (ACQUISTI_ATTIVI ? (premium ? MAX_PREMIUM : MAX_GRATIS) : MAX_PREMIUM);

const salva = async v => { try { await window.storage.set('ht-premium', v ? '1' : '0'); } catch (e) {} };

const setPremium = async v => {
  premium = !!v;
  if (v) await salva(true);
};

/** Legge lo stato salvato: va chiamata all'avvio, prima di tutto il resto. */
export async function caricaStato() {
  try {
    const r = await window.storage.get('ht-premium');
    premium = r?.value === '1';
  } catch (e) { premium = false; }
  return premium;
}

const store = () => {
  if (!ACQUISTI_ATTIVI || typeof window === 'undefined') return null;
  return window.CdvPurchase?.store || null;
};

/** Gli acquisti esistono solo nell'app installata, non nel browser. */
export const acquistiDisponibili = () => !!store();

/**
 * Prepara il negozio e allinea lo stato con quello che risulta ad Apple.
 * @param {(p:boolean)=>void} onCambio richiamata quando lo sblocco cambia
 */
export async function inizializza(onCambio) {
  const s = store();
  if (!s || pronto) return premium;
  const { ProductType, Platform } = window.CdvPurchase;

  try {
    s.register([{ id: PRODOTTO, type: ProductType.NON_CONSUMABLE, platform: Platform.APPLE_APPSTORE }]);

    s.when()
      .approved(tr => tr.verify())
      .verified(rec => {
        rec.finish();
        if (s.owned(PRODOTTO)) { setPremium(true); onCambio?.(true); }
      });

    s.error(e => console.warn('[acquisti]', e?.code, e?.message));

    await s.initialize([Platform.APPLE_APPSTORE]);
    pronto = true;

    if (s.owned(PRODOTTO)) { await setPremium(true); onCambio?.(true); }
  } catch (e) {
    console.warn('[acquisti] inizializzazione non riuscita', e);
  }
  return premium;
}

/** Prezzo formattato dall'App Store (es. "2,99 €"), o null se non disponibile. */
export function prezzo() {
  try {
    const p = store()?.get(PRODOTTO);
    return p?.getOffer()?.pricingPhases?.[0]?.price || null;
  } catch (e) { return null; }
}

/** Avvia l'acquisto. Ritorna 'ok' | 'annullato' | 'non_disponibile' | 'errore'. */
export async function acquista() {
  const s = store();
  if (!s) return 'non_disponibile';
  try {
    const offerta = s.get(PRODOTTO)?.getOffer();
    if (!offerta) return 'non_disponibile';
    const err = await offerta.order();
    if (err) return err.code === window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED ? 'annullato' : 'errore';
    return s.owned(PRODOTTO) ? 'ok' : 'ok';   // la conferma definitiva arriva da verified()
  } catch (e) {
    console.warn('[acquisti] acquisto non riuscito', e);
    return 'errore';
  }
}

/** Ripristina un acquisto già fatto (nuovo telefono, reinstallazione). */
export async function ripristina() {
  const s = store();
  if (!s) return 'non_disponibile';
  try {
    await s.restorePurchases();
    if (s.owned(PRODOTTO)) { await setPremium(true); return 'ok'; }
    return 'niente';
  } catch (e) {
    console.warn('[acquisti] ripristino non riuscito', e);
    return 'errore';
  }
}
