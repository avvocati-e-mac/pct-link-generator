'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// IPC_CHANNELS inline — il preload deve essere CJS (Electron non supporta ESM nel preload)
// Le costanti sono duplicate da src/shared/types.js per evitare import ESM
const IPC_CHANNELS = {
  PDF_PROCESS:          'pdf:process',
  DIALOG_SELECT_FOLDER: 'dialog:selectOutputFolder',
};

/**
 * Espone un'API minimale e sicura al Renderer tramite contextBridge.
 * Non espone ipcRenderer direttamente.
 *
 * Disponibile nel renderer come window.electronAPI.*
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Avvia l'elaborazione PCT del PDF principale con gli allegati.
   *
   * @param {{ mainPdfPath: string, attachments: Array<{path: string, name: string, label: string}>, outputFolder: string }} data
   * @returns {Promise<{ success: boolean, processedAnnotations: number, notFound: string[] }>}
   */
  processPDF: (data) => ipcRenderer.invoke(IPC_CHANNELS.PDF_PROCESS, data),

  /**
   * Apre il dialogo di selezione cartella di output.
   *
   * @returns {Promise<string|null>} Percorso scelto o null se annullato.
   */
  selectOutputFolder: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),

  /**
   * Restituisce il percorso assoluto di un File object droppato nel renderer.
   * Necessario perché con contextIsolation il renderer non ha accesso a Node.js.
   *
   * @param {File} file - Il File object dall'evento drop
   * @returns {string} Percorso assoluto del file
   */
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
