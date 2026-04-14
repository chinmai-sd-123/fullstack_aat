const XLSX = require('xlsx');
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, places = 2) {
  if (value === null || value === undefined || value === '') return '';
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function ceilOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  return Math.ceil(value);
}

function calculateStudent(s) {
  const ia1 = num(s.theory?.ia1);
  const ia2 = num(s.theory?.ia2);
  const ia3 = num(s.theory?.ia3);
  const quiz = num(s.theory?.quiz);
  const aat = num(s.theory?.aat);
  const labExam = num(s.lab?.exam ?? s.lab?.marks ?? s.lab?.internal);

  const ia1Reduced = ia1 === null ? null : ia1 * 30 / 50;
  const ia2Reduced = ia2 === null ? null : ia2 * 30 / 50;
  const ia3Reduced = ia3 === null ? null : ia3 * 30 / 50;
  const iatAverage = [ia1Reduced, ia2Reduced, ia3Reduced].every(v => v !== null)
    ? (ia1Reduced + ia2Reduced + ia3Reduced) / 3
    : null;
  const quizReduced = quiz === null ? null : quiz * 10 / 30;
  const theoryTotal50 = [iatAverage, quizReduced, aat].every(v => v !== null)
    ? iatAverage + quizReduced + aat
    : null;
  const theoryReduced30 = theoryTotal50 === null ? null : theoryTotal50 * 30 / 50;
  const labReduced20Raw = labExam === null ? null : labExam * 20 / 50;
  const labReduced20 = labReduced20Raw === null ? null : Math.ceil(labReduced20Raw);
  const finalTotal50 = [theoryReduced30, labReduced20].every(v => v !== null)
    ? theoryReduced30 + labReduced20
    : null;

  return {
    ia1,
    ia1Reduced,
    ia2,
    ia2Reduced,
    ia3,
    ia3Reduced,
    iatAverage,
    quiz,
    quizReduced,
    aat,
    theoryTotal50,
    theoryReduced30,
    labExam,
    labReduced20,
    finalTotal50,
    roundedFinal: ceilOrBlank(finalTotal50)
  };
}

function buildFsdRows(entry) {
  const rows = [
    [],
    [],
    [],
    [],
    [],
    [],
    ['','', 'CIE for the theory component of Integrated Professional Core Courses (IPCC)'],
    [],
    ['','', 'Course', '', entry.subject || ''],
    ['','', 'Course Code', '', entry.course_code || entry.courseCode || ''],
    [],
    [
      'Sl. No',
      'USN',
      'NAME',
      'IAT-1 (50)',
      'IAT-1 (Reduced to 30) (A)',
      'IAT-2 (50)',
      'IAT-2 (Reduced to 30) (B)',
      'IAT-3 (50)',
      'IAT-3 (Reduced to 30) (C) ',
      'Average\n(A + B + C) / 3 (D)',
      'Quiz (30)',
      'Quiz (Reduced to 10) (E)',
      'AAT (10) (F)',
      'TOTAL G = (D + E + F) (50)',
      'G reduced to 30 (K)',
      'Lab Marks (L) (20)',
      'Final Total (Theory (30) + Lab (20)) (50)',
      'TOTAL (Round up - Total 50)',
      'Attendance(40)',
      'Lab Att',
      'Total'
    ]
  ];

  entry.students.forEach((s, i) => {
    const c = calculateStudent(s);
    rows.push([
      i + 1,
      s.usn,
      s.name,
      c.ia1 ?? '',
      round(c.ia1Reduced),
      c.ia2 ?? '',
      round(c.ia2Reduced),
      c.ia3 ?? '',
      round(c.ia3Reduced),
      round(c.iatAverage),
      c.quiz ?? '',
      round(c.quizReduced),
      c.aat ?? '',
      round(c.theoryTotal50),
      round(c.theoryReduced30),
      c.labReduced20 ?? '',
      round(c.finalTotal50),
      c.roundedFinal,
      '',
      '',
      ''
    ]);
  });

  return rows;
}

