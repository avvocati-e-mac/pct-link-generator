# Sessione 020 — Auto-update via electron-updater

**Data:** 2026-03-28
**Versione:** 0.4.5 (branch feat/auto-update)

## Obiettivo

Implementare l'aggiornamento automatico dell'app tramite `electron-updater` + GitHub Releases, con banner UI nel renderer che guida l'utente attraverso i 3 stati: disponibile → download → pronto per installazione.

## Decisioni prese

1. **electron-updater 6.x** — libreria standard per Electron, si integra con GitHub Releases via `latest-mac.yml`.
2. **`autoDownload: false`** — il download non parte automaticamente: l'utente clicca "Aggiorna ora".
3. **Banner fisso bottom-right** — non modale, non invasivo. Dismissibile con ✕.
4. **Canali IPC separati per push e invoke** — Main→Renderer tramite `webContents.send` (3 canali push), Renderer→Main tramite `ipcRenderer.invoke` (2 canali invoke).
5. **`--publish always` in CI** — i job di build pubblicano direttamente sulla Release. Il job `release` separato aggiunge il body con le istruzioni xattr.
6. **`owner/repo` in electron-builder.config.cjs** — placeholder `filippostrozzi/pct-link-generator`, da verificare prima del merge.

## File modificati

| File | Modifica |
|------|----------|
| `src/main/updater.js` | **NUOVO** — `setupUpdater`, `downloadUpdate`, `quitAndInstall` |
| `src/shared/types.js` | +5 canali IPC update |
| `src/main/preload.cjs` | +`downloadUpdate`, `installUpdate`, `onUpdateEvent` |
| `src/main/main.js` | import updater + `setupUpdater(mainWindow)` + 2 handler IPC |
| `src/renderer/index.html` | banner HTML (bottom-right) |
| `src/renderer/style.css` | stili banner |
| `src/renderer/renderer.js` | logica banner (3 stati) |
| `electron-builder.config.cjs` | sezione `publish` con provider github |
| `.github/workflows/build.yml` | `--publish always` + `GITHUB_TOKEN` nei 4 job di build |
| `package.json` / `package-lock.json` | `electron-updater ^6.8.3` |

## Bug noti da fixare prima del merge

### Bug 1+2 — Doppio handler + no error handling in `renderer.js`

**Problema:** nel callback `downloaded` (riga 816) si assegna `btnUpdateDownload.onclick = installUpdate`, ma il `addEventListener` della riga 822 non viene rimosso. Cliccando "Riavvia ora" scattano entrambi: `downloadUpdate()` fallisce con errore silenzioso, poi `installUpdate()` chiude l'app. In più, nessun error handling se il download fallisce.

**Fix pianificato:**
- Aggiungere `let updateReady = false;`
- Nel callback `downloaded`: impostare solo `updateReady = true` (no `onclick`)
- Nel listener `addEventListener('click')`: branch `if (updateReady)` → `installUpdate()`, altrimenti `downloadUpdate()` con `try/catch`

## Problemi noti / TODO prossima sessione

- [ ] **Fix Bug 1+2** in `renderer.js` (vedi sopra) — obbligatorio prima del merge
- [ ] **Test manuali con debug timeout** — aggiungere 4 `setTimeout` temporanei in `main.js` per simulare i 4 eventi IPC e verificare visivamente il banner
- [ ] **Test unitari `tests/updater.test.js`** — mock di `electron-updater` via `vi.hoisted` + `vi.mock`, 8 test per `setupUpdater`, `downloadUpdate`, `quitAndInstall`
- [ ] **Verificare `owner/repo`** in `electron-builder.config.cjs` con i valori reali del repo GitHub
- [ ] **CI beta test** — tag `v0.4.6-beta.0` su `feat/auto-update` per verificare che `--publish always` crei la Release correttamente
- [ ] **Merge e release stabile** — solo dopo che CI beta è verde
- [ ] **Fase 8 — Notarizzazione Apple** (roadmap, blocca `quitAndInstall` su macOS)
