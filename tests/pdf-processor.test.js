/**
 * tests/pdf-processor.test.js
 * Test unitari per le funzioni in src/main/pdf-processor.js
 * Usa pdf-lib per generare PDF sintetici in memoria.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  buildSearchRegex,
  buildListEntryRegex,
  DOCUMENT_LIST_HEADER_RE,
  findTextCoordinates,
  addUnderlineLink,
  processPCTDocument,
  LABEL_SYNONYM_GROUPS,
  SYNONYMS_PREFIX_PATTERN,
  normalizeRunText,
  hasLeadingNumber,
  buildRenamedName,
} from '../src/main/pdf-processor.js';

// ===== Utilità per test =====

/**
 * Crea un PDF con un testo specifico a coordinate note e lo salva su disco.
 * @param {string} text - Testo da inserire
 * @param {{ x: number, y: number, size: number }} [opts]
 * @returns {Promise<{ pdfPath: string, x: number, y: number, width: number, height: number }>}
 */
async function createTestPdf(text, { x = 50, y = 750, size = 12 } = {}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x, y, size, font });
  const pdfBytes = await pdfDoc.save();

  const tmpPath = path.join(os.tmpdir(), `pct_test_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  await fs.promises.writeFile(tmpPath, pdfBytes);
  return { pdfPath: tmpPath, x, y, size };
}

/**
 * Crea un file vuoto (allegato fittizio) su disco.
 * @param {string} name
 * @returns {Promise<string>} Percorso del file
 */
async function createDummyFile(name) {
  const filePath = path.join(os.tmpdir(), name);
  await fs.promises.writeFile(filePath, `contenuto fittizio: ${name}`);
  return filePath;
}

// ===== Pulizia file temporanei =====

/** @type {string[]} File da eliminare dopo ogni test */
const tmpFiles = [];

afterEach(async () => {
  for (const f of tmpFiles) {
    try { await fs.promises.unlink(f); } catch { /* ignora se già rimosso */ }
  }
  tmpFiles.length = 0;
});

// ===== Test 1: Inversione asse Y =====

describe('Conversione asse Y', () => {
  it('calcola yPdfLib correttamente dato pageHeight=842, y=700, height=12', () => {
    // Formula: yPdfLib = pageHeight - y - height
    const pageHeight = 842;
    const y = 700;
    const height = 12;
    const yPdfLib = pageHeight - y - height;
    expect(yPdfLib).toBe(130);
  });

  it('formula simmetrica: converte e riconverte allo stesso valore', () => {
    const pageHeight = 595;
    const y = 400;
    const height = 10;
    const yPdfLib = pageHeight - y - height;
    // Se riconverti: pageHeight - yPdfLib - height === y
    expect(pageHeight - yPdfLib - height).toBe(y);
  });
});

// ===== Test 2: Regex matching flessibile =====

describe('buildSearchRegex — matching flessibile', () => {
  const cases = [
    { label: 'doc. 1', input: 'doc. 1', shouldMatch: true },
    { label: 'doc. 1', input: 'Doc.1', shouldMatch: true },
    { label: 'doc. 1', input: 'DOC. 1', shouldMatch: true },
    { label: 'doc. 1', input: 'doc 1', shouldMatch: true },
    { label: 'doc. 1', input: 'Doc. 1', shouldMatch: true },
    { label: 'doc. 1', input: 'doc. 2', shouldMatch: false },
    { label: 'doc. 1', input: 'doc. 11', shouldMatch: false },
    { label: 'doc. 1', input: 'doc. 12', shouldMatch: false },
    { label: 'doc. 1', input: 'doc. 1a', shouldMatch: false },
    { label: 'allegato 2', input: 'Allegato 2', shouldMatch: true },
    { label: 'allegato 2', input: 'allegato2', shouldMatch: true },
    { label: 'allegato 2', input: 'allegato 3', shouldMatch: false },
    { label: 'allegato A', input: 'Allegato A', shouldMatch: true },
    { label: 'allegato A', input: 'allegato AB', shouldMatch: false },
  ];

  for (const { label, input, shouldMatch } of cases) {
    it(`"${label}" ${shouldMatch ? 'trova' : 'NON trova'} "${input}"`, () => {
      const regex = buildSearchRegex(label);
      expect(regex.test(input)).toBe(shouldMatch);
    });
  }
});

// ===== Test 2b: buildSearchRegex con sinonimi PCT =====

describe('buildSearchRegex — sinonimi italiani PCT', () => {
  const synonymCases = [
    // "doc. 1" espande a tutti i sinonimi del gruppo
    { label: 'doc. 1', input: 'Doc.1', shouldMatch: true },
    { label: 'doc. 1', input: 'documento 1', shouldMatch: true },
    { label: 'doc. 1', input: 'Allegato 1', shouldMatch: true },
    { label: 'doc. 1', input: 'all. 1', shouldMatch: true },
    // att./attaccato/ex rimossi dal gruppo sinonimi
    { label: 'doc. 1', input: 'att. 1', shouldMatch: false },
    { label: 'doc. 1', input: 'ex 1', shouldMatch: false },
    // Falsi positivi — NON devono fare match
    { label: 'doc. 1', input: 'doc. 12', shouldMatch: false },
    { label: 'doc. 1', input: 'documento 11', shouldMatch: false },
    { label: 'doc. 1', input: 'doc. 1a', shouldMatch: false },
    // "allegato A" espande a tutti i sinonimi del gruppo
    { label: 'allegato A', input: 'Allegato A', shouldMatch: true },
    { label: 'allegato A', input: 'doc. A', shouldMatch: true },
    { label: 'allegato A', input: 'All. A', shouldMatch: true },
    // Falsi positivi per lettera
    { label: 'allegato A', input: 'Allegato AB', shouldMatch: false },
    { label: 'allegato A', input: 'allegato A1', shouldMatch: false },
    // Token non nel gruppo sinonimi — solo match esatto
    { label: 'paragrafo 3', input: 'paragrafo 3', shouldMatch: true },
    { label: 'paragrafo 3', input: 'doc. 3', shouldMatch: false },
    { label: 'paragrafo 3', input: 'allegato 3', shouldMatch: false },
    { label: 'paragrafo 3', input: 'paragrafo 33', shouldMatch: false },
  ];

  for (const { label, input, shouldMatch } of synonymCases) {
    it(`sinonimi: "${label}" ${shouldMatch ? 'trova' : 'NON trova'} "${input}"`, () => {
      const regex = buildSearchRegex(label);
      expect(regex.test(input)).toBe(shouldMatch);
    });
  }

  it('LABEL_SYNONYM_GROUPS è un array non vuoto esportato', () => {
    expect(Array.isArray(LABEL_SYNONYM_GROUPS)).toBe(true);
    expect(LABEL_SYNONYM_GROUPS.length).toBeGreaterThan(0);
    // Il primo gruppo deve contenere "doc" e "allegato"
    const firstGroup = LABEL_SYNONYM_GROUPS[0];
    expect(firstGroup).toContain('doc');
    expect(firstGroup).toContain('allegato');
  });
});

// ===== Test 2c: buildSearchRegex — label solo numero (posizione) =====

describe('buildSearchRegex — label solo numero (posizione)', () => {
  // Deve fare match
  const matchCases = [
    { label: '1',   input: 'doc. 1',             desc: 'doc. 1' },
    { label: '1',   input: 'allegato 1',          desc: 'allegato 1' },
    { label: '1',   input: 'allegato n. 1',       desc: 'allegato n. 1' },
    { label: '1',   input: 'Documento n. 1',      desc: 'Documento n. 1' },
    { label: '1',   input: 'all. 1',              desc: 'all. 1' },
    { label: '1',   input: 'allegato 1 bis',      desc: 'allegato 1 bis (spazio prima di bis)' },
    { label: '1',   input: 'doc. 1 ter',          desc: 'doc. 1 ter (spazio prima di ter)' },
    { label: '11',  input: 'allegato n. 11',      desc: 'allegato n. 11' },
    { label: '11',  input: 'doc. 11',             desc: 'doc. 11' },
    { label: '11',  input: 'Documento n. 11',     desc: 'Documento n. 11' },
    { label: '100', input: 'allegato 100',        desc: 'allegato 100' },
    { label: '100', input: 'doc. 100',            desc: 'doc. 100' },
  ];

  for (const { label, input, desc } of matchCases) {
    it(`label "${label}" trova "${desc}"`, () => {
      expect(buildSearchRegex(label).test(input)).toBe(true);
    });
  }

  // NON deve fare match
  const noMatchCases = [
    // Prefisso obbligatorio: numeri isolati NON devono fare match
    { label: '1',   input: '1',                   desc: '1 standalone (senza prefisso)' },
    { label: '1',   input: '250.000,00',           desc: 'importo monetario' },
    { label: '1',   input: '09876543210',          desc: 'P.IVA' },
    { label: '1',   input: '10 settembre 2025',    desc: 'data (10 non deve matchare come "1")' },
    // Falsi positivi numerici
    { label: '1',   input: 'doc. 11',            desc: 'doc. 11 (falso positivo)' },
    { label: '1',   input: 'allegato 12',         desc: 'allegato 12 (falso positivo)' },
    { label: '1',   input: '1a',                  desc: '1a (lettera attaccata)' },
    { label: '1',   input: 'doc. 1bis',           desc: 'doc. 1bis (senza spazio)' },
    { label: '1',   input: 'allegato 1ter',       desc: 'allegato 1ter (senza spazio)' },
    { label: '11',  input: 'allegato n. 111',     desc: 'allegato n. 111 (falso positivo)' },
    { label: '11',  input: 'doc. 112',            desc: 'doc. 112 (falso positivo)' },
    { label: '100', input: 'allegato 1000',       desc: 'allegato 1000 (falso positivo)' },
  ];

  for (const { label, input, desc } of noMatchCases) {
    it(`label "${label}" NON trova "${desc}"`, () => {
      expect(buildSearchRegex(label).test(input)).toBe(false);
    });
  }

  it('SYNONYMS_PREFIX_PATTERN è una stringa esportata non vuota', () => {
    expect(typeof SYNONYMS_PREFIX_PATTERN).toBe('string');
    expect(SYNONYMS_PREFIX_PATTERN.length).toBeGreaterThan(0);
  });
});

// ===== Test 2d: buildListEntryRegex — elenco numerato =====

describe('buildListEntryRegex — pattern N) N. N– elenco documenti', () => {
  const matchCases = [
    // Formato N) — Word/LibreOffice numbered list
    { n: '1',  input: '1) Visura camerale di Beta S.p.A.',      desc: 'N) Word' },
    { n: '20', input: '20) Preventivo di ripristino danni',      desc: 'N) a due cifre' },
    { n: '9',  input: '9) Contratto di fornitura',               desc: 'N) singola cifra' },
    // Formato N. — LaTeX \enumerate / LibreOffice
    { n: '1',  input: '1. Visura camerale di Beta S.p.A.',       desc: 'N. LaTeX/LibreOffice' },
    { n: '20', input: '20. Preventivo di ripristino danni',      desc: 'N. a due cifre' },
    // Formato N – — em-dash (U+2013)
    { n: '1',  input: '1 \u2013 Visura camerale',                desc: 'N em-dash con spazio' },
    { n: '1',  input: '1\u2013 Visura camerale',                 desc: 'N em-dash senza spazio prima' },
    // Formato N - — trattino ASCII
    { n: '1',  input: '1 - Visura camerale',                     desc: 'N trattino ASCII con spazio' },
  ];

  for (const { n, input, desc } of matchCases) {
    it(`"${n}" trova "${desc}"`, () => {
      expect(buildListEntryRegex(n).test(input)).toBe(true);
    });
  }

  const noMatchCases = [
    { n: '1',  input: '(cfr. Doc. 1)',        desc: 'paren a fine riga in corpo testo' },
    { n: '1',  input: 'doc. 1',               desc: 'body text senza paren' },
    { n: '1',  input: 'allegato 1',           desc: 'body text allegato' },
    { n: '1',  input: '10) Decimo documento', desc: 'label 1 NON matcha entry 10)' },
    { n: '1',  input: '11) Undicesimo',       desc: 'label 1 NON matcha entry 11)' },
    { n: '1',  input: '10. Decimo documento', desc: 'label 1 NON matcha entry 10.' },
    { n: '2',  input: '1) Visura camerale',   desc: 'label 2 NON matcha entry 1)' },
  ];

  for (const { n, input, desc } of noMatchCases) {
    it(`"${n}" NON trova "${desc}"`, () => {
      expect(buildListEntryRegex(n).test(input)).toBe(false);
    });
  }
});

// ===== Test 2e: DOCUMENT_LIST_HEADER_RE — riconoscimento header sezione =====

describe('DOCUMENT_LIST_HEADER_RE — riconoscimento header sezione elenco documenti', () => {
  const matchCases = [
    'ELENCO DEI DOCUMENTI PRODOTTI',
    'Elenco dei documenti prodotti',
    'ELENCO DOCUMENTI',
    'Elenco documenti',
    'INDICE DEI DOCUMENTI PRODOTTI',
    'Indice dei documenti',
    'DOCUMENTI PRODOTTI',
  ];
  for (const input of matchCases) {
    it(`riconosce "${input}"`, () => {
      expect(DOCUMENT_LIST_HEADER_RE.test(input)).toBe(true);
    });
  }

  const noMatchCases = [
    'ECCEZIONI',
    'CONCLUSIONI',
    'NEL MERITO',
    'IN VIA PRELIMINARE',
    'DOMANDA RICONVENZIONALE',
    'ISTANZE ISTRUTTORIE',
    '1. Eccezione di prescrizione',
    '1. Rigettare integralmente le domande',
  ];
  for (const input of noMatchCases) {
    it(`NON riconosce "${input}"`, () => {
      expect(DOCUMENT_LIST_HEADER_RE.test(input)).toBe(false);
    });
  }
});

// ===== Test 3: findTextCoordinates con PDF reale =====

describe('findTextCoordinates', () => {
  it('trova le coordinate di "doc. 1" nel PDF generato con pdf-lib', async () => {
    const searchText = 'doc. 1';
    const { pdfPath } = await createTestPdf(`Atto principale. Si veda ${searchText} allegato.`, { x: 50, y: 750, size: 12 });
    tmpFiles.push(pdfPath);

    const results = await findTextCoordinates(pdfPath, searchText);

    // Il PDF è stato generato con il testo in un unico item
    // Verifica che almeno un item contenga il testo cercato
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].pageIndex).toBe(0);
    expect(results[0].matchedText).toMatch(/doc[\s.]*1/i);
    // Le coordinate devono essere numeri positivi
    expect(results[0].x).toBeGreaterThanOrEqual(0);
    expect(results[0].y).toBeGreaterThanOrEqual(0);
    expect(results[0].width).toBeGreaterThan(0);
    expect(results[0].height).toBeGreaterThan(0);
  });

  it('restituisce array vuoto se l\'etichetta non è nel PDF (no throw)', async () => {
    const { pdfPath } = await createTestPdf('Questo PDF non contiene la parola cercata.');
    tmpFiles.push(pdfPath);

    const results = await findTextCoordinates(pdfPath, 'ZZZNONTROVATO999');
    expect(results).toEqual([]);
  });
});

// ===== Test 4: processPCTDocument — caso notFound =====

describe('processPCTDocument — caso notFound', () => {
  it('restituisce notFound con l\'etichetta e success=true se non trovata', async () => {
    const { pdfPath: mainPdfPath } = await createTestPdf('Atto senza etichette speciali. Questo testo è sufficientemente lungo da superare la soglia di natività del documento PCT.');
    tmpFiles.push(mainPdfPath);

    const attPath = await createDummyFile('allegato_test.pdf');
    tmpFiles.push(attPath);

    const outputFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pct_out_'));
    // Aggiungi la cartella di output ai file da pulire
    tmpFiles.push(outputFolder);

    const result = await processPCTDocument({
      mainPdfPath,
      attachments: [{ path: attPath, name: 'allegato_test.pdf', label: 'ZZZNONTROVATO999' }],
      outputFolder,
    });

    expect(result.success).toBe(true);
    expect(result.notFound[0]).toMatch(/ZZZNONTROVATO999/);
    expect(result.processedAnnotations).toBe(0);
  });
});

// ===== Test 5: processPCTDocument — copia allegati =====

describe('processPCTDocument — copia allegati', () => {
  it('copia tutti gli allegati nella outputFolder', async () => {
    const { pdfPath: mainPdfPath } = await createTestPdf('Atto principale che cita il doc. 1 allegato e il doc. 2 allegato. Il testo supera la soglia minima di cento caratteri richiesta per i PDF nativi.');
    tmpFiles.push(mainPdfPath);

    const att1Path = await createDummyFile('att_test_1.pdf');
    const att2Path = await createDummyFile('att_test_2.pdf');
    tmpFiles.push(att1Path, att2Path);

    const outputFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pct_copy_'));
    tmpFiles.push(outputFolder);

    await processPCTDocument({
      mainPdfPath,
      attachments: [
        { path: att1Path, name: 'att_test_1.pdf', label: 'doc. 1' },
        { path: att2Path, name: 'att_test_2.pdf', label: 'doc. 2' },
      ],
      outputFolder,
    });

    expect(fs.existsSync(path.join(outputFolder, 'att_test_1.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(outputFolder, 'att_test_2.pdf'))).toBe(true);
  });
});

// ===== hasLeadingNumber =====

describe('hasLeadingNumber', () => {
  it('riconosce nome con numero e underscore', () => {
    expect(hasLeadingNumber('01_contratto.pdf')).toBe(true);
  });

  it('riconosce nome con numero e trattino', () => {
    expect(hasLeadingNumber('1-contratto.pdf')).toBe(true);
  });

  it('riconosce nome con numero e spazio', () => {
    expect(hasLeadingNumber('1 contratto.pdf')).toBe(true);
  });

  it('riconosce nome doc_N', () => {
    expect(hasLeadingNumber('doc_1_contratto.pdf')).toBe(true);
  });

  it('ritorna false per nome senza numero iniziale', () => {
    expect(hasLeadingNumber('contratto.pdf')).toBe(false);
  });

  it('ritorna false per nome che inizia con lettera', () => {
    expect(hasLeadingNumber('allegato_contratto.pdf')).toBe(false);
  });
});

// ===== buildRenamedName =====

describe('buildRenamedName', () => {
  it('schema numbered: aggiunge numero con padding', () => {
    expect(buildRenamedName('contratto.pdf', 'numbered', 1, 1)).toBe('1_contratto.pdf');
  });

  it('schema numbered: usa zero-padding per totale > 9', () => {
    expect(buildRenamedName('contratto.pdf', 'numbered', 1, 10)).toBe('01_contratto.pdf');
  });

  it('schema doc_: aggiunge prefisso doc_', () => {
    expect(buildRenamedName('contratto.pdf', 'doc_', 1, 10)).toBe('doc_01_contratto.pdf');
  });

  it('schema allegato_: aggiunge prefisso allegato_', () => {
    expect(buildRenamedName('contratto.pdf', 'allegato_', 1, 10)).toBe('allegato_01_contratto.pdf');
  });

  it('schema numbered: sostituisce numero iniziale esistente', () => {
    // strip "01_" → "contratto.pdf", poi applica numbered con index=1, total=10 → "01_contratto.pdf"
    expect(buildRenamedName('01_contratto.pdf', 'numbered', 1, 10)).toBe('01_contratto.pdf');
  });

  it('schema doc_: sostituisce numero iniziale esistente', () => {
    // strip "01_" → "contratto.pdf", poi applica doc_ con index=1, total=10 → "doc_01_contratto.pdf"
    expect(buildRenamedName('01_contratto.pdf', 'doc_', 1, 10)).toBe('doc_01_contratto.pdf');
  });

  it('schema none (default): ritorna nome originale', () => {
    expect(buildRenamedName('contratto.pdf', 'none', 1, 1)).toBe('contratto.pdf');
  });
});

// ===== normalizeRunText — fix issue #1 (PDF da Word) =====

describe('normalizeRunText — caratteri Unicode invisibili da PDF Word', () => {
  it('converte NBSP (U+00A0) in spazio normale', () => {
    expect(normalizeRunText('doc.\u00A01')).toBe('doc. 1');
  });

  it('converte narrow no-break space (U+202F) in spazio', () => {
    expect(normalizeRunText('allegato\u202F1')).toBe('allegato 1');
  });

  it('converte soft hyphen (U+00AD) in spazio', () => {
    expect(normalizeRunText('doc.\u00AD1')).toBe('doc. 1');
  });

  it('converte zero-width space (U+200B) in spazio', () => {
    expect(normalizeRunText('allegato\u200B1')).toBe('allegato 1');
  });

  it('preserva la lunghezza del testo (mapping 1:1 con chars)', () => {
    const input = 'doc.\u00A01';
    const output = normalizeRunText(input);
    expect(output.length).toBe(input.length);
  });

  it('buildSearchRegex trova match su testo con NBSP normalizzato', () => {
    const regex = buildSearchRegex('1');
    expect(regex.test(normalizeRunText('allegato\u00A01'))).toBe(true);
  });

  it('buildSearchRegex trova match su "doc. 1" con NBSP normalizzato', () => {
    const regex = buildSearchRegex('1');
    expect(regex.test(normalizeRunText('doc.\u00A01'))).toBe(true);
  });

  it('non altera testo normale già corretto', () => {
    expect(normalizeRunText('doc. 1 allegato')).toBe('doc. 1 allegato');
  });
});
