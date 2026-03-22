/**
 * renderer.js — Logica UI del renderer Electron.
 * Nessun accesso a Node.js o fs. Solo window.electronAPI per comunicare col main.
 */

// ===== Stato applicazione =====

/** @type {string|null} Percorso assoluto del PDF atto principale */
let mainPdfPath = null;

/**
 * @typedef {Object} Attachment
 * @property {string} path   - Percorso assoluto del file
 * @property {string} name   - Nome file
 * @property {string} label  - Etichetta di ricerca (es. "doc. 1")
 * @property {string} id     - ID univoco per la lista
 */

/** @type {Attachment[]} */
let attachments = [];

let nextId = 0;

// ===== Riferimenti DOM =====

const dropZoneMain = document.getElementById('drop-zone-main');
const inputMainPdf = document.getElementById('input-main-pdf');
const mainPdfInfo = document.getElementById('main-pdf-info');
const mainPdfName = document.getElementById('main-pdf-name');
const mainPdfPath_el = document.getElementById('main-pdf-path');
const btnRemoveMain = document.getElementById('btn-remove-main');

const dropZoneAttachments = document.getElementById('drop-zone-attachments');
const inputAttachments = document.getElementById('input-attachments');
const attachmentsList = document.getElementById('attachments-list');

const btnGenerate = document.getElementById('btn-generate');

const statusArea = document.getElementById('status-area');
const statusMessage = document.getElementById('status-message');
const notFoundList = document.getElementById('not-found-list');

// ===== Drag & drop: atto principale =====

dropZoneMain.addEventListener('click', () => inputMainPdf.click());
dropZoneMain.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') inputMainPdf.click();
});

dropZoneMain.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZoneMain.classList.add('drag-over');
});
dropZoneMain.addEventListener('dragleave', () => dropZoneMain.classList.remove('drag-over'));
dropZoneMain.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZoneMain.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (files.length > 0) setMainPdf(files[0]);
});

inputMainPdf.addEventListener('change', () => {
  if (inputMainPdf.files.length > 0) setMainPdf(inputMainPdf.files[0]);
  inputMainPdf.value = '';
});

btnRemoveMain.addEventListener('click', clearMainPdf);

/**
 * Imposta il PDF atto principale.
 * @param {File} file
 */
function setMainPdf(file) {
  mainPdfPath = window.electronAPI.getPathForFile(file);
  mainPdfName.textContent = file.name;
  mainPdfPath_el.textContent = mainPdfPath;
  mainPdfInfo.hidden = false;
  dropZoneMain.hidden = true;
  updateGenerateButton();
}

function clearMainPdf() {
  mainPdfPath = null;
  mainPdfInfo.hidden = true;
  dropZoneMain.hidden = false;
  updateGenerateButton();
}

// ===== Drag & drop: allegati =====

const ACCEPTED_EXTENSIONS = ['.pdf', '.eml', '.msg', '.jpg', '.jpeg'];

dropZoneAttachments.addEventListener('click', () => inputAttachments.click());
dropZoneAttachments.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') inputAttachments.click();
});

dropZoneAttachments.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZoneAttachments.classList.add('drag-over');
});
dropZoneAttachments.addEventListener('dragleave', () => dropZoneAttachments.classList.remove('drag-over'));
dropZoneAttachments.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZoneAttachments.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f =>
    ACCEPTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
  );
  files.forEach(addAttachment);
});

inputAttachments.addEventListener('change', () => {
  Array.from(inputAttachments.files).forEach(addAttachment);
  inputAttachments.value = '';
});

/**
 * Aggiunge un file alla lista allegati.
 * @param {File} file
 */
function addAttachment(file) {
  const idx = attachments.length + 1;
  attachments.push({
    id: String(nextId++),
    path: window.electronAPI.getPathForFile(file),
    name: file.name,
    label: `doc. ${idx}`,
  });
  renderAttachmentsList();
  updateGenerateButton();
}

/**
 * Rimuove un allegato per ID.
 * @param {string} id
 */
function removeAttachment(id) {
  attachments = attachments.filter(a => a.id !== id);
  renumberDefaultLabels();
  renderAttachmentsList();
  updateGenerateButton();
}

/**
 * Sposta un allegato su o giù nella lista.
 * @param {string} id
 * @param {'up'|'down'} direction
 */
