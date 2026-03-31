# Sessione 024 — Fix badge versione hardcoded

**Data:** 2026-03-31
**Versione:** 0.6.1

## Obiettivo

Correggere il badge versione nell'header che mostrava `v0.5.3` invece di `v0.6.0`,
nonostante il meccanismo IPC `getAppVersion` fosse già implementato dalla sessione 023.

## Decisioni prese

### Root cause
`preload.cjs` mantiene una copia locale di `IPC_CHANNELS` (non può importare ESM da
`types.js`). La costante `GET_APP_VERSION: 'app:getVersion'` era stata aggiunta a
`types.js` nella sessione 023 ma dimenticata nella copia CJS del preload.
Risultato: `ipcRenderer.invoke(undefined)` → Promise rigettata silenziosamente →
badge rimasto al valore statico HTML.

### Fix applicati
1. Aggiunto `GET_APP_VERSION: 'app:getVersion'` in `IPC_CHANNELS` di `preload.cjs`
2. Badge in `index.html` cambiato da `v0.5.3` a `v…` (placeholder neutro che il
   renderer sovrascrive all'avvio — se IPC fallisce, l'utente vede `v…` non un numero sbagliato)
3. Aggiunto avviso in `CLAUDE.md` checklist pre-build per prevenire regressioni

## File modificati

| File | Modifica |
|------|----------|
| `src/main/preload.cjs` | `GET_APP_VERSION: 'app:getVersion'` aggiunto a `IPC_CHANNELS` |
| `src/renderer/index.html` | Badge `v0.5.3` → `v…` |
| `CLAUDE.md` | Avviso checklist pre-build |
| `DEVLOG.md` | Sezione fix aggiunta |

## Problemi noti / TODO prossima sessione

- Monitorare se ci sono altre costanti IPC in `types.js` non sincronizzate con `preload.cjs`
- La duplicazione di `IPC_CHANNELS` tra `types.js` (ESM) e `preload.cjs` (CJS) è una
  fonte di bug: valutare se generare il CJS da un file JSON condiviso in una sessione futura
