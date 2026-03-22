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

---

## Sessione 007 — Fix Regressione Regex + UX (2026-03-22)

### Cosa ho fatto

**Fix 1 — Prefisso obbligatorio in buildSearchRegex (CRITICO):**
- `SYNONYMS_PREFIX_PATTERN` era opzionale (`?` finale) → `buildSearchRegex("1")` faceva match su qualsiasi `"1"` isolata nel PDF (importi, P.IVA, date).
- Rimosso il `?` finale: il prefisso sinonimo è ora **obbligatorio** per le label numeriche.
- Aggiornati i test: rimosso il caso `'1 standalone' → true`, aggiunti 3 casi di non-match (`250.000,00`, P.IVA, data).
- 65 test verdi.

**Fix 2 — Modale preview sincronizzata con ordine allegati:**
- Analizzato il codice: `openPreviewModal` legge `attachments.forEach` al momento della chiamata → non c'è un bug strutturale.
- Il drop handler usa `attachments.splice()` (mutazione in-place) → l'array module-level è aggiornato correttamente.
- Aggiunto `console.log('[DRAG] Nuovo ordine:', ...)` nel drop handler per facilitare debug futuro.

**Fix 3 — Nomi allegati non più troncati a 120px:**
- `.attachment-item .att-name`: rimosso `flex: 0 0 auto` e `max-width: 120px`.
- Sostituito con `flex: 1; min-width: 0` → il nome ora occupa lo spazio disponibile e viene troncato con ellipsis solo se necessario.

**Fix 4 — Animazione drag visibile:**
- Aggiunta `transition: transform 0.15s ease, opacity 0.15s ease, background-color 0.12s` a `.attachment-item`.
- Aggiunta nuova regola `.attachment-item.dragging` con opacity 0.4, bordo tratteggiato blu, scale(0.98).

### Decisioni prese

1. **Prefisso obbligatorio (non opzionale):** cambio breaking intenzionale per utenti che usano label numeriche (es. "1", "2", "10"). Il rischio di falsi positivi su documenti legali con molti numeri (importi, date, P.IVA) è inaccettabile.
2. **Nessun bug strutturale nel Fix 2:** il codice era già corretto. Il console.log è un'aggiunta difensiva per debug futuro.

### File modificati

- `src/main/pdf-processor.js`
- `tests/pdf-processor.test.js`
- `src/renderer/renderer.js`
- `src/renderer/style.css`

### Problemi noti / TODO prossima sessione

- pdfjs-dist ancora in package.json — può essere rimosso
- Nessun test per la logica UI del renderer (test solo su pdf-processor)
- Electron Builder non ancora configurato (Fase 6 roadmap)

---

## Sessione 008 — Feature UX avanzate (2026-03-22)

### Cosa ho fatto

**Commit 2.1 — att-number a sinistra (grid layout):**
- Classe `att-label` → `att-number`. `.attachment-item` usa `display: grid` con `[drag] 24px [number] 36px [name] 1fr [controls] auto`.
- `.att-number` in azzurro, allineato a destra nella colonna.

**Commit 2.2 — startIndex configurabile:**
- Input `#input-start-index` in Step 2. `getStartIndex()` valida (intero ≥ 1, default 1).
- Tutti i punti che usavano `idx + 1` ora usano `getStartIndex() + idx`.

**Commit 3.1 — Rilevamento e rinomina numerica allegati:**
- `hasLeadingNumber(name)` esportata da pdf-processor (testata) + duplicata nel renderer.
- Badge ⚠️ per allegati senza numero iniziale. `<select id="rename-scheme">` con 4 opzioni.
- `buildRenamedName(name, scheme, index, total)` con zero-padding calcolato sul totale.
- `att.renamedAs` nel payload → copia file con nome rinominato nell'output.
- 12 nuovi test (77 totali).

**Commit 3.2 — Dark mode:**
- Tutti i colori hardcoded → variabili CSS `:root` (light) + `[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`.
- Toggle 🌙/☀️ nell'header, persiste in `localStorage` con fallback silenzioso.

**Commit 3.3 — Anteprima PDF atto principale:**
- IPC handler `read-pdf-as-base64` (primi 500KB). `readPdfAsBase64()` in preload.cjs.
- `<embed id="pdf-preview-embed">` caricato via `data:application/pdf;base64,...` (no blob:).

