# ARCHITECTURE.md — PCT Link Generator

## Diagramma architetturale (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP                                  │
│                                                                      │
│  ┌──────────────────────┐          ┌──────────────────────────────┐ │
│  │    MAIN PROCESS      │          │      RENDERER PROCESS        │ │
│  │   (Node.js full)     │          │  (sandboxed, no Node.js)     │ │
│  │                      │  IPC     │                              │ │
│  │  main.js             │◄────────►│  index.html                  │ │
│  │  pdf-processor.js    │ invoke   │  renderer.js                 │ │
│  │                      │          │  style.css                   │ │
│  │  • BrowserWindow     │          │                              │ │
│  │  • ipcMain.handle    │          │  • Step 1: drag PDF atto     │ │
│  │  • dialog API        │          │  • Step 2: drag allegati     │ │
│  │  • fs, path          │          │  • Drag & drop riordino      │ │
│  │  • mupdf             │          │  • Modale anteprima          │ │
│  │  • pdf-lib           │          │  • window.electronAPI calls  │ │
│  └──────────────────────┘          └──────────────────────────────┘ │
│            ▲                                     ▲                  │
│            │                                     │                  │
│            │                         ┌───────────┴──────────────┐  │
│            └─────────────────────────┤      PRELOAD SCRIPT      │  │
│                  contextBridge        │      preload.js          │  │
│                                       │                          │  │
│                                       │  espone window.          │  │
│                                       │  electronAPI             │  │
│                                       │  (contextBridge)         │  │
│                                       └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Canali IPC

Tutti i canali sono definiti come costanti in `src/shared/types.js`. Mai hardcodare le stringhe.

| Canale | Direzione | Pattern | Payload input | Payload output |
|--------|-----------|---------|---------------|----------------|
| `pdf:process` | Renderer → Main | invoke/handle | `{ mainPdfPath, attachments, outputFolder }` | `ProcessResult` |
| `dialog:selectOutputFolder` | Renderer → Main | invoke/handle | nessuno | `string \| null` |
| `render-pdf-page` | Renderer → Main | invoke/handle | `{ filePath: string, pageIndex: number }` | `{ base64: string, totalPages: number }` |
| `app:quit` | Renderer → Main | invoke/handle | nessuno | `void` |
| `shell:openPath` | Renderer → Main | invoke/handle | `folderPath: string` | `void` |
| `update:download` | Renderer → Main | invoke/handle | nessuno | `void` |
| `update:install` | Renderer → Main | invoke/handle | nessuno | `void` |
| `update:available` | Main → Renderer | webContents.send (push) | `{ version: string }` | — |
| `update:progress` | Main → Renderer | webContents.send (push) | `{ percent: number }` | — |
| `update:downloaded` | Main → Renderer | webContents.send (push) | `{}` | — |

I canali Renderer→Main usano `ipcRenderer.invoke` / `ipcMain.handle` (request/response).
I canali Main→Renderer usano `mainWindow.webContents.send` / `ipcRenderer.on` (push unidirezionale).

---

## Tipi condivisi (`src/shared/types.js`)

```javascript
/**
 * @typedef {Object} Attachment
 * @property {string}  path       - Percorso assoluto del file allegato
 * @property {string}  name       - Nome file originale (es. "Comparsa.pdf")
 * @property {string}  label      - Numero di posizione come stringa (es. "1", "2")
 * @property {string}  [renamedAs] - Nome file nell'output se rinomina attiva (opzionale)
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean}     success              - Sempre true (anche con notFound)
 * @property {number}      processedAnnotations - Annotazioni aggiunte
 * @property {string[]}    notFound             - Posizioni non trovate nel PDF
 * @property {string[]}    unsupportedPatterns  - Pattern bis/ter trovati ma non linkati
 * @property {string|null} [warning]            - 'PDF_LOW_TEXT_DENSITY' se OCR sospetto
 */
```

---

## Moduli Node.js in `src/main/`

