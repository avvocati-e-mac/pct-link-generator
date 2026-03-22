/**
 * renderer.js — Logica UI del renderer Electron.
 * Nessun accesso a Node.js o fs. Solo window.electronAPI per comunicare col main.
 */

import { DEFAULT_ATTACHMENT_PREFIX, DEFAULT_ATTACHMENT_SEPARATOR } from '../shared/types.js';

// ===== Stato applicazione =====

/** @type {string|null} Percorso assoluto del PDF atto principale */
let mainPdfPath = null;

/**
 * @typedef {Object} Attachment
 * @property {string}  path        - Percorso assoluto del file
 * @property {string}  name        - Nome file
 * @property {string}  label       - Etichetta di ricerca (es. "doc. 1")
 * @property {string}  id          - ID univoco per la lista
 * @property {boolean} customLabel - true se l'utente ha modificato manualmente l'etichetta
 */

/** @type {Attachment[]} */
let attachments = [];

let nextId = 0;

/** @type {Set<string>} IDs degli allegati selezionati */
let selectedIds = new Set();

/** @type {string|null} ID dell'ultimo allegato cliccato (per Shift+Click) */
let lastClickedId = null;

/** @type {string|null} ID dell'allegato in fase di drag */
let draggingId = null;

// ===== Rilevamento OS (per Cmd vs Ctrl) =====
const isMac = navigator.platform.includes('Mac');

// ===== Formati allegati ammessi PCT 2024 =====
// Vigenti dal 30 settembre 2024 — DM n. 44/2011 art. 34
const ACCEPTED_EXTENSIONS = [
  '.pdf', '.rtf',
  '.jpg', '.jpeg', '.tif', '.tiff', '.gif', '.dcm',
  '.mp4', '.m4v', '.mov', '.mpg', '.mpeg', '.avi',
  '.mp3', '.flac', '.raw', '.wav', '.aiff', '.aif',
  '.txt', '.xml', '.html', '.htm',
  '.eml', '.msg',
  '.zip', '.rar', '.arj',
];

// ===== Riferimenti DOM =====

const viewStep1           = document.getElementById('view-step1');
const viewStep2           = document.getElementById('view-step2');

const dropZoneMain        = document.getElementById('drop-zone-main');
const inputMainPdf        = document.getElementById('input-main-pdf');
const mainPdfInfo         = document.getElementById('main-pdf-info');
const mainPdfNameEl       = document.getElementById('main-pdf-name');
const mainPdfPathEl       = document.getElementById('main-pdf-path');
const btnRemoveMain       = document.getElementById('btn-remove-main');
const btnNext             = document.getElementById('btn-next');

const dropZoneAttachments = document.getElementById('drop-zone-attachments');
const inputAttachments    = document.getElementById('input-attachments');
const attachmentsList     = document.getElementById('attachments-list');
const btnGenerate         = document.getElementById('btn-generate');
const btnBack             = document.getElementById('btn-back');
const bulkRemoveRow       = document.getElementById('bulk-remove-row');
const btnRemoveSelected   = document.getElementById('btn-remove-selected');

const inputPrefix         = document.getElementById('input-prefix');
const inputSeparator      = document.getElementById('input-separator');
const inputStartNum       = document.getElementById('input-start-num');
const inputUseLetters     = document.getElementById('input-use-letters');

const statusArea          = document.getElementById('status-area');
const statusMessage       = document.getElementById('status-message');
const notFoundList        = document.getElementById('not-found-list');

const modalPreview        = document.getElementById('modal-preview');
const previewMainPdf      = document.getElementById('preview-main-pdf');
const previewTbody        = document.getElementById('preview-tbody');
const btnModalCancel      = document.getElementById('btn-modal-cancel');
const btnModalConfirm     = document.getElementById('btn-modal-confirm');

// ===== Navigazione Step 1 ↔ Step 2 =====

/**
 * Mostra lo step 1 (atto principale), nasconde lo step 2.
 */
function showStep1() {
  viewStep1.classList.remove('hidden');
  viewStep2.classList.add('hidden');
}

/**
 * Mostra lo step 2 (allegati), nasconde lo step 1.
 */
