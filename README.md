# PCT Link Generator

App desktop Electron per aggiungere annotazioni link cliccabili ai PDF degli atti PCT.

## Cosa fa

1. Trascini il PDF dell'atto principale
2. Trascini uno o più allegati (PDF, EML, MSG, JPG, XML), riordinabili a piacere
3. Assegni a ogni allegato un'etichetta di ricerca (es. `doc. 1`)
4. L'app trova quella etichetta nel testo dell'atto, aggiunge una sottolineatura blu e un link cliccabile che apre il file allegato
5. Salva l'atto modificato e tutti gli allegati nella cartella di output scelta

**Uso tipico:** avvocati e professionisti che depositano atti telematici PCT.

## Privacy

Zero connessioni di rete. Tutto elaborato offline. GDPR compliant.

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

16 test Vitest, tutti verdi.

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
│   ├── index.html         # UI drag & drop
│   ├── renderer.js        # Logica UI
│   └── style.css
└── shared/
    └── types.js           # Costanti IPC + typedef JSDoc
tests/
└── pdf-processor.test.js
```

## Note tecniche

- **Coordinate:** mupdf restituisce coordinate per-carattere in sistema top-left (Y↓). La conversione a sistema pdf-lib (bottom-left, Y↑) avviene solo in `addUnderlineLink`: `yPdfLib = pageHeight - y - height`.
- **Link relativi:** le Launch action usano `PDFString` per i path — compatibile con Acrobat e Foxit.
- **Sicurezza Electron:** `contextIsolation: true`, `nodeIntegration: false`, comunicazione esclusivamente via `contextBridge` + `ipcRenderer.invoke`.

## Roadmap

- [x] Fase 1 — Scaffolding
- [x] Fase 2 — Core services (findTextCoordinates, addUnderlineLink)
- [x] Fase 3 — IPC e Preload
- [x] Fase 4 — UI Renderer
- [x] Fase 5 — Test (16/16 verdi)
- [ ] Fase 6 — Packaging (electron-builder)
- [ ] Fase 7 — UX miglioramenti (progress bar, notifiche)