| File | Responsabilità |
|------|----------------|
| `main.js` | Entry point Electron. Crea `BrowserWindow`, registra handler IPC, chiama `setupUpdater(mainWindow)` in `ready-to-show`, gestisce lifecycle app. **Nessuna logica PDF.** |
| `preload.cjs` | Bridge sicuro (CJS — Electron non supporta ESM nel preload). Espone `window.electronAPI` via `contextBridge`: `processPDF`, `selectOutputFolder`, `getPathForFile`, `renderPdfPage`, `quitApp`, `openPath`, `downloadUpdate`, `installUpdate`, `onUpdateEvent`. |
| `pdf-processor.js` | Tutta la logica PDF: `checkPdfNativity`, `findTextCoordinates` (mupdf), `addUnderlineLink` (pdf-lib), `buildRenamedName` / `hasLeadingNumber`, `processPCTDocument`. **Nessun codice Electron.** |
| `updater.js` | Auto-update via `electron-updater`. `setupUpdater(win)` configura i listener su `autoUpdater` e avvia `checkForUpdates()` in background. `downloadUpdate()` e `quitAndInstall()` delegano ad `autoUpdater`. Gli eventi di avanzamento vengono inviati al renderer via `webContents.send`. |

### Packaging

| File | Responsabilità |
|------|----------------|
| `electron-builder.config.cjs` | Configurazione electron-builder (CommonJS). Definisce target DMG (macOS ARM + x64), NSIS (Windows x64), AppImage (Linux x64), icone per piattaforma. Sezione `publish` con `provider: github` + `owner/repo` per electron-updater. |
| `.github/workflows/build.yml` | CI/CD: 4 job di build paralleli (`--publish always` — electron-builder pubblica gli asset direttamente sulla GitHub Release) + job `release-notes` che appende le istruzioni di installazione macOS via `gh release edit`. |

---

## Componenti UI in `src/renderer/`

| File | Responsabilità |
|------|----------------|
| `index.html` | Shell HTML. Step 1 (drop PDF atto + anteprima immagine con navigazione pagine ‹/›), Step 2 (drop allegati, lista riordinabile, input startIndex, select rinomina), toggle dark mode, modale anteprima, area stato con pulsante "Esci". |
| `renderer.js` | Logica UI: navigazione step 1/2, dark mode (`initTheme` + localStorage), anteprima PDF multi-pagina (`renderPdfPagePreview` + stato `currentPage`/`totalPdfPages`), `getStartIndex`, `hasLeadingNumber`, `buildRenamedName`, `stripLeadingNumber`, badge ⚠️, drag & drop riordino, multi-selezione, modale preview, chiamate `window.electronAPI`. |
| `style.css` | Stili vanilla: variabili CSS con tema light/dark (`[data-theme="dark"]` + `prefers-color-scheme`), layout grid allegati, step views, drag highlighting, lista scrollabile. |

---

## Schema flusso dati

