/**
 * pdf-processor.js — Logica PDF pura (pdfjs-dist + pdf-lib).
 * Nessun codice Electron in questo file.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { PDFDocument, rgb, PDFName } from 'pdf-lib';

// pdfjs-dist in Node.js: build legacy, workerSrc punta al file locale
// Nota: non ha default export, si usa import * as
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
const _require = createRequire(import.meta.url);
const _workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(_workerPath).href;

// ===== Funzione di matching flessibile =====

/**
 * Crea una RegExp flessibile per trovare un'etichetta nel testo del PDF.
 * Normalizza: "doc. 1" trova "Doc.1", "doc 1", "DOC. 1", "Doc. 1", ecc.
 *
 * @param {string} label - Es. "doc. 1", "allegato 2"
 * @returns {RegExp}
 */
export function buildSearchRegex(label) {
  // Strategia: splitta la label in token alfanumerici, poi li unisce con [\s.]*
  // "doc. 1" → tokens ["doc", "1"] → /doc[\s.]*1\b/i
  // Questo trova "Doc.1", "doc 1", "DOC. 1", ecc.
  // Il \b finale evita falsi positivi: "doc. 1" non trova "doc. 11"
  const normalized = label.trim();
  const tokens = normalized.match(/[a-zA-ZàèéìòùÀÈÉÌÒÙ]+|\d+/g) || [];
  const pattern = tokens
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s.]*');
  return new RegExp(pattern + '\\b', 'i');
}

// ===== Lettura coordinate testo =====

// Opcode pdfjs per l'operator list
const OPS_setFont       = 37;
const OPS_setTextMatrix = 42;
const OPS_moveText      = 40;
const OPS_showText      = 44;

/**
 * Scorre l'operator list di una pagina e costruisce una mappa
 * posizione → {fontSize, glyphs} per ogni run di testo.
 *
 * La chiave è "x.x_y.y" (coordinate arrotondate a 1 decimale),
 * che corrisponde univocamente a item.transform[4]_item.transform[5]
 * di getTextContent().
 *
 * @param {{ fnArray: number[], argsArray: any[][] }} opList
 * @returns {Map<string, {fontSize: number, glyphs: any[]}>}
 */
function buildPositionMap(opList) {
  const map = new Map();
  let curX = 0, curY = 0, curFontSize = 12;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn   = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS_setFont) {
      if (args?.[1] != null) curFontSize = Math.abs(args[1]);
    } else if (fn === OPS_setTextMatrix) {
      // args: [a, b, c, d, e, f] — reset posizione assoluta
      if (args) {
        curX = args[4];
        curY = args[5];
        if (Math.abs(args[3]) > 0) curFontSize = Math.abs(args[3]);
      }
    } else if (fn === OPS_moveText) {
      // args: [tx, ty] — spostamento relativo
      if (args) { curX += args[0]; curY += args[1]; }
    } else if (fn === OPS_showText) {
      if (!args?.[0]) continue;
      const glyphs = args[0];
      const key = `${curX.toFixed(1)}_${curY.toFixed(1)}`;
      map.set(key, { fontSize: curFontSize, glyphs });
      // Avanza curX della larghezza del run appena emesso
      for (const g of glyphs) {
        if (typeof g === 'number') {
          // Kern: valore negativo = avanzamento (unità 1/1000 font)
          curX -= (g / 1000) * curFontSize;
        } else if (g?.width != null) {
          curX += (g.width / 1000) * curFontSize;
        }
      }
    }
  }
  return map;
}

/**
 * Calcola x e width precisi di una sottostringa matched usando i glyph width
 * dell'operator list (1/1000 di unità font per carattere).
 *
 * @param {string}  str       - Testo completo dell'item
 * @param {RegExp}  regex     - Pattern da trovare
 * @param {number}  itemX     - X baseline dell'item
 * @param {number}  fontSize  - Dimensione font effettiva dal run
 * @param {any[]}   glyphs    - Array di glyph dall'operatore showText
 * @returns {{ x: number, width: number } | null}
 */
