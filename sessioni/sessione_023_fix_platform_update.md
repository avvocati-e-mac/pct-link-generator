# Sessione 023 — Fix auto-update platform-aware + APP_VERSION via IPC

**Data:** 2026-03-28
**Versione:** 0.5.4

## Obiettivo

Completare i due TODO dalla sessione 022:
1. Ripristinare `quitAndInstall()` su Windows (priorità alta)
2. Eliminare `APP_VERSION` hardcodata nel renderer (priorità media)

## Decisioni prese

### Fix auto-update platform-aware
Il payload `update:downloaded` ora include `platform: process.platform` (da `updater.js`).
Il renderer branchia su `platform`:
- `win32` → "Riavvia ora" → `window.electronAPI.installUpdate()` (`quitAndInstall`)
- `darwin` → "Scarica →" → link DMG corretto (arm64 o x64) su GitHub
- `linux` → "Scarica →" → link AppImage su GitHub

Un solo bump v0.5.4 per entrambe le fix (strettamente correlate).

### APP_VERSION via IPC
Rimossa `const APP_VERSION = '0.5.3'` da `renderer.js:8`.
Aggiunto canale IPC `app:getVersion` → `app.getVersion()` nel main process.
Il badge nell'header si popola con `.then()` sulla Promise — giustificato perché
la Promise si risolve prima del primo frame visibile e non ha dipendenze.

## File modificati

| File | Modifica |
|------|----------|
| `src/main/updater.js` | `platform: process.platform` nel payload `UPDATE_DOWNLOADED` |
| `src/renderer/renderer.js` | Listener + click handler platform-aware; rimossa `APP_VERSION`; badge via IPC |
| `src/main/main.js` | Handler `GET_APP_VERSION` |
| `src/main/preload.cjs` | `getAppVersion()` nel contextBridge |
| `src/shared/types.js` | `GET_APP_VERSION: 'app:getVersion'` |
| `tests/updater.test.js` | Assertion `UPDATE_DOWNLOADED` aggiornata con `platform` |
| `package.json` | `version` → `0.5.4` |
| `README.md` | Link download v0.5.4, roadmap aggiornata |
| `DEVLOG.md` | Sezione v0.5.4 aggiunta |

| `README.md` | Aggiunge sezione "Installazione su Linux (AppImage)" e "Aggiornamenti automatici" |

## Problemi noti / TODO prossima sessione

- **Deprecazione Node.js 20 in GitHub Actions** — aggiornare `actions/checkout` e
  `actions/setup-node` a versioni che supportano Node 24 prima di settembre 2026
- **Tag + CI**: creare tag `v0.5.4` quando si vuole rilasciare la build agli utenti
  (seguire Regola 9 di CLAUDE.md — step 8: aggiornare body release su GitHub dopo CI)
- **Test su Windows**: il branch `win32` è testato solo con unit test (process.platform mock);
  verificare manualmente quando disponibile una macchina Windows
