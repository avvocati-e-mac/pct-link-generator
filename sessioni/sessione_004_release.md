# Sessione 004 — Prima release beta v0.1.1

**Data:** 2026-03-22
**Versione:** 0.1.1

## Obiettivo

Completare il commit pendente del fix PDFString, aggiornare la documentazione,
fare il merge su master e pubblicare la prima release beta su GitHub.

## Decisioni prese

- Versione bumped a **0.1.1** (PATCH: fix bug link Acrobat + fix coordinate)
- Tag **v0.1.1-beta** → GitHub Release automaticamente segnata come Pre-release
- `macos-13` non più disponibile sui runner GitHub → sostituito con `macos-latest`
  (ARM) anche per la build x64 (cross-compilazione)
- Build locale macOS generata in `dist/` come artefatto collaterale (ignorabile)

## File modificati

| File | Modifica |
|------|----------|
| `package.json` | Versione 0.1.0 → 0.1.1 |
| `src/main/pdf-processor.js` | Fix PDFString committato |
| `README.md` | Creato ex novo |
| `DEVLOG.md` | Aggiornato sessione 003 |
| `ARCHITECTURE.md` | Sezioni pdfjs sostituite con mupdf |
| `.github/workflows/build.yml` | macos-13 → macos-latest per build x64 |
| `sessioni/sessione_003_fase3.md` | Committato |

## Stato build e test

- ✅ 16/16 test Vitest verdi
- ✅ Build macOS ARM — testata su hardware reale, funziona
- ✅ Build macOS x64 — completata su GitHub Actions
- ✅ Build Windows x64 — completata su GitHub Actions
- ✅ Build Linux AppImage — completata su GitHub Actions
- ✅ GitHub Release v0.1.1-beta pubblicata come Pre-release

## Aggiornamenti post-test

- Aggiunta nota quarantena macOS in `README.md` e nel body della GitHub Release (`build.yml`):
  `sudo xattr -cr /Applications/PCT\ Link\ Generator.app`
- L'app non è notarizzata → il comando è necessario al primo avvio su macOS

## Problemi noti / TODO prossima sessione

- Warning GitHub Actions: Node.js 20 deprecato, da giugno 2026 servirà aggiornare
  le action a Node.js 24 (non urgente)
- pdfjs-dist ancora in package.json ma non usato — da rimuovere in futuro
- Icone app non ancora create (usa icona Electron di default)
- Fase 6 (packaging avanzato) e Fase 7 (UX) ancora da fare
