/**
 * src/shared/types.js
 * Costanti IPC e @typedef JSDoc condivisi tra Main e Renderer.
 * Importa da qui — non hardcodare le stringhe dei canali.
 */

/**
 * Prefisso default per le etichette degli allegati (es. "doc.").
 * Importa da qui — non hardcodare nei file.
 * @type {string}
 */
export const DEFAULT_ATTACHMENT_PREFIX = 'doc.';

/**
 * Separatore default tra prefisso e numero dell'allegato (es. " ").
 * Importa da qui — non hardcodare nei file.
 * @type {string}
 */
export const DEFAULT_ATTACHMENT_SEPARATOR = ' ';

/**
 * Costanti per i canali IPC.
 * Mai hardcodare queste stringhe nei file — importa sempre da qui.
 *
 * @enum {string}
 */
export const IPC_CHANNELS = {
  PDF_PROCESS:          'pdf:process',
  DIALOG_SELECT_FOLDER: 'dialog:selectOutputFolder',
};

/**
 * @typedef {Object} Attachment
 * @property {string}  path        - Percorso assoluto del file allegato
 * @property {string}  name        - Nome file (es. "allegato_1.pdf")
 * @property {string}  label       - Etichetta di ricerca nell'atto (es. "doc. 1")
 * @property {boolean} customLabel - true se l'utente ha modificato manualmente l'etichetta
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
 * @property {boolean}  success                - Sempre true (anche con notFound)
 * @property {number}   processedAnnotations   - Numero totale annotazioni aggiunte
 * @property {string[]} notFound               - Etichette non trovate nel PDF
 */