**Commit 3.4 — Verifica natività PDF:**
- `checkPdfNativity()` esportata. In `processPCTDocument`: conteggio caratteri mupdf prima dell'elaborazione.
- `totalChars < 100` → errore bloccante. `totalChars/pagine < 50` → `warning: 'PDF_LOW_TEXT_DENSITY'`.
- Renderer mostra avviso OCR non bloccante. 2 test aggiornati con testo più lungo.

### Decisioni prese

1. `hasLeadingNumber` duplicata in renderer e pdf-processor: la versione pdf-processor è esportata e coperta da test.
2. `buildRenamedName` nel renderer costruisce il nome nel payload IPC; `processPCTDocument` lo applica lato main.
3. Soglia natività 100 caratteri: conservativa e sicura per documenti legali italiani.
4. I test `processPCTDocument` richiedono testo ≥ 100 caratteri — aggiornato il testo di test.

### File modificati

- `src/main/pdf-processor.js`, `src/main/main.js`, `src/main/preload.cjs`
- `src/renderer/renderer.js`, `src/renderer/style.css`, `src/renderer/index.html`
- `src/shared/types.js`, `tests/pdf-processor.test.js`

### Problemi noti / TODO prossima sessione

- Verificare empiricamente la CSP per `data:` URI nell'embed PDF a runtime in Electron
- pdfjs-dist ancora in package.json — può essere rimosso
- Electron Builder non ancora configurato (Fase 6 roadmap)
- `checkPdfNativity` non testata con PDF scansionato reale (funzione esportata, test possibile)

---

## Sessione 009 — Bugfix rinomina + anteprima PDF via mupdf (2026-03-22)

### Cosa ho fatto

**Fix 1 — Rinomina doppio numero:**
- `buildRenamedName` nel renderer usava `originalName` direttamente senza rimuovere il prefisso numerico originale.
- Aggiunta `stripLeadingNumber()` nel renderer (stessa logica di `pdf-processor.js`) e aggiornata `buildRenamedName` per usare `baseName`.
- Risultato: `01_Comparsa_Risposta.pdf` + schema `doc_` + startIndex `2` → `doc_02_Comparsa_Risposta.pdf` ✓

**Fix 2 — Anteprima PDF adattiva (sostituzione embed → img):**
- `<embed type="application/pdf">` con data URI base64 usava il viewer nativo macOS (PDFKit): bande grigie laterali, dimensioni non controllabili via CSS.
- Nuovo IPC handler `render-pdf-page`: legge il PDF, usa mupdf `page.toPixmap([1.5x], DeviceRGB, false, true)` → `asJPEG(85)` → base64.
- Renderer usa `<img>` + `object-fit: contain` invece di `<embed>`. Container con `flex: 1; min-height: 200px`.
- Aggiunti: `RENDER_PDF_PAGE` in `types.js`, handler in `main.js` (con `import mupdf`), `renderPdfPage(filePath)` in `preload.cjs`.

### Decisioni prese
- mupdf già installato → nessuna dipendenza nuova, nessun problema worker/CSP.
- `READ_PDF_BASE64` / `readPdfAsBase64` lasciato in place (non usato, rimozione futura).
- Scala 1.5x per risoluzione adeguata senza overhead eccessivo.

### File modificati
- `src/renderer/renderer.js` — `stripLeadingNumber`, `buildRenamedName`, `renderPdfPage`
- `src/renderer/style.css` — `flex: 1` container, `.pdf-preview-img` con `object-fit: contain`
- `src/renderer/index.html` — `<embed>` → `<img id="pdf-preview-img">`
- `src/main/main.js` — `import mupdf`, handler `RENDER_PDF_PAGE`
- `src/main/preload.cjs` — `renderPdfPage(filePath)`
- `src/shared/types.js` — `RENDER_PDF_PAGE: 'render-pdf-page'`

---

## Sessione 010 — Navigazione pagine PDF + pulsante Esci (2026-03-22)

### Cosa ho fatto

