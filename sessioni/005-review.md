# Sessione 005 — Code Review Pre-Refactoring

**Data:** 2026-03-22
**Versione:** 0.1.1

---

## Analisi codice esistente

### src/shared/types.js
- Contiene `IPC_CHANNELS` come costante esportata — corretto, nessuna stringa hardcoded nei file
- I `@typedef` sono documentati con JSDoc — coerente con le linee guida
- **Gap trovato:** mancano costanti `DEFAULT_ATTACHMENT_PREFIX` e `DEFAULT_ATTACHMENT_SEPARATOR`
  che sono invece hardcoded come `"doc."` e `" "` in `renderer.js`

### src/main/pdf-processor.js
- Usa mupdf per estrazione testo (sostituisce pdfjs-dist dalla sessione 003)
- `buildSearchRegex`: tokenizza per parole/numeri, unisce con `[\s.]*`, conclude con `\b`
  - **Bug word boundary:** `\b` alla fine è un word boundary che non funziona bene
    per numeri seguiti da lettere. Es. `"doc. 1"` potrebbe trovare `"doc. 1a"` perché
    `\b` separa `1` da `a` (entrambi alfanumerici). Il lookahead negativo `(?![a-zA-Z0-9])`
    sarebbe più preciso.
  - **Mancano sinonimi:** "doc." non fa match su "documento", "allegato", "all.", ecc.
    che sono forme equivalenti nell'uso forense italiano.
- `extractCharRuns`: implementazione solida con flush su beginLine/endLine/beginTextBlock/endTextBlock
- `matchBoundsFromChars`: mapping 1:1 char→quad con check `chars.length !== runText.length`
- `findTextCoordinates`: reset regex non necessario (il flag `g` non è usato, non c'è lastIndex)
- `addUnderlineLink`: formula conversione asse Y corretta (`pageHeight - ann.y - ann.height`)
- `processPCTDocument`: orchestrazione solida, nessuna eccezione per notFound

### src/renderer/renderer.js
- `addAttachment`: label hardcoded come `` `doc. ${idx}` `` — non usa costanti
- `renumberDefaultLabels`: funzione vuota (TODO non implementato)
  - Dopo rimozione/riordino le label NON vengono rinumerate — problema UX reale
- Campo `customLabel` non presente nell'oggetto `Attachment` — necessario per la
  rinumerazione selettiva
- Nessun sistema di navigazione step1/step2 — tutta l'UI è su una singola schermata
- Drag & drop per riordino non implementato (solo ▲▼)
- Nessuna multi-selezione
- Nessuna modale di preview prima della generazione

### src/renderer/index.html
- Struttura monolitica a due colonne — non multi-step
- Nessun `<dialog>` per preview
- Attributo `hidden` usato (invece della classe CSS `.hidden`) — da uniformare
  per la nuova logica multi-step (dove serve CSS per animazioni future)
- CSP corretta: `default-src 'self'`

### src/renderer/style.css
- Layout a due colonne funzionante
- Manca `.hidden { display: none; }` come classe utility
- Mancano stili per: drag handle, `.drag-over` su attachment items, `.selected`,
  modale `<dialog>`, pulsante secondario, riga configurazione prefisso

### src/main/main.js
- IPC handlers registrati correttamente con costanti da `types.js`
- `sandbox: false` documentato con motivazione
- Lifecycle macOS/Windows gestito correttamente

### src/main/preload.js / preload.cjs
- `contextBridge` correttamente usato
- `ipcRenderer` non esposto direttamente
- `webUtils.getPathForFile` esposto per drag & drop

### tests/pdf-processor.test.js
- 16 test, tutti verdi al baseline
- Casi di test per `buildSearchRegex`: coprono varianti case/spazio/punto ma
  **non coprono** `"doc. 11"` vs `"doc. 1"` con word boundary preciso
- **Non ci sono test** per `LABEL_SYNONYM_GROUPS` (da aggiungere in commit 3.1)
- Test `processPCTDocument` usano `tmpFiles` per cleanup — pattern corretto

---

## Problemi critici (da fixare in questa sessione)

1. **Word boundary impreciso** in `buildSearchRegex` — `\b` non esclude `"doc. 1a"` o `"doc. 11"`
   correttamente in tutti i contesti
2. **`renumberDefaultLabels` non implementata** — UX rotta dopo rimozione/riordino allegati
3. **Label hardcoded** `"doc."` in renderer — non usa costanti condivise
4. **Mancanza sinonimi PCT** — "documento 1" ≠ "doc. 1" per la regex attuale

## Problemi non critici (UX improvements)

5. UI monolitica — nessuna navigazione step-by-step per l'utente non tecnico
6. Riordino solo con ▲▼ — nessun drag handle
7. Nessuna multi-selezione per rimozione batch
8. Nessuna preview/conferma prima di avviare l'elaborazione (operazione irreversibile)
9. Prefisso etichetta non configurabile — hardcoded `"doc."`

---

## Stato baseline

- **Test:** 16/16 verdi
- **Versione:** 0.1.1
- **Git:** repository con storia commessa