```
UTENTE
  │
  ├─ Avvio app
  │     → initTheme(): legge localStorage → applica data-theme="dark"|"light"
  │
  ├─ Step 1: Drag & drop PDF atto principale
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → setMainPdf(): aggiorna UI, abilita "Avanti →", resetta currentPage=0
  │     → renderPdfPagePreview(0)
  │           → window.electronAPI.renderPdfPage(path, pageIndex)
  │           → IPC: render-pdf-page
  │           → main.js: mupdf → loadPage(pageIndex) → toPixmap(1.5x) → asJPEG(85)
  │           → restituisce { base64, totalPages }
  │           → img#pdf-preview-img.src = "data:image/jpeg;base64,..."
  │           → aggiorna indicatore "N / M", abilita/disabilita ‹ ›
  │
  ├─ Step 2: Drag & drop allegati (ripetuto)
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → aggiunge a lista con label = getStartIndex() + idx
  │     → renderAttachmentsList(): grid [drag][number][name][controls]
  │         + badge ⚠️ se hasLeadingNumber(att.name) === false
  │     → input #input-start-index: modifica numero partenza → ri-renderizza
  │     → select #rename-scheme: schema rinomina (none|numbered|doc_|allegato_)
  │     → riordino via drag & drop HTML5 nativo → aggiorna posizioni
  │
  ├─ Click "Genera link"
  │     → openPreviewModal(): mostra riepilogo atto + allegati ordinati
  │     → utente conferma "OK — Genera"
  │
  └─ Conferma nella modale
        │
        ├─ window.electronAPI.selectOutputFolder()
        │     → IPC: dialog:selectOutputFolder
        │     → main.js: dialog.showOpenDialog()
        │     → restituisce percorso cartella
        │
        └─ window.electronAPI.processPDF({ mainPdfPath, attachments, outputFolder })
              │  attachments[i].label    = String(getStartIndex() + i)
              │  attachments[i].renamedAs = buildRenamedName(...) se schema ≠ none
              │
              → IPC: pdf:process
              │
              → main.js → pdf-processor.js
                    │
                    ├─ Verifica natività (mupdf)
                    │     → conta totalChars su tutte le pagine
                    │     → totalChars < 100 → throw errore bloccante
                    │     → totalChars/pagine < 50 → nativityWarning = 'PDF_LOW_TEXT_DENSITY'
                    │
                    ├─ findUnsupportedBisPatterns(doc)
                    │     → scansiona PDF per pattern {prefisso}{N}bis/ter/quater
                    │     → restituisce string[] (segnalati in UI)
                    │
                    ├─ fs.copyFile: copia allegati in outputFolder
                    │     → usa att.renamedAs come nome dest se presente
                    │
                    ├─ Per ogni allegato (label = "1", "2", "3"…):
                    │     buildSearchRegex(label)
                    │       → Caso A (label solo numero):
                    │           regex con prefisso OBBLIGATORIO:
                    │           (?:doc\.?|documento|all\.?|allegato)\s+(?:n\.?\s*)?N(?![a-zA-Z0-9])
                    │           → fa match su "doc. 1", "allegato n. 1", "Documento n. 1"…
                    │           → NON fa match su "1" isolato, importi, P.IVA, "att. 1", "ex 1"
                    │       → Caso B (label con prefisso es. "doc. 1"):
                    │           espansione sinonimi via LABEL_SYNONYM_GROUPS
                    │     findTextCoordinates(mainPdfPath, label)
                    │       → mupdf: apre PDF, stext.walk() per-carattere
                    │       → extractCharRuns(): raggruppa char in righe fisiche
                    │       → Passaggio 1 — match per-run (stessa riga):
                    │           matchBoundsFromChars(): bbox esatto del match
                    │       → Passaggio 2 — match cross-run (etichetta a cavallo di riga):
                    │           coppie (runA, runB) consecutive → testo concatenato
                    │           matchBoundsInRange(): bbox frammento in runA + bbox frammento in runB
                    │           → due annotazioni separate per la stessa etichetta
                    │       → restituisce [{ pageIndex, x, y, width, height }]
                    │
                    ├─ addUnderlineLink(mainPdfPath, outputPath, annotations)
                    │       → pdf-lib: carica PDF
                    │       → per ogni annotazione:
                    │           conversione Y: yPdfLib = pageHeight - y - height
                    │           drawLine (sottolineatura blu)
                    │           aggiungi dict /Link con /Launch relativa (targetFile = destName)
                    │       → salva PDF modificato in outputFolder
                    │
                    └─ restituisce { success, processedAnnotations, notFound, unsupportedPatterns, warning }
                          │
                    → IPC response → renderer.js
                    → UI: "Completato ✓" o avviso parziale
                    → Se warning PDF_LOW_TEXT_DENSITY: avviso OCR non bloccante
                    → Se unsupportedPatterns: avviso giallo con lista pattern non linkati
                    → Pulsante "Esci dall'app" visibile → IPC: app:quit → app.quit()
```

---

## Logica `buildSearchRegex` (CRITICO)

