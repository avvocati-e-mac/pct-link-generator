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

## Commit 1 — chore: init project structure (da completare)

> Da aggiornare dopo la creazione della struttura.

---

## Commit 2 — feat: electron main process with IPC skeleton (da completare)

> Da aggiornare dopo la creazione di main.js.

---

## Commit 3 — feat: preload bridge with contextBridge (da completare)

> Da aggiornare dopo la creazione di preload.js.

---

## Commit 4 — feat: renderer UI with drag & drop and reorderable list (da completare)

> Da aggiornare dopo la creazione del renderer.

---

## Commit 5 — feat: pdf-processor read text coordinates (da completare)

> Da aggiornare dopo la creazione di findTextCoordinates.

---

## Commit 6 — feat: pdf-processor write link annotation (da completare)

> Da aggiornare dopo la creazione di addUnderlineLink.

---

## Commit 7 — feat: pdf-processor orchestrator function (da completare)

> Da aggiornare dopo la creazione di processPCTDocument.

---

## Commit 8 — test: pdf-processor unit tests (da completare)

> Da aggiornare dopo la scrittura dei test Vitest.
