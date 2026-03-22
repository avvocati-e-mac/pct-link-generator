# DEVLOG — PCT Link Generator

Registro delle decisioni e dei problemi per ogni commit/fase.

---

## Fase 1 — Analisi e pianificazione (2026-03-22)

### Cosa ho fatto
- Creato `ARCHITECTURE.md` con:
  - Diagramma ASCII dell'architettura Main/Renderer/Preload
  - Lista canali IPC (`pdf:process`, `dialog:selectOutputFolder`)
  - Lista moduli Main e componenti Renderer
  - Schema flusso dati completo
  - Analisi struttura `textContent.items` di pdfjs-dist
  - Problema inversione asse Y con formula di conversione
  - Pattern basso livello per annotazione Link/Launch in pdf-lib
  - Limitazioni pdfjs-dist in Node.js (no worker, build legacy)
- Creato questo `DEVLOG.md`

### Decisioni prese

1. **Build legacy di pdfjs-dist:** uso `pdfjs-dist/legacy/build/pdf.mjs`
   con `disableWorker: true` — è l'unico modo per usare pdfjs in Node.js
   senza un Web Worker. Documentato in ARCHITECTURE.md.

2. **Nessun framework UI:** come da spec, vanilla HTML/CSS/JS nel renderer.
   Layout a due colonne con flexbox.

3. **`webUtils.getPathForFile`:** per ottenere il percorso assoluto dei file
   droppati nel renderer (API Electron disponibile nel renderer con contextIsolation).

4. **Launch action relativa:** `targetFile` nella Launch action conterrà solo
   il nome del file (non percorso assoluto) perché atto e allegati saranno
   nella stessa cartella di output.

5. **Risultato parziale su notFound:** se un'etichetta non viene trovata,
   il processo non lancia eccezione ma restituisce un report parziale.
   Scelta conservativa per non bloccare l'utente su casi edge.

6. **`"type": "module"` in package.json:** come da spec. Tutti i file .js
   useranno `import`/`export` ESM nativi. Electron supporta ESM nel main
   process dalla versione 28+.

### Problemi aperti / Note per Fase 2

- Verificare la versione Electron da installare: deve supportare ESM nativo
  nel main process (≥ 28.x). Usare `electron@latest`.
- Le coordinate Y di pdfjs in realtà usano il sistema bottom-up come il PDF
  nativo — la formula `yPdfLib = pageHeight - y - height` va verificata
  empiricamente con il test del Commit 8.
- `webUtils` in Electron è disponibile nel renderer process direttamente
  (non richiede IPC) ma va importato come `const { webUtils } = require('electron')`
  con contextIsolation — verificare se serve esposizione via preload o è
  già disponibile globalmente nel renderer Electron.

---

## Commit 1 — chore: init project structure

- Struttura cartelle `src/main/`, `src/renderer/`, `tests/`
- `package.json` con `"type": "module"`, `"main": "src/main/main.js"`, electron 33, pdfjs-dist 4.x, pdf-lib, vitest
- `.gitignore`, `ARCHITECTURE.md`, `DEVLOG.md`

---

## Commit 2 — feat: electron main process with IPC skeleton

- `BrowserWindow` con `contextIsolation: true`, `nodeIntegration: false`
- Handler IPC `dialog:selectOutputFolder` → `dialog.showOpenDialog`
- Handler IPC `pdf:process` → delega a `pdf-processor.js`
- Gestione lifecycle macOS/Windows/Linux

---

## Commit 3 — feat: preload bridge with contextBridge

- `contextBridge.exposeInMainWorld('electronAPI', ...)`
- `processPDF`, `selectOutputFolder`, `getPathForFile` (via `webUtils`)
- `ipcRenderer` non esposto direttamente

---

## Commit 4 — feat: renderer UI with drag & drop and reorderable list

- Due zone drop (atto principale: solo PDF; allegati: PDF, EML, MSG, JPG)
- Lista allegati riordinabile con ▲ ▼ ✕ e campo etichetta editabile
- Percorso assoluto via `window.electronAPI.getPathForFile(file)`
- Pulsante "Genera Link" disabilitato se mancano input
- Messaggi di stato in elementi HTML (nessun `alert()`)
- Layout due colonne flexbox, stili vanilla CSS

---

## Commit 5 — feat: pdf-processor read text coordinates

- `findTextCoordinates` con pdfjs-dist legacy, workerSrc = file URL del worker locale
- Scoperto problema: pdfjs 4.x non ha `default` export → uso `import * as pdfjsLib`
- `disableWorker: true` non funziona in v4 → workerSrc punta al file `.worker.mjs`
- `buildSearchRegex` corretta: tokenizza per parole/numeri + `[\s.]*` + `\b`

---

## Commit 6 — feat: pdf-processor write link annotation

- `addUnderlineLink`: inversione asse Y `yPdfLib = pageHeight - y - height`
- Sottolineatura blu con `page.drawLine`
- Annotazione `/Link /Launch` relativa con `pdfDoc.context.obj` a basso livello
- `targetFile` = solo nome file (Launch relativa, entrambi i file in stessa cartella)

---

## Commit 7 — feat: pdf-processor orchestrator function

- `processPCTDocument`: copia allegati → cerca etichette → aggiunge annotazioni
- Risultato parziale se `notFound.length > 0`, nessuna eccezione
- Collegato all'handler IPC `pdf:process` in `main.js`

---

## Commit 8 — test: pdf-processor unit tests

**16 test tutti verdi.**

- Test 1: formula inversione asse Y (842 - 700 - 12 = 130)
- Test 2: regex matching flessibile (10 casi: "Doc.1", "doc 1", "DOC. 1"...)
- Test 3: `findTextCoordinates` con PDF sintetico generato con pdf-lib
- Test 4: `processPCTDocument` restituisce `notFound` e `success=true` (no throw)
- Test 5: `processPCTDocument` copia allegati nella outputFolder

**Problema risolto:** `buildSearchRegex` aveva un bug — l'escape dei caratteri speciali
avveniva prima della trasformazione dei separatori, producendo regex rotte come
`/doc\[\s.]*1/i`. Soluzione: tokenizzazione per parole/numeri con `.match()` e
join con `[\s.]*` + `\b`.

**Problema risolto:** pdfjs-dist 4.x non funziona con `disableWorker: true` né
con `workerSrc = ''` — richiede il path del worker come `file://` URL. Usato
`createRequire + pathToFileURL` per risolvere il path corretto.
