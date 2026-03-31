
Questo file guida Claude Code quando lavora in questo repository.
Leggilo integralmente prima di eseguire qualsiasi azione.

---

## Descrizione del progetto

App desktop Electron per **aggiungere annotazioni link cliccabili ai PDF degli atti PCT**.

L'utente:
1. Trascina un PDF (l'atto principale del PCT)
2. Trascina uno o più allegati (PDF, EML, MSG, JPG), con possibilità di riordinarli
3. Per ogni allegato assegna un'etichetta di ricerca (es. "doc. 1")
4. L'app trova quella etichetta nell'atto principale, aggiunge una sottolineatura blu
   e un'annotazione link (Launch action relativa) che punta al file allegato
5. Salva l'atto modificato e tutti gli allegati nella cartella di output scelta

**Target:** utenti non tecnici (es. avvocati, professionisti).
**Privacy:** zero connessioni di rete. Tutto offline. GDPR compliant.

**Stack:** Electron + JavaScript puro (ESModules) + HTML/CSS vanilla +
pdfjs-dist + pdf-lib + Vitest

---

## Session Memory

Prima di iniziare qualsiasi lavoro, leggi il file di sessione più recente nella root
(es. `sessione_002_fase2.md`) per capire lo stato del progetto, le decisioni prese,
cosa manca.

I file di sessione stanno nella cartella `sessioni/`.

Dopo ogni blocco di lavoro significativo, crea o aggiorna il file di sessione.

**Naming:** `sessione_NNN_faseN.md` (es. `sessione_001_fase1.md`)

**Template obbligatorio:**

```markdown
# Sessione NNN — [Titolo breve]

**Data:** YYYY-MM-DD
**Versione:** x.y.z

## Obiettivo

## Decisioni prese

## File modificati

## Problemi noti / TODO prossima sessione
```

---

## Session Startup Checklist

Esegui questi controlli prima di qualsiasi modifica:

1. [ ] Letto il file di sessione più recente nella root
2. [ ] Verificato `git status` (nessun file uncommitted non intenzionale)
3. [ ] Eseguito `npm test` e annotato quanti test passano/falliscono

Le operazioni **read-only** (`cat`, `grep`, `git log`, `git diff`,
`git status`) **non richiedono conferma** — eseguile immediatamente.

Le operazioni di **scrittura/cancellazione/commit** richiedono conferma
solo se non sono parte di un piano già approvato.

---

## Regole Critiche (Non Negoziabili)

Hanno priorità su qualsiasi altra best practice:

### 1. Zero connessioni di rete durante l'elaborazione
Nessuna API esterna, nessuna telemetria durante l'analisi/annotazione PDF.

### 2. Sicurezza Electron

```javascript
// In OGNI BrowserWindow
nodeIntegration: false,
contextIsolation: true,
// sandbox: false — necessario per webUtils.getPathForFile() nel preload
// webUtils richiede accesso al processo principale, incompatibile con sandbox
// in Electron 33. Rivalutare in versioni future.
sandbox: false,
preload: path.join(__dirname, 'preload.js'),
```

- Usa solo `contextBridge` + `ipcRenderer.invoke` per comunicazione
- Mai esporre `ipcRenderer` direttamente nel renderer
- `ipcMain.send()` NON esiste — usa sempre `mainWindow.webContents.send()`
- Non usare `nodeIntegration: true` in nessun caso

### 3. JavaScript coerente e leggibile
- Usa `const` e `let`, mai `var`
- Usa `async/await`, mai `.then()` nidificato
- Documenta funzioni pubbliche con **JSDoc** (vedi sezione sotto)
- Non usare `eval()`, `new Function()`, o costrutti dinamici pericolosi
- Mantieni gli stessi nomi di variabili/funzioni coerenti tra i file

### 4. Sviluppo incrementale
Una feature/fix alla volta. **STOP alla fine di ogni unità logica.**
Aspetta conferma utente prima di procedere.

### 5. Git commits e documentazione

Usa Conventional Commits:
- `feat:` nuova funzionalità visibile all'utente
- `fix:` bug fix
- `refactor:` cambio interno senza nuove feature
- `chore:` script, config, dipendenze, docs
- `test:` aggiunta/modifica test

**DEVLOG.md:** aggiorna dopo ogni commit con: cosa hai fatto, decisioni prese,
problemi risolti o aperti.

### 9. Checklist obbligatoria prima di ogni build GitHub (tag di release)

Prima di creare un tag `vX.Y.Z` e avviare la CI, esegui **tutti** questi passi nell'ordine:

0. **Verifica sincronizzazione versione:**
   - Controlla che `package.json` → `"version"` corrisponda alla versione che vuoi rilasciare
   - La versione mostrata nell'interfaccia viene letta direttamente da `package.json`
     via IPC (`app:getVersion` → `app.getVersion()`): **non esiste una costante separata
     da aggiornare nel renderer**
   - Se le due versioni non coincidono, aggiorna `package.json` prima di procedere
   - ⚠️ Verifica che `src/renderer/index.html` contenga `v…` nel badge versione,
     **mai un numero hardcoded** — il valore viene sempre iniettato via IPC a runtime

1. **Aggiorna `README.md` — sezione Download:**
   - Cambia il numero di versione nella riga "Versione attuale: **vX.Y.Z**"
   - Aggiorna tutti e 4 i link di download con il nuovo numero di versione
     (cerca e sostituisci il vecchio numero ovunque nella sezione Download)

2. **Aggiorna `README.md` — sezione Roadmap:**
   - Aggiungi una riga `- [x] vX.Y.Z — [descrizione delle novità]` con le funzionalità
     introdotte nella release

3. **Aggiorna `DEVLOG.md`:**
   - Aggiungi una sezione `## vX.Y.Z — [titolo] (YYYY-MM-DD)` con: cosa è cambiato,
     decisioni prese, file modificati, risultato dei test

4. **Aggiorna `ARCHITECTURE.md`** se l'architettura è cambiata

5. **Esegui `npm test`** — tutti i test devono essere verdi

6. **Crea il commit** con `chore: bump vX.Y.Z` e poi il tag

7. **Dopo che la CI ha pubblicato la release**, aggiorna il body su GitHub con le novità:
   - Usa `gh release edit vX.Y.Z --repo avvocati-e-mac/pct-link-generator --notes-file <file>`
   - Il body deve contenere: tabella link download (generata dal job CI), sezione
     **## Novità in questa versione** con le funzionalità introdotte in linguaggio
     comprensibile agli utenti finali (non tecnico), istruzioni macOS.

> ⚠️ Non creare mai il tag prima di aver aggiornato `README.md` con i link di download:
> i link puntano direttamente all'URL del tag e devono essere corretti prima che
> la release sia pubblica.

### 6. Privacy nei log
**MAI** loggare il contenuto dei file PDF o il testo estratto.
Logga solo: nome file sanitizzato, dimensione, numero pagine, timing,
warning, codici errore.

```javascript
// ✅ Corretto
console.log(`[PDF] Elaborazione avviata: ${path.basename(filePath)}, ${pages} pagine`);

// ❌ Vietato
console.log('Testo estratto:', testoDelPDF);
console.log('Buffer:', buffer);
```

### 7. File temporanei
Preferisci elaborazione in-memory. Se servono file temp, usa la directory
OS temp, nomi random, cleanup immediato a fine elaborazione o in errore.

### 8. Test obbligatori per modifiche critiche
Se modifichi `buildSearchRegex` in `pdf-processor.js` o la conversione
coordinate, **devi** aggiornare i test Vitest corrispondenti prima di
chiedere conferma.

---

## JSDoc — Standard di documentazione

Poiché il progetto usa JavaScript (non TypeScript), usa JSDoc per documentare
la firma delle funzioni pubbliche.

```javascript
/**
 * Trova le coordinate del testo nel PDF.
 *
 * @param {string} pdfPath - Percorso assoluto al PDF
 * @param {string} searchLabel - Etichetta da cercare (es. "doc. 1")
 * @returns {Promise<AnnotationCoord[]>}
 */
export async function findTextCoordinates(pdfPath, searchLabel) { ... }
```

Definisci i `@typedef` principali in `src/shared/types.js` e importali
con `@import` dove servono:

```javascript
// In qualsiasi file che usa ProcessResult:
/** @import { ProcessResult } from '../shared/types.js' */
```

---

## Versionamento (SemVer)

- **PATCH** (x.y.**Z**): bugfix, refactoring, aggiornamenti dipendenze
- **MINOR** (x.**Y**.0): nuova funzionalità visibile, nuovo canale IPC
- **MAJOR** (**X**.0.0): breaking change all'architettura o all'IPC contract

---

## Comandi

```bash
npm start          # Avvia Electron: electron .
npm test           # Vitest run (tutti i test)
npm run build      # Placeholder — da configurare con electron-builder
```

---

## Architettura

### Separazione dei processi Electron

**Main Process** (`src/main/`)
- Accesso Node.js completo: file system, pdfjs-dist, pdf-lib
- `main.js` — entry point, crea BrowserWindow, registra handler IPC
- `preload.js` — espone `window.electronAPI` via `contextBridge`
- `pdf-processor.js` — tutta la logica PDF (nessun codice Electron qui)

**Renderer** (`src/renderer/`)
- Vanilla HTML/CSS/JavaScript — nessun framework UI
- Zero accesso a Node.js (contextIsolation attivo)
- `index.html` — shell HTML con due zone drag & drop
- `renderer.js` — logica UI, drag & drop, lista allegati riordinabile
- `style.css` — stili vanilla, layout due colonne flexbox

**Shared** (`src/shared/`)
- `types.js` — costanti IPC (`IPC_CHANNELS`) e `@typedef` JSDoc

### Flusso di elaborazione

```
File droppati nel Renderer
  → webUtils.getPathForFile(file) → percorso assoluto
  → window.electronAPI.selectOutputFolder() → IPC: dialog:selectOutputFolder
  → window.electronAPI.processPDF(data)
      → IPC: pdf:process
      → main.js → pdf-processor.js
            ├─ fs.copyFile: allegati → outputFolder
            ├─ findTextCoordinates(mainPdfPath, label)
            │     pdfjs-dist: getTextContent() → buildSearchRegex() → match
            │     restituisce [{ pageIndex, x, y, width, height }]
            ├─ addUnderlineLink(mainPdfPath, outputPath, annotations)
            │     pdf-lib: inversione Y, drawLine blu, annotazione /Link /Launch
            └─ restituisce { success, processedAnnotations, notFound[] }
  → renderer.js: aggiorna UI con risultato
```

---

## IPC Channels Reference

Tutti i canali sono definiti come costanti in `src/shared/types.js`.
**Mai hardcodare stringhe di canale nei file.**

### Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`)

| Canale | Costante | Input | Output |
|--------|----------|-------|--------|
| `pdf:process` | `IPC_CHANNELS.PDF_PROCESS` | `{ mainPdfPath: string, attachments: Attachment[], outputFolder: string }` | `ProcessResult` |
| `dialog:selectOutputFolder` | `IPC_CHANNELS.DIALOG_SELECT_FOLDER` | nessuno | `string \| null` |

> ⚠️ Non esistono altri canali IPC in questo progetto. Non aggiungerne
> senza aggiornare sia il codice che questa documentazione.

---

## window.electronAPI Surface

Disponibile nel Renderer come `window.electronAPI.*`.

```javascript
// Elaborazione PCT
processPDF(data)              // Promise<ProcessResult>
// data = { mainPdfPath: string, attachments: Attachment[], outputFolder: string }

// Dialog selezione cartella
selectOutputFolder()          // Promise<string | null>

// Percorso assoluto da File object (drag & drop)
getPathForFile(file)          // string
```

---

## Tipi condivisi (`src/shared/types.js`)

```javascript
// Costanti canali IPC — importa da qui, non hardcodare le stringhe
export const IPC_CHANNELS = {
  PDF_PROCESS:          'pdf:process',
  DIALOG_SELECT_FOLDER: 'dialog:selectOutputFolder',
};

/**
 * @typedef {Object} Attachment
 * @property {string} path   - Percorso assoluto del file allegato
 * @property {string} name   - Nome file (es. "allegato_1.pdf")
 * @property {string} label  - Etichetta di ricerca nell'atto (es. "doc. 1")
 */

/**
 * @typedef {Object} AnnotationCoord
 * @property {number} pageIndex   - Indice pagina 0-based
 * @property {number} x
 * @property {number} y           - Coordinata Y sistema pdfjs (bottom-up baseline)
 * @property {number} width
 * @property {number} height
 * @property {string} matchedText - Testo che ha fatto match
 */

/**
 * @typedef {Object} ProcessInput
 * @property {string}       mainPdfPath
 * @property {Attachment[]} attachments
 * @property {string}       outputFolder
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean}  success                - Sempre true (anche con notFound)
 * @property {number}   processedAnnotations   - Annotazioni aggiunte
 * @property {string[]} notFound               - Etichette non trovate nel PDF
 */
```

---

## Conversione coordinate (CRITICO)

`pdfjs-dist` e `pdf-lib` usano sistemi di coordinate diversi per l'asse Y:

- **pdfjs-dist:** coordinate native PDF — origine in **basso a sinistra**,
  ma la coordinata Y restituita è la **baseline del testo**
- **pdf-lib:** origine in **basso a sinistra**, coordinate del rettangolo

Formula (`pdf-processor.js`, funzione `addUnderlineLink`):

```javascript
// Inversione per trovare il bordo inferiore del rettangolo di testo
const yPdfLib = pageHeight - y - height;
```

Dove:
- `y` = `item.transform[5]` (baseline pdfjs)
- `height` = `item.height` (altezza item)
- `pageHeight` = `page.getSize().height` (pdf-lib)

**Regola:** le `AnnotationCoord` contengono SEMPRE coordinate pdfjs raw.
La conversione avviene SOLO in `addUnderlineLink`, mai altrove.

---

## Gestione errori

| Situazione | Comportamento |
|---|---|
| PDF protetto da password | Cattura `PasswordException`, rilancia con messaggio leggibile |
| PDF corrotto | Cattura eccezione generica, messaggio con nome file |
| Etichetta non trovata | Restituisce risultato parziale con `notFound[]`, non lancia eccezione |
| Errore copia allegati | Propaga eccezione al renderer (messaggio di errore in UI) |

---

## Testing Pattern

```javascript
// ✅ Testa la logica pura del service, senza IPC o Electron
import { findTextCoordinates, buildSearchRegex } from '../src/main/pdf-processor.js';

it('trova coordinate con PDF sintetico', async () => {
  // Genera PDF con pdf-lib in memoria, salva in os.tmpdir()
  const { pdfPath } = await createTestPdf('Si veda doc. 1 allegato.');
  const results = await findTextCoordinates(pdfPath, 'doc. 1');
  expect(results.length).toBeGreaterThan(0);
});

// ✅ Usa cartelle temporanee per output
const outputFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pct_'));

// ✅ Pulisci sempre con afterEach
afterEach(async () => {
  for (const f of tmpFiles) {
    try { await fs.promises.unlink(f); } catch { /* ignora */ }
  }
});

// ❌ Non fare questo — ipcMain non funziona in Vitest
// ipcMain.handle('pdf:process', handler);
```

---

## Performance

```javascript
// BrowserWindow: mostra solo quando pronta (evita flash bianco)
win.once('ready-to-show', () => win.show());

// File system: sempre asincrono
const buffer = await fs.promises.readFile(filePath); // ✅
// const buffer = fs.readFileSync(filePath);          // ❌ blocca il thread

// IPC: sempre invoke, mai sendSync
const result = await window.electronAPI.processPDF(data); // ✅
```

---

## pdfjs-dist in Node.js — Note tecniche

- **Nessun default export:** usa `import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'`
- **Worker obbligatorio:** `disableWorker: true` non funziona in v4+.
  Imposta `workerSrc` come file URL del worker locale:
  ```javascript
  import { createRequire } from 'module';
  import { pathToFileURL } from 'url';
  const _require = createRequire(import.meta.url);
  const workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  ```
- **Input come Uint8Array:** `getDocument({ data: new Uint8Array(buffer) })`
- **Build legacy:** usa `pdfjs-dist/legacy/build/pdf.mjs` per compatibilità Node.js

---

## Struttura file

```
/
├── CLAUDE.md
├── ARCHITECTURE.md
├── DEVLOG.md
├── sessioni/
│   ├── sessione_001_fase1.md
│   └── sessione_NNN_faseN.md   ← pattern per sessioni future
├── package.json
├── vitest.config.js
├── src/
│   ├── main/
│   │   ├── main.js             ← entry point Electron, IPC handlers
│   │   ├── preload.js          ← contextBridge, window.electronAPI
│   │   └── pdf-processor.js   ← logica PDF pura (pdfjs + pdf-lib)
│   ├── renderer/
│   │   ├── index.html
│   │   ├── renderer.js
│   │   └── style.css
│   └── shared/
│       └── types.js            ← costanti IPC + @typedef
└── tests/
    └── pdf-processor.test.js
```

---

## Roadmap — Fasi di implementazione

### ✅ Fase 1 — Scaffolding (COMPLETATA)
- Struttura cartelle, package.json ESM, .gitignore
- ARCHITECTURE.md, DEVLOG.md
- Electron puro (no electron-vite), JavaScript vanilla (no React/Tailwind)

### ✅ Fase 2 — Core services (COMPLETATA)
- `pdf-processor.js`: `findTextCoordinates`, `addUnderlineLink`, `processPCTDocument`
- pdfjs-dist 4.x con workerSrc come file URL
- `buildSearchRegex`: tokenizzazione parole/numeri + `[\s.]*` + word boundary

### ✅ Fase 3 — IPC e Preload (COMPLETATA)
- `main.js`: BrowserWindow + handler IPC
- `preload.js`: contextBridge con `processPDF`, `selectOutputFolder`, `getPathForFile`
- `src/shared/types.js`: costanti IPC

### ✅ Fase 4 — UI Renderer (COMPLETATA)
- `index.html`: due zone drag & drop, lista allegati, area stato
- `renderer.js`: lista riordinabile (▲▼✕), etichette editabili, chiamate IPC
- `style.css`: layout due colonne flexbox, stili vanilla

### ✅ Fase 5 — Test (COMPLETATA)
- `tests/pdf-processor.test.js`: 16 test Vitest, tutti verdi
- Test formula Y, regex flessibile, findTextCoordinates, notFound, copia allegati

### Fase 6 — Packaging (futura)
- `electron-builder.config.js`
- Icone (macOS `.icns`, Windows `.ico`, Linux `.png`)
- Script dist: `npm run dist:mac`, `npm run dist:win`, `npm run dist:linux`

### Fase 7 — UX miglioramenti (futura)
- Progress bar durante elaborazione PDF
- Notifica di completamento nativa Electron
- Apertura automatica cartella output dopo il completamento

---

## Note operative

- **pdfjs-dist versione:** 4.x — verificare compatibility in caso di aggiornamento
- **pdf-lib pagine 0-indexed:** `pdfDoc.getPage(i)` usa indice 0-based;
  `pageIndex` nei risultati è già 0-based
- **ESModules:** `"type": "module"` in package.json — non mischiare `require()` con `import`
- **Percorsi file:** usa sempre `path.join()` o `path.resolve()`, mai concatenazione
  di stringhe con `/` o `\`
- Preferisci semplicità all'eleganza — gli utenti finali non sono sviluppatori
- Non fare refactoring di codice funzionante senza richiesta esplicita
- Non installare librerie non menzionate in questo file senza chiedere
- Di fronte ad ambiguità: scegli la soluzione più conservativa,
  documentala in `DEVLOG.md` e aspetta conferma
