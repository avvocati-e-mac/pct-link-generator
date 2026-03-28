# Sessione 015 — Valutazione migrazione Electron → Tauri

**Data:** 2026-03-28
**Versione:** 0.4.1

## Obiettivo

Ricerca approfondita per valutare se e come migrare l'app da Electron 33 a Tauri v2.
Nessuna modifica al codice — solo analisi e documentazione della decisione.

---

## Decisioni prese

**Raccomandazione: NON migrare ora. Completare Fase 6 packaging con Electron.**

Motivazioni principali:
1. `mupdf` è un native Node.js binding — non funziona nel WebView di Tauri
2. L'unica sostituzione praticabile (pdfjs-dist) era già stata scartata in Fase 1 per problemi di precisione su PDF italiani reali (matching per-carattere con `matchBoundsFromChars`)
3. Stima migrazione: 62+ ore (Opzione A, minimo Rust) con rischio regressioni
4. Benefici concreti (bundle ~8MB vs ~90MB, RAM -75%) non bloccanti per utenti avvocati

---

## Analisi tecnica

### Stack attuale che impedisce migrazione diretta

| Componente | Problema Tauri |
|---|---|
| `mupdf@^1.27.0` | Native binding Node.js — incompatibile con WebView |
| `webUtils.getPathForFile` | API Electron proprietaria — sostituire con `onDragDropEvent` |
| IPC `ipcMain.handle` / `ipcRenderer.invoke` | Sostituire con `#[tauri::command]` + `invoke()` Rust |

### pdfjs vs mupdf: il vero problema

`pdf-processor.js` usa `mupdf.stext.walk` per iterare carattere-per-carattere con quad coordinates (8 float per carattere). Questa granularità è usata da `matchBoundsFromChars` per costruire bounding box precisi del testo trovato.

`pdfjs-dist` restituisce `TextItem` con coordinate per-parola (non per-carattere). La sostituzione richiede interpolazione che degrada la precisione. Il progetto ha già fatto questo percorso: pdfjs → mupdf in Fase 1/2.

### Conflitto drag & drop in Tauri

`dragDropEnabled: true` (richiesto per ricevere file dal filesystem) intercetta gli eventi `dragstart`/`drop` del DOM, confliggendo con il riordinamento interno della lista allegati. Soluzione: `e.stopPropagation()` sugli handler HTML5 degli `<li>` — i due meccanismi sono discriminabili perché il drag interno non genera eventi filesystem Tauri.

---

## Le tre opzioni valutate

### Opzione A: "PDF in WebView" — 62 ore, rischio medio-alto
- `pdfjs-dist` nel frontend WebView (perde precisione per-carattere)
- `pdf-lib` nel frontend WebView (puro JS — OK)
- Backend Rust: solo IO file (copy, write, dialog)
- Quando rivalutare: dopo v1.0, con corpus PDF italiani reali per testing

### Opzione B: "PDF in Rust" — 116 ore, rischio alto
- `pdfium-render` Rust crate (precisione per-carattere mantenuta)
- Riscrittura completa backend in Rust
- Blocco: regex lookbehind non supportata in crate `regex` Rust
- Blocco: gestione binari nativi PDFium in CI/CD multipiattaforma

### Opzione C: Mantieni Electron, completa Fase 6 — 8-12 ore *(scelta)*
- Zero migrazione, zero rischi
- Packaging, notarizzazione macOS, distribuzione v1.0

---

## File modificati

Nessuno. Solo analisi.

Nuovi file creati:
- `sessioni/sessione_015_valutazione_tauri.md` (questo file)
- `/Users/filippostrozzi/.claude/plans/lovely-marinating-kurzweil.md` (piano Claude)

---

## Problemi noti / TODO prossima sessione

**Prossimo passo consigliato: Fase 6 — Packaging e distribuzione**
1. Configurare notarizzazione macOS (Apple ID + app-specific password in GitHub Secrets)
2. Testare DMG su macOS clean (arm64 + x64)
3. Pubblicare v1.0 su GitHub Releases
4. Aggiornare README con istruzioni installazione finali

**Se in futuro si vuole tentare Opzione A:**
- Prima costruire test suite con PDF reali italiani
- Verificare `matchBoundsFromChars` con pdfjs come primo step, prima di impegnarsi nell'intera migrazione
- Tauri v2 è stabile da ottobre 2024; API plugin (`tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-opener`) sono mature
- Bug noto risolto: Issue #13698 (path corrotti in `onDragDropEvent`) — richiede tauri ≥ 2.6.0
- Bug aperto: Issue #14134 — eventi drag duplicati su macOS 15.6.1 con Tauri 2.8.4

---

## Riferimenti ricerca

- [Tauri v2 stable](https://v2.tauri.app/blog/tauri-20/) — stabile da ottobre 2024
- [Node.js sidecar Tauri](https://v2.tauri.app/learn/sidecar-nodejs/) — scartato: bundle +30-50MB, vanifica il vantaggio
- [Tauri drag & drop Issue #11177](https://github.com/tauri-apps/tauri/issues/11177)
- [Migrazione Electron→Tauri UMLBoard](https://www.umlboard.com/blog/moving-from-electron-to-tauri-1/)
- [Tauri vs Electron benchmark reale (Hopp)](https://www.gethopp.app/blog/tauri-vs-electron) — 409MB → 172MB RAM (6 finestre)
- [DoltHub: problemi firma codice con Tauri](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
