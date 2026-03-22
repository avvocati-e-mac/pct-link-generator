import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  processPDF: (data) => ipcRenderer.invoke('pdf:process', data),

  /**
   * Apre il dialogo di selezione cartella di output.
   *
   * @returns {Promise<string|null>} Percorso scelto o null se annullato.
   */
  selectOutputFolder: () => ipcRenderer.invoke('dialog:selectOutputFolder'),

  /**
   * Restituisce il percorso assoluto di un File object droppato nel renderer.
   * Necessario perché con contextIsolation il renderer non ha accesso a Node.js.
   *
   * @param {File} file - Il File object dall'evento drop
   * @returns {string} Percorso assoluto del file
   */
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