```javascript
// Sinonimi riconosciuti (case-insensitive, punto opzionale sulle abbreviazioni)
export const LABEL_SYNONYM_GROUPS = [
  ['doc', 'documento', 'all', 'allegato'],
];

export function buildSearchRegex(label) {
  // CASO A: label è solo un numero (es. "1", "11", "100")
  // Prefisso OBBLIGATORIO — evita match su numeri isolati nel testo
  if (/^\d+$/.test(label.trim())) {
    const SYNONYMS_PREFIX_REQUIRED =
      '(?:doc\\.?|documento|all\\.?|allegato)\\s+(?:n\\.?\\s*)?';
    return new RegExp(SYNONYMS_PREFIX_REQUIRED + numEscaped + '(?![a-zA-Z0-9])', 'i');
  }

  // CASO B: label con prefisso (es. "doc. 1", "allegato A")
  // Espande il primo token con sinonimi dal gruppo
  // Unisce token con [\s.]* per flessibilità
  // Aggiunge lookahead negativo (?![a-zA-Z0-9]) finale
}
```

**Prefissi riconosciuti:**

| Token nel testo | Pattern regex | Note |
|---|---|---|
| `doc` / `doc.` | `doc\.?` | Punto opzionale |
| `documento` | `documento` | Parola intera |
| `all` / `all.` | `all\.?` | Punto opzionale |
| `allegato` | `allegato` | Parola intera |

Tra prefisso e numero è accettato `n.` opzionale: `(?:n\.?\s*)?`
Il separatore tra token è `[\s.]*` (spazi, punti, niente).

**Esempi Caso A (`"1"`):**
- ✅ `"doc. 1"`, `"Doc.1"`, `"DOC. 1"`, `"allegato 1"`, `"Allegato n. 1"`, `"Documento n. 1"`, `"all. 1"`, `"allegato 1 bis"` (spazio prima di "bis")
- ❌ `"1"` standalone, `"doc. 11"`, `"1a"`, `"doc. 1bis"` (senza spazio), importi, P.IVA, `"att. 1"`, `"ex 1"`

---

## Analisi tecnica: mupdf per estrazione testo

mupdf fornisce coordinate **per-carattere** tramite `stext.walk()` con il callback `onChar`.
È stato scelto in sostituzione di pdfjs-dist perché le coordinate sono già nel sistema PDF nativo e non richiedono trasformazioni CTM aggiuntive.

### Struttura quad per-carattere

```javascript
// onChar(c, origin, font, size, quad)
// quad: array di 8 numeri — 4 angoli del carattere in pt
// [ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y]
//   0      1     2     3     4     5     6     7

const yTop    = quad[1]; // ul.y — bordo superiore
const yBottom = quad[5]; // ll.y — bordo inferiore  (NON quad[6] che è lr.x!)
const xLeft   = quad[0]; // ul.x
const xRight  = quad[2]; // ur.x
```

### Separazione righe fisiche

mupdf tratta paragrafi multi-riga come una singola `LINE`. Il codice spezza il run quando
il delta-Y tra caratteri consecutivi supera `max(2pt, charH * 0.5)`.

### charMap — gestione ligature tipografiche

mupdf espande le ligature tipografiche (fi, fl, ff, ffi, ffl) emettendo **due callback `onChar`**:
- primo char: bbox pieno (larghezza > 0)
- secondo char: bbox larghezza zero (quad degenere — non ha coordinate proprie)

`extractCharRuns` introduce `charMap[]`: ogni indice in `run.text` punta all'indice
corrispondente in `run.chars`. I char con bbox zero vengono aggiunti al testo ma il loro
`charMap[i]` punta al glyph precedente (quello con il bbox pieno).

```javascript
// Char con bbox zero = componente secondaria di ligatura
if (charWidth < 0.5) {
  cur.text += c;
  cur.charMap.push(cur.chars.length - 1); // punta all'ultimo char valido
  return;
}
// Char normale
cur.text += c;
cur.charMap.push(cur.chars.length);       // indice del char che stiamo per aggiungere
cur.chars.push({ c, quad });
```

`matchBoundsFromChars` usa `Set(charMap.slice(start, end))` per deduplicare gli indici
e ricavare solo i glyph unici con coordinate reali nel range del match.

### matchBoundsInRange — match cross-riga