function showStep2() {
  viewStep1.classList.add('hidden');
  viewStep2.classList.remove('hidden');
}

btnNext.addEventListener('click', () => {
  if (mainPdfPath) showStep2();
});

btnBack.addEventListener('click', () => {
  showStep1();
});

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
  mainPdfNameEl.textContent = file.name;
  mainPdfPathEl.textContent = mainPdfPath;
  mainPdfInfo.classList.remove('hidden');
  dropZoneMain.classList.add('hidden');
  updateNextButton();
}

/**
 * Rimuove il PDF atto principale.
 */
function clearMainPdf() {
  mainPdfPath = null;
  mainPdfInfo.classList.add('hidden');
  dropZoneMain.classList.remove('hidden');
  updateNextButton();
}

/**
 * Aggiorna lo stato del pulsante "Avanti →".
 */
function updateNextButton() {
  btnNext.disabled = !mainPdfPath;
}

// ===== Drag & drop: allegati =====

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
  // Ignora i drop se si tratta di un riordino (draggingId è impostato)
  if (draggingId !== null) return;
  const files = Array.from(e.dataTransfer.files).filter(f =>
    ACCEPTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
  );
  files.forEach(addAttachment);
});

inputAttachments.addEventListener('change', () => {
  Array.from(inputAttachments.files).forEach(addAttachment);
  inputAttachments.value = '';
});

// ===== Configurazione prefisso =====

/**
 * Costruisce un'etichetta default per un allegato in base alla configurazione corrente.
 *
 * @param {string} prefix     - Prefisso (es. "doc.")
 * @param {string} separator  - Separatore (es. " ")
 * @param {number} startNum   - Numero iniziale (es. 1)
 * @param {boolean} useLetters - Se true usa lettere A, B, C…
 * @param {number} idx        - Indice 0-based nella sequenza dei default
 * @returns {string}
 */
function buildDefaultLabel(prefix, separator, startNum, useLetters, idx) {
  const n = useLetters
    ? String.fromCharCode(65 + (startNum - 1 + idx) % 26)
    : String(startNum + idx);
  return `${prefix}${separator}${n}`;
}

/**
 * Ricalcola le etichette default (non custom) in base alla configurazione corrente del prefisso.
 */
function applyPrefixConfig() {
  const prefix    = inputPrefix.value;
  const separator = inputSeparator.value;
  const startNum  = Math.max(1, parseInt(inputStartNum.value, 10) || 1);
  const useLetters = inputUseLetters.checked;

  let defaultCounter = 0;
  for (const att of attachments) {
    if (!att.customLabel) {
      att.label = buildDefaultLabel(prefix, separator, startNum, useLetters, defaultCounter);
      defaultCounter++;
    }
  }
  renderAttachmentsList();
}

inputPrefix.addEventListener('input', applyPrefixConfig);
inputSeparator.addEventListener('input', applyPrefixConfig);
inputStartNum.addEventListener('input', applyPrefixConfig);
inputUseLetters.addEventListener('change', applyPrefixConfig);

// ===== Gestione allegati =====

/**
 * Aggiunge un file alla lista allegati con etichetta default.
 * @param {File} file
 */
function addAttachment(file) {
  const prefix     = inputPrefix.value;
  const separator  = inputSeparator.value;
  const startNum   = Math.max(1, parseInt(inputStartNum.value, 10) || 1);
  const useLetters = inputUseLetters.checked;

  // Conta quanti allegati NON-custom ci sono già per calcolare l'indice
  const defaultCount = attachments.filter(a => !a.customLabel).length;

  attachments.push({
    id: String(nextId++),
    path: window.electronAPI.getPathForFile(file),
    name: file.name,
    label: buildDefaultLabel(prefix, separator, startNum, useLetters, defaultCount),
    customLabel: false,
  });
  renderAttachmentsList();
  updateGenerateButton();
}

/**
 * Rimuove un allegato per ID. Deseleziona l'ID e rinumera le etichette default.
 * @param {string} id
 */
function removeAttachment(id) {
  attachments = attachments.filter(a => a.id !== id);
  selectedIds.delete(id);
  if (lastClickedId === id) lastClickedId = null;
  renumberDefaultLabels();
  renderAttachmentsList();
  updateGenerateButton();
  updateBulkRemoveButton();
}