/**
 * Generate an Excel workbook using the FSD marks-sheet column layout.
 */
function generateExcel(entry) {
  const templatePath = path.join(__dirname, '..', 'FSD MArks Sheet_A_B_C.xlsx');
  if (fs.existsSync(templatePath)) {
    const files = readZip(fs.readFileSync(templatePath));
    const sheet = files.find(f => f.name === 'xl/worksheets/sheet1.xml');
    if (sheet) {
      sheet.data = Buffer.from(buildTemplateSheetXml(entry), 'utf8');
      const picturePath = path.join(__dirname, '..', 'Picture1.png');
      const image = files.find(f => f.name === 'xl/media/image1.png');
      if (image && fs.existsSync(picturePath)) image.data = fs.readFileSync(picturePath);
      return writeZip(sanitizeTemplateFiles(files));
    }
  }

  return generateBasicExcel(entry);
}

function generateBasicExcel(entry) {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(buildFsdRows(entry));

  sheet['!merges'] = [
    { s: { c: 2, r: 6 }, e: { c: 12, r: 6 } },
    { s: { c: 2, r: 8 }, e: { c: 3, r: 8 } },
    { s: { c: 4, r: 8 }, e: { c: 5, r: 8 } },
    { s: { c: 2, r: 9 }, e: { c: 3, r: 9 } },
    { s: { c: 4, r: 9 }, e: { c: 5, r: 9 } }
  ];
  sheet['!cols'] = [
    { wch: 8 }, { wch: 15 }, { wch: 28 },
    { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 24 },
    { wch: 12 }, { wch: 24 }, { wch: 26 }, { wch: 12 },
    { wch: 24 }, { wch: 13 }, { wch: 27 }, { wch: 18 },
    { wch: 18 }, { wch: 34 }, { wch: 27 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }
  ];

  XLSX.utils.book_append_sheet(wb, sheet, 'Theory Component');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function sanitizeTemplateFiles(files) {
  setZipText(files, 'xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="3" lowestEdited="5" rupBuild="9302"/><workbookPr/><bookViews><workbookView windowWidth="28800" windowHeight="12180" activeTab="0"/></bookViews><sheets><sheet name="Theory Component" sheetId="10" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`);
  setZipText(files, 'xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId15" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId14" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  setZipText(files, 'xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>`);
  setZipText(files, '[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`);

  const keep = new Set([
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/app.xml',
    'docProps/core.xml',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet1.xml.rels',
    'xl/drawings/drawing1.xml',
    'xl/drawings/_rels/drawing1.xml.rels',
    'xl/media/image1.png',
    'xl/theme/theme1.xml',
    'xl/styles.xml',
    'xl/sharedStrings.xml'
  ]);
  return files.filter(f => keep.has(f.name));
}

function setZipText(files, name, content) {
  const file = files.find(f => f.name === name);
  if (file) file.data = Buffer.from(content, 'utf8');
}

function xml(value) {
  return String(value ?? '').replace(/[<>&"']/g, ch => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
  })[ch]);
}

function stringCell(addr, value, style) {
  const s = style ? ` s="${style}"` : '';
  return `<c r="${addr}"${s} t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
}

function numberCell(addr, value, style, formula) {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${addr}"${s}/>`;
  const f = formula ? `<f>${xml(formula)}</f>` : '';
  return `<c r="${addr}"${s}>${f}<v>${xml(value)}</v></c>`;
}

function blankCell(addr, style) {
  return `<c r="${addr}"${style ? ` s="${style}"` : ''}/>`;
}

function buildTemplateSheetXml(entry) {
  const rows = [];
  const endRow = Math.max(12 + entry.students.length, 219);

  rows.push(`<row r="7" customHeight="1" spans="3:13">${stringCell('C7', 'CIE for the theory component of Integrated Professional Core Courses (IPCC)', 37)}${['D','E','F','G','H','I','J','K','L','M'].map(c => blankCell(c + '7', 37)).join('')}</row>`);
  rows.push(`<row r="8" spans="3:8">${['C','D','E','F','G','H'].map(c => blankCell(c + '8', 38)).join('')}</row>`);
  rows.push(`<row r="9" spans="3:8">${stringCell('C9', 'Course', 39)}${blankCell('D9', 39)}${stringCell('E9', entry.subject || '', 39)}${blankCell('F9', 39)}${blankCell('G9', 38)}${blankCell('H9', 38)}</row>`);
  rows.push(`<row r="10" spans="3:8">${stringCell('C10', 'Course Code', 39)}${blankCell('D10', 39)}${stringCell('E10', entry.course_code || entry.courseCode || '', 39)}${blankCell('F10', 39)}${blankCell('G10', 38)}${blankCell('H10', 36)}</row>`);

  const headers = [
    ['A12', 'Sl. No', 1], ['B12', 'USN', 2], ['C12', 'NAME', 2],
    ['D12', 'IAT-1 (50)', 2], ['E12', 'IAT-1 (Reduced to 30) (A)', 1],
    ['F12', 'IAT-2 (50)', 2], ['G12', 'IAT-2 (Reduced to 30) (B)', 1],
    ['H12', 'IAT-3 (50)', 2], ['I12', 'IAT-3 (Reduced to 30) (C) ', 1],
    ['J12', 'Average\n(A + B + C) / 3 (D)', 1], ['K12', 'Quiz (30)', 51],
    ['L12', 'Quiz (Reduced to 10) (E)', 52], ['M12', 'AAT (10) (F)', 1],
    ['N12', 'TOTAL G = (D + E + F) (50)', 1], ['O12', 'G reduced to 30 (K)', 1],
    ['P12', 'Lab Marks (L) (20)', 59], ['Q12', 'Final Total (Theory (30) + Lab (20)) (50)', 59],
    ['R12', 'TOTAL (Round up - Total 50)', 59], ['S12', 'Attendance(40)', 59],
    ['T12', 'Lab Att', null], ['U12', 'Total', null]
  ];
  rows.push(`<row r="12" ht="38.25" spans="1:21">${headers.map(h => stringCell(h[0], h[1], h[2])).join('')}</row>`);

  entry.students.forEach((s, i) => {
    const r = 13 + i;
    const c = calculateStudent(s);
    rows.push(`<row r="${r}" spans="1:21">` +
      numberCell(`A${r}`, i + 1, 4) +
      stringCell(`B${r}`, s.usn, 5) +
      stringCell(`C${r}`, s.name, 13) +
      numberCell(`D${r}`, c.ia1 ?? '', 48) +
      numberCell(`E${r}`, round(c.ia1Reduced), 49, `((D${r}*30)/50)`) +
      numberCell(`F${r}`, c.ia2 ?? '', 48) +
      numberCell(`G${r}`, round(c.ia2Reduced), 49, `((F${r}*30)/50)`) +
      numberCell(`H${r}`, c.ia3 ?? '', 48) +
      numberCell(`I${r}`, round(c.ia3Reduced), 49, `((H${r}*30)/50)`) +
      numberCell(`J${r}`, round(c.iatAverage), 49, `((E${r}+G${r}+I${r})/3)`) +
      numberCell(`K${r}`, c.quiz ?? '', 48) +
      numberCell(`L${r}`, round(c.quizReduced), 54, `((K${r}*10)/30)`) +
      numberCell(`M${r}`, c.aat ?? '', 48) +
      numberCell(`N${r}`, round(c.theoryTotal50), 56, `SUM(J${r},L${r},M${r})`) +
      numberCell(`O${r}`, round(c.theoryReduced30), 56, `(N${r}/50)*30`) +
      numberCell(`P${r}`, c.labReduced20 ?? '', 56) +
      numberCell(`Q${r}`, round(c.finalTotal50), 56, `(O${r}+P${r})`) +
      numberCell(`R${r}`, c.roundedFinal, 56, `ROUNDUP(Q${r},0)`) +
      blankCell(`S${r}`, 3) +
      blankCell(`T${r}`, 60) +
      blankCell(`U${r}`, null) +
      '</row>');
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"><sheetPr/><dimension ref="A7:U${endRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="12" topLeftCell="A98" activePane="bottomLeft" state="frozen"/><selection/><selection pane="bottomLeft" activeCell="B7" sqref="B7"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="9.14285714285714" defaultRowHeight="15"/><cols><col min="1" max="1" width="4.85714285714286" customWidth="1"/><col min="2" max="2" width="23.4285714285714" customWidth="1"/><col min="3" max="3" width="32.8571428571429" customWidth="1"/><col min="4" max="4" width="11" customWidth="1"/><col min="5" max="5" width="9.57142857142857" customWidth="1"/><col min="6" max="6" width="11" customWidth="1"/><col min="7" max="7" width="9.57142857142857" customWidth="1"/><col min="8" max="8" width="11" customWidth="1"/><col min="9" max="9" width="9.57142857142857" customWidth="1"/><col min="10" max="10" width="12.2857142857143" customWidth="1"/><col min="11" max="11" width="9.14285714285714" customWidth="1"/><col min="12" max="12" width="10.7142857142857" customWidth="1"/><col min="13" max="13" width="9.14285714285714" customWidth="1"/><col min="14" max="14" width="10.4285714285714" customWidth="1"/><col min="15" max="15" width="15.8571428571429" customWidth="1"/><col min="16" max="16" width="9.14285714285714" customWidth="1"/><col min="17" max="17" width="14.1428571428571" customWidth="1"/><col min="18" max="18" width="10.8571428571429" customWidth="1"/><col min="19" max="19" width="12.4285714285714" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="6"><mergeCell ref="C7:M7"/><mergeCell ref="C9:D9"/><mergeCell ref="E9:F9"/><mergeCell ref="C10:D10"/><mergeCell ref="E10:F10"/><mergeCell ref="G10:H10"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><headerFooter/><drawing r:id="rId1"/></worksheet>`;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Invalid XLSX zip: central directory not found');
}

function readZip(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const total = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const files = [];
  let ptr = centralOffset;

  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Invalid XLSX zip: central file header not found');
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.slice(ptr + 46, ptr + 46 + nameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    files.push({ name, data });

    ptr += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function writeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(file => {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  });

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

/**
 * Generate a CSV using the same FSD-style columns as the Excel sheet.
 */
function generateCSV(entry) {
  const rows = entry.students.map((s, i) => {
    const c = calculateStudent(s);
    return {
      'Sl. No': i + 1,
      USN: s.usn,
      NAME: s.name,
      'IAT-1 (50)': c.ia1 ?? '',
      'IAT-1 (Reduced to 30) (A)': round(c.ia1Reduced),
      'IAT-2 (50)': c.ia2 ?? '',
      'IAT-2 (Reduced to 30) (B)': round(c.ia2Reduced),
      'IAT-3 (50)': c.ia3 ?? '',
      'IAT-3 (Reduced to 30) (C)': round(c.ia3Reduced),
      'Average (A + B + C) / 3 (D)': round(c.iatAverage),
      'Quiz (30)': c.quiz ?? '',
      'Quiz (Reduced to 10) (E)': round(c.quizReduced),
      'AAT (10) (F)': c.aat ?? '',
      'TOTAL G = (D + E + F) (50)': round(c.theoryTotal50),
      'G reduced to 30 (K)': round(c.theoryReduced30),
      'Lab Marks (L) (20)': c.labReduced20 ?? '',
      'Final Total (Theory (30) + Lab (20)) (50)': round(c.finalTotal50),
      'TOTAL (Round up - Total 50)': c.roundedFinal,
      'Attendance(40)': '',
      'Lab Att': '',
      Total: ''
    };
  });

  const parser = new Parser({ fields: Object.keys(rows[0] || {
    'Sl. No': '',
    USN: '',
    NAME: '',
    'IAT-1 (50)': '',
    'IAT-1 (Reduced to 30) (A)': '',
    'IAT-2 (50)': '',
    'IAT-2 (Reduced to 30) (B)': '',
    'IAT-3 (50)': '',
    'IAT-3 (Reduced to 30) (C)': '',
    'Average (A + B + C) / 3 (D)': '',
    'Quiz (30)': '',
    'Quiz (Reduced to 10) (E)': '',
    'AAT (10) (F)': '',
    'TOTAL G = (D + E + F) (50)': '',
    'G reduced to 30 (K)': '',
    'Lab Marks (L) (20)': '',
    'Final Total (Theory (30) + Lab (20)) (50)': '',
    'TOTAL (Round up - Total 50)': '',
    'Attendance(40)': '',
    'Lab Att': '',
    Total: ''
  }) });

  return { theoryCsv: parser.parse(rows), labCsv: '' };
}

function cleanHeader(header) {
  return String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstValue(rowObj, keys) {
  for (const key of keys) {
    if (rowObj[key] !== undefined && rowObj[key] !== '') return rowObj[key];
  }
  return '';
}

/**
 * Parse uploaded Excel/CSV file to extract student details and any marks already present.
 */
function parseStudentFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const studentsMap = {};

  for (const sheetName of wb.SheetNames) {
    const sheetData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || !Array.isArray(row)) continue;
      if (!row.some(cell => String(cell).toLowerCase().trim() === 'usn')) continue;

      const headers = row.map(cleanHeader);

      for (let j = i + 1; j < sheetData.length; j++) {
        const dataRow = sheetData[j];
        if (!dataRow || dataRow.every(cell => cell === '')) continue;
        if (dataRow.some(cell => String(cell).toLowerCase().trim() === 'usn')) {
          i = j - 1;
          break;
        }

        const rowObj = {};
        for (let k = 0; k < headers.length; k++) {
          if (headers[k]) rowObj[headers[k]] = dataRow[k];
        }

        const usn = String(firstValue(rowObj, ['usn', 'rollno'])).trim();
        const name = String(firstValue(rowObj, ['name', 'studentname'])).trim();
        if (!usn || !name) continue;

        if (!studentsMap[usn]) {
          studentsMap[usn] = {
            usn,
            name,
            theory: { ia1: '', ia2: '', ia3: '', quiz: '', aat: '' },
            lab: { exam: '' }
          };
        }

        const s = studentsMap[usn];
        const ia1 = firstValue(rowObj, ['ia1', 'iat150']);
        const ia2 = firstValue(rowObj, ['ia2', 'iat250']);
        const ia3 = firstValue(rowObj, ['ia3', 'iat350']);
        const quiz = firstValue(rowObj, ['quiz', 'quiz30']);
        const aat = firstValue(rowObj, ['aat', 'aat10', 'aat10f']);
        const labExam = firstValue(rowObj, ['labexam50', 'labmarks50', 'labmarks', 'finaltest50']);

        if (ia1 !== '') s.theory.ia1 = String(ia1).trim();
        if (ia2 !== '') s.theory.ia2 = String(ia2).trim();
        if (ia3 !== '') s.theory.ia3 = String(ia3).trim();
        if (quiz !== '') s.theory.quiz = String(quiz).trim();
        if (aat !== '') s.theory.aat = String(aat).trim();
        if (labExam !== '') s.lab.exam = String(labExam).trim();
      }
    }
  }

  return Object.values(studentsMap);
}

module.exports = { generateExcel, generateCSV, parseStudentFile };
