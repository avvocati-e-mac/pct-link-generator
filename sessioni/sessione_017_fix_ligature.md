# Sessione 017 — Fix ligature tipografiche + analisi PDF Word reale

**Data:** 2026-03-28
**Versione:** 0.4.3 (in preparazione)

## Obiettivo

Implementare Fix 3 (ligature con quad degenere) pianificato nella sessione 016.
Analisi del PDF Word reale fornito dall'utente per identificare la causa effettiva
dei 3 documenti mancanti (3, 4, 9).

---

## Decisioni prese

1. **Causa dei doc. 3, 4, 9 mancanti:** non è un bug dell'app. Dall'analisi della
   schermata fornita dall'utente, i documenti 3 e 4 erano citati con formato non
   standard (`doc. sub n. 3`) o erano stati linkati manualmente. I documenti mancanti
   semplicemente non sono citati nell'atto con un formato riconoscibile — comportamento
   corretto dell'app.

2. **Fix 3 — charMap per ligature:** introdotto `charMap[]` in `extractCharRuns`.
   Mappa ogni indice del testo all'indice corrispondente in `chars`. I caratteri con
   bbox larghezza zero (componenti secondarie di ligature mupdf) vengono aggiunti al
   testo ma puntano al glyph precedente in `charMap` invece di creare un char senza
   coordinate. `matchBoundsFromChars` usa `Set()` per deduplicare gli indici.

3. **Branch separato:** il fix è stato sviluppato su `fix/ligature-quad-degenere`
   come pianificato, poi mergeato su `master` e rilasciato come `v0.4.3`.

---

## File modificati

| File | Modifica |
|---|---|
| `src/main/pdf-processor.js` | `extractCharRuns`: aggiunto `charMap[]` e filtro quad degenere in `onChar`; `matchBoundsFromChars`: firma aggiornata con `charMap`, logica indici via `Set()`; JSDoc aggiornato |

**Test:** 85/85 verdi (nessun test aggiunto — le ligature non sono simulabili con pdf-lib/Helvetica che non ha ligature)

---

## Problemi noti / TODO prossima sessione

### Priorità alta
- [ ] **Test con PDF Word reale** — quando arriva il PDF, aggiungerlo come fixture
  in `tests/fixtures/` e scrivere test di integrazione. Solo allora chiudere issue #1.

### Priorità bassa
- [ ] **Fase 8 — Notarizzazione Apple**: configurare Apple ID + app-specific password
  in GitHub Secrets per notarizzare il DMG e rimuovere il workaround `xattr` dal README
- [ ] **Chiudere issue #1** dopo verifica con PDF Word reale
