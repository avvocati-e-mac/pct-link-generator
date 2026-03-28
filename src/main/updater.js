/**
 * updater.js — Auto-update via electron-updater (GitHub Releases).
 *
 * Flusso:
 *   1. checkForUpdates() viene chiamato all'avvio (dopo ready-to-show)
 *   2. Se trovato un aggiornamento: notifica il renderer → mostra banner
 *   3. L'utente clicca "Aggiorna": renderer chiama downloadAndInstall()
 *   4. Progresso scaricamento → eventi IPC verso renderer
 *   5. A download completo: installazione al prossimo quit (quitAndInstall)
 */

// electron-updater è un modulo CJS — non supporta named exports in ESM.
// Usare il default export e destrutturare manualmente.
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { IPC_CHANNELS } from '../shared/types.js';

/** @type {Electron.BrowserWindow | null} */
let _win = null;

/**
 * Invia un evento IPC al renderer (se la finestra è ancora aperta).
 *
 * @param {string} channel
 * @param {unknown} payload
 */
function send(channel, payload) {
  if (_win && !_win.isDestroyed()) {
    _win.webContents.send(channel, payload);
  }
}

/**
 * Configura e avvia il controllo aggiornamenti.
 * Deve essere chiamato dopo che la finestra è pronta (ready-to-show).
 *
 * @param {Electron.BrowserWindow} win - La finestra principale
 */
export function setupUpdater(win) {
  _win = win;

  // Disabilita log verbosi in produzione
  autoUpdater.logger = null;

  // Non installare automaticamente: chiedi all'utente
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload = false;

  // Rimuovi eventuali listener precedenti (evita accumulo in dev con hot-reload)
  autoUpdater.removeAllListeners();

  autoUpdater.on('update-available', (info) => {
    send(IPC_CHANNELS.UPDATE_AVAILABLE, { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    send(IPC_CHANNELS.UPDATE_PROGRESS, { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', () => {
    send(IPC_CHANNELS.UPDATE_DOWNLOADED, {});
  });

  autoUpdater.on('error', (err) => {
    // Log solo il codice/messaggio — mai dati utente
    console.error(`[updater] errore: ${err.message}`);
  });

  // Controlla in background — non blocca l'avvio
  autoUpdater.checkForUpdates().catch((err) => {
    console.error(`[updater] checkForUpdates fallito: ${err.message}`);
  });
}

/**
 * Scarica l'aggiornamento disponibile.
 * Chiamato via IPC quando l'utente clicca "Aggiorna ora".
 *
 * @returns {Promise<void>}
 */
export async function downloadUpdate() {
  await autoUpdater.downloadUpdate();
}

/**
 * Installa l'aggiornamento scaricato e riavvia l'app.
 * Chiamato via IPC quando l'utente clicca "Riavvia" dopo il download.
 */
export function quitAndInstall() {
  autoUpdater.quitAndInstall();
}