function moveAttachment(id, direction) {
  const idx = attachments.findIndex(a => a.id === id);
  if (idx === -1) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= attachments.length) return;
  [attachments[idx], attachments[newIdx]] = [attachments[newIdx], attachments[idx]];
  renderAttachmentsList();
}

/**
 * Aggiorna l'etichetta di ricerca di un allegato.
 * @param {string} id
 * @param {string} label
 */
function updateLabel(id, label) {
  const att = attachments.find(a => a.id === id);
  if (att) att.label = label;
}

/**
 * Rinumera le etichette che hanno ancora il formato default "doc. N"
 * dopo una rimozione, solo se non sono state modificate manualmente.
 */
function renumberDefaultLabels() {
  // Non rinumera etichette modificate manualmente — mantiene coerenza
  // Decisione conservativa: l'utente deve aggiornare manualmente se sposta
}

/**
 * Renderizza la lista allegati nel DOM.
 */
function renderAttachmentsList() {
  attachmentsList.innerHTML = '';
  attachments.forEach((att, idx) => {
    const li = document.createElement('li');
    li.className = 'attachment-item';
    li.dataset.id = att.id;

    li.innerHTML = `
      <span class="att-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
      <input
        type="text"
        class="att-label-input"
        value="${escapeHtml(att.label)}"
        placeholder="es. doc. 1"
        aria-label="Etichetta di ricerca per ${escapeHtml(att.name)}"
      />
      <div class="attachment-controls">
        <button class="btn-move btn-up" aria-label="Sposta su" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-move btn-down" aria-label="Sposta giù" ${idx === attachments.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn-remove btn-del" aria-label="Rimuovi allegato">✕</button>
      </div>
    `;

    li.querySelector('.att-label-input').addEventListener('input', (e) => {
      updateLabel(att.id, e.target.value);
    });
    li.querySelector('.btn-up').addEventListener('click', () => moveAttachment(att.id, 'up'));
    li.querySelector('.btn-down').addEventListener('click', () => moveAttachment(att.id, 'down'));
    li.querySelector('.btn-del').addEventListener('click', () => removeAttachment(att.id));

    attachmentsList.appendChild(li);
  });
}

// ===== Pulsante Genera Link =====

function updateGenerateButton() {
  btnGenerate.disabled = !(mainPdfPath && attachments.length > 0);
}

btnGenerate.addEventListener('click', async () => {
  // 1. Seleziona cartella di output
  const outputFolder = await window.electronAPI.selectOutputFolder();
  if (!outputFolder) return; // utente ha annullato

  // 2. Avvia elaborazione
  setStatus('info', 'Elaborazione in corso…');
  btnGenerate.disabled = true;

  try {
    const result = await window.electronAPI.processPDF({
      mainPdfPath,
      attachments: attachments.map(a => ({ path: a.path, name: a.name, label: a.label })),
      outputFolder,
    });

    if (result.notFound.length > 0) {
      setStatus('warning',
        `Completato con avvisi: ${result.processedAnnotations} annotazioni aggiunte. ` +
        `Le seguenti etichette non sono state trovate nel PDF:`
      );
      showNotFound(result.notFound);
    } else {
      setStatus('success',
        `Completato ✓ — ${result.processedAnnotations} annotazioni aggiunte. ` +
        `File salvati in: ${outputFolder}`
      );
    }
  } catch (err) {
    setStatus('error', `Errore durante l'elaborazione: ${err.message}`);
  } finally {
    updateGenerateButton();
  }
});

// ===== Utilità UI =====

/**
 * Mostra un messaggio di stato.
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {string} text
 */
function setStatus(type, text) {
  statusArea.hidden = false;
  statusMessage.className = `status-message ${type}`;
  statusMessage.textContent = text;
  notFoundList.hidden = true;
  notFoundList.innerHTML = '';
}

/**
 * Mostra la lista di etichette non trovate.
 * @param {string[]} labels
 */
function showNotFound(labels) {
  notFoundList.hidden = false;
  notFoundList.innerHTML = labels
    .map(l => `<li>${escapeHtml(l)}</li>`)
    .join('');
}

/**
 * Escapa caratteri HTML pericolosi per l'inserimento in innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
