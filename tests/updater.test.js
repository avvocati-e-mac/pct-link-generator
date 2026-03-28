/**
 * tests/updater.test.js
 * Test unitari per src/main/updater.js.
 *
 * Strategia di mock:
 * - electron-updater: sostituito con un EventEmitter controllabile via vi.hoisted + vi.mock
 * - electron: stub minimale (solo app.isPackaged usato da updater.js)
 * - BrowserWindow: oggetto semplice con webContents.send mockato
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock di electron-updater ──────────────────────────────────────────────
// vi.hoisted garantisce che la const sia disponibile dentro vi.mock()
// (che viene hoistato prima degli import dal transpiler Vitest).
const mockAutoUpdater = vi.hoisted(() => {
  const { EventEmitter } = require('events');
  const m = new EventEmitter();
  m.logger = null;
  m.autoInstallOnAppQuit = false;
  m.autoDownload = true;
  m.checkForUpdates = vi.fn().mockResolvedValue(undefined);
  m.downloadUpdate = vi.fn().mockResolvedValue(undefined);
  m.quitAndInstall = vi.fn();
  return m;
});

// updater.js usa `import pkg from 'electron-updater'; const { autoUpdater } = pkg;`
// quindi il mock deve esporre sia il default export che il named export.
vi.mock('electron-updater', () => ({
  default: { autoUpdater: mockAutoUpdater },
  autoUpdater: mockAutoUpdater,
}));

// ─── Mock minimale di electron ─────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

// ─── Import del modulo sotto test ──────────────────────────────────────────
import { setupUpdater, downloadUpdate, quitAndInstall } from '../src/main/updater.js';

// ─── Helper: finestra mock ─────────────────────────────────────────────────
/**
 * Crea un mock minimale di BrowserWindow.
 * @param {boolean} destroyed - Simula finestra già distrutta
 */
function makeMockWin(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  };
}

// ──────────────────────────────────────────────────────────────────────────
describe('setupUpdater', () => {
  beforeEach(() => {
    // Reset listeners e spy tra i test
    mockAutoUpdater.removeAllListeners();
    vi.clearAllMocks();
  });

  it('chiama checkForUpdates all\'inizializzazione', () => {
    setupUpdater(makeMockWin());
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('invia UPDATE_AVAILABLE al renderer con la versione corretta', () => {
    const win = makeMockWin();
    setupUpdater(win);
    mockAutoUpdater.emit('update-available', { version: '1.2.3' });
    expect(win.webContents.send).toHaveBeenCalledWith('update:available', { version: '1.2.3' });
  });

  it('invia UPDATE_PROGRESS con percent arrotondato al numero intero', () => {
    const win = makeMockWin();
    setupUpdater(win);
    mockAutoUpdater.emit('download-progress', { percent: 45.7 });
    expect(win.webContents.send).toHaveBeenCalledWith('update:progress', { percent: 46 });
  });

  it('invia UPDATE_DOWNLOADED al renderer con arch e platform', () => {
    const win = makeMockWin();
    setupUpdater(win);
    mockAutoUpdater.emit('update-downloaded', { version: '0.5.4' });
    expect(win.webContents.send).toHaveBeenCalledWith('update:downloaded', {
      version: '0.5.4',
      arch: process.arch,
      platform: process.platform,
    });
  });

  it('non invia messaggi IPC se la finestra è già distrutta', () => {
    const win = makeMockWin(true);
    setupUpdater(win);
    mockAutoUpdater.emit('update-available', { version: '1.0.0' });
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('non lancia se checkForUpdates rigetta (es. rete assente)', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error('net::ERR_NAME_NOT_RESOLVED')
    );
    expect(() => setupUpdater(makeMockWin())).not.toThrow();
    // Flush della promise rejected per evitare unhandledRejection nel test runner
    await new Promise((r) => setTimeout(r, 10));
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('downloadUpdate', () => {
  it('delega ad autoUpdater.downloadUpdate', async () => {
    await downloadUpdate();
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledOnce();
  });
});

// ──────────────────────────────────────────────────────────────────────────
describe('quitAndInstall', () => {
  it('delega ad autoUpdater.quitAndInstall', () => {
    quitAndInstall();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });
});
