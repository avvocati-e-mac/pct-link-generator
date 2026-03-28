# Sessione 020 — Auto-update via electron-updater

**Data:** 2026-03-28
**Versione:** 0.4.6 (rilasciata su master)

## Obiettivo

Implementare l'aggiornamento automatico dell'app tramite `electron-updater` + GitHub Releases, verificarlo con un ciclo completo di test manuali + test unitari + CI beta, e rilasciare la versione stabile `v0.4.6`.

## Decisioni prese

1. **electron-updater 6.x** — libreria standard per Electron, si integra con GitHub Releases via `latest-mac.yml`.
2. **`autoDownload: false`** — il download non parte automaticamente: l'utente clicca "Aggiorna ora".
3. **`autoInstallOnAppQuit: true`** — se il download è già avvenuto, l'installazione parte alla chiusura normale dell'app.
4. **Banner fisso bottom-right** — non modale, non invasivo. Dismissibile con ✕. 3 stati: disponibile → progresso % → pronto per installare.
5. **Flag `updateReady`** invece di `onclick` — un unico `addEventListener` con branch interno evita il doppio handler che scattava cliccando "Riavvia ora".
6. **Import CJS di electron-updater** — `import pkg from 'electron-updater'; const { autoUpdater } = pkg;` perché electron-updater è un modulo CJS che non supporta named exports in ESM.
7. **`autoUpdater.removeAllListeners()`** in `setupUpdater` — evita accumulo di listener in dev con hot-reload.
8. **CI semplificata** — rimosso il job `softprops/action-gh-release` che conflittava con `--publish always` di electron-builder (stesso tag → errore `already_exists`). Sostituito con job `release-notes` che usa `gh release edit --draft=false`.
9. **`owner: avvocati-e-mac`** — il repo è sotto l'organizzazione, non l'utente personale. Scoperto durante la CI beta con errore 404.

## File modificati

| File | Modifica |
|------|----------|
| `src/main/updater.js` | **NUOVO** — `setupUpdater`, `downloadUpdate`, `quitAndInstall` |
| `src/shared/types.js` | +5 canali IPC update |
| `src/main/preload.cjs` | +`downloadUpdate`, `installUpdate`, `onUpdateEvent` |
| `src/main/main.js` | import updater + `setupUpdater(mainWindow)` + 2 handler IPC |
| `src/renderer/index.html` | banner HTML (bottom-right) |
| `src/renderer/style.css` | stili banner |
| `src/renderer/renderer.js` | logica banner 3 stati + fix doppio handler + error handling |
| `electron-builder.config.cjs` | sezione `publish` con `provider: github`, `owner: avvocati-e-mac` |
| `.github/workflows/build.yml` | `--publish always` nei 4 job + job `release-notes` con `gh release edit --draft=false` |
| `package.json` / `package-lock.json` | `electron-updater ^6.8.3` |
| `tests/updater.test.js` | **NUOVO** — 8 test unitari con mock `vi.hoisted` |
| `README.md` / `ARCHITECTURE.md` / `DEVLOG.md` | aggiornati per v0.4.6 |

## Test eseguiti

- **93/93 test Vitest verdi** (85 PDF processor + 8 updater)
- **Test manuale visivo** con debug timeout in `main.js` — tutti e 3 gli stati del banner verificati, dismiss funzionante, dark mode ok
- **CI beta `v0.4.6-beta.0`** — 4 job di build verdi, Release pubblicata con `latest-mac.yml`, `.dmg`, `.exe`, `.AppImage`
- **Release stabile `v0.4.6`** — pubblicata come Latest su GitHub

## Problemi riscontrati e risolti

| Problema | Causa | Fix |
|----------|-------|-----|
| `SyntaxError: Named export 'autoUpdater' not found` | electron-updater è CJS | `import pkg from 'electron-updater'` |
| Errore 404 in CI su `/repos/filippostrozzi/...` | owner sbagliato (utente vs org) | `owner: 'avvocati-e-mac'` |
| CI falliva con `already_exists` | electron-builder + softprops creavano entrambi la Release | Rimosso softprops, aggiunto `gh release edit` |
| Release rimasta Draft | `gh release edit` non passava `--draft=false` | Aggiunto `--draft=false` al comando |
| Mock Vitest falliva dopo fix import CJS | `vi.mock` non esponeva il `default` export | `default: { autoUpdater: mockAutoUpdater }` nel mock |

## Problemi noti / TODO prossima sessione

- [ ] **Fase 8 — Notarizzazione Apple** — `quitAndInstall` su macOS non completa l'installazione perché il DMG scaricato è bloccato da Gatekeeper (app non notarizzata). Richiede Apple Developer ID.
- [ ] **Test con app installata reale** — verificare che un'app v0.4.5 installata rilevi v0.4.6 come aggiornamento disponibile (verificabile solo post-release con build packaged).
