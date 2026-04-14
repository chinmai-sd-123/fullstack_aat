const XLSX = require('xlsx');
const workbook = XLSX.readFile('FSD MArks Sheet_A_B_C.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('Sheet Name:', sheetName);
console.log('Headers (first 5 rows):');
data.slice(0, 5).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, row);
});

// Optionally, let's look for formulas or specific column headers in the first row that looks like a header
let headerRow = data.find(row => row.some(cell => String(cell).toLowerCase().includes('usn')));
if (headerRow) {
    console.log('Detected Header Row:', headerRow);
}
