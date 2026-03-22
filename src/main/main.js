import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mupdf from 'mupdf';
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
    height: 780,
    minWidth: 800,
    minHeight: 620,
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
  /**
   * Renderizza una pagina del PDF come JPEG e la restituisce come base64.
   * Usato per l'anteprima nel renderer con navigazione multi-pagina.
   *
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {{ filePath: string, pageIndex: number }} param
   * @returns {Promise<{ base64: string, totalPages: number }>}
   */
  ipcMain.handle(IPC_CHANNELS.RENDER_PDF_PAGE, async (_event, { filePath, pageIndex = 0 }) => {
    const buffer = await fs.promises.readFile(filePath);
    const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
    const totalPages = doc.countPages();
    const page = doc.loadPage(pageIndex);
    const pixmap = page.toPixmap([1.5, 0, 0, 1.5, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    const jpegBytes = pixmap.asJPEG(85);
    return { base64: Buffer.from(jpegBytes).toString('base64'), totalPages };
  });

  /**
   * Chiude l'applicazione.
   */
  ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => {
    app.quit();
  });

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
    const notifBody = result.notFound.length > 0
      ? `${result.notFound.length} allegati non trovati nell'atto — controlla che i riferimenti siano presenti nel testo.`
      : `Completato — ${result.processedAnnotations} link agli allegati inseriti nell'atto.`;
    new Notification({ title: 'PCT Link Generator', body: notifBody }).show();
    return result;
  });

  /**
   * Apre una cartella nel file manager di sistema (Finder/Explorer).
   *
   * @param {Electron.IpcMainInvokeEvent} _event
   * @param {string} folderPath - Percorso assoluto della cartella da aprire
   * @returns {Promise<void>}
   */
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_event, folderPath) => {
    await shell.openPath(folderPath);
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
