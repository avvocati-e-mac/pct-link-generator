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

Tutti i canali usano `ipcRenderer.invoke` / `ipcMain.handle` (pattern request/response).

---

## Tipi condivisi (`src/shared/types.js`)

```javascript
/**
 * @typedef {Object} Attachment
 * @property {string} path  - Percorso assoluto del file allegato
 * @property {string} name  - Nome file (es. "01_Comparsa.pdf")
 * @property {string} label - Numero di posizione come stringa (es. "1", "2")
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean}  success              - Sempre true (anche con notFound)
 * @property {number}   processedAnnotations - Annotazioni aggiunte
 * @property {string[]} notFound             - Posizioni non trovate nel PDF
 * @property {string[]} unsupportedPatterns  - Pattern bis/ter trovati ma non linkati
 */
```

---

## Moduli Node.js in `src/main/`

| File | Responsabilità |
|------|----------------|
| `main.js` | Entry point Electron. Crea `BrowserWindow`, registra handler IPC, gestisce lifecycle app. **Nessuna logica PDF.** |
| `preload.js` | Bridge sicuro. Espone `window.electronAPI` via `contextBridge`. Mai `ipcRenderer` diretto. |
| `pdf-processor.js` | Tutta la logica PDF: estrae coordinate testo con mupdf (per-carattere), scrive annotazioni link con pdf-lib, orchestra il processo. **Nessun codice Electron.** |

---

## Componenti UI in `src/renderer/`

| File | Responsabilità |
|------|----------------|
| `index.html` | Shell HTML. Step 1 (drop PDF atto), Step 2 (drop allegati, lista riordinabile), modale anteprima, area stato. |
| `renderer.js` | Logica UI: navigazione step 1/2, drag & drop allegati con riordino, multi-selezione, modale preview, chiamate `window.electronAPI`. |
| `style.css` | Stili vanilla: layout flexbox, step views, drag highlighting (`.drag-over`, `.dragging`), lista allegati scrollabile. |

---

## Schema flusso dati

```
UTENTE
  │
  ├─ Step 1: Drag & drop PDF atto principale
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → aggiorna UI, abilita pulsante "Avanti →"
  │
  ├─ Step 2: Drag & drop allegati (ripetuto)
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → aggiunge a lista con label = numero di posizione (1-based)
  │     → UI: lista scrollabile con drag handle ⠿, numero posizione, ✕
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
              │  attachments[i].label = String(i + 1)  ← numero posizione
              │
              → IPC: pdf:process
              │
              → main.js → pdf-processor.js
                    │
                    ├─ findUnsupportedBisPatterns(doc)
                    │     → scansiona PDF per pattern {prefisso}{N}bis/ter/quater
                    │     → restituisce string[] (segnalati in UI)
                    │
                    ├─ fs.copyFile: copia allegati in outputFolder
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
                    │           aggiungi dict /Link con /Launch relativa
                    │       → salva PDF modificato in outputFolder
                    │
                    └─ restituisce { success, processedAnnotations, notFound, unsupportedPatterns }
                          │
                    → IPC response → renderer.js
                    → UI: "Completato ✓" o avviso parziale
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
