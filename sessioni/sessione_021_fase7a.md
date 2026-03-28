# Sessione 021 — Badge versione + Pagina introduttiva

**Data:** 2026-03-28
**Versione:** 0.4.6

## Obiettivo

Aggiungere badge versione nell'header e schermata introduttiva per avvocati.

## Decisioni prese

1. **Badge versione** in header-right accanto al toggle tema — costante `APP_VERSION` hardcodata in renderer.js, da aggiornare manualmente ad ogni bump.
2. **`#view-intro`** inserita come prima sezione in `<main>`, prima di `#view-step1`.
3. **`initIntro()`** legge `localStorage.pct-intro-hidden` — se assente mostra l'intro e nasconde i 3 step finché l'utente clicca "Ho capito, inizia →".
4. **Checkbox "Non mostrare più"** — persiste in localStorage, silenzio su errori di accesso.
5. **Reset per test**: `localStorage.removeItem('pct-intro-hidden'); location.reload()` nelle DevTools.

## File modificati

| File | Modifica |
|------|----------|
| `src/renderer/index.html` | Wrapper `header-right` + intera sezione `#view-intro` |
| `src/renderer/style.css` | Aggiunto in coda: `.header-right`, `.version-badge`, tutti i selettori `.intro-*` e `.patterns-table` |
| `src/renderer/renderer.js` | `APP_VERSION`, refs DOM intro, `initIntro()`, listener `btnIntroStart` |

## Problemi noti / TODO prossima sessione

- `APP_VERSION` è hardcodata: valutare in futuro di leggerla via IPC da `app.getVersion()` per evitare disallineamenti.
- Stili `var(--color-table-header)` e `var(--color-file-info-bg)` usati nella tabella pattern — verificare che esistano in entrambi i temi (light/dark).
