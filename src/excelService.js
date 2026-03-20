const XLSX = require('xlsx');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs');

/**
 * Generate an Excel workbook with separate Theory and Lab sheets
 */
function generateExcel(entry) {
  const wb = XLSX.utils.book_new();

  // --- Theory Sheet ---
  const theoryRows = entry.students.map((s, i) => {
    const ia1 = s.theory?.ia1 != null && s.theory.ia1 !== '' ? +s.theory.ia1 : null;
    const ia2 = s.theory?.ia2 != null && s.theory.ia2 !== '' ? +s.theory.ia2 : null;
    const ia3 = s.theory?.ia3 != null && s.theory.ia3 !== '' ? +s.theory.ia3 : null;
    const validIAs = [ia1, ia2, ia3].filter(v => v !== null);
    const avgIA50 = validIAs.length ? validIAs.reduce((a, b) => a + b, 0) / validIAs.length : null;
    const avgIA30 = avgIA50 !== null ? Math.round((avgIA50 * 30 / 50) * 100) / 100 : '';
    return {
      'Sl No': i + 1,
      'USN': s.usn,
      'Student Name': s.name,
      'IA1': s.theory?.ia1 ?? '',
      'IA2': s.theory?.ia2 ?? '',
      'IA3': s.theory?.ia3 ?? '',
      'Avg IA(50)': avgIA50 !== null ? Math.round(avgIA50 * 100) / 100 : '',
      'Avg IA(30)': avgIA30,
      'Assignment': s.theory?.assignment ?? '',
      'Total': calculateTheoryTotal(s.theory)
    };
  });
  const theorySheet = XLSX.utils.json_to_sheet(theoryRows);
  theorySheet['!cols'] = [
    { wch: 6 }, { wch: 15 }, { wch: 25 },
    { wch: 6 }, { wch: 6 }, { wch: 6 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }
  ];
  XLSX.utils.book_append_sheet(wb, theorySheet, 'Theory Marks');

  // --- Lab Sheet ---
  const labRows = entry.students.map((s, i) => ({
    'Sl No': i + 1,
    'USN': s.usn,
    'Student Name': s.name,
    'Lab Internal': s.lab?.internal ?? '',
    'Lab External': s.lab?.external ?? '',
    'Lab Total': calculateLabTotal(s.lab)
  }));
  const labSheet = XLSX.utils.json_to_sheet(labRows);
  labSheet['!cols'] = [
    { wch: 6 }, { wch: 15 }, { wch: 25 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, labSheet, 'Lab Marks');

  // Write to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

/**
 * Generate CSV strings for theory and lab marks
 */
function generateCSV(entry) {
  // Theory CSV
  const theoryData = entry.students.map((s, i) => {
    const ia1 = s.theory?.ia1 != null && s.theory.ia1 !== '' ? +s.theory.ia1 : null;
    const ia2 = s.theory?.ia2 != null && s.theory.ia2 !== '' ? +s.theory.ia2 : null;
    const ia3 = s.theory?.ia3 != null && s.theory.ia3 !== '' ? +s.theory.ia3 : null;
    const validIAs = [ia1, ia2, ia3].filter(v => v !== null);
    const avgIA50 = validIAs.length ? validIAs.reduce((a, b) => a + b, 0) / validIAs.length : null;
    const avgIA30 = avgIA50 !== null ? Math.round((avgIA50 * 30 / 50) * 100) / 100 : '';
    return {
      SlNo: i + 1,
      USN: s.usn,
      StudentName: s.name,
      IA1: s.theory?.ia1 ?? '',
      IA2: s.theory?.ia2 ?? '',
      IA3: s.theory?.ia3 ?? '',
      AvgIA50: avgIA50 !== null ? Math.round(avgIA50 * 100) / 100 : '',
      AvgIA30: avgIA30,
      Assignment: s.theory?.assignment ?? '',
      Total: calculateTheoryTotal(s.theory)
    };
  });
  const theoryParser = new Parser({ fields: ['SlNo', 'USN', 'StudentName', 'IA1', 'IA2', 'IA3', 'AvgIA50', 'AvgIA30', 'Assignment', 'Total'] });
  const theoryCsv = theoryParser.parse(theoryData);

  // Lab CSV
  const labData = entry.students.map((s, i) => ({
    SlNo: i + 1,
    USN: s.usn,
    StudentName: s.name,
    LabInternal: s.lab?.internal ?? '',
    LabExternal: s.lab?.external ?? '',
    LabTotal: calculateLabTotal(s.lab)
  }));
  const labParser = new Parser({ fields: ['SlNo', 'USN', 'StudentName', 'LabInternal', 'LabExternal', 'LabTotal'] });
  const labCsv = labParser.parse(labData);

  return { theoryCsv, labCsv };
}

/**
 * Parse uploaded Excel/CSV file to extract USN and Name columns
 */
function parseStudentFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const studentsMap = {}; // Keyed by USN to merge data across sheets

  for (const sheetName of wb.SheetNames) {
    // Read raw 2D array: each row is an array of cell values
    const sheetData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    // There might be multiple header rows in a single sheet (like our generated CSVs)
    let headerRowIdx = -1;
    let headers = [];

    // Scan for all header rows containing USN
    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || !Array.isArray(row)) continue;

      if (row.some(cell => String(cell).toLowerCase().trim() === 'usn')) {
        headerRowIdx = i;
        // Clean up headers (lowercase, no spaces/special chars)
        headers = row.map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));

        // Parse data rows below this header until we hit an empty row or another header
        for (let j = headerRowIdx + 1; j < sheetData.length; j++) {
          const dataRow = sheetData[j];
          if (!dataRow || !dataRow.length) continue; // Skip empty rows

          // If we hit another header row, break the inner loop to let the outer loop find it
          if (dataRow.some(cell => String(cell).toLowerCase().trim() === 'usn')) {
            i = j - 1; // Advance outer loop
            break;
          }

          // Build object mapping clean header to value
          const rowObj = {};
          for (let k = 0; k < headers.length; k++) {
            if (headers[k]) {
              rowObj[headers[k]] = dataRow[k];
            }
          }

          const usn = String(rowObj['usn'] || rowObj['rollno'] || '').trim();
          const name = String(rowObj['name'] || rowObj['studentname'] || '').trim();

          if (!usn || !name) continue;

          if (!studentsMap[usn]) {
            studentsMap[usn] = {
              usn, name,
              theory: { ia1: '', ia2: '', ia3: '', assignment: '' },
              lab: { internal: '', external: '' }
            };
          }

          const s = studentsMap[usn];

          // Theory marks mapping
          const ia1 = rowObj['ia1'];
          const ia2 = rowObj['ia2'];
          const ia3 = rowObj['ia3'];
          const assignment = rowObj['assignment'] || rowObj['assign'];

          if (ia1 !== undefined && ia1 !== '') s.theory.ia1 = String(ia1).trim();
          if (ia2 !== undefined && ia2 !== '') s.theory.ia2 = String(ia2).trim();
          if (ia3 !== undefined && ia3 !== '') s.theory.ia3 = String(ia3).trim();
          if (assignment !== undefined && assignment !== '') s.theory.assignment = String(assignment).trim();

          // Lab marks mapping
          const labInternal = rowObj['labinternal'] || rowObj['labint'];
          const labExternal = rowObj['labexternal'] || rowObj['labext'];

          if (labInternal !== undefined && labInternal !== '') s.lab.internal = String(labInternal).trim();
          if (labExternal !== undefined && labExternal !== '') s.lab.external = String(labExternal).trim();
        }
      }
    }
  }

  return Object.values(studentsMap);
}

function calculateTheoryTotal(theory) {
  if (!theory) return '';
  const ia1 = theory.ia1 != null && theory.ia1 !== '' ? +theory.ia1 : null;
  const ia2 = theory.ia2 != null && theory.ia2 !== '' ? +theory.ia2 : null;
  const ia3 = theory.ia3 != null && theory.ia3 !== '' ? +theory.ia3 : null;
  const assignment = theory.assignment != null && theory.assignment !== '' ? +theory.assignment : 0;
  if (ia1 === null && ia2 === null && ia3 === null) return '';
  const validIAs = [ia1, ia2, ia3].filter(v => v !== null);
  const avgIA50 = validIAs.length ? validIAs.reduce((a, b) => a + b, 0) / validIAs.length : 0;
  // Scale average from 50 to 30
  const avgIA30 = avgIA50 * 30 / 50;
  return Math.round((avgIA30 + assignment) * 100) / 100;
}

function calculateLabTotal(lab) {
  if (!lab) return '';
  const internal = lab.internal != null ? +lab.internal : null;
  const external = lab.external != null ? +lab.external : null;
  if (internal === null && external === null) return '';
  return (+internal || 0) + (+external || 0);
}

module.exports = { generateExcel, generateCSV, parseStudentFile };
