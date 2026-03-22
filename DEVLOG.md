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

## Sessione allineamento CLAUDE.md (2026-03-22)

### Cosa ho fatto
- Analizzato 20 discrepanze tra CLAUDE.md (descritto stack React/electron-vite)
  e progetto reale (Electron puro + Vanilla JS)
- Riscritto CLAUDE.md per descrivere il progetto come realmente implementato
- Creato `src/shared/types.js` con costanti IPC (`IPC_CHANNELS`) e @typedef JSDoc
- Aggiornato `main.js` e `preload.js` per importare e usare `IPC_CHANNELS`

### Decisioni prese
- File di sessione rimangono nella root accanto a DEVLOG.md (non in sottocartella)
- `sandbox: false` documentato in CLAUDE.md con motivazione (webUtils requirement)
- Zod non aggiunto: progetto offline, validazione non critica per ora
- Struttura preload rimasta in `src/main/preload.js` (non spostata in `src/preload/`)

### Problemi aperti
- Nessuno — 16 test verdi, struttura allineata

---

## Sessione 004 — Prima release beta v0.1.1 (2026-03-22)

### Cosa ho fatto
- Committato fix PDFString pendente dalla sessione 003
- Creato `README.md`
- Aggiornato `DEVLOG.md` e `ARCHITECTURE.md` (pdfjs → mupdf)
- Bump versione 0.1.0 → 0.1.1
- Merge `feat/pct-2024-formats` → `master` (--no-ff)
- Tag `v0.1.1-beta` pushato su GitHub
- Fix GitHub Actions: `macos-13` → `macos-latest` (runner non più disponibile)
- Build completata su tutti e 4 i target (macOS ARM, macOS x64, Windows, Linux)
- GitHub Release v0.1.1-beta pubblicata automaticamente come Pre-release

### Decisioni prese
- `macos-latest` usato anche per la build x64 (cross-compilazione da ARM)
- Tag con suffisso `-beta` → `prerelease: true` in automatico nella Action

### Risultato
**Testato su macOS ARM con successo.**

---

## Sessione 003 — Fix coordinate (mupdf) + Fix link Acrobat (PDFString) (2026-03-22)

### Cosa ho fatto

**Bug 1 — Coordinate imprecise (risolto):**
- Root cause: `buildPositionMap()` con pdfjs usava il content stream non trasformato dalla CTM → la chiave `curX_curY` non matchava mai → si eseguiva solo il fallback proporzionale (impreciso per righe lunghe).
- Soluzione: sostituito pdfjs con **mupdf**. `stext.walk()` con `onChar()` fornisce il `quad` per-carattere (8 numeri, 4 angoli) già in coordinate PDF native. `matchBoundsFromChars()` calcola bbox esatto.
- Nota critica indici quad: `[ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y]` → yTop=`quad[1]`, yBottom=`quad[5]` (non `quad[6]` che è lr.x).
- Paragrafi multi-riga spezzati quando delta-Y tra char consecutivi supera `max(2pt, charH * 0.5)`.

**Bug 2 — Link relativi non funzionanti in Acrobat (risolto):**
- Root cause: `context.obj()` convertiva stringhe JS in PDFName (es. `/01_file.pdf`). Acrobat interpretava il PDFName come risorsa interna → "Impossibile aprire il file ' '".
- Fix: `PDFString.of(ann.targetFile)` forza serializzazione come stringa PDF `(01_file.pdf)`.
- Aggiunto `PDFString` all'import da pdf-lib.

### Decisioni prese
- mupdf sostituisce pdfjs-dist per estrazione testo. pdfjs-dist rimane in package.json ma non è più usato (da rimuovere in futuro).
- Coordinate `AnnotationCoord` contengono sempre coordinate mupdf raw. Conversione solo in `addUnderlineLink`.
- FileSpec dict con `/F` e `/UF` entrambi come PDFString (ISO 32000 §7.11.3).

### Problemi aperti
- pdfjs-dist ancora in package.json — può essere rimosso in futuro.
- Le Launch action verso file locali mostrano dialogo di avviso in Acrobat (comportamento di sicurezza, non bug).
- Branch `feat/pct-2024-formats` da mergiare su master + tag `v0.1.0`.

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

---

## Sessione 005 — Generic Patterns, UI Multi-Step, Preview Modal, Drag-Reorder (2026-03-22)

### Cosa ho fatto

**Commit 2.1 — refactor: estrai DEFAULT_ATTACHMENT_PREFIX e DEFAULT_ATTACHMENT_SEPARATOR**
- Aggiunte costanti `DEFAULT_ATTACHMENT_PREFIX = 'doc.'` e `DEFAULT_ATTACHMENT_SEPARATOR = ' '`
  in `src/shared/types.js`
- Eliminato hardcoding di `"doc."` e `" "` in `renderer.js` — import da types.js
- 16 test verdi

**Commit 2.2 — fix: word boundary preciso in buildSearchRegex**
- Sostituito `\b` finale con `(?![a-zA-Z0-9])` lookahead negativo
- `"doc. 1"` ora NON fa match su `"doc. 11"`, `"doc. 12"`, `"doc. 1a"`
- Aggiunti test: `"doc. 12"` → false, `"doc. 1a"` → false, `"allegato AB"` → false
- 20 test verdi

