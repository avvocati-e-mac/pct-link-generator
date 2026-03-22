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

// Opcode pdfjs (da OPS enum)
const OPS_setFont       = 37;
const OPS_setTextMatrix = 42;
const OPS_moveText      = 40;
const OPS_showText      = 44; // TJ / Tj con array glyph-width

/**
 * Calcola x e width precisi di una sottostringa matched all'interno di un item
 * pdfjs usando i dati glyph-level dell'operator list.
 *
 * @param {string}   str        - Testo completo dell'item
 * @param {RegExp}   regex      - Pattern da trovare
 * @param {number}   itemX      - X dell'item (da item.transform[4])
 * @param {number}   fontSize   - Dimensione font corrente
 * @param {Array}    glyphs     - Array di glyph dall'operatore showText
 * @returns {{ x: number, width: number } | null}
 */
function computeMatchBounds(str, regex, itemX, fontSize, glyphs) {
  const match = regex.exec(str);
  if (!match) return null;

  const matchStart = match.index;
  const matchEnd   = matchStart + match[0].length;

  // I glyph possono essere misti: { unicode, width } o numeri (kern, negativo = avanzamento)
  // Ricostruiamo il mapping carattere → width accumulando i glyph reali
  let charWidths = [];
  for (const g of glyphs) {
    if (typeof g === 'number') {
      // kern: aggiusta l'ultimo carattere già emesso (non aggiunge caratteri)
      // pdfjs lo esprime in 1/1000 di unità — lo ignoriamo per semplicità
      continue;
    }
    if (g && typeof g.width === 'number') {
      // width è in 1/1000 di unità font → converti in pt
      charWidths.push((g.width / 1000) * fontSize);
    }
  }

  // Se il numero di glyph non corrisponde al numero di caratteri (PDF complessi,
  // ligature, glyph compositi), fallback alla larghezza proporzionale sull'item
  if (charWidths.length !== str.length) {
    const totalItemWidth = charWidths.reduce((a, b) => a + b, 0) || 0;
    if (totalItemWidth <= 0) return null;
    // Usa proporzione basata sulla lunghezza in caratteri come approssimazione
    const avgW = totalItemWidth / charWidths.length;
    charWidths = Array(str.length).fill(avgW);
  }

  const xOffset    = charWidths.slice(0, matchStart).reduce((a, b) => a + b, 0);
  const matchWidth = charWidths.slice(matchStart, matchEnd).reduce((a, b) => a + b, 0);

  return { x: itemX + xOffset, width: matchWidth };
}

/**
 * Trova le coordinate di tutti i match di un'etichetta nel PDF.
 * Usa pdfjs-dist in modalità Node.js (no worker, build legacy).
 * Le coordinate X sono calcolate a livello di glyph per precisione sub-parola.
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

    // Recupera sia il testo strutturato sia la lista operatori (con glyph widths)
    const [textContent, opList] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ]);

    // Costruiamo una mappa: (str, xBaseline) → glyph array dall'operator list
    // Scorriamo gli operatori una volta, costruendo una sequenza di "run di testo"
    // che poi abbiniamo agli item di getTextContent() per str+x.
    /** @type {Array<{str: string, x: number, fontSize: number, glyphs: Array}>} */
    const textRuns = [];
    let curFontSize = 12;

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn   = opList.fnArray[i];
      const args = opList.argsArray[i];

      if (fn === OPS_setFont) {
        // args: [fontName, size]
        if (args && args[1] != null) curFontSize = Math.abs(args[1]);
      } else if (fn === OPS_setTextMatrix) {
        // args: [a, b, c, d, e, f] — la matrice Tm include scala e traslazione
        // Il font size effettivo viene dal prodotto |d|*size o |a|*size a seconda
        // dell'orientamento, ma per testo orizzontale standard |a| = |d| = fontSize.
        if (args && args[3] != null) {
          const scaleFromMatrix = Math.abs(args[3]);
          if (scaleFromMatrix > 0) curFontSize = scaleFromMatrix;
        }
      } else if (fn === OPS_showText) {
        // args[0] è l'array di glyph: [ {unicode, width}, kern_num, ... ]
        if (!args || !args[0]) continue;
        const glyphs = args[0];
        // Ricostruisce la stringa dai glyph (stessa logica di pdfjs internamente)
        let runStr = '';
        for (const g of glyphs) {
          if (g && g.unicode != null) runStr += g.unicode;
        }
        if (runStr === '') continue;
        // Cerca l'item corrispondente per stringa tra quelli di getTextContent
        // (l'abbinamento avviene su str perché le coordinate potrebbero differire
        //  leggermente dopo trasformazioni CTM)
        textRuns.push({ str: runStr, fontSize: curFontSize, glyphs });
      }
    }

    // Indice corrente nella sequenza di textRuns per l'abbinamento con items
    let runIdx = 0;

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      if (!regex.test(item.str)) continue;

      const itemX    = item.transform[4];
      const itemY    = item.transform[5];
      const itemH    = item.height > 0 ? item.height : Math.abs(item.transform[3]);

      // Cerca il textRun corrispondente a questo item
      // Strategia: scorre i run dal punto corrente cercando quello che contiene item.str
      let matchedRun = null;
      for (let r = runIdx; r < textRuns.length; r++) {
        if (textRuns[r].str === item.str) {
          matchedRun = textRuns[r];
          runIdx = r + 1; // avanza l'indice per i prossimi item
          break;
        }
      }

      if (matchedRun) {
        // Calcola coordinate precise con glyph widths
        const bounds = computeMatchBounds(
          item.str, regex, itemX, matchedRun.fontSize, matchedRun.glyphs
        );
        if (bounds) {
          results.push({
            pageIndex,
            x: bounds.x,
            y: itemY,
            width: bounds.width,
            height: itemH,
            matchedText: item.str,
          });
          continue;
        }
      }

      // Fallback: usa le coordinate dell'intero item (comportamento precedente)
      results.push({
        pageIndex,
        x: itemX,
        y: itemY,
        width: item.width,
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
