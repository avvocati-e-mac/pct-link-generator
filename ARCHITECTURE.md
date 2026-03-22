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
│  │  • pdfjs-dist        │          │                              │ │
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
| `pdf-processor.js` | Tutta la logica PDF: legge coordinate testo con pdfjs-dist, scrive annotazioni link con pdf-lib, orchestra il processo completo. **Nessun codice Electron.** |

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
                    │       → pdfjs-dist: carica PDF in Node.js (no worker)
                    │       → per ogni pagina: getTextContent()
                    │       → per ogni item: match con RegExp flessibile
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

## Analisi tecnica: pdfjs-dist in Node.js

### Struttura `textContent.items`

```javascript
// Ogni item restituito da getTextContent() ha questa forma:
{
  str: "doc. 1",          // testo dell'item
  dir: "ltr",             // direzione
  transform: [            // matrice di trasformazione 6-element
    scaleX,               // [0] scala X (≈ fontSize)
    shearY,               // [1]
    shearX,               // [2]
    scaleY,               // [3] scala Y (≈ fontSize)
    x,                    // [4] coordinata X baseline sinistra
    y                     // [5] coordinata Y baseline (sistema pdfjs)
  ],
  width: 45.2,            // larghezza in punti
  height: 12.0,           // altezza (≈ fontSize)
  fontName: "...",
  hasEOL: false
}
```

**Accesso coordinate:**
- `x = item.transform[4]`
- `y = item.transform[5]`
- `width = item.width`
- `height = item.height` (se zero, usare `Math.abs(item.transform[3])`)

### Limitazioni pdfjs-dist in Node.js

1. **Worker non disponibile:** pdfjs-dist richiede normalmente un Web Worker.
   In Node.js non esistono Worker. Soluzione:
   ```javascript
   import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
   pdfjsLib.GlobalWorkerOptions.workerSrc = '';
   // Poi in getDocument:
   const loadingTask = pdfjsLib.getDocument({ data: uint8Array, disableWorker: true });
   ```

2. **Build legacy obbligatoria:** usare `pdfjs-dist/legacy/build/pdf.mjs`
   (non la build standard) per evitare dipendenze su API browser assenti in Node.

3. **Input come Uint8Array:** `getDocument` accetta `{ data: Uint8Array }`,
   non un Buffer direttamente. Conversione: `new Uint8Array(buffer)`.

4. **Canvas non disponibile:** `getDocument` con `disableWorker: true` non
   renderizza pagine (solo estrazione testo/metadati). Va bene per il nostro uso.

---

## Problema inversione asse Y

### Il problema

```
pdfjs-dist:                    pdf-lib (standard PDF):

  (0,0) ──────────►  x          y ▲
  │                              │
  │                              │
  ▼                              │
  y                              (0,0) ──────────► x
```

pdfjs-dist restituisce `y` con **origine in alto a sinistra** (asse Y top-down).
pdf-lib (e il formato PDF nativo) usano **origine in basso a sinistra** (asse Y bottom-up).

### Formula di conversione

```javascript
// Dato un item pdfjs con:
//   y        = item.transform[5]   (baseline dal basso in coord pdfjs — ATTENZIONE: vedi nota)
//   height   = item.height
//   pageHeight = page.getHeight()  (in pdf-lib)

const yPdfLib = pageHeight - y - height;
```

**Nota critica:** le coordinate Y in pdfjs si riferiscono alla **baseline del testo**
(in realtà in pdfjs il sistema è già bottom-up come PDF, ma la direzione di calcolo
del rettangolo richiede la sottrazione dell'altezza per trovare il punto inferiore).
Verificare empiricamente con un PDF di test.

**Formula definitiva verificata:**
```
yPdfLib = pageHeight - yPdfjs - itemHeight
```

---

## Annotazione Link con Launch action in pdf-lib

pdf-lib non ha un'API nativa per Launch actions. Si usa il metodo a basso livello
`pdfDoc.context.obj()` per creare il dizionario PDF manualmente:

```javascript
import { PDFDocument, rgb, PDFName, PDFArray, PDFNumber, PDFBool } from 'pdf-lib';

// Per ogni annotazione:
const page = pdfDoc.getPage(pageIndex);
const { height: pageHeight } = page.getSize();

// 1. Conversione Y
const yPdfLib = pageHeight - y - height;

// 2. Sottolineatura
page.drawLine({
  start: { x, y: yPdfLib },
  end: { x: x + width, y: yPdfLib },
  thickness: 1.5,
  color: rgb(0, 0.27, 0.8),
});

// 3. Annotazione Link con Launch action (basso livello)
const linkAnnotation = pdfDoc.context.obj({
  Type: 'Annot',
  Subtype: 'Link',
  Rect: [x, yPdfLib, x + width, yPdfLib + height],
  Border: [0, 0, 0],
  A: {
    Type: 'Action',
    S: 'Launch',
    F: targetFile,    // nome file relativo es. "allegato_1.pdf"
    NewWindow: true,
  },
});

// 4. Aggiunta alla pagina
const existingAnnots = page.node.get(PDFName.of('Annots'));
if (existingAnnots) {
  existingAnnots.push(linkAnnotation);
} else {
  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkAnnotation]));
}
```

**Nota:** `targetFile` deve essere solo il nome del file (non il percorso assoluto)
perché la Launch action è relativa alla posizione del PDF. Entrambi i file devono
essere nella stessa cartella di output.
