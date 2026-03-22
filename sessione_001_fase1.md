# Sessione 001 — Scaffolding architettura base + Allineamento CLAUDE.md

**Data:** 2026-03-22
**Versione:** 0.1.0

## Obiettivo

Costruire da zero l'intera struttura base dell'app Electron `pct-link-generator`
con 8 commit atomici, poi allineare CLAUDE.md alla realtà del progetto.

## Decisioni prese

1. **Stack:** Electron puro + Vanilla JS/HTML/CSS (no React, no electron-vite, no Tailwind)
2. **pdfjs-dist 4.x:** nessun `default` export → `import * as pdfjsLib`; workerSrc come
   file URL locale (non `disableWorker: true` che non funziona in v4+)
3. **`buildSearchRegex`:** tokenizzazione per parole/numeri + join con `[\s.]*` + `\b`
   (evita falsi positivi es. "doc. 1" ≠ "doc. 11")
4. **`sandbox: false`:** necessario per `webUtils.getPathForFile()` nel preload
5. **Costanti IPC in `src/shared/types.js`:** mai hardcodare stringhe di canale
6. **File di sessione nella root:** accanto a DEVLOG.md, non in sottocartella
7. **Risultato parziale su notFound:** se un'etichetta non viene trovata, nessuna
   eccezione — restituisce report con `notFound[]` e `success: true`

## File modificati

- `CLAUDE.md` — riscritto completamente per allinearsi al progetto reale
- `ARCHITECTURE.md` — creato con diagramma ASCII, canali IPC, analisi tecnica
- `DEVLOG.md` — aggiornato con ogni commit e sessione
- `package.json` — `"type": "module"`, electron 33, pdfjs-dist 4.x, pdf-lib, vitest
- `src/main/main.js` — BrowserWindow, handler IPC, import IPC_CHANNELS
- `src/main/preload.js` — contextBridge, getPathForFile, import IPC_CHANNELS
- `src/main/pdf-processor.js` — findTextCoordinates, addUnderlineLink, processPCTDocument
- `src/renderer/index.html` — shell HTML con drag & drop, lista allegati, area stato
- `src/renderer/renderer.js` — logica UI vanilla, lista riordinabile
- `src/renderer/style.css` — layout due colonne flexbox, stili vanilla
- `src/shared/types.js` — costanti IPC + @typedef JSDoc
- `tests/pdf-processor.test.js` — 16 test Vitest
- `vitest.config.js` — configurazione test Node.js

## Stato test

```
✓ tests/pdf-processor.test.js (16 tests) — TUTTI VERDI
```

## Problemi noti / TODO prossima sessione

- **Packaging:** Fase 6 non ancora implementata (electron-builder)
- **Progress bar:** nessun feedback visivo durante elaborazione lunga
- **Test manuali:** verificare drag & drop reale con PDF PCT autentici
- **`sandbox: false`:** rivalutare in versioni future di Electron (>33)
  se webUtils diventa compatibile con sandbox
