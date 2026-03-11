const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { generateExcel, generateCSV, parseStudentFile } = require('./excelService');
const {
    db, findUser, findUserById, insertSession, findSession, deleteSession,
    insertEntry, updateEntry, findEntry, findEntryByCombo, listEntries,
    insertMark, deleteMarksByEntry, findMarksByEntry, findMarksByUsn
} = require('./database');

const app = express();
const PORT = 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Multer config ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
        else cb(new Error('Only .xlsx, .xls, .csv files are allowed'));
    }
});

// --- Auth Middleware ---
function authenticate(requiredRole) {
    return (req, res, next) => {
        const token = req.headers['x-auth-token'] || req.query.token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const session = findSession.get(token);
        if (!session) return res.status(401).json({ error: 'Invalid session' });
        if (requiredRole && session.role !== requiredRole) return res.status(403).json({ error: 'Forbidden' });
        req.session = session;
        next();
    };
}

// ========================
//  AUTH
// ========================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = findUser.get(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = uuidv4();
    insertSession.run(token, user.id, user.role, new Date().toISOString());
    res.json({ token, role: user.role, name: user.name, userId: user.id });
});

app.post('/api/logout', (req, res) => {
    const token = req.headers['x-auth-token'];
    if (!token) return res.status(400).json({ error: 'No token' });
    deleteSession.run(token);
    res.json({ message: 'Logged out' });
});

// ========================
//  UPLOAD STUDENTS FILE
// ========================
app.post('/api/upload-students', authenticate('faculty'), upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const students = parseStudentFile(req.file.path);
        if (!students.length) return res.status(400).json({ error: 'No valid USN/Name data found. Ensure columns are named USN and Name.' });
        fs.unlinkSync(req.file.path);
        res.json({ students });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse file: ' + err.message });
    }
});

// ========================
//  SAVE MARKS
// ========================
app.post('/api/marks', authenticate('faculty'), (req, res) => {
    const { semester, section, subject, students } = req.body;
    if (!semester || !section || !subject || !students || !students.length) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const now = new Date().toISOString();
    const existing = findEntryByCombo.get(semester, section, subject);

    let entryId;
    if (existing) {
        entryId = existing.id;
        updateEntry.run(semester, section, subject, req.session.user_id, now, entryId);
        deleteMarksByEntry.run(entryId);
    } else {
        entryId = uuidv4();
        insertEntry.run(entryId, semester, section, subject, req.session.user_id, now);
    }

    // Insert all student marks
    const insert = db.transaction((students) => {
        for (const s of students) {
            insertMark.run(
                entryId, s.usn, s.name,
                s.theory?.ia1 || '', s.theory?.ia2 || '', s.theory?.ia3 || '', s.theory?.assignment || '',
                s.lab?.internal || '', s.lab?.external || ''
            );
        }
    });
    insert(students);

    res.json({ message: 'Marks saved successfully', entryId });
});

// ========================
//  GET MARKS
// ========================
app.get('/api/marks', authenticate(), (req, res) => {
    const { semester, section, subject } = req.query;

    if (req.session.role === 'student') {
        const user = findUserById.get(req.session.user_id);
        if (!user || !user.usn) return res.json({ entries: [] });
        const rows = findMarksByUsn.all(user.usn);

        // Group by entry
        const map = {};
        for (const r of rows) {
            if (!map[r.entry_id]) {
                map[r.entry_id] = { id: r.entry_id, semester: r.semester, section: r.section, subject: r.subject, updatedAt: r.updated_at, students: [] };
            }
            map[r.entry_id].students.push({
                usn: r.usn, name: r.name,
                theory: { ia1: r.ia1, ia2: r.ia2, ia3: r.ia3, assignment: r.assignment },
                lab: { internal: r.lab_internal, external: r.lab_external }
            });
        }
        return res.json({ entries: Object.values(map) });
    }

    // Faculty: get all entries
    let entries = listEntries.all();
    if (semester) entries = entries.filter(e => e.semester === semester);
    if (section) entries = entries.filter(e => e.section === section);
    if (subject) entries = entries.filter(e => e.subject === subject);

    const result = entries.map(e => {
        const marks = findMarksByEntry.all(e.id);
        return {
            id: e.id, semester: e.semester, section: e.section, subject: e.subject, updatedAt: e.updated_at,
            students: marks.map(m => ({
                usn: m.usn, name: m.name,
                theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, assignment: m.assignment },
                lab: { internal: m.lab_internal, external: m.lab_external }
            }))
        };
    });

    res.json({ entries: result });
});