function computeMatchBoundsFromGlyphs(str, regex, itemX, fontSize, glyphs) {
  const match = regex.exec(str);
  if (!match) return null;

  const matchStart = match.index;
  const matchEnd   = matchStart + match[0].length;

  // Filtra solo glyph reali (scarta kern numerici)
  const chars = glyphs.filter(g => g && g.unicode != null);

  // Se il numero di glyph non corrisponde ai caratteri (ligature, PDF complessi)
  // non possiamo fare il mapping 1:1 → restituisce null per attivare il fallback
  if (chars.length !== str.length) return null;

  const charWidths = chars.map(g => (g.width / 1000) * fontSize);
  const xOffset    = charWidths.slice(0, matchStart).reduce((a, b) => a + b, 0);
  const matchWidth = charWidths.slice(matchStart, matchEnd).reduce((a, b) => a + b, 0);

  return { x: itemX + xOffset, width: matchWidth };
}

/**
 * Fallback: calcola x e width per proporzione uniforme di caratteri.
 * Accurato per righe corte o match all'inizio; meno preciso per match
 * a metà di righe lunghe con font proporzionale.
 *
 * @param {string}  str    - Testo completo dell'item
 * @param {RegExp}  regex  - Pattern da trovare
 * @param {number}  itemX  - X baseline dell'item
 * @param {number}  itemW  - Larghezza totale dell'item in pt
 * @returns {{ x: number, width: number } | null}
 */
function computeMatchBoundsProportional(str, regex, itemX, itemW) {
  const match = regex.exec(str);
  if (!match || str.length === 0 || itemW <= 0) return null;

  const avgCharW   = itemW / str.length;
  const xOffset    = match.index * avgCharW;
  const matchWidth = match[0].length * avgCharW;

  return { x: itemX + xOffset, width: matchWidth };
}

/**
 * Trova le coordinate di tutti i match di un'etichetta nel PDF.
 * Usa pdfjs-dist in modalità Node.js (no worker, build legacy).
 * Le coordinate X/width sono calcolate con glyph-level widths dall'operator list,
 * abbinati agli item di getTextContent() per posizione X+Y (abbinamento univoco).
 *
 * @param {string} pdfPath - Percorso assoluto al PDF
 * @param {string} searchLabel - Etichetta da cercare (es. "doc. 1")
 * @returns {Promise<Array<{pageIndex: number, x: number, y: number, width: number, height: number, matchedText: string}>>}
 */
export async function findTextCoordinates(pdfPath, searchLabel) {
  const buffer = await fs.promises.readFile(pdfPath);
  const uint8Array = new Uint8Array(buffer);

  let pdfDocument;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      verbosity: 0,
    });
    pdfDocument = await loadingTask.promise;
  } catch (err) {
    if (err.name === 'PasswordException') {
      throw new Error(`Il PDF è protetto da password: ${path.basename(pdfPath)}`);
    }
    throw new Error(`PDF non leggibile o corrotto: ${path.basename(pdfPath)} — ${err.message}`);
  }

  const regex = buildSearchRegex(searchLabel);
  const results = [];

  for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex++) {
    const page = await pdfDocument.getPage(pageIndex + 1); // pdfjs è 1-based

    const [textContent, opList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ]);

    // Mappa posizione → run glyph (abbinamento per X+Y univoco)
    const positionMap = buildPositionMap(opList);

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      if (!regex.test(item.str)) continue;

      const itemX = item.transform[4];
      const itemY = item.transform[5];
      const itemH = item.height > 0 ? item.height : Math.abs(item.transform[3]);

      // Cerca il run corrispondente per posizione X+Y
      const key = `${itemX.toFixed(1)}_${itemY.toFixed(1)}`;
      const run = positionMap.get(key);

      let bounds = null;
      if (run) {
        bounds = computeMatchBoundsFromGlyphs(item.str, regex, itemX, run.fontSize, run.glyphs);
      }
      // Fallback proporzionale se run non trovato o glyph non allineati 1:1
      if (!bounds) {
        bounds = computeMatchBoundsProportional(item.str, regex, itemX, item.width);
      }

      results.push({
        pageIndex, // 0-based, coerente con pdf-lib
        x:      bounds?.x     ?? itemX,
        y:      itemY,
        width:  bounds?.width ?? item.width,
        height: itemH,
        matchedText: item.str,
      });
    }
  }

  return results;
}

// ===== Commit 6: Scrittura annotazioni link =====

