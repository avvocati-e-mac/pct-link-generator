/**
 * pdf-processor.js — Logica PDF pura (mupdf + pdf-lib).
 * Nessun codice Electron in questo file.
 *
 * mupdf: estrae testo con coordinate per-carattere (stext.walk)
 * pdf-lib: scrive annotazioni link/underline sul PDF
 */

import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, PDFName, PDFString } from 'pdf-lib';
import mupdf from 'mupdf';

// ===== Funzione di matching flessibile =====

/**
 * Gruppi di sinonimi per i prefissi di etichetta negli atti PCT italiani.
 * Se il primo token della label appartiene a un gruppo, la regex espande
 * il match a tutte le varianti del gruppo (incluse abbreviazioni con punto opzionale).
 *
 * @type {string[][]}
 */
export const LABEL_SYNONYM_GROUPS = [
  ['doc', 'documento', 'all', 'allegato'],
];

/**
 * Pattern stringa per il prefisso OBBLIGATORIO (doc./allegato/ecc. + n. opzionale).
 * Usato nel Caso A di buildSearchRegex (label solo numero).
 * Il prefisso è obbligatorio per evitare falsi match su numeri isolati (importi, date, P.IVA).
 * Esportata per i test.
 * @type {string}
 */
export const SYNONYMS_PREFIX_PATTERN =
  '(?:doc\\.?|documento|all\\.?|allegato)\\s+(?:n\\.?\\s*)?';

/**
 * Crea una RegExp flessibile per trovare un'etichetta nel testo del PDF.
 *
 * **Caso A — label è solo un numero (es. "1", "11", "100"):**
 * Costruisce una regex con prefisso OBBLIGATORIO:
 *   (?:doc\.?|documento|all\.?|allegato)\s+(?:n\.?\s*)?NUMERO(?![a-zA-Z0-9])
 * Il prefisso è obbligatorio → evita falsi match su numeri isolati (importi, date, P.IVA).
 * Fa match su "allegato 1", "doc. 1", "allegato n. 1", "Documento n. 1", "all. 1" ecc.
 * Lookahead negativo → "1" non fa match su "11", "1a", "1bis" (senza spazio).
 *
 * **Caso B — label contiene un prefisso (es. "doc. 1", "allegato A"):**
 * Comportamento esistente con espansione sinonimi.
 *
 * @param {string} label - Es. "1", "11", "doc. 1", "allegato 2"
 * @returns {RegExp}
 */
export function buildSearchRegex(label) {
  const normalized = label.trim();

  // Caso A: label è solo un numero (posizione 1-based)
  if (/^\d+$/.test(normalized)) {
    const numEscaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Prefisso OBBLIGATORIO: evita match su numeri isolati (importi, P.IVA, date).
    // (?<!\d) = lookbehind negativo: il numero non può essere preceduto da un'altra cifra.
    // Questo evita che label "1" faccia match su "11" o "111":
    //   "doc. 11" → la "1" è preceduta da "1" → no match ✓
    //   "doc. 1"  → la "1" è preceduta da " " → match ✓
    // (?![a-zA-Z0-9]) = lookahead negativo: nessuna lettera o cifra dopo il numero.
    return new RegExp(SYNONYMS_PREFIX_PATTERN + '(?<!\\d)' + numEscaped + '(?![a-zA-Z0-9])', 'i');
  }

  // Caso B: label contiene un prefisso (comportamento esistente con sinonimi)
  const tokens = normalized.match(/[a-zA-ZàèéìòùÀÈÉÌÒÙ]+|\d+/g) || [];
  if (tokens.length === 0) {
    return new RegExp('(?!)', 'i'); // regex che non fa mai match
  }

  /**
   * Trova il gruppo sinonimi a cui appartiene un token (case-insensitive).
   * @param {string} token
   * @returns {string[] | null}
   */
  function findSynonymGroup(token) {
    const lower = token.toLowerCase();
    for (const group of LABEL_SYNONYM_GROUPS) {
      if (group.includes(lower)) return group;
    }
    return null;
  }

  /**
   * Trasforma un sinonimo in un pattern regex.
   * Le abbreviazioni brevi (≤ 4 char) ottengono il punto opzionale: doc → doc\.?
   * Le parole lunghe non hanno punto opzionale: documento → documento
   * @param {string} syn
   * @returns {string}
   */
  function synonymToPattern(syn) {
    const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return syn.length <= 4 ? escaped + '\\.?' : escaped;
  }

  const patternParts = tokens.map((t, i) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (i === 0) {
      const group = findSynonymGroup(t);
      if (group) {
        const alternatives = group.map(synonymToPattern).join('|');
        return `(?:${alternatives})`;
      }
    }
    return escaped;
  });

  const pattern = patternParts.join('[\\s.]*');
  // Lookahead negativo: evita falsi positivi "doc. 1" → "doc. 11" o "doc. 1a"
  return new RegExp(pattern + '(?![a-zA-Z0-9])', 'i');
}

// ===== Lettura coordinate testo =====

