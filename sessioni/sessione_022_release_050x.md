# Sessione 022 — Release v0.5.x: badge, intro, auto-update fix

**Data:** 2026-03-28
**Versione finale:** 0.5.3

## Obiettivo

Rilasciare le funzionalità sviluppate nella sessione 021 (badge versione +
schermata introduttiva) e correggere tutti i problemi emersi durante il
rilascio: CI conflict 422, auto-update macOS non funzionante.

---

## Decisioni prese

### v0.5.0 — Badge + schermata intro
- Badge `vX.Y.Z` nell'header: `APP_VERSION` hardcodata in `renderer.js`,
  aggiornata ad ogni bump seguendo la Regola 9 di CLAUDE.md.
- `#view-intro`: prima sezione di `<main>`, nasconde i 3 step finché
  l'utente non clicca "Ho capito, inizia →". Persiste in `localStorage.pct-intro-hidden`.
- Job `release-notes` in `build.yml` riscritto con `printf + --notes-file`:
  genera automaticamente nel body la tabella link download per piattaforma.

### v0.5.1 — Fix auto-update macOS (ZIP target)
- Causa: `electron-builder` generava solo DMG. Su macOS, electron-updater
  usa il **ZIP** per aggiornamenti in-place; il DMG fallisce la verifica firma
  (`codesign`) su app non notarizzate.
- Fix: aggiunto `zip` come target macOS in `electron-builder.config.cjs`.
- Fix: il listener `error` di `updater.js` ora propaga `UPDATE_ERROR` al
  renderer e rigetta la Promise corrente di `downloadUpdate()` via `_downloadReject`.
- Aggiunto `IPC_CHANNELS.UPDATE_ERROR` + listener nel renderer.

### v0.5.2 — Fix CI conflict 422
- Causa: `arch: ['arm64', 'x64']` nella config aveva la precedenza sulle
  flag CLI `--arm64`/`--x64`. Entrambi i job costruivano entrambe le arch
  → race condition → `422 already_exists` su GitHub.
- Fix: rimosso `arch` dalla config. Ora `target: ['dmg', 'zip']` senza arch;
  ogni job usa solo la sua flag CLI.

### v0.5.3 — Fix auto-update macOS (quitAndInstall)
- Causa: `autoUpdater.quitAndInstall()` non funziona su macOS non notarizzata.
  electron-updater estrae lo ZIP in temp, tenta `app.relaunch()`, macOS
  applica la quarantena al nuovo eseguibile → relaunch silenziosamente bloccato.
- Soluzione: dopo il download, il pulsante diventa "Scarica DMG →" e apre
  nel browser il download diretto del DMG corretto (arm64 o x64) da GitHub.
  L'arch viene rilevata con `process.arch` nel main process e propagata
  nell'evento `update:downloaded`.
- Nuovo canale IPC `shell:openUrl` → `shell.openExternal(url)`.
- Comportamento: installa il nuovo DMG come la prima volta (no xattr richiesto).

---

## File modificati (sessione completa)

| File | Modifiche |
|------|-----------|
| `src/renderer/index.html` | Wrapper `header-right`, badge `v0.5.3`, sezione `#view-intro` completa |
| `src/renderer/style.css` | `.header-right`, `.version-badge`, tutti i selettori `.intro-*`, `.patterns-table` |
| `src/renderer/renderer.js` | `APP_VERSION`, `initIntro()`, badge, listener update (downloaded/error), click "Scarica DMG →" |
| `src/main/updater.js` | `_downloadReject`, propagazione `UPDATE_ERROR`, `arch` in `update-downloaded` |
| `src/main/main.js` | Handler `OPEN_URL` |
| `src/main/preload.cjs` | `OPEN_URL`, `UPDATE_ERROR`, `openUrl()`, `error` in `channelMap` |
| `src/shared/types.js` | `UPDATE_ERROR`, `OPEN_URL` |
| `electron-builder.config.cjs` | Target macOS: `['dmg', 'zip']` senza arch |
| `.github/workflows/build.yml` | Job `release-notes` riscritto con tabella link download |
| `CLAUDE.md` | Regola 9 — checklist obbligatoria pre-release |
| `README.md` | Link download v0.5.3, roadmap aggiornata |
| `ARCHITECTURE.md` | Aggiornate righe renderer e build.yml |
| `DEVLOG.md` | Sezioni v0.5.0 → v0.5.3 |
| `package.json` | `version` → `0.5.3` |
| `tests/updater.test.js` | Test `UPDATE_DOWNLOADED` aggiornato con payload `{ version, arch }` |

---

## Problemi noti / TODO prossima sessione

### ⚠️ PRIORITÀ — Fix auto-update per piattaforma (prossima cosa da fare)

Il fix "Scarica DMG →" introdotto in v0.5.3 ha uniformato il comportamento
su tutte le piattaforme, ma Windows dovrebbe usare `quitAndInstall()` perché
lì funziona correttamente. Il comportamento corretto per piattaforma è:

| Piattaforma | Comportamento corretto | Stato |
|---|---|---|
| macOS (ARM + Intel) | "Scarica DMG →" → apre browser | ✅ v0.5.3 |
| Windows | "Riavvia ora" → `quitAndInstall()` | ⚠️ da ripristinare |
| Linux | "Scarica AppImage →" → apre browser | ✅ v0.5.3 |

**Implementazione:** in `updater.js`, propagare `platform: process.platform`
nell'evento `update:downloaded`. In `renderer.js`, brancare su `platform`:
- `darwin` → apri URL DMG su GitHub
- `win32` → chiama `window.electronAPI.installUpdate()` (`quitAndInstall`)
- `linux` → apri URL AppImage su GitHub

---

- `APP_VERSION` è hardcodata: valutare IPC da `app.getVersion()` per eliminare
  il rischio di disallineamento con `package.json`.
- Deprecazione Node.js 20 nelle GitHub Actions: aggiornare
  `actions/checkout` e `actions/setup-node` a versioni che supportano Node 24
  prima di settembre 2026.
