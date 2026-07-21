// Persistenza locale su IndexedDB (i dati restano solo sul dispositivo)
const DB = 'healthtracker-db';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function op(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

window.storage = {
  get: async (key) => {
    const v = await op('readonly', (s) => s.get(key));
    return v === undefined ? null : { value: v };
  },
  set: (key, value) => op('readwrite', (s) => s.put(value, key)),
  delete: (key) => op('readwrite', (s) => s.delete(key)),
};
