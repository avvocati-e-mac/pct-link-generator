# Sessione 007 — Fix Regressione Regex + UX

**Data:** 2026-03-22
**Versione:** 0.1.1

## Obiettivo

Fix di 4 problemi emersi dal test manuale della sessione 006:
1. Regex label numeriche faceva match su numeri isolati (importi, P.IVA, date)
2. Modale preview potenzialmente non sincronizzata con ordine riordinato degli allegati
3. Nomi allegati troncati a 120px fissi nella lista
4. Nessuna animazione visiva durante il drag-to-reorder

## Decisioni prese

- Prefisso sinonimo **obbligatorio** (non opzionale) in `buildSearchRegex` per label numeriche: il rischio di falsi positivi su documenti legali (importi €, date, P.IVA) è inaccettabile rispetto alla perdita del match standalone.
- `attachments[]` è correttamente mutato in-place dal drop handler (`splice`): nessun bug strutturale nel Fix 2. Aggiunto `console.log` difensivo per debug futuro.
- `.att-name` con `flex: 1; min-width: 0` invece di `flex: 0 0 auto; max-width: 120px`: il nome si adatta allo spazio disponibile e usa ellipsis naturale.

## File modificati

- `src/main/pdf-processor.js` — `SYNONYMS_PREFIX_PATTERN` senza `?` finale (prefisso obbligatorio)
- `tests/pdf-processor.test.js` — rimosso caso `'1 standalone' → true`, aggiunti 3 no-match cases
- `src/renderer/renderer.js` — `console.log('[DRAG] Nuovo ordine:', ...)` nel drop handler
- `src/renderer/style.css` — `transition` su `.attachment-item`, regola `.attachment-item.dragging`, fix `.att-name` flex
- `DEVLOG.md` — aggiunta sezione Sessione 007

## Problemi noti / TODO prossima sessione

- pdfjs-dist ancora in package.json (non più usato — rimosso in futuro)
- Nessun test per la logica UI del renderer (test solo su pdf-processor)
- Electron Builder non ancora configurato (Fase 6 roadmap)
- Verificare empiricamente Fix 2 su macOS: aprire l'app, riordinare gli allegati, aprire la modale e controllare che l'ordine corrisponda