Quando un'etichetta è spezzata da un a-capo reale (es. `doc.` a fine riga, `n. 2` a
inizio riga successiva), `findTextCoordinates` tenta il match su coppie di run
consecutivi. Se il match attraversa il confine, `matchBoundsInRange` calcola il bbox
per il sotto-range di ciascun run che partecipa al match.

```javascript
// Passaggio 2 in findTextCoordinates
const joined   = textA + ' ' + textB;
const boundary = textA.length + 1;
const match    = regex.exec(joined);
// match attraversa il confine → due annotazioni
const boundsA = matchBoundsInRange(runA.chars, runA.charMap, matchStart, textA.length);
const boundsB = matchBoundsInRange(runB.chars, runB.charMap, 0, matchEnd - boundary);
```

Risultato: due sottolineature blu sulla stessa etichetta (una per riga), entrambe
puntanti allo stesso allegato.

### normalizeRunText — spazi Unicode da PDF Word

Word inserisce `U+00A0` (NBSP) tra abbreviazioni e numeri in alcuni stili. La funzione
`normalizeRunText` converte NBSP e varianti di spazio Unicode in spazio ordinario
**prima** del match regex. La sostituzione è sempre 1:1 (non altera la lunghezza del
testo) per preservare il mapping `charMap`.

---

## Conversione coordinate mupdf → pdf-lib (CRITICO)

mupdf e pdf-lib usano sistemi di coordinate opposti sull'asse Y:

```
mupdf:                         pdf-lib (standard PDF):

  (0,0) ──────────►  x          y ▲
  │                              │
  │  Y verso il basso            │  Y verso l'alto
  ▼                              │
  y                              (0,0) ──────────► x
```

### Formula di conversione (verificata)

```javascript
// ann.y = yTop in mupdf (bordo superiore del testo, Y↓)
// ann.height = altezza del carattere/match
// pageHeight = page.getSize().height in pdf-lib

const yPdfLib = pageHeight - ann.y - ann.height;
// yPdfLib = bordo inferiore del rettangolo in sistema pdf-lib (Y↑)
```

Le `AnnotationCoord` contengono SEMPRE coordinate mupdf raw. La conversione avviene
SOLO in `addUnderlineLink`, mai altrove.

---

## Annotazione Link con Launch action in pdf-lib

pdf-lib non ha un'API nativa per Launch actions. Si usa `pdfDoc.context.obj()` a basso livello.
Il FileSpec usa `PDFString` (non stringhe JS nude) per garantire compatibilità con Acrobat.

```javascript
import { PDFDocument, rgb, PDFName, PDFString } from 'pdf-lib';

const page = pdfDoc.getPage(ann.pageIndex);
const { height: pageHeight } = page.getSize();
const yPdfLib = pageHeight - ann.y - ann.height;

// 1. Sottolineatura blu
page.drawLine({
  start: { x: ann.x,             y: yPdfLib },
  end:   { x: ann.x + ann.width, y: yPdfLib },
  thickness: 1.5,
  color: rgb(0, 0.27, 0.8),
});

// 2. Annotazione Link con Launch action e FileSpec (ISO 32000 §7.11.3)
const linkDict = pdfDoc.context.obj({
  Type: 'Annot',
  Subtype: 'Link',
  Rect: [ann.x, yPdfLib, ann.x + ann.width, yPdfLib + ann.height],
  Border: [0, 0, 0],
  A: {
    Type: 'Action',
    S: 'Launch',
    F: pdfDoc.context.obj({
      Type: 'Filespec',
      F:  PDFString.of(ann.targetFile),  // ASCII — DEVE essere PDFString, non stringa JS
      UF: PDFString.of(ann.targetFile),  // Unicode
    }),
    NewWindow: true,
  },
});
```

**Nota:** `targetFile` è solo il nome file (non il percorso assoluto) — la Launch action
è relativa. Atto e allegati devono stare nella stessa cartella di output.

**Nota sicurezza:** le Launch action verso file locali mostrano un dialogo di avviso in
Acrobat (comportamento di sicurezza dal 2021, non bug dell'app).
