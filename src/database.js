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
                lab_internal TEXT DEFAULT '',
                lab_external TEXT DEFAULT ''
            );
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
  insertEntry: async (id, semester, section, subject, faculty_id, updated_at) => {
    await pool.query('INSERT INTO marks_entries (id, semester, section, subject, faculty_id, updated_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, semester, section, subject, faculty_id, updated_at]);
  },
  updateEntry: async (semester, section, subject, faculty_id, updated_at, id) => {
    await pool.query('UPDATE marks_entries SET semester = $1, section = $2, subject = $3, faculty_id = $4, updated_at = $5 WHERE id = $6', [semester, section, subject, faculty_id, updated_at, id]);
  },
  findEntry: async (id) => {
    const res = await pool.query('SELECT * FROM marks_entries WHERE id = $1', [id]);
    return res.rows[0];
  },
  findEntryByCombo: async (semester, section, subject) => {
    const res = await pool.query('SELECT * FROM marks_entries WHERE semester = $1 AND section = $2 AND subject = $3', [semester, section, subject]);
    return res.rows[0];
  },
  listEntries: async () => {
    const res = await pool.query('SELECT * FROM marks_entries ORDER BY updated_at DESC');
    return res.rows;
  },
  deleteEntry: async (id) => {
    await pool.query('DELETE FROM marks_entries WHERE id = $1', [id]);
  },

  // Student marks
  insertMark: async (entry_id, usn, name, ia1, ia2, ia3, assignment, lab_internal, lab_external) => {
    await pool.query('INSERT INTO student_marks (entry_id, usn, name, ia1, ia2, ia3, assignment, lab_internal, lab_external) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [entry_id, usn, name, ia1, ia2, ia3, assignment, lab_internal, lab_external]);
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
