import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { processPCTDocument } from './pdf-processor.js';
import { IPC_CHANNELS } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {BrowserWindow | null} */
let mainWindow = null;

/**
 * Crea la finestra principale dell'applicazione.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // disabilitato per consentire webUtils nel renderer
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Registra tutti gli handler IPC.
 * Nessuna logica PDF qui — solo bridge tra Renderer e pdf-processor.js.
 */
function registerIpcHandlers() {
  /**
   * Apre il dialogo di selezione cartella di output.
   * @returns {Promise<string|null>} Percorso della cartella scelta, o null se annullato.
   */
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Seleziona cartella di output',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  /**
   * Avvia l'elaborazione PCT: trova etichette nel PDF principale e aggiunge
   * annotazioni link che puntano agli allegati.
   *
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {{ mainPdfPath: string, attachments: Array<{path: string, name: string, label: string}>, outputFolder: string }} data
   * @returns {Promise<{ success: boolean, processedAnnotations: number, notFound: string[] }>}
   */
  ipcMain.handle(IPC_CHANNELS.PDF_PROCESS, async (_event, data) => {
    const { mainPdfPath, attachments, outputFolder } = data;
    console.log(
      `[IPC] pdf:process avviato: ${path.basename(mainPdfPath)}, ` +
      `${attachments.length} allegati, output: ${path.basename(outputFolder)}`
    );
    const result = await processPCTDocument({ mainPdfPath, attachments, outputFolder });
    console.log(
      `[IPC] pdf:process completato: ${result.processedAnnotations} annotazioni, ` +
      `notFound: ${result.notFound.length}`
    );
    return result;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // macOS: ricrea la finestra se l'app è nel dock e non ci sono finestre aperte
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Su macOS è normale che l'app resti attiva anche senza finestre
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
