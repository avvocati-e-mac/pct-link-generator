/**
 * pdf-processor.js — Logica PDF pura (mupdf + pdf-lib).
 * Nessun codice Electron in questo file.
 *
 * mupdf: estrae testo con coordinate per-carattere (stext.walk)
 * pdf-lib: scrive annotazioni link/underline sul PDF
 */

import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, PDFName } from 'pdf-lib';
import mupdf from 'mupdf';

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
  // Il \b finale evita falsi positivi: "doc. 1" non trova "doc. 11"
  const normalized = label.trim();
  const tokens = normalized.match(/[a-zA-ZàèéìòùÀÈÉÌÒÙ]+|\d+/g) || [];
  const pattern = tokens
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s.]*');
  return new RegExp(pattern + '\\b', 'i');
}

// ===== Lettura coordinate testo =====

/**
 * Estrae testo con coordinate per-carattere da una pagina mupdf tramite walk.
 * Raggruppa i caratteri in "run" fisici: spezza quando la Y cambia
 * (paragrafo che va a capo = char con Y diversa nella stessa line mupdf).
 *
 * @param {object} page - Pagina mupdf (da doc.loadPage)
 * @returns {Array<{text: string, chars: Array<{c: string, quad: number[]}>}>}
 */
function extractCharRuns(page) {
  const stext = page.toStructuredText('preserve-whitespace,preserve-spans');
  const runs  = [];
  let cur     = null;

  const flushCur = () => {
    if (cur && cur.text.trim()) runs.push(cur);
    cur = null;
  };

  stext.walk({
    beginTextBlock() { flushCur(); },
    endTextBlock()   { flushCur(); },
    beginLine()      { flushCur(); },
    endLine()        { flushCur(); },
    onChar(c, origin, font, size, quad) {
      // quad layout: [ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y]
      // indici:        0      1     2     3     4     5     6     7
      const charYTop    = quad[1]; // ul.y = top del carattere
      const charYBottom = quad[5]; // ll.y = bottom del carattere

      if (!cur) {
        cur = { text: '', chars: [], yRef: charYTop };
      } else {
        // Se la Y è cambiata significativamente (> 2pt), è una nuova riga fisica
        const charH = Math.abs(charYBottom - charYTop);
        if (Math.abs(charYTop - cur.yRef) > Math.max(2, charH * 0.5)) {
          flushCur();
          cur = { text: '', chars: [], yRef: charYTop };
        }
      }

      cur.text += c;
      cur.chars.push({ c, quad });
    },
  });
  flushCur();
  return runs;
}

/**
 * Calcola il bounding box di una sottostringa matched dentro un run di caratteri.
 * Usa i quad mupdf (un quad = 8 numeri = 4 angoli del carattere).
 *
 * Coordinate mupdf: origine top-left, Y verso il basso (pt).
 * Restituisce { x, y, width, height } nel sistema mupdf.
 *
 * @param {string}  runText    - Testo completo del run
 * @param {RegExp}  regex      - Pattern da trovare
 * @param {Array}   chars      - Array di {c, quad} per ogni carattere del run
 * @returns {{ x: number, y: number, width: number, height: number, matchedText: string } | null}
 */
function matchBoundsFromChars(runText, regex, chars) {
  const match = regex.exec(runText);
  if (!match) return null;
  if (chars.length !== runText.length) return null; // sicurezza: mapping 1:1

  const matchStart = match.index;
  const matchEnd   = matchStart + match[0].length;
  const matchChars = chars.slice(matchStart, matchEnd);
  if (matchChars.length === 0) return null;

  // quad layout: [ul.x, ul.y, ur.x, ur.y, ll.x, ll.y, lr.x, lr.y]
  // indici:        0      1     2     3     4     5     6     7
  const x      = matchChars[0].quad[0];                                          // ul.x primo char
  const xRight = matchChars[matchChars.length - 1].quad[2];                      // ur.x ultimo char
  const yTop   = Math.min(...matchChars.map(ch => ch.quad[1]));                  // ul.y (top)
  const yBottom= Math.max(...matchChars.map(ch => ch.quad[5]));                  // ll.y (bottom)

  return {
    x,
    y:      yTop,
    width:  xRight - x,
    height: yBottom - yTop,
    matchedText: match[0],
  };
}

