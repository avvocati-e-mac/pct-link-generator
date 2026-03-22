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
│  │  • ipcMain.handle    │          │  • Drag & drop zones         │ │
│  │  • dialog API        │          │  • Reorderable list          │ │
│  │  • fs, path          │          │  • window.electronAPI calls  │ │
│  │  • mupdf             │          │                              │ │
│  │  • pdf-lib           │          └──────────────────────────────┘ │
│  └──────────────────────┘                        ▲                  │
│            ▲                                     │                  │
│            │                         ┌───────────┴──────────────┐  │
│            └─────────────────────────┤      PRELOAD SCRIPT      │  │
│                  contextBridge        │      preload.js          │  │
│                                       │                          │  │
│                                       │  expone window.          │  │
│                                       │  electronAPI             │  │
│                                       │  (contextBridge)         │  │
│                                       └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Canali IPC

| Canale | Direzione | Payload input | Payload output |
|--------|-----------|---------------|----------------|
| `pdf:process` | Renderer → Main | `{ mainPdfPath: string, attachments: Array<{path: string, name: string, label: string}> }` | `{ success: boolean, processedAnnotations: number, notFound: string[] }` |
| `dialog:selectOutputFolder` | Renderer → Main | nessuno | `string \| null` (percorso cartella scelta) |

Tutti i canali usano `ipcRenderer.invoke` / `ipcMain.handle` (pattern request/response).

---

## Moduli Node.js in `src/main/`

| File | Responsabilità |
|------|----------------|
| `main.js` | Entry point Electron. Crea `BrowserWindow`, registra handler IPC, gestisce lifecycle app (`app.whenReady`, `window-all-closed`). **Nessuna logica PDF.** |
| `preload.js` | Bridge sicuro. Espone `window.electronAPI` via `contextBridge`. Mai `ipcRenderer` diretto. |
| `pdf-processor.js` | Tutta la logica PDF: legge coordinate testo con mupdf (per-carattere), scrive annotazioni link con pdf-lib, orchestra il processo completo. **Nessun codice Electron.** |

---

## Componenti UI in `src/renderer/`

| File | Responsabilità |
|------|----------------|
| `index.html` | Shell HTML. Due zone drag & drop, lista allegati, pulsante "Genera Link", area messaggi di stato. |
| `renderer.js` | Logica UI: gestione drag & drop, lista riordinabile allegati, chiamate a `window.electronAPI`, aggiornamento stato. |
| `style.css` | Stili vanilla: layout a due colonne flexbox, drag & drop highlighting, lista allegati, stati pulsante. |

---

## Schema flusso dati

```
UTENTE
  │
  ├─ Drag & drop PDF atto principale
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → aggiorna UI (mostra nome file)
  │
  ├─ Drag & drop allegati (ripetuto)
  │     → renderer.js cattura evento drop
  │     → webUtils.getPathForFile(file) → percorso assoluto
  │     → aggiunge a lista con label default "doc. N"
  │     → UI: lista riordinabile con ▲ ▼ ✕
  │
  └─ Click "Genera Link"
        │
        ├─ window.electronAPI.selectOutputFolder()
        │     → IPC: dialog:selectOutputFolder
        │     → main.js: dialog.showOpenDialog()
        │     → restituisce percorso cartella
        │
        └─ window.electronAPI.processPDF({ mainPdfPath, attachments })
              │
              → IPC: pdf:process
              │
              → main.js → pdf-processor.js
                    │
                    ├─ fs.copyFile: copia allegati in outputFolder
                    │
                    ├─ Per ogni allegato:
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
                    └─ restituisce { success, processedAnnotations, notFound }
                          │
                    → IPC response → renderer.js
                    → UI: mostra "Completato ✓" o errore parziale
```

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

### Apertura documento

```javascript
import mupdf from 'mupdf';

const buffer = await fs.promises.readFile(pdfPath);
const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
const numPages = doc.countPages();
const page = doc.loadPage(pageIndex); // 0-based
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

// 3. Aggiunta alla pagina
const annotsKey = PDFName.of('Annots');
const existingAnnots = page.node.get(annotsKey);
if (existingAnnots) {
  existingAnnots.push(linkDict);
} else {
  page.node.set(annotsKey, pdfDoc.context.obj([linkDict]));
}
```

**Nota:** `targetFile` è solo il nome file (non il percorso assoluto) — la Launch action
è relativa. Atto e allegati devono stare nella stessa cartella di output.

**Nota sicurezza:** le Launch action verso file locali mostrano un dialogo di avviso in
Acrobat (comportamento di sicurezza dal 2021, non bug dell'app).