app.get('/api/marks/:id', authenticate(), (req, res) => {
    const entry = findEntry.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const marks = findMarksByEntry.all(entry.id);

    res.json({
        entry: {
            id: entry.id, semester: entry.semester, section: entry.section, subject: entry.subject, updatedAt: entry.updated_at,
            students: marks.map(m => ({
                usn: m.usn, name: m.name,
                theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, assignment: m.assignment },
                lab: { internal: m.lab_internal, external: m.lab_external }
            }))
        }
    });
});

// ========================
//  DOWNLOAD EXCEL
// ========================
app.get('/api/download/excel/:id', authenticate(), (req, res) => {
    const entry = findEntry.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const marks = findMarksByEntry.all(entry.id);

    const data = {
        ...entry,
        students: marks.map(m => ({
            usn: m.usn, name: m.name,
            theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, assignment: m.assignment },
            lab: { internal: m.lab_internal, external: m.lab_external }
        }))
    };

    const buffer = generateExcel(data);
    const filename = entry.subject + '_Sem' + entry.semester + '_Sec' + entry.section + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buffer);
});

// ========================
//  DOWNLOAD CSV
// ========================
app.get('/api/download/csv/:id', authenticate(), (req, res) => {
    const entry = findEntry.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const marks = findMarksByEntry.all(entry.id);

    const data = {
        ...entry,
        students: marks.map(m => ({
            usn: m.usn, name: m.name,
            theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, assignment: m.assignment },
            lab: { internal: m.lab_internal, external: m.lab_external }
        }))
    };

    const { theoryCsv, labCsv } = generateCSV(data);
    const combined = '--- THEORY MARKS ---\n' + theoryCsv + '\n\n--- LAB MARKS ---\n' + labCsv;
    const filename = entry.subject + '_Sem' + entry.semester + '_Sec' + entry.section + '.csv';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(combined);
});

// ========================
//  LIST ENTRIES
// ========================
app.get('/api/entries', authenticate(), (req, res) => {
    const entries = listEntries.all();
    const result = entries.map(e => {
        const count = db.prepare('SELECT COUNT(*) as cnt FROM student_marks WHERE entry_id = ?').get(e.id);
        return {
            id: e.id, semester: e.semester, section: e.section, subject: e.subject,
            studentCount: count.cnt,
            updatedAt: e.updated_at
        };
    });
    res.json({ entries: result });
});

// ========================
//  DELETE ENTRY
// ========================
app.delete('/api/marks/:id', authenticate('faculty'), (req, res) => {
    const entry = findEntry.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    deleteMarksByEntry.run(req.params.id);
    db.prepare('DELETE FROM marks_entries WHERE id = ?').run(req.params.id);
    res.json({ message: 'Entry deleted' });
});

// ========================
//  USER MANAGEMENT (faculty only)
// ========================
app.get('/api/users', authenticate('faculty'), (req, res) => {
    const users = db.prepare('SELECT id, username, role, name, usn FROM users ORDER BY role, name').all();
    res.json({ users });
});

app.post('/api/users', authenticate('faculty'), (req, res) => {
    const { username, password, role, name, usn } = req.body;
    if (!username || !password || !role || !name) {
        return res.status(400).json({ error: 'Username, password, role, and name are required' });
    }
    if (!['faculty', 'student'].includes(role)) {
        return res.status(400).json({ error: 'Role must be faculty or student' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, password, role, name, usn) VALUES (?, ?, ?, ?, ?, ?)').run(id, username, password, role, name, usn || null);
    res.json({ message: 'User created', userId: id });
});

app.delete('/api/users/:id', authenticate('faculty'), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted' });
});

// --- Start ---
app.listen(PORT, () => {
    console.log('IPCC Marks Entry Server running at http://localhost:' + PORT);
});
