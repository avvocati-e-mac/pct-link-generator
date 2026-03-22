# PCT Link Generator

App desktop Electron per aggiungere annotazioni link cliccabili ai PDF degli atti PCT.

## Cosa fa

1. Trascini il PDF dell'atto principale (Step 1);
2. Trascini uno o più allegati (PDF, EML, MSG, JPG, XML…), riordinabili con drag & drop (Step 2);
3. Rivedi il riepilogo nella modale di anteprima prima di confermare;
4. L'app cerca automaticamente nell'atto tutti i riferimenti agli allegati per posizione (`doc. 1`, `allegato 1`, `documento n. 1`, `all. 1`…) e aggiunge una sottolineatura blu con link cliccabile che apre il file allegato;
5. Salva l'atto modificato e tutti gli allegati nella cartella di output scelta dall’utente.

**Uso tipico:** avvocati e professionisti che depositano atti telematici del Processo Civile Telematico (PCT).

## Download

Scarica l'ultima versione dalla pagina [**Releases**](https://github.com/avvocati-e-mac/pct-link-generator/releases/latest):

| Sistema operativo | File da scaricare |
|---|---|
| **macOS — Apple Silicon** (M1/M2/M3/M4) | `PCT-Link-Generator-*-arm64.dmg` |
| **macOS — Intel** (x64) | `PCT-Link-Generator-*-x64.dmg` |
| **Windows** (x64) | `PCT-Link-Generator-*-x64.exe` |
| **Linux** (x64) | `PCT-Link-Generator-*-x86_64.AppImage` |

> **Non sai quale Mac hai?** Vai su  → "Informazioni su questo Mac". Se vedi "Apple M…" scarica la versione ARM64, altrimenti Intel.

## Privacy

Zero connessioni di rete. Tutto elaborato offline. GDPR compliant.

## Installazione su macOS (DMG)

L'app non è notarizzata. Al primo avvio macOS la mette in quarantena e blocca l'apertura.

**Prima di avviare l'app**, esegui questo comando nel Terminale:

```bash
sudo xattr -cr /Applications/PCT\ Link\ Generator.app
```

> Sostituisci il percorso se hai installato l'app in una cartella diversa da `/Applications`.

Questo comando rimuove l'attributo di quarantena e permette l'avvio normale.

## Requisiti

- Node.js 18+
- npm 9+

## Installazione

```bash
npm install
```

## Avvio

```bash
npm start
```

## Test

```bash
npm test
```

65 test Vitest, tutti verdi (v0.2.0).

## Stack

| Componente | Tecnologia |
|---|---|
| Shell desktop | Electron 33 |
| UI | HTML/CSS/JavaScript vanilla |
| Estrazione testo PDF | mupdf (coordinate per-carattere) |
| Scrittura annotazioni PDF | pdf-lib |
| Test | Vitest |

## Struttura

```
src/
├── main/
│   ├── main.js            # Entry point Electron, IPC handlers
│   ├── preload.js         # contextBridge → window.electronAPI
│   └── pdf-processor.js  # Logica PDF (mupdf + pdf-lib)
├── renderer/
│   ├── index.html         # UI multi-step drag & drop
│   ├── renderer.js        # Logica UI
│   └── style.css
└── shared/
    └── types.js           # Costanti IPC + typedef JSDoc
tests/
└── pdf-processor.test.js
```

## Logica di ricerca

Il software associa ogni allegato alla sua **posizione** nella lista (1, 2, 3…). Per ogni posizione costruisce una regex che cerca tutte le varianti italiane comuni:

- `doc. 1`, `Doc.1`, `DOC. 1`
- `allegato 1`, `Allegato 1`
- `documento 1`, `Documento n. 1`
- `all. 1`, `All. 1`, `att. 1`
- `allegato n. 1` (con `n.` intermedio)

Pattern non supportati (es. `doc. 1bis` senza spazio): vengono rilevati e segnalati all'utente con un avviso.

## Note tecniche

- **Coordinate:** mupdf restituisce coordinate per-carattere in sistema top-left (Y↓). La conversione a sistema pdf-lib (bottom-left, Y↑) avviene solo in `addUnderlineLink`: `yPdfLib = pageHeight - y - height`.
- **Link relativi:** le Launch action usano `PDFString` per i path — compatibile con Acrobat e Foxit.
- **Sicurezza Electron:** `contextIsolation: true`, `nodeIntegration: false`, comunicazione esclusivamente via `contextBridge` + `ipcRenderer.invoke`.

## Roadmap

- [x] Fase 1 — Scaffolding
- [x] Fase 2 — Core services (findTextCoordinates, addUnderlineLink)
- [x] Fase 3 — IPC e Preload
- [x] Fase 4 — UI Renderer
- [x] Fase 5 — Test (65/65 verdi)
- [x] Fase 6a — UI multi-step, drag & drop riordino, modale anteprima
- [x] Fase 6b — Regex sinonimi italiani PCT, prefisso obbligatorio, rilevamento bis/ter
- [ ] Fase 7 — Packaging (electron-builder, DMG/EXE)
- [ ] Fase 8 — UX (progress bar, notifiche native, apertura cartella output)