**Feature 1 — Navigazione multi-pagina anteprima:**
- IPC `render-pdf-page` esteso: accetta `{ filePath, pageIndex }`, restituisce `{ base64, totalPages }`.
- `preload.cjs`: firma aggiornata a `renderPdfPage(filePath, pageIndex = 0)`.
- UI: barra navigazione `‹ N / M ›` sotto l'immagine (`.pdf-nav`).
- Renderer: stato `currentPage` / `totalPdfPages`, funzione `renderPdfPagePreview(pageIndex)`, listeners ← →.
- Container PDF: `display: flex; flex-direction: column` — immagine `flex: 1`, nav barra `flex-shrink: 0`.

**Feature 2 — Pulsante reset atto più visibile:**
- `#btn-remove-main` ingrandito a 32×32px via CSS — già funzionante con `clearMainPdf()`.

**Feature 3 — Pulsante "Esci dall'app":**
- Nuovo canale IPC `app:quit` → `app.quit()`.
- `#status-actions` con `<button id="btn-quit">` visibile dopo completamento (success o warning).
- Nascosto da `setStatus()` ad ogni nuova elaborazione.

### Decisioni prese
- La navigazione rilegge il file a ogni cambio pagina (semplice, nessuna cache). Accettabile per file locali.
- Pulsante Esci solo dopo completamento (non sempre visibile) per non distrarre durante il flusso.

### File modificati
- `src/shared/types.js` — `QUIT_APP: 'app:quit'`
- `src/main/main.js` — handler `RENDER_PDF_PAGE` aggiornato, nuovo handler `QUIT_APP`
- `src/main/preload.cjs` — `renderPdfPage(filePath, pageIndex)`, `quitApp()`
- `src/renderer/index.html` — `.pdf-nav`, `#status-actions` con `#btn-quit`
- `src/renderer/renderer.js` — stato pagine, `renderPdfPagePreview`, listeners, `btnQuit`, `statusActions`
- `src/renderer/style.css` — `.pdf-nav`, `.btn-pdf-nav`, `.pdf-page-indicator`, `.status-actions`, `#btn-remove-main`

### Problemi noti / TODO prossima sessione
- `READ_PDF_BASE64` / `readPdfAsBase64` ancora presenti ma inutilizzati — rimuovere in futuro
- pdfjs-dist ancora in package.json — può essere rimosso
- Electron Builder non ancora configurato (Fase 6 roadmap)

---

## Sessione 014 — Release v0.4.0/v0.4.1, fix icona DMG, fix release notes (2026-03-22)

### Cosa ho fatto

**Release v0.4.0:**
- Push di 11 commit su `origin/master`, tag `v0.4.0`, GitHub Release creata manualmente con changelog strutturato

**Fix release notes automatiche:**
- `body:` hardcodato in `softprops/action-gh-release@v2` sovrascriveva `generate_release_notes: true`
- Aggiunto `append_body: true`: changelog auto-generato in testa, istruzioni installazione in fondo
- Dalla prossima release il changelog viene generato automaticamente dai Conventional Commits

**Fix icona assente nel DMG (CRITICO):**
- Root cause: `electron-builder.config.js` era ESModule — electron-builder 25.x non leggeva il campo `icon` → usava icona default Electron
- Fix: convertito in `electron-builder.config.cjs` (CommonJS `module.exports`) + `icon:` esplicito in `mac`, `win`, `linux`
- Aggiornati tutti gli script `npm run dist:*` e il workflow CI con `--config electron-builder.config.cjs`
- Bump patch: `v0.4.0` → `v0.4.1`

**Fix documentazione:**
- Comando quarantena macOS corretto: `sudo xattr -cr /Applications/pct-link-generator.app`
- README: aggiunto link all'articolo PCT su avvocati-e-mac.it

### Decisioni prese
- Bump patch (non re-tag v0.4.0) perché il fix riguarda solo il packaging, non il codice app
- `electron-builder.config.cjs` mantenuto separato (non inline in package.json) per leggibilità
- Release notes miste (auto + corpo fisso) invece di solo auto: le istruzioni di installazione macOS sono necessarie per utenti non tecnici

### File modificati
- `electron-builder.config.js` → `electron-builder.config.cjs`
- `.github/workflows/build.yml`
- `package.json`
- `README.md`
