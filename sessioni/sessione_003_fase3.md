# Sessione 003 — Fix coordinate annotazioni (mupdf) + Fix link Acrobat (PDFString)

**Data:** 2026-03-22
**Versione:** 0.1.0
**Branch attivo:** `feat/pct-2024-formats`

## Obiettivo

Risolvere due bug critici nel processore PDF:
1. Coordinate annotazioni imprecise (sottolineature sul testo sbagliato)
2. Link relativi non funzionanti in Acrobat

## Decisioni prese

### Bug 1 — Coordinate imprecise (risolto)

**Root cause:** `buildPositionMap()` tracciava le coordinate nel sistema del content stream non trasformato dalla CTM. `getTextContent()` di pdfjs le restituisce invece già trasformate. La chiave `curX_curY` non corrispondeva mai a `itemX_itemY` → tutta la logica glyph era **codice morto** → si eseguiva solo il fallback proporzionale (impreciso per righe lunghe con match a metà).

**Soluzione:** sostituito pdfjs con **mupdf** (npm) per l'estrazione testo. `stext.walk()` con `onChar()` fornisce il `quad` per-carattere `[ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y]` già in coordinate PDF native. `matchBoundsFromChars()` calcola bbox esatto del match usando `quad[0]` (x primo char), `quad[2]` (x destra ultimo char), `quad[1]` (yTop), `quad[5]` (yBottom — **non** `quad[6]` che è lr.x!).

**Nota critica sugli indici quad mupdf:**
- `quad[0]` = ul.x, `quad[1]` = ul.y (top)
- `quad[2]` = ur.x, `quad[3]` = ur.y
- `quad[4]` = ll.x, `quad[5]` = ll.y (bottom) ← usare questo per yBottom
- `quad[6]` = lr.x (NON y!), `quad[7]` = lr.y

**Separazione righe fisiche:** mupdf tratta paragrafi multi-riga come una singola `LINE`. Il codice spezza il run quando il delta-Y tra caratteri consecutivi supera `max(2pt, charH * 0.5)`.

**Risultato:** "doc. 1" in riga lunga (94 char, w=394pt) → x=418.11, w=26.88, h=14.67pt (precisi al pt invece di x≈347 sbagliata).

### Bug 2 — Link relativi Acrobat (parzialmente risolto)

**Root cause progressiva:**

**Tentativo 1:** `F: ann.targetFile` (stringa semplice) → Acrobat non supporta path relativi come stringa semplice.

**Tentativo 2:** `F: pdfDoc.context.obj({ Type: 'Filespec', F: ann.targetFile, UF: ann.targetFile })` → `context.obj()` converte stringhe JS in **PDFName** (es. `/01_Comparsa_Risposta.pdf`). Acrobat interpreta PDFName come risorsa interna → non trova file → mostra "Impossibile aprire il file ' '".

**Fix attuale (pendente commit):** `PDFString.of(ann.targetFile)` forza la serializzazione come stringa PDF `(01_Comparsa_Risposta.pdf)`. Aggiunto `PDFString` all'import da pdf-lib. Fix di 2 righe — **non ancora committato** (sessione interrotta prima del commit).

## File modificati

| File | Modifica |
|------|----------|
| `src/main/pdf-processor.js` | Sostituito pdfjs con mupdf per estrazione testo; fix PDFString per FileSpec |
| `package.json` | Aggiunto `mupdf` nelle dipendenze |
| `package-lock.json` | Aggiornato |

## Stato test

```
✓ tests/pdf-processor.test.js (16 tests) — TUTTI VERDI
```

## Commit già pushati questa sessione

1. `fix: annotazioni precise sul testo — usa glyph widths dall'operator list` (poi sostituito)
2. `fix: coordinate annotazioni precise con glyph widths + abbinamento per posizione X/Y` (poi sostituito)
3. `fix: sostituisce pdfjs con mupdf per coordinate precise + FileSpec per link Acrobat`

## Problemi noti / TODO prossima sessione

- **Commit pendente:** `fix: FileSpec F e UF come PDFString — link relativi funzionano in Acrobat` — il fix è nel codice ma non è stato committato/pushato (sessione interrotta). Da fare all'inizio della prossima sessione.
- **Verifica Acrobat:** dopo il commit del fix PDFString, rigenera il PDF e verifica che i link funzionino in Acrobat (non più errore ' ')
- **Merge branch:** `feat/pct-2024-formats` da mergiare su `master` dopo verifica
- **Icone app:** non ancora create
- **Prima release:** tag `v0.1.0` da pushare quando tutto funziona
- **Avviso sicurezza Acrobat:** le Launch action verso file locali mostrano un dialogo di avviso in Acrobat dal 2021 (comportamento di sicurezza, non bug dell'app — configurabile dall'utente)
- **pdfjs-dist:** ancora in `package.json` come dipendenza ma non più usato — può essere rimosso in futuro