/**
 * @typedef {Object} Annotation
 * @property {number} pageIndex  - Indice pagina 0-based
 * @property {number} x
 * @property {number} y          - Coordinata Y sistema pdfjs (baseline)
 * @property {number} width
 * @property {number} height
 * @property {string} targetFile - Nome file allegato (relativo, es. "allegato_1.pdf")
 */

/**
 * Aggiunge sottolineature blu e annotazioni Link/Launch a un PDF.
 * Il PDF originale non viene modificato — il risultato è salvato su outputPath.
 *
 * @param {string} pdfPath    - Percorso PDF sorgente
 * @param {string} outputPath - Percorso PDF di destinazione
 * @param {Annotation[]} annotations
 * @returns {Promise<void>}
 */
export async function addUnderlineLink(pdfPath, outputPath, annotations) {
  const buffer = await fs.promises.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(buffer);

  for (const ann of annotations) {
    const page = pdfDoc.getPage(ann.pageIndex);
    const { height: pageHeight } = page.getSize();

    // Inversione asse Y: pdfjs (top-down baseline) → pdf-lib (bottom-up)
    const yPdfLib = pageHeight - ann.y - ann.height;

    // 1. Sottolineatura blu
    page.drawLine({
      start: { x: ann.x, y: yPdfLib },
      end: { x: ann.x + ann.width, y: yPdfLib },
      thickness: 1.5,
      color: rgb(0, 0.27, 0.8),
    });

    // 2. Annotazione Link con Launch action (basso livello pdf-lib)
    const linkDict = pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [ann.x, yPdfLib, ann.x + ann.width, yPdfLib + ann.height],
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'Launch',
        F: ann.targetFile,
        NewWindow: true,
      },
    });

    // Aggiunge l'annotazione all'array Annots della pagina
    const annotsKey = PDFName.of('Annots');
    const existingAnnots = page.node.get(annotsKey);
    if (existingAnnots) {
      existingAnnots.push(linkDict);
    } else {
      page.node.set(annotsKey, pdfDoc.context.obj([linkDict]));
    }
  }

  const savedBytes = await pdfDoc.save();
  await fs.promises.writeFile(outputPath, savedBytes);
}

// ===== Commit 7: Funzione orchestratrice =====

/**
 * @typedef {Object} ProcessInput
 * @property {string} mainPdfPath
 * @property {Array<{path: string, name: string, label: string}>} attachments
 * @property {string} outputFolder
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean}  success
 * @property {number}   processedAnnotations
 * @property {string[]} notFound
 */

/**
 * Processo completo PCT:
 * 1. Copia allegati nella outputFolder
 * 2. Cerca le etichette nel PDF principale
 * 3. Aggiunge annotazioni link al PDF modificato
 * 4. Restituisce un report (mai lancia eccezione per etichette non trovate)
 *
 * @param {ProcessInput} input
 * @returns {Promise<ProcessResult>}
 */
export async function processPCTDocument({ mainPdfPath, attachments, outputFolder }) {
  // 1. Copia allegati nella cartella di output
  for (const att of attachments) {
    const destPath = path.join(outputFolder, att.name);
    await fs.promises.copyFile(att.path, destPath);
    console.log(`[PDF] Copiato allegato: ${att.name}`);
  }

  // 2. Cerca le etichette e raccoglie le annotazioni
  /** @type {Annotation[]} */
  const allAnnotations = [];
  const notFound = [];

  for (const att of attachments) {
    const matches = await findTextCoordinates(mainPdfPath, att.label);
    if (matches.length === 0) {
      notFound.push(att.label);
      console.log(`[PDF] Etichetta non trovata: "${att.label}"`);
    } else {
      for (const match of matches) {
        allAnnotations.push({
          pageIndex: match.pageIndex,
          x: match.x,
          y: match.y,
          width: match.width,
          height: match.height,
          targetFile: att.name, // nome relativo — entrambi i file nella stessa cartella
        });
      }
      console.log(`[PDF] Trovati ${matches.length} match per: "${att.label}"`);
    }
  }

  // 3. Scrive il PDF modificato nella outputFolder
  const mainPdfName = path.basename(mainPdfPath);
  const outputMainPath = path.join(outputFolder, mainPdfName);
  await addUnderlineLink(mainPdfPath, outputMainPath, allAnnotations);
  console.log(`[PDF] PDF modificato salvato: ${mainPdfName}`);

  return {
    success: true,
    processedAnnotations: allAnnotations.length,
    notFound,
  };
}