/**
 * Estrae testo con coordinate per-carattere da una pagina mupdf tramite walk.
 * Raggruppa i caratteri in "run" fisici: spezza quando la Y cambia
 * (paragrafo che va a capo = char con Y diversa nella stessa line mupdf).
 *
 * Usa 'preserve-whitespace' senza 'preserve-spans': mupdf unisce span contigui
 * sulla stessa riga anche se hanno font diversi (es. regular + bold in Word).
 * Necessario per trovare etichette come "doc. 1" quando il numero è in grassetto.
 *
 * @param {object} page - Pagina mupdf (da doc.loadPage)
 * @returns {Array<{text: string, chars: Array<{c: string, quad: number[]}>}>}
 */
function extractCharRuns(page) {
  const stext = page.toStructuredText('preserve-whitespace');
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
 * Normalizza caratteri Unicode "invisibili" nel testo estratto da PDF.
 * Converte varianti di spazio in spazio normale per gestire PDF da Word
 * che usano NBSP (U+00A0) tra abbreviazioni e numeri (es. "doc.·1").
 *
 * La sostituzione è sempre 1:1 (non rimuove caratteri) per preservare
 * il mapping tra run.text e run.chars usato in matchBoundsFromChars.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeRunText(text) {
  return text
    .replace(/\u00A0/g, ' ')   // Non-breaking space → spazio normale
    .replace(/\u00AD/g, ' ')   // Soft hyphen → spazio
    .replace(/\u200B/g, ' ')   // Zero-width space → spazio
    .replace(/\u202F/g, ' ')   // Narrow no-break space → spazio
    .replace(/\u2009/g, ' ');  // Thin space → spazio
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
      const normalizedText = normalizeRunText(run.text);
      if (!normalizedText.trim() || !regex.test(normalizedText)) continue;

      const bounds = matchBoundsFromChars(normalizedText, regex, run.chars);
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
          F:  PDFString.of(ann.targetFile),   // PDFString per path relativo ASCII
          UF: PDFString.of(ann.targetFile),   // PDFString per path relativo Unicode
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
 * @property {string[]} unsupportedPatterns - pattern bis/ter trovati ma non linkati
 */

/**
 * Scansiona il testo del PDF cercando pattern {prefisso}{N}bis/ter/quater
 * (senza spazio tra numero e suffisso) che non vengono linkati.
 *
 * @param {object} doc - Documento mupdf già aperto
 * @returns {string[]} Array di pattern trovati (es. ["doc. 1bis", "allegato 2ter"])
 */
function findUnsupportedBisPatterns(doc) {
  const bisRegex = /(?:doc\.?|documento|all\.?|allegato|att\.?|attaccato)\s*(?:n\.?\s*)?\d+(?:bis|ter|quater|quinquies)/gi;
  const found = new Set();
  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const stext = page.toStructuredText('preserve-whitespace');
    const text = stext.asText();
    let m;
    while ((m = bisRegex.exec(text)) !== null) {
      found.add(m[0].trim());
    }
    page.destroy();
  }
  return [...found];
}

/**
 * Verifica se un PDF contiene testo selezionabile sufficiente (PDF nativo).
 * Un PDF scansionato puro avrà 0 o pochissimi caratteri estratti.
 *
 * Soglie:
 * - totalChars < 100 → PDF non nativo (scansione pura) — errore bloccante
 * - totalChars / numPages < 50 → sospetto OCR superficiale — warning non bloccante
 *
 * @param {string} pdfPath - Percorso assoluto del PDF
 * @returns {Promise<{ isNative: boolean, totalChars: number, numPages: number, warning: string|null }>}
 */
export async function checkPdfNativity(pdfPath) {
  const buffer = await fs.promises.readFile(pdfPath);
  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
  const numPages = doc.countPages();
  let totalChars = 0;

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i);
    const stext = page.toStructuredText('preserve-whitespace');
    totalChars += stext.asText().length;
    page.destroy();
  }

  const isNative = totalChars >= 100;
  let warning = null;
  if (isNative && numPages > 0 && totalChars / numPages < 50) {
    warning = 'PDF_LOW_TEXT_DENSITY';
  }

  return { isNative, totalChars, numPages, warning };
}

/**
 * Processo completo PCT:
 * 1. Copia allegati nella outputFolder
 * 2. Cerca le etichette nel PDF principale
 * 3. Aggiunge annotazioni link al PDF modificato
 * 4. Segnala pattern bis/ter/quater non supportati
 * 5. Restituisce un report (mai lancia eccezione per etichette non trovate)
 *
 * @param {ProcessInput} input
 * @returns {Promise<ProcessResult>}
 */
