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
  const theoryRows = entry.students.map((s, i) => ({
    'Sl No': i + 1,
    'USN': s.usn,
    'Student Name': s.name,
    'IA1': s.theory?.ia1 ?? '',
    'IA2': s.theory?.ia2 ?? '',
    'IA3': s.theory?.ia3 ?? '',
    'Avg IA': s.theory?.ia1 != null && s.theory?.ia2 != null && s.theory?.ia3 != null
      ? Math.round(((+s.theory.ia1 + +s.theory.ia2 + +s.theory.ia3) / 3) * 100) / 100
      : '',
    'Assignment': s.theory?.assignment ?? '',
    'Total': calculateTheoryTotal(s.theory)
  }));
  const theorySheet = XLSX.utils.json_to_sheet(theoryRows);
  theorySheet['!cols'] = [
    { wch: 6 }, { wch: 15 }, { wch: 25 },
    { wch: 6 }, { wch: 6 }, { wch: 6 },
    { wch: 8 }, { wch: 12 }, { wch: 8 }
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
  const theoryData = entry.students.map((s, i) => ({
    SlNo: i + 1,
    USN: s.usn,
    StudentName: s.name,
    IA1: s.theory?.ia1 ?? '',
    IA2: s.theory?.ia2 ?? '',
    IA3: s.theory?.ia3 ?? '',
    AvgIA: s.theory?.ia1 != null && s.theory?.ia2 != null && s.theory?.ia3 != null
      ? Math.round(((+s.theory.ia1 + +s.theory.ia2 + +s.theory.ia3) / 3) * 100) / 100
      : '',
    Assignment: s.theory?.assignment ?? '',
    Total: calculateTheoryTotal(s.theory)
  }));
  const theoryParser = new Parser({ fields: ['SlNo', 'USN', 'StudentName', 'IA1', 'IA2', 'IA3', 'AvgIA', 'Assignment', 'Total'] });
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
  const sheetName = wb.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const students = data.map(row => {
    // Try common column names
    const usn = row['USN'] || row['usn'] || row['Usn'] || row['Roll No'] || row['roll_no'] || '';
    const name = row['Name'] || row['name'] || row['Student Name'] || row['student_name'] || '';
    return { usn: String(usn).trim(), name: String(name).trim() };
  }).filter(s => s.usn && s.name);

  return students;
}

function calculateTheoryTotal(theory) {
  if (!theory) return '';
  const ia1 = theory.ia1 != null ? +theory.ia1 : null;
  const ia2 = theory.ia2 != null ? +theory.ia2 : null;
  const ia3 = theory.ia3 != null ? +theory.ia3 : null;
  const assignment = theory.assignment != null ? +theory.assignment : 0;
  if (ia1 === null && ia2 === null && ia3 === null) return '';
  const avg = [ia1, ia2, ia3].filter(v => v !== null);
  const avgIA = avg.length ? avg.reduce((a, b) => a + b, 0) / avg.length : 0;
  return Math.round((avgIA + assignment) * 100) / 100;
}

function calculateLabTotal(lab) {
  if (!lab) return '';
  const internal = lab.internal != null ? +lab.internal : null;
  const external = lab.external != null ? +lab.external : null;
  if (internal === null && external === null) return '';
  return (+internal || 0) + (+external || 0);
}

module.exports = { generateExcel, generateCSV, parseStudentFile };