/**
 * Rimuove tutti gli allegati selezionati in una sola operazione.
 */
function removeSelectedAttachments() {
  attachments = attachments.filter(a => !selectedIds.has(a.id));
  selectedIds.clear();
  lastClickedId = null;
  renumberDefaultLabels();
  renderAttachmentsList();
  updateGenerateButton();
  updateBulkRemoveButton();
}

/**
 * Sposta un allegato su o giù nella lista (fallback ▲▼).
 * @param {string} id
 * @param {'up'|'down'} direction
 */
function moveAttachment(id, direction) {
  const idx = attachments.findIndex(a => a.id === id);
  if (idx === -1) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= attachments.length) return;
  [attachments[idx], attachments[newIdx]] = [attachments[newIdx], attachments[idx]];
  renumberDefaultLabels();
  renderAttachmentsList();
}

/**
 * Aggiorna l'etichetta di ricerca di un allegato.
 * Marca customLabel = true perché l'utente ha modificato manualmente il campo.
 * @param {string} id
 * @param {string} label
 */
function updateLabel(id, label) {
  const att = attachments.find(a => a.id === id);
  if (att) {
    att.label = label;
    att.customLabel = true;
  }
}

/**
 * Rinumera le etichette default (customLabel !== true) in base alla configurazione corrente.
 * Le etichette modificate manualmente non vengono toccate.
 */
function renumberDefaultLabels() {
  const prefix     = inputPrefix.value;
  const separator  = inputSeparator.value;
  const startNum   = Math.max(1, parseInt(inputStartNum.value, 10) || 1);
  const useLetters = inputUseLetters.checked;

  let defaultCounter = 0;
  for (const att of attachments) {
    if (!att.customLabel) {
      att.label = buildDefaultLabel(prefix, separator, startNum, useLetters, defaultCounter);
      defaultCounter++;
    }
  }
}

// ===== Multi-selezione allegati =====

/**
 * Gestisce la selezione di un allegato con supporto Shift+Click e Cmd/Ctrl+Click.
 * @param {string} id        - ID dell'allegato cliccato
 * @param {MouseEvent} event - Evento del click
 */
function handleAttachmentClick(id, event) {
  const useMetaKey = isMac ? event.metaKey : event.ctrlKey;

  if (event.shiftKey && lastClickedId !== null) {
    // Shift+Click: seleziona range dall'ultimo cliccato all'elemento corrente
    const ids = attachments.map(a => a.id);
    const fromIdx = ids.indexOf(lastClickedId);
    const toIdx   = ids.indexOf(id);
    if (fromIdx !== -1 && toIdx !== -1) {
      const start = Math.min(fromIdx, toIdx);
      const end   = Math.max(fromIdx, toIdx);
      for (let i = start; i <= end; i++) {
        selectedIds.add(ids[i]);
      }
    }
  } else if (useMetaKey) {
    // Cmd+Click (macOS) / Ctrl+Click: toggle singolo
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
  } else {
    // Click semplice: seleziona solo questo
    selectedIds.clear();
    selectedIds.add(id);
  }

  lastClickedId = id;
  renderAttachmentsList();
  updateBulkRemoveButton();
}

/**
 * Aggiorna la visibilità del pulsante "Rimuovi selezionati".
 */
function updateBulkRemoveButton() {
  if (selectedIds.size > 0) {
    bulkRemoveRow.classList.remove('hidden');
  } else {
    bulkRemoveRow.classList.add('hidden');
  }
}

btnRemoveSelected.addEventListener('click', removeSelectedAttachments);

// ===== Drag to reorder (HTML5 Drag & Drop nativo) =====

/**
 * Attiva il drag-to-reorder sull'handle di un elemento della lista.
 * @param {HTMLElement} li    - L'elemento <li> dell'allegato
 * @param {HTMLElement} handle - L'handle di drag
 * @param {string} id         - ID dell'allegato
 */
