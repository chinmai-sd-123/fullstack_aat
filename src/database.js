const { Pool } = require('pg');
require('dotenv').config();

// Default to a local DB for development if no URL is provided
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ipcc_marks';

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Required for Neon
});

// Create tables
async function initDb() {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('faculty')),
                name TEXT NOT NULL,
                usn TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS marks_entries (
                id TEXT PRIMARY KEY,
                semester TEXT NOT NULL,
                section TEXT NOT NULL,
                subject TEXT NOT NULL,
                course_code TEXT DEFAULT '',
                faculty_id TEXT NOT NULL REFERENCES users(id),
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS student_marks (
                id SERIAL PRIMARY KEY,
                entry_id TEXT NOT NULL REFERENCES marks_entries(id) ON DELETE CASCADE,
                usn TEXT NOT NULL,
                name TEXT NOT NULL,
                ia1 TEXT DEFAULT '',
                ia2 TEXT DEFAULT '',
                ia3 TEXT DEFAULT '',
                assignment TEXT DEFAULT '',
                quiz TEXT DEFAULT '',
                aat TEXT DEFAULT '',
                lab_exam TEXT DEFAULT '',
                lab_internal TEXT DEFAULT '',
                lab_external TEXT DEFAULT ''
            );
        `);

    await pool.query(`
            ALTER TABLE marks_entries
            ADD COLUMN IF NOT EXISTS course_code TEXT DEFAULT '';

            ALTER TABLE student_marks
            ADD COLUMN IF NOT EXISTS quiz TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS aat TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS lab_exam TEXT DEFAULT '';
        `);

    // Seed default users if table is empty
    const userCount = await pool.query('SELECT COUNT(*) as cnt FROM users');
    if (parseInt(userCount.rows[0].cnt) === 0) {
      const insertUser = 'INSERT INTO users (id, username, password, role, name, usn) VALUES ($1, $2, $3, $4, $5, $6)';
      await pool.query(insertUser, ['f1', 'faculty', 'faculty123', 'faculty', 'Dr. Kumar', null]);
      await pool.query(insertUser, ['f2', 'faculty2', 'faculty123', 'faculty', 'Prof. Sharma', null]);
      console.log('  Seeded default users to PostgreSQL');
    }
    console.log('PostgreSQL Database connected and initialized.');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDb();

// ---- Database Helper Functions ----

module.exports = {
  pool,

  // Users
  findUser: async (username, password) => {
    const res = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    return res.rows[0];
  },
  findUserById: async (id) => {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  },
  getAllUsers: async () => {
    const res = await pool.query('SELECT id, username, role, name, usn FROM users ORDER BY role, name');
    return res.rows;
  },
  findUserByUsername: async (username) => {
    const res = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    return res.rows[0];
  },
  insertUser: async (id, username, password, role, name, usn) => {
    await pool.query('INSERT INTO users (id, username, password, role, name, usn) VALUES ($1, $2, $3, $4, $5, $6)', [id, username, password, role, name, usn]);
  },
  deleteUser: async (id) => {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  },

  // Sessions
  insertSession: async (token, user_id, role, created_at) => {
    await pool.query('INSERT INTO sessions (token, user_id, role, created_at) VALUES ($1, $2, $3, $4)', [token, user_id, role, created_at]);
  },
  findSession: async (token) => {
    const res = await pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
    return res.rows[0];
  },
  deleteSession: async (token) => {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  },
  deleteSessionsByUser: async (userId) => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  },

  // Marks entries
  insertEntry: async (id, semester, section, subject, course_code, faculty_id, updated_at) => {
    await pool.query('INSERT INTO marks_entries (id, semester, section, subject, course_code, faculty_id, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, semester, section, subject, course_code, faculty_id, updated_at]);
  },
  updateEntry: async (semester, section, subject, course_code, faculty_id, updated_at, id) => {
    await pool.query('UPDATE marks_entries SET semester = $1, section = $2, subject = $3, course_code = $4, faculty_id = $5, updated_at = $6 WHERE id = $7', [semester, section, subject, course_code, faculty_id, updated_at, id]);
  },
  findEntry: async (id) => {
    const res = await pool.query('SELECT * FROM marks_entries WHERE id = $1', [id]);
    return res.rows[0];
  },
  findEntryByCombo: async (semester, section, subject, course_code) => {
    const res = await pool.query('SELECT * FROM marks_entries WHERE semester = $1 AND section = $2 AND subject = $3 AND course_code = $4', [semester, section, subject, course_code]);
    return res.rows[0];
  },
  listEntries: async (faculty_id) => {
    if (faculty_id) {
      const res = await pool.query('SELECT * FROM marks_entries WHERE faculty_id = $1 ORDER BY updated_at DESC', [faculty_id]);
      return res.rows;
    }
    const res = await pool.query('SELECT * FROM marks_entries ORDER BY updated_at DESC');
    return res.rows;
  },
  deleteEntry: async (id) => {
    await pool.query('DELETE FROM marks_entries WHERE id = $1', [id]);
  },

  // Student marks
  insertMark: async (entry_id, usn, name, ia1, ia2, ia3, quiz, aat, lab_exam) => {
    await pool.query('INSERT INTO student_marks (entry_id, usn, name, ia1, ia2, ia3, quiz, aat, lab_exam) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [entry_id, usn, name, ia1, ia2, ia3, quiz, aat, lab_exam]);
  },
  deleteMarksByEntry: async (entry_id) => {
    await pool.query('DELETE FROM student_marks WHERE entry_id = $1', [entry_id]);
  },
  findMarksByEntry: async (entry_id) => {
    const res = await pool.query('SELECT * FROM student_marks WHERE entry_id = $1', [entry_id]);
    return res.rows;
  },
  countStudentsByEntry: async (entry_id) => {
    const res = await pool.query('SELECT COUNT(*) as cnt FROM student_marks WHERE entry_id = $1', [entry_id]);
    return parseInt(res.rows[0].cnt);
  }
};
