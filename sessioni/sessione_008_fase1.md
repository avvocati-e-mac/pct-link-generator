# Sessione 008 — Feature UX avanzate (numerazione, dark mode, anteprima PDF, verifica natività)

**Data:** 2026-03-22
**Versione:** 0.1.1

## Obiettivo

Implementare le seguenti feature UX:
- Commit 2.1: spostare `.att-label` a sinistra come colonna separata (layout grid)
- Commit 2.2: aggiungere input per il numero di partenza (`startIndex`)
- Commit 3.1: rilevamento + rinomina numerica allegati
- Commit 3.2: dark mode con toggle manuale + `prefers-color-scheme`
- Commit 3.3: anteprima PDF atto principale (via IPC + base64)
- Commit 3.4: verifica natività PDF (nativo testuale vs scansione) con mupdf

## Stato iniziale

- `npm test`: 65/65 verde
- Versione: 0.1.1

---

## Analisi Fase 1

### 1.1 — Struttura lista allegati (Step 2)

**Template HTML in `renderAttachmentsList()`** (renderer.js righe ~360-367):
```html
<span class="drag-handle">⠿</span>
<span class="att-name" title="...">nome file</span>
<span class="att-label">N</span>
<div class="attachment-controls">
  <button class="btn-remove btn-del">✕</button>
</div>
```

**Ordine attuale:** drag-handle → att-name → att-label → attachment-controls

`.att-label` è **terzo** (dopo il nome file), non in colonna separata a sinistra.

**Layout CSS di `.attachment-item`:**
- `display: flex; align-items: center; gap: 8px;` (non grid)
- `.att-name`: `flex: 1` (prende tutto lo spazio)
- `.att-label`: `flex-shrink: 0; min-width: 32px; text-align: center; color: #4a5568; font-weight: 600; font-size: 13px;`
- `.drag-handle`: stile separato (cursore grab)

Nessun grid layout — tutto flex. `.att-label` non ha una colonna separata visivamente rilevante.

### 1.2 — Numero di partenza

**Non esiste** alcun input `input-start-index` né variabile configurabile.

**Calcolo hardcoded:**
- `renderAttachmentsList()`: `${idx + 1}`
- `runGeneration()`: `label: String(idx + 1)`

La label è sempre posizione 1-based, non personalizzabile.

### 1.3 — Rilevamento numero nel nome file

**Non esiste** `buildRenamedName` né `hasLeadingNumber` in `pdf-processor.js`.

Gli allegati vengono copiati con il nome originale senza nessun controllo:
```javascript
const destPath = path.join(outputFolder, att.name);
await fs.promises.copyFile(att.path, destPath);
```

Nessun test di rinomina in `pdf-processor.test.js`. Le funzioni vanno create ex-novo.

### 1.4 — Dark mode

**Non esiste** nessuna media query `prefers-color-scheme: dark` in `style.css`.

**Non esiste** un toggle dark mode in `index.html`.

**Non esistono** variabili CSS in `:root {}`. I colori sono hardcodati (es. `#1a1a2e`, `#f5f7fa`, `#4a6cf7`).

→ Refactoring completo necessario: creare variabili CSS, aggiungere tema dark, aggiungere toggle.

### 1.5 — Anteprima PDF atto principale

**Non esiste** `readPdfAsBase64` in `preload.js` (solo 3 metodi: `processPDF`, `selectOutputFolder`, `getPathForFile`).

**Non esiste** handler `read-pdf-as-base64` in `main.js` (solo 2 handler IPC).

**Non esiste** `#pdf-preview-container` in `index.html`.

La modale `#modal-preview` esistente è testuale (tabella allegati), non un'anteprima grafica del PDF.

→ Necessario aggiungere: IPC handler in main.js, metodo in preload.js, elemento HTML, logica in renderer.js.

**Nota CSP:** la CSP attuale è `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`.
I `data:` URI per i media sono consentiti in Electron anche con `default-src 'self'` (Electron gestisce i data URI in modo permissivo per i contenuti embeddati). Va verificato a runtime; se necessario si aggiunge `media-src 'self' data:`.

### 1.6 — Verifica natività PDF

**Non esiste** `checkPdfNativity` in `pdf-processor.js`.

**mupdf è già usato** in due punti:
1. `findTextCoordinates()` — estrae testo con coordinate via `stext.walk`
2. `processPCTDocument()` — usa `findUnsupportedBisPatterns()` per rilevare pattern bis/ter/quater

L'approccio consigliato è usare la stessa API mupdf già presente:
- Aprire il documento con `mupdf.Document.openDocument()`
- Per ogni pagina: `page.toStructuredText('preserve-whitespace').asText()`
- Sommare i caratteri totali
- Soglia non-nativo: `totalChars < 100`
- Soglia OCR sospetto: `totalChars / numPages < 50`