function attachDragHandlers(li, handle, id) {
  handle.addEventListener('dragstart', (e) => {
    draggingId = id;
    e.dataTransfer.effectAllowed = 'move';
    // Timeout per applicare la classe dopo che il browser ha catturato lo snapshot
    setTimeout(() => li.classList.add('dragging'), 0);
  });

  handle.addEventListener('dragend', () => {
    draggingId = null;
    li.classList.remove('dragging');
    // Rimuovi .drag-over da tutti gli elementi
    document.querySelectorAll('.attachment-item.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  });

  li.addEventListener('dragover', (e) => {
    if (draggingId === null || draggingId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    li.classList.add('drag-over');
  });

  li.addEventListener('dragleave', () => {
    li.classList.remove('drag-over');
  });

  li.addEventListener('drop', (e) => {
    e.preventDefault();
    li.classList.remove('drag-over');
    if (draggingId === null || draggingId === id) return;

    const fromIdx = attachments.findIndex(a => a.id === draggingId);
    const toIdx   = attachments.findIndex(a => a.id === id);
    if (fromIdx === -1 || toIdx === -1) return;

    // Determina se inserire prima o dopo in base alla metà verticale del target
    const rect    = li.getBoundingClientRect();
    const midY    = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midY;

    const [moved] = attachments.splice(fromIdx, 1);
    const newIdx  = insertBefore
      ? (fromIdx < toIdx ? toIdx - 1 : toIdx)
      : (fromIdx < toIdx ? toIdx : toIdx + 1);
    attachments.splice(newIdx, 0, moved);

    draggingId = null;
    renumberDefaultLabels();
    renderAttachmentsList();
  });
}

// ===== Renderizzazione lista allegati =====

/**
 * Renderizza la lista allegati nel DOM con drag handle, selezione e controlli.
 */
function renderAttachmentsList() {
  attachmentsList.innerHTML = '';
  attachments.forEach((att, idx) => {
    const li = document.createElement('li');
    li.className = 'attachment-item';
    if (selectedIds.has(att.id)) li.classList.add('selected');
    li.dataset.id = att.id;

    li.innerHTML = `
      <span class="drag-handle" draggable="true" aria-label="Trascina per riordinare">⠿</span>
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

    const handle = li.querySelector('.drag-handle');
    attachDragHandlers(li, handle, att.id);

    // Click sull'elemento per la selezione (esclusi input e pulsanti)
    li.addEventListener('click', (e) => {
      const target = e.target;
      // Non gestire click su input, pulsanti o drag handle
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.classList.contains('drag-handle')
      ) return;
      handleAttachmentClick(att.id, e);
    });

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

/**
 * Aggiorna lo stato del pulsante "Genera link".
 */
function updateGenerateButton() {
  btnGenerate.disabled = !(mainPdfPath && attachments.length > 0);
}

btnGenerate.addEventListener('click', () => {
  openPreviewModal();
});

// ===== Modale di preview =====

/**
 * Popola e apre la modale di anteprima prima della generazione.
 */
function openPreviewModal() {
  // Popola il nome del file atto principale
  const mainName = mainPdfPath ? mainPdfPath.split('/').pop() : '';
  previewMainPdf.textContent = mainName;

  // Popola la tabella allegati
  previewTbody.innerHTML = '';
  attachments.forEach((att, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</td>
      <td>${escapeHtml(att.label)}</td>
    `;
    previewTbody.appendChild(tr);
  });

  modalPreview.showModal();
}

btnModalCancel.addEventListener('click', () => {
  modalPreview.close();
});

btnModalConfirm.addEventListener('click', async () => {
  modalPreview.close();
  await runGeneration();
});

/**
 * Esegue la generazione effettiva: selezione cartella output + elaborazione PDF.
 */
async function runGeneration() {
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
}

// ===== Utilità UI =====

/**
 * Mostra un messaggio di stato.
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {string} text
 */
function setStatus(type, text) {
  statusArea.classList.remove('hidden');
  statusMessage.className = `status-message ${type}`;
  statusMessage.textContent = text;
  notFoundList.classList.add('hidden');
  notFoundList.innerHTML = '';
}

/**
 * Mostra la lista di etichette non trovate.
 * @param {string[]} labels
 */
function showNotFound(labels) {
  notFoundList.classList.remove('hidden');
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
