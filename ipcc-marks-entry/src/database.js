const Database = require('better-sqlite3');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'ipcc.db');
const db = new Database(DB_FILE);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('faculty', 'student')),
    name TEXT NOT NULL,
    usn TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS marks_entries (
    id TEXT PRIMARY KEY,
    semester TEXT NOT NULL,
    section TEXT NOT NULL,
    subject TEXT NOT NULL,
    faculty_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (faculty_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS student_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,
    usn TEXT NOT NULL,
    name TEXT NOT NULL,
    ia1 TEXT DEFAULT '',
    ia2 TEXT DEFAULT '',
    ia3 TEXT DEFAULT '',
    assignment TEXT DEFAULT '',
    lab_internal TEXT DEFAULT '',
    lab_external TEXT DEFAULT '',
    FOREIGN KEY (entry_id) REFERENCES marks_entries(id) ON DELETE CASCADE
  );
`);

// Seed default users if table is empty
const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
if (userCount.cnt === 0) {
    const insertUser = db.prepare('INSERT INTO users (id, username, password, role, name, usn) VALUES (?, ?, ?, ?, ?, ?)');
    insertUser.run('f1', 'faculty', 'faculty123', 'faculty', 'Dr. Kumar', null);
    insertUser.run('f2', 'faculty2', 'faculty123', 'faculty', 'Prof. Sharma', null);
    insertUser.run('s1', 'student', 'student123', 'student', 'Arun M', '1RV21CS001');
    console.log('  Seeded default users');
}

// ---- Prepared Statements ----

// Users
const findUser = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?');
const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');

// Sessions
const insertSession = db.prepare('INSERT INTO sessions (token, user_id, role, created_at) VALUES (?, ?, ?, ?)');
const findSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

// Marks entries
const insertEntry = db.prepare('INSERT INTO marks_entries (id, semester, section, subject, faculty_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
const updateEntry = db.prepare('UPDATE marks_entries SET semester = ?, section = ?, subject = ?, faculty_id = ?, updated_at = ? WHERE id = ?');
const findEntry = db.prepare('SELECT * FROM marks_entries WHERE id = ?');
const findEntryByCombo = db.prepare('SELECT * FROM marks_entries WHERE semester = ? AND section = ? AND subject = ?');
const listEntries = db.prepare('SELECT * FROM marks_entries ORDER BY updated_at DESC');

// Student marks
const insertMark = db.prepare('INSERT INTO student_marks (entry_id, usn, name, ia1, ia2, ia3, assignment, lab_internal, lab_external) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const deleteMarksByEntry = db.prepare('DELETE FROM student_marks WHERE entry_id = ?');
const findMarksByEntry = db.prepare('SELECT * FROM student_marks WHERE entry_id = ?');
const findMarksByUsn = db.prepare('SELECT sm.*, me.semester, me.section, me.subject, me.updated_at FROM student_marks sm JOIN marks_entries me ON sm.entry_id = me.id WHERE sm.usn = ?');

module.exports = {
    db,
    findUser,
    findUserById,
    insertSession,
    findSession,
    deleteSession,
    insertEntry,
    updateEntry,
    findEntry,
    findEntryByCombo,
    listEntries,
    insertMark,
    deleteMarksByEntry,
    findMarksByEntry,
    findMarksByUsn
};
