// Blocco dell'app con Face ID / Touch ID / codice del dispositivo.
// Nessun dato esce dal telefono: la verifica è fatta interamente da iOS.

let plugin = null;
async function getPlugin() {
  if (plugin !== null) return plugin;
  try {
    const m = await import('@aparajita/capacitor-biometric-auth');
    plugin = m.BiometricAuth || null;
  } catch { plugin = null; }
  return plugin;
}

/** Il blocco esiste solo nell'app installata, non nel browser. */
export async function bloccoDisponibile() {
  const p = await getPlugin();
  if (!p) return false;
  try {
    const info = await p.checkBiometry();
    // isAvailable = biometria pronta · strongReason presente quando manca ma c'è il codice
    return !!(info?.isAvailable || info?.deviceIsSecure);
  } catch { return false; }
}

/** Nome del metodo disponibile, per scriverlo nell'interfaccia. */
export async function tipoBlocco() {
  const p = await getPlugin();
  try {
    const info = await p?.checkBiometry();
    const t = String(info?.biometryType ?? '');
    if (/face/i.test(t) || info?.biometryType === 1) return 'Face ID';
    if (/touch|finger/i.test(t) || info?.biometryType === 2) return 'Touch ID';
  } catch {}
  return null;
}

/**
 * Chiede lo sblocco. Ritorna true se l'identità è confermata.
 * Se la biometria fallisce, iOS propone da solo il codice del dispositivo.
 */
export async function sblocca(motivo) {
  const p = await getPlugin();
  if (!p) return true;                 // senza plugin non si blocca nulla
  try {
    await p.authenticate({
      reason: motivo,
      cancelTitle: 'Annulla',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Usa il codice',
    });
    return true;
  } catch (e) {
    return false;
  }
}