### 1.7 — IPC e preload esistenti

**`contextBridge.exposeInMainWorld`** (preload.js):
| Metodo | Tipo | Descrizione |
|--------|------|-------------|
| `processPDF(data)` | `invoke` | Elaborazione PCT |
| `selectOutputFolder()` | `invoke` | Dialog selezione cartella |
| `getPathForFile(file)` | `webUtils` (no IPC) | Path assoluto da File object |

**`ipcMain.handle()`** (main.js):
| Canale | Costante | Descrizione |
|--------|----------|-------------|
| `dialog:selectOutputFolder` | `IPC_CHANNELS.DIALOG_SELECT_FOLDER` | Apre dialog cartella |
| `pdf:process` | `IPC_CHANNELS.PDF_PROCESS` | Elabora PDF principale |

**Canali in `types.js`:**
```javascript
IPC_CHANNELS = {
  PDF_PROCESS:          'pdf:process',
  DIALOG_SELECT_FOLDER: 'dialog:selectOutputFolder',
}
```

Nessun canale IPC non implementato. Tutti i canali definiti sono implementati.
Il nuovo canale `read-pdf-as-base64` va aggiunto sia in `types.js` che in `main.js` e `preload.js`.

---

## Decisioni prese

- Il vecchio file `sessione_007_fase1.md` riguardava fix diversi (regressione regex + UX drag); questa sessione 008 implementa le feature UX avanzate richieste nel prompt operativo.
- Per il Commit 3.1 (rinomina), `hasLeadingNumber` viene aggiunto come funzione esportata anche in `pdf-processor.js` per consentire il testing Vitest (la funzione in renderer.js non è testabile direttamente).
- Per il Commit 3.4 (natività), si usa mupdf già presente come dipendenza — nessuna nuova libreria.
- La CSP va verificata empiricamente per il `data:` URI nell'embed PDF (Commit 3.3).

## File da modificare (piano)

### Commit 2.1
- `src/renderer/renderer.js` — `renderAttachmentsList()`: ordine → drag-handle, att-number, att-name, controls
- `src/renderer/style.css` — grid layout per `.attachment-item`, stile `.att-number`

### Commit 2.2
- `src/renderer/index.html` — aggiunta `<div class="start-index-row">` in `#view-step2`
- `src/renderer/renderer.js` — `getStartIndex()`, aggiornamento `renderAttachmentsList`, `openPreviewModal`, `runGeneration`, listener
- `src/renderer/style.css` — `.start-index-row`, `.start-index-input`

### Commit 3.1
- `src/renderer/index.html` — aggiunta `<select id="rename-scheme">` in `#view-step2`
- `src/renderer/renderer.js` — `hasLeadingNumber()` (renderer), badge `⚠️`, logica `runGeneration`
- `src/main/pdf-processor.js` — `buildRenamedName()`, `hasLeadingNumber()` (esportata per test)
- `src/main/main.js` — uso di `att.renamedAs` nella copia file
- `src/shared/types.js` — campo `renamedAs` in `@typedef Attachment`
- `tests/pdf-processor.test.js` — nuovi test per `buildRenamedName` e `hasLeadingNumber`

### Commit 3.2
- `src/renderer/style.css` — variabili CSS in `:root`, tema `[data-theme="dark"]`, media query
- `src/renderer/index.html` — pulsante toggle nell'header
- `src/renderer/renderer.js` — `initTheme()`, event listener toggle

### Commit 3.3
- `src/main/main.js` — IPC handler `read-pdf-as-base64`
- `src/main/preload.js` — `readPdfAsBase64(path)`
- `src/shared/types.js` — canale IPC `READ_PDF_BASE64`
- `src/renderer/index.html` — `#pdf-preview-container` con `<embed>`
- `src/renderer/renderer.js` — chiamata IPC in `setMainPdf()`, pulizia in `clearMainPdf()`
- `src/renderer/style.css` — `.pdf-preview-container`, `.pdf-preview-embed`

### Commit 3.4
- `src/main/pdf-processor.js` — `checkPdfNativity()` esportata, integrazione in `processPCTDocument()`
- `src/main/main.js` — campo `warning` nella risposta IPC
- `src/renderer/renderer.js` — `setStatus('warning', ...)` per `PDF_LOW_TEXT_DENSITY`

## Problemi noti / TODO prossima sessione

- Da completare tutte le fasi (2.1, 2.2, 3.1, 3.2, 3.3, 3.4)
- Verificare empiricamente CSP per data: URI nell'embed PDF
- pdfjs-dist ancora in package.json (non più usato — da rimuovere in sessione futura)