/**
 * Trova le coordinate di tutti i match di un'etichetta nel PDF.
 * Usa mupdf per l'estrazione testo con coordinate per-carattere (stext.walk).
 *
 * Le coordinate restituite sono nel sistema mupdf (origine top-left, Y verso il basso).
 * addUnderlineLink converte in sistema pdf-lib (origine bottom-left).
 *
 * @param {string} pdfPath      - Percorso assoluto al PDF
 * @param {string} searchLabel  - Etichetta da cercare (es. "doc. 1")
 * @returns {Promise<Array<{pageIndex: number, x: number, y: number, width: number, height: number, matchedText: string}>>}
 */
export async function findTextCoordinates(pdfPath, searchLabel) {
  const buffer = await fs.promises.readFile(pdfPath);

  let mupdfDoc;
  try {
    mupdfDoc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
  } catch (err) {
    if (err.message?.toLowerCase().includes('password')) {
      throw new Error(`Il PDF è protetto da password: ${path.basename(pdfPath)}`);
    }
    throw new Error(`PDF non leggibile o corrotto: ${path.basename(pdfPath)} — ${err.message}`);
  }

  const regex   = buildSearchRegex(searchLabel);
  const results = [];
  const numPages = mupdfDoc.countPages();

  for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
    const page = mupdfDoc.loadPage(pageIndex);
    const runs = extractCharRuns(page);

    for (const run of runs) {
      if (!run.text.trim() || !regex.test(run.text)) continue;

      const bounds = matchBoundsFromChars(run.text, regex, run.chars);
      if (!bounds) continue;

      results.push({
        pageIndex, // 0-based, coerente con pdf-lib
        x:      bounds.x,
        y:      bounds.y,         // sistema mupdf (top-left, Y verso il basso)
        width:  bounds.width,
        height: bounds.height,
        matchedText: bounds.matchedText,
      });
    }
  }

  return results;
}

// ===== Scrittura annotazioni link =====

/**
 * @typedef {Object} Annotation
 * @property {number} pageIndex  - Indice pagina 0-based
 * @property {number} x
 * @property {number} y          - Coordinata Y sistema mupdf (top-left, Y verso il basso)
 * @property {number} width
 * @property {number} height
 * @property {string} targetFile - Nome file allegato (relativo, es. "allegato_1.pdf")
 */

/**
 * Aggiunge sottolineature blu e annotazioni Link/Launch a un PDF.
 * Il PDF originale non viene modificato — il risultato è salvato su outputPath.
 *
 * Conversione coordinate: mupdf usa origine top-left (Y↓), pdf-lib usa origine
 * bottom-left (Y↑). La pagina A4 ha altezza 841.89pt in entrambi i sistemi.
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

    // Conversione mupdf (top-left, Y↓) → pdf-lib (bottom-left, Y↑)
    // ann.y = yTop in mupdf → yBottom in pdf-lib = pageHeight - (ann.y + ann.height)
    const yPdfLib = pageHeight - ann.y - ann.height;

    // 1. Sottolineatura blu (al bordo inferiore del testo)
    page.drawLine({
      start: { x: ann.x,              y: yPdfLib },
      end:   { x: ann.x + ann.width,  y: yPdfLib },
      thickness: 1.5,
      color: rgb(0, 0.27, 0.8),
    });

    // 2. Annotazione Link con Launch action e FileSpec dict per path relativi
    // ISO 32000 §7.11.3: FileSpec dict con /F (ASCII) e /UF (Unicode) per path relativi
    const linkDict = pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [ann.x, yPdfLib, ann.x + ann.width, yPdfLib + ann.height],
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'Launch',
        F: pdfDoc.context.obj({
          Type: 'Filespec',
          F:  ann.targetFile,   // path relativo, ASCII
          UF: ann.targetFile,   // path relativo, Unicode (PDF 1.7+)
        }),
        NewWindow: true,
      },
    });

    // Aggiunge l'annotazione all'array Annots della pagina
    const annotsKey     = PDFName.of('Annots');
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

// ===== Funzione orchestratrice =====

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
          x:         match.x,
          y:         match.y,
          width:     match.width,
          height:    match.height,
          targetFile: att.name, // nome relativo — entrambi i file nella stessa cartella
        });
      }
      console.log(`[PDF] Trovati ${matches.length} match per: "${att.label}"`);
    }
  }

  // 3. Scrive il PDF modificato nella outputFolder
  const mainPdfName    = path.basename(mainPdfPath);
  const outputMainPath = path.join(outputFolder, mainPdfName);
  await addUnderlineLink(mainPdfPath, outputMainPath, allAnnotations);
  console.log(`[PDF] PDF modificato salvato: ${mainPdfName}`);

  return {
    success: true,
    processedAnnotations: allAnnotations.length,
    notFound,
  };
}
