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

| Canale | Direzione | Payload input | Payload output |
|--------|-----------|---------------|----------------|
| `pdf:process` | Renderer → Main | `{ mainPdfPath: string, attachments: Attachment[], outputFolder: string }` | `ProcessResult` |
| `dialog:selectOutputFolder` | Renderer → Main | nessuno | `string \| null` |
| `read-pdf-as-base64` | Renderer → Main | `filePath: string` | `{ base64: string }` |

Tutti i canali usano `ipcRenderer.invoke` / `ipcMain.handle` (pattern request/response).

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
| `main.js` | Entry point Electron. Crea `BrowserWindow`, registra handler IPC (`pdf:process`, `dialog:selectOutputFolder`, `read-pdf-as-base64`), gestisce lifecycle app. **Nessuna logica PDF.** |
| `preload.cjs` | Bridge sicuro (CJS — Electron non supporta ESM nel preload). Espone `window.electronAPI` via `contextBridge`: `processPDF`, `selectOutputFolder`, `getPathForFile`, `readPdfAsBase64`. |
| `pdf-processor.js` | Tutta la logica PDF: `checkPdfNativity` (verifica testo estraibile), `findTextCoordinates` (mupdf), `addUnderlineLink` (pdf-lib), `buildRenamedName` / `hasLeadingNumber` (rinomina allegati), `processPCTDocument` (orchestrazione). **Nessun codice Electron.** |

---

## Componenti UI in `src/renderer/`

| File | Responsabilità |
|------|----------------|
| `index.html` | Shell HTML. Step 1 (drop PDF atto + anteprima embed), Step 2 (drop allegati, lista riordinabile, input startIndex, select rinomina), toggle dark mode, modale anteprima, area stato. |
| `renderer.js` | Logica UI: navigazione step 1/2, dark mode (`initTheme` + localStorage), anteprima PDF (`readPdfAsBase64`), `getStartIndex`, `hasLeadingNumber`, `buildRenamedName`, badge ⚠️, drag & drop riordino, multi-selezione, modale preview, chiamate `window.electronAPI`. |
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
  │     → setMainPdf(): aggiorna UI, abilita "Avanti →"
  │     → window.electronAPI.readPdfAsBase64(path)
  │           → IPC: read-pdf-as-base64
  │           → main.js: fs.readFile → buffer.slice(0, 500KB) → base64
  │           → embed#pdf-preview-embed.src = "data:application/pdf;base64,..."
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
                    │           (?:doc\.?|documento|all\.?|allegato|att\.?|…)\s+(?:n\.?\s*)?N(?![a-zA-Z0-9])
                    │           → fa match su "doc. 1", "allegato n. 1", "Documento n. 1"…
                    │           → NON fa match su "1" isolato, importi, P.IVA
                    │       → Caso B (label con prefisso es. "doc. 1"):
                    │           espansione sinonimi via LABEL_SYNONYM_GROUPS
                    │     findTextCoordinates(mainPdfPath, label)
                    │       → mupdf: apre PDF, stext.walk() per-carattere
                    │       → extractCharRuns(): raggruppa char in righe fisiche
                    │       → matchBoundsFromChars(): bbox esatto del match
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
```

---

## Logica `buildSearchRegex` (CRITICO)

```javascript
export const LABEL_SYNONYM_GROUPS = [
  ['doc', 'documento', 'all', 'allegato', 'att', 'attaccato', 'ex'],
];

export function buildSearchRegex(label) {
  // CASO A: label è solo un numero (es. "1", "11", "100")
  // Prefisso OBBLIGATORIO — evita match su numeri isolati nel testo
  if (/^\d+$/.test(label.trim())) {
    const SYNONYMS_PREFIX_REQUIRED =
      '(?:doc\\.?|documento|all\\.?|allegato|att\\.?|attaccato|ex)\\s+(?:n\\.?\\s*)?';
    return new RegExp(SYNONYMS_PREFIX_REQUIRED + numEscaped + '(?![a-zA-Z0-9])', 'i');
  }

  // CASO B: label con prefisso (es. "doc. 1", "allegato A")
  // Espande il primo token con sinonimi dal gruppo
  // Unisce token con [\s.]* per flessibilità
  // Aggiunge lookahead negativo (?![a-zA-Z0-9]) finale
}
```

**Esempi Caso A (`"1"`):**
- ✅ `"doc. 1"`, `"Doc.1"`, `"allegato 1"`, `"Allegato n. 1"`, `"Documento n. 1"`, `"allegato 1 bis"`
- ❌ `"1"` standalone, `"doc. 11"`, `"1a"`, `"doc. 1bis"`, importi, P.IVA

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
