/**
 * src/shared/types.js
 * Costanti IPC e @typedef JSDoc condivisi tra Main e Renderer.
 * Importa da qui — non hardcodare le stringhe dei canali.
 */

/**
 * Costanti per i canali IPC.
 * Mai hardcodare queste stringhe nei file — importa sempre da qui.
 *
 * @enum {string}
 */
export const IPC_CHANNELS = {
  PDF_PROCESS:          'pdf:process',
  DIALOG_SELECT_FOLDER: 'dialog:selectOutputFolder',
  READ_PDF_BASE64:      'read-pdf-as-base64',
};

/**
 * @typedef {Object} Attachment
 * @property {string}  path       - Percorso assoluto del file allegato
 * @property {string}  name       - Nome file originale (es. "contratto.pdf")
 * @property {string}  label      - Etichetta di ricerca nell'atto (numero di posizione, es. "1")
 * @property {string}  [renamedAs] - Nome da usare nella cartella di output (opzionale, rinomina solo l'output)
 */

/**
 * @typedef {Object} AnnotationCoord
 * @property {number} pageIndex   - Indice pagina 0-based
 * @property {number} x           - Coordinata X (sistema pdfjs, punti)
 * @property {number} y           - Coordinata Y baseline (sistema pdfjs, bottom-up)
 * @property {number} width       - Larghezza in punti
 * @property {number} height      - Altezza in punti
 * @property {string} matchedText - Testo che ha fatto match con la label
 */

/**
 * @typedef {Object} ProcessInput
 * @property {string}       mainPdfPath  - Percorso assoluto PDF atto principale
 * @property {Attachment[]} attachments  - Lista allegati con label di ricerca
 * @property {string}       outputFolder - Percorso assoluto cartella di output
 */

/**
 * @typedef {Object} ProcessResult
 * @property {boolean}       success                - Sempre true (anche con notFound)
 * @property {number}        processedAnnotations   - Numero totale annotazioni aggiunte
 * @property {string[]}      notFound               - Etichette non trovate nel PDF
 * @property {string[]}      unsupportedPatterns    - Pattern bis/ter/quater trovati ma non linkati
 * @property {string|null}   [warning]              - 'PDF_LOW_TEXT_DENSITY' se OCR sospetto, null altrimenti
 */