**Commit 2.3 — feat: renumberDefaultLabels funzionante**
- Campo `customLabel: boolean` aggiunto all'oggetto `Attachment` (typedef + renderer)
- `updateLabel()` ora setta `customLabel = true` quando l'utente modifica il campo
- `renumberDefaultLabels()` implementata: rinumera solo le label con `customLabel !== true`
- Chiamata anche in `moveAttachment()` dopo ogni riordino
- 20 test verdi

**Commit 3.1 — feat: buildSearchRegex con sinonimi italiani PCT**
- Esportata costante `LABEL_SYNONYM_GROUPS` in `pdf-processor.js`
- `buildSearchRegex` ora espande il primo token se è in un gruppo sinonimi:
  `"doc. 1"` → match su `"documento 1"`, `"Allegato 1"`, `"all. 1"`, `"ex 1"`, ecc.
- Abbreviazioni ≤ 4 char ottengono il punto opzionale (`doc` → `doc\.?`)
- Token non nel gruppo sinonimi: match esatto (es. `"paragrafo 3"` non si espande)
- 19 nuovi test sinonimi + 1 test export LABEL_SYNONYM_GROUPS = 39 test totali

**Commit 3.2/3.3/3.4/3.5/3.6 — feat: UI multi-step, prefisso configurabile, drag-reorder, multi-selezione, modale preview**
- `index.html` ristrutturato in `#view-step1` e `#view-step2` con classe `.hidden`
- Navigazione step1 ↔ step2 con pulsanti "Avanti →" e "← Indietro"
- Riga configurazione prefisso: input testo prefisso/separatore, input numero iniziale, checkbox lettere
- `buildDefaultLabel()` per generare label configurabili (es. `doc. A`, `all. 03`)
- Drag-to-reorder con `<span class="drag-handle">⠿</span>` — HTML5 Drag & Drop nativo
- Multi-selezione con Click / Shift+Click (range) / Cmd+Click macOS / Ctrl+Click
- Pulsante "Rimuovi selezionati" visibile solo con selezione attiva
- `<dialog id="modal-preview">` con tabella riepilogo, "OK — Genera" e "Annulla"
- Uso coerente di `.hidden` (classe CSS) invece dell'attributo `hidden`
- CSS aggiornato: `.hidden`, `.btn-secondary`, `.btn-danger`, `.drag-handle`,
  `.attachment-item.drag-over`, `.attachment-item.selected`, `#modal-preview`,
  `.prefix-config`, `.preview-table`, `.step2-actions`
- 39 test verdi

### Decisioni prese

1. **`customLabel` come campo booleano:** soluzione semplice e non invasiva rispetto
   a un approccio basato su "valore originale memorizzato". Se l'utente vuole tornare
   al default, deve cancellare il campo — comportamento intuitivo.

2. **Sinonimi solo sul primo token:** la logica di espansione si applica al solo prefisso
   (primo token). I token successivi (numero/lettera) non vengono espansi. Scelta
   conservativa per evitare falsi positivi su label complesse.

3. **Abbreviazioni ≤ 4 char con punto opzionale:** `doc` → `doc\.?`, `all` → `all\.?`,
   ma `documento` → `documento` (senza punto opzionale). Soglia empirica che copre
   tutte le abbreviazioni reali nel contesto PCT italiano.

4. **Drag & Drop nativo per riordino:** nessuna libreria esterna. Inserimento prima/dopo
   basato sulla metà verticale del target (`e.clientY < rect.top + rect.height / 2`).

5. **Classe `.hidden` invece dell'attributo `hidden`:** permette futura transizione CSS
   su show/hide senza modifiche al JS. I vecchi elementi che usavano l'attributo `hidden`
   sono stati aggiornati.

6. **Modale `<dialog>` nativa:** usa l'API `showModal()` / `close()` del browser —
   nessuna libreria UI. Il backdrop è stilizzato via `::backdrop` in CSS.

### File modificati

- `src/shared/types.js` — aggiunte costanti prefisso, campo customLabel nel typedef
- `src/main/pdf-processor.js` — fix word boundary, aggiunta LABEL_SYNONYM_GROUPS, espansione sinonimi
- `src/renderer/renderer.js` — riscrittura completa con tutte le nuove feature
- `src/renderer/index.html` — struttura multi-step, dialog modale, riga prefisso
- `src/renderer/style.css` — nuovi stili per tutte le nuove feature
- `tests/pdf-processor.test.js` — +23 test (word boundary, sinonimi PCT)
- `sessioni/005-review.md` — analisi del codice baseline

### Problemi noti / TODO prossima sessione

- pdfjs-dist ancora in package.json — può essere rimosso
- Nessun test per la logica UI del renderer (test solo su pdf-processor)
- Electron Builder non ancora configurato (Fase 6 roadmap)
- La build CI su GitHub Actions non è stata aggiornata per questa sessione
