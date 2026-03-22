/**
 * pdf-processor.js — Logica PDF pura (pdfjs-dist + pdf-lib).
 * Nessun codice Electron in questo file.
 */

import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, PDFName } from 'pdf-lib';

// pdfjs-dist in Node.js: build legacy con worker disabilitato
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// ===== Funzione di matching flessibile =====

/**
 * Crea una RegExp flessibile per trovare un'etichetta nel testo del PDF.
 * Normalizza: "doc. 1" trova "Doc.1", "doc 1", "DOC. 1", "Doc. 1", ecc.
 *
 * @param {string} label - Es. "doc. 1", "allegato 2"
 * @returns {RegExp}
 */
export function buildSearchRegex(label) {
  // Normalizza la label: rimuove spazi multipli, rende case-insensitive
  // Sostituisce il separatore (punto o spazio) tra parola e numero con [\s.]*
  // Es: "doc. 1" → /doc[\s.]*1/i
  const escaped = label
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escapa caratteri speciali regex
    .replace(/\.\s*/g, '[\\s.]*')            // "." → [\s.]* (punto opzionale con spazi)
    .replace(/\s+/g, '[\\s.]*');              // spazi → [\s.]* (spazio o punto opzionali)
  return new RegExp(escaped, 'i');
}

// ===== Lettura coordinate testo =====

/**
 * Trova le coordinate di tutti i match di un'etichetta nel PDF.
 * Usa pdfjs-dist in modalità Node.js (no worker, build legacy).
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
      disableWorker: true,
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
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      if (!regex.test(item.str)) continue;

      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width;
      // height: usa item.height se disponibile, altrimenti Math.abs(scaleY)
      const height = item.height > 0 ? item.height : Math.abs(item.transform[3]);

      results.push({
        pageIndex, // 0-based, coerente con pdf-lib
        x,
        y,
        width,
        height,
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
