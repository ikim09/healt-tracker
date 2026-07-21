# Pubblicare Health Tracker sul Play Store

Il progetto è già configurato con Capacitor. Restano i passaggi che richiedono il tuo PC (Android Studio) e il tuo account Play.

## Cosa è già pronto

- Progetto Android in `android/` (appId: `com.michele.healthtracker`, versionCode 1, versionName 1.0, targetSdk 36)
- Icone app (normale, round, adattiva) già installate nel progetto Android
- Asset per la scheda Play Store in `store-assets/` (icona 512×512 e feature graphic 1024×500)
- Script npm: `npm run sync` (build web + aggiorna Android), `npm run open:android`

## 1. Installa Android Studio

Scarica da https://developer.android.com/studio e installa (include l'SDK Android).

## 2. Apri il progetto

```
npm install
npm run sync
npm run open:android
```

Attendi la sincronizzazione Gradle (prima volta: alcuni minuti).

Facoltativo: prova l'app su un emulatore o telefono con il pulsante ▶ Run.

## 3. Genera l'AAB firmato

Il Play Store richiede un **Android App Bundle (.aab) firmato**.

1. In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle**
2. **Create new…** per creare il keystore. Salvalo fuori dal progetto (es. `C:\Users\miche\keystore\health-tracker.jks`) e **conserva password e file: se li perdi non potrai più aggiornare l'app**
3. Scegli variante **release** → Create
4. Il file esce in `android/app/release/app-release.aab`

## 4. Carica su Play Console

Su https://play.google.com/console:

1. **Crea app** → nome "Health Tracker", app gratuita
2. Compila la **scheda dello store**: descrizione breve/completa, icona 512×512 e feature graphic (in `store-assets/`), almeno 2 screenshot del telefono (falli dall'emulatore)
3. Compila i questionari obbligatori: **privacy policy (URL obbligatorio)**, sicurezza dei dati, classificazione contenuti, pubblico di destinazione
4. **Produzione → Crea nuova release** → carica l'AAB → invia in revisione

Nota: per i nuovi account personali Google richiede un test chiuso con almeno 12 tester per 14 giorni prima della produzione. Se il tuo account è soggetto a questo requisito, la Console te lo indicherà.

Nota salute: essendo un'app "health", nella dichiarazione della scheda evita claim medici (diagnosi/cura) per non ricadere nelle policy per app mediche.

## Aggiornamenti futuri

1. Modifica il codice in `src/`
2. `npm run sync`
3. In `android/app/build.gradle` incrementa `versionCode` (es. 2) e `versionName`
4. Rigenera l'AAB firmato con lo stesso keystore e caricalo come nuova release

## Nota

Da `vite.config.js` è stato rimosso il plugin Tailwind: non era installato né usato dall'app e impediva la build.