export async function processPCTDocument({ mainPdfPath, attachments, outputFolder }) {
  // 0. Apri il documento mupdf una sola volta per rilevare pattern non supportati
  const mainBuffer = await fs.promises.readFile(mainPdfPath);
  let mupdfDoc;
  try {
    mupdfDoc = mupdf.Document.openDocument(new Uint8Array(mainBuffer), 'application/pdf');
  } catch (err) {
    if (err.message?.toLowerCase().includes('password')) {
      throw new Error(`Il PDF è protetto da password: ${path.basename(mainPdfPath)}`);
    }
    throw new Error(`PDF non leggibile o corrotto: ${path.basename(mainPdfPath)} — ${err.message}`);
  }

  // Verifica natività del PDF (nativo testuale vs scansione)
  let nativityWarning = null;
  {
    const numPages = mupdfDoc.countPages();
    let totalChars = 0;
    for (let i = 0; i < numPages; i++) {
      const pg = mupdfDoc.loadPage(i);
      totalChars += pg.toStructuredText('preserve-whitespace').asText().length;
      pg.destroy();
    }
    if (totalChars < 100) {
      throw new Error(
        `Il PDF sembra una scansione (${totalChars} caratteri estratti): i link non possono essere aggiunti. ` +
        `Usa un PDF nativo testuale.`
      );
    }
    if (numPages > 0 && totalChars / numPages < 50) {
      nativityWarning = 'PDF_LOW_TEXT_DENSITY';
      console.log(`[PDF] Attenzione: bassa densità di testo (${Math.round(totalChars / numPages)} char/pagina) — possibile OCR superficiale`);
    }
    console.log(`[PDF] Natività OK: ${totalChars} caratteri, ${numPages} pagine`);
  }

  // Rileva pattern bis/ter/quater non supportati
  const unsupportedPatterns = findUnsupportedBisPatterns(mupdfDoc);
  if (unsupportedPatterns.length > 0) {
    console.log(`[PDF] Pattern non supportati trovati: ${unsupportedPatterns.join(', ')}`);
  }

  // 1. Copia allegati nella cartella di output
  // Usa att.renamedAs come nome destinazione se fornito (rinomina solo nell'output)
  for (const att of attachments) {
    const destName = att.renamedAs || att.name;
    const destPath = path.join(outputFolder, destName);
    await fs.promises.copyFile(att.path, destPath);
    console.log(`[PDF] Copiato allegato: ${destName}`);
  }

  // 2. Cerca le etichette e raccoglie le annotazioni
  /** @type {Annotation[]} */
  const allAnnotations = [];
  const notFound = [];

  for (const att of attachments) {
    const matches = await findTextCoordinates(mainPdfPath, att.label);
    if (matches.length === 0) {
      notFound.push(`${att.label} — ${att.name}`);
      console.log(`[PDF] Etichetta non trovata: "${att.label}"`);
    } else {
      const destName = att.renamedAs || att.name;
      for (const match of matches) {
        allAnnotations.push({
          pageIndex: match.pageIndex,
          x:         match.x,
          y:         match.y,
          width:     match.width,
          height:    match.height,
          targetFile: destName, // nome relativo — entrambi i file nella stessa cartella
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
    unsupportedPatterns,
    warning: nativityWarning,
  };
}

// ===== Rilevamento e rinomina numerica allegati =====

/**
 * Verifica se il nome file inizia già con un pattern numerico.
 * Pattern supportati: "01_file.pdf", "1-file.pdf", "1 file.pdf", "doc_1_file.pdf".
 *
 * @param {string} name - Nome file (solo il basename, es. "contratto.pdf")
 * @returns {boolean}
 */
export function hasLeadingNumber(name) {
  return /^\d+[-_\s]/.test(name) || /^doc[-_]\d+/i.test(name);
}

/**
 * Rimuove il prefisso numerico iniziale da un nome file se presente.
 * Es: "01_Comparsa.pdf" → "Comparsa.pdf", "doc_1_foo.pdf" → "foo.pdf"
 *
 * @param {string} name
 * @returns {string}
 */
function stripLeadingNumber(name) {
  return name
    .replace(/^doc[-_]\d+[-_\s]?/i, '') // doc_1_ o doc-1-
    .replace(/^\d+[-_\s]/, '');          // 01_ o 1-
}

/**
 * Costruisce il nuovo nome file secondo lo schema di rinomina scelto.
 * Se il file ha già un numero iniziale, lo rimuove prima di applicare il nuovo schema.
 *
 * @param {string} originalName - Nome file originale (es. "01_contratto.pdf")
 * @param {'numbered'|'doc_'|'allegato_'} scheme - Schema di rinomina
 * @param {number} index - Numero 1-based (già calcolato con startIndex)
 * @param {number} [total=1] - Numero totale di allegati (per calcolare zero-padding)
 * @returns {string} Nuovo nome file
 */
export function buildRenamedName(originalName, scheme, index, total = 1) {
  // Rimuove numero iniziale esistente prima di applicare lo schema
  const baseName = stripLeadingNumber(originalName);

  // Calcola zero-padding in base al totale
  const padLen = total <= 9 ? 1 : total <= 99 ? 2 : 3;
  const padded = String(index).padStart(padLen, '0');

  switch (scheme) {
    case 'numbered':  return `${padded}_${baseName}`;
    case 'doc_':      return `doc_${padded}_${baseName}`;
    case 'allegato_': return `allegato_${padded}_${baseName}`;
    default:          return originalName;
  }
}
