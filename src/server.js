const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { generateExcel, generateCSV, parseStudentFile } = require('./excelService');
const {
    pool, findUser, findUserById, getAllUsers, findUserByUsername, insertUser, deleteUser,
    insertSession, findSession, deleteSession, deleteSessionsByUser,
    insertEntry, updateEntry, findEntry, findEntryByCombo, listEntries, deleteEntry,
    insertMark, deleteMarksByEntry, findMarksByEntry, countStudentsByEntry
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Multer config ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use system temp directory for serverless deploy compatibility
        cb(null, os.tmpdir());
    },
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
    return async (req, res, next) => {
        const token = req.headers['x-auth-token'] || req.query.token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const session = await findSession(token);
            if (!session) return res.status(401).json({ error: 'Invalid session' });
            if (requiredRole && session.role !== requiredRole) return res.status(403).json({ error: 'Forbidden' });
            req.session = session;
            next();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server error during auth' });
        }
    };
}

// ========================
//  AUTH
// ========================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await findUser(username, password);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const token = uuidv4();
        await insertSession(token, user.id, user.role, new Date().toISOString());
        res.json({ token, role: user.role, name: user.name, userId: user.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        const token = req.headers['x-auth-token'];
        if (!token) return res.status(400).json({ error: 'No token' });
        await deleteSession(token);
        res.json({ message: 'Logged out' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Logout failed' });
    }
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
app.post('/api/marks', authenticate('faculty'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { semester, section, subject, courseCode, students } = req.body;
        if (!semester || !section || !subject || !courseCode || !students || !students.length) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate marks
        for (const s of students) {
            // IA1, IA2, IA3: max 50
            const iaVals = [s.theory?.ia1, s.theory?.ia2, s.theory?.ia3];
            for (const v of iaVals) {
                if (v !== '' && v !== null && v !== undefined) {
                    const num = Number(v);
                    if (isNaN(num) || num < 0 || num > 50) {
                        return res.status(400).json({ error: 'IA marks must be between 0 and 50. Found: ' + v + ' for ' + s.usn });
                    }
                }
            }
            const quiz = s.theory?.quiz;
            if (quiz !== '' && quiz !== null && quiz !== undefined) {
                const num = Number(quiz);
                if (isNaN(num) || num < 0 || num > 30) {
                    return res.status(400).json({ error: 'Quiz marks must be between 0 and 30. Found: ' + quiz + ' for ' + s.usn });
                }
            }
            const aat = s.theory?.aat;
            if (aat !== '' && aat !== null && aat !== undefined) {
                const num = Number(aat);
                if (isNaN(num) || num < 0 || num > 10) {
                    return res.status(400).json({ error: 'AAT marks must be between 0 and 10. Found: ' + aat + ' for ' + s.usn });
                }
            }
            // Lab: max 50
            const labVal = s.lab?.exam ?? s.lab?.marks;
            if (labVal !== '' && labVal !== null && labVal !== undefined) {
                const num = Number(labVal);
                if (isNaN(num) || num < 0 || num > 50) {
                    return res.status(400).json({ error: 'Lab exam marks must be between 0 and 50. Found: ' + labVal + ' for ' + s.usn });
                }
            }
        }

        const now = new Date().toISOString();
        const existing = await findEntryByCombo(semester, section, subject, courseCode);

        await client.query('BEGIN'); // Start transaction

        let entryId;
        if (existing) {
            entryId = existing.id;
            await updateEntry(semester, section, subject, courseCode, req.session.user_id, now, entryId);
            await deleteMarksByEntry(entryId);
        } else {
            entryId = uuidv4();
            await insertEntry(entryId, semester, section, subject, courseCode, req.session.user_id, now);
        }

        // Insert all student marks
        for (const s of students) {
            await insertMark(
                entryId, s.usn, s.name,
                s.theory?.ia1 || '', s.theory?.ia2 || '', s.theory?.ia3 || '',
                s.theory?.quiz || '', s.theory?.aat || '', (s.lab?.exam ?? s.lab?.marks) || ''
            );
        }

        await client.query('COMMIT'); // End transaction
        res.json({ message: 'Marks saved successfully', entryId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to save marks: ' + err.message });
    } finally {
        client.release();
    }
});

// ========================
//  GET MARKS
// ========================
app.get('/api/marks', authenticate('faculty'), async (req, res) => {
    try {
        const { semester, section, subject } = req.query;

        // Faculty: get only their entries
        let entries = await listEntries(req.session.user_id);
        if (semester) entries = entries.filter(e => e.semester === semester);
        if (section) entries = entries.filter(e => e.section === section);
        if (subject) entries = entries.filter(e => e.subject === subject);

        const result = await Promise.all(entries.map(async (e) => {
            const marks = await findMarksByEntry(e.id);
            return {
                id: e.id, semester: e.semester, section: e.section, subject: e.subject, courseCode: e.course_code || '', updatedAt: e.updated_at,
                students: marks.map(m => ({
                    usn: m.usn, name: m.name,
                    theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, quiz: m.quiz || '', aat: m.aat || '' },
                    lab: { exam: m.lab_exam || m.lab_internal || '' }
                }))
            };
        }));

        res.json({ entries: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch marks' });
    }
});

app.get('/api/marks/:id', authenticate(), async (req, res) => {
    try {
        const entry = await findEntry(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        const marks = await findMarksByEntry(entry.id);

        res.json({
            entry: {
                id: entry.id, semester: entry.semester, section: entry.section, subject: entry.subject, courseCode: entry.course_code || '', updatedAt: entry.updated_at,
                students: marks.map(m => ({
                    usn: m.usn, name: m.name,
                    theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, quiz: m.quiz || '', aat: m.aat || '' },
                    lab: { exam: m.lab_exam || m.lab_internal || '' }
                }))
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch entry' });
    }
});

// ========================
//  DOWNLOAD EXCEL
// ========================
app.get('/api/download/excel/:id', authenticate(), async (req, res) => {
    try {
        const entry = await findEntry(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        const marks = await findMarksByEntry(entry.id);

        const data = {
            ...entry,
            students: marks.map(m => ({
                usn: m.usn, name: m.name,
                theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, quiz: m.quiz || '', aat: m.aat || '' },
                lab: { exam: m.lab_exam || m.lab_internal || '' }
            }))
        };

        const buffer = generateExcel(data);
        const filename = entry.subject + '_Sem' + entry.semester + '_Sec' + entry.section + '.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        res.send(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating Excel');
    }
});

// ========================
//  DOWNLOAD CSV
// ========================
app.get('/api/download/csv/:id', authenticate(), async (req, res) => {
    try {
        const entry = await findEntry(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        const marks = await findMarksByEntry(entry.id);

        const data = {
            ...entry,
            students: marks.map(m => ({
                usn: m.usn, name: m.name,
                theory: { ia1: m.ia1, ia2: m.ia2, ia3: m.ia3, quiz: m.quiz || '', aat: m.aat || '' },
                lab: { exam: m.lab_exam || m.lab_internal || '' }
            }))
        };

        const { theoryCsv } = generateCSV(data);
        const combined = theoryCsv;
        const filename = entry.subject + '_Sem' + entry.semester + '_Sec' + entry.section + '.csv';
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        res.send(combined);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating CSV');
    }
});

// ========================
//  LIST ENTRIES
// ========================
app.get('/api/entries', authenticate(), async (req, res) => {
    try {
        const entries = await listEntries(req.session.user_id);
        const result = await Promise.all(entries.map(async (e) => {
            const count = await countStudentsByEntry(e.id);
            return {
                id: e.id, semester: e.semester, section: e.section, subject: e.subject, courseCode: e.course_code || '',
                studentCount: count,
                updatedAt: e.updated_at
            };
        }));
        res.json({ entries: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

// ========================
//  DELETE ENTRY
// ========================
app.delete('/api/marks/:id', authenticate('faculty'), async (req, res) => {
    try {
        const entry = await findEntry(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });

        if (entry.faculty_id !== req.session.user_id) {
            return res.status(403).json({ error: 'Unauthorized to delete this entry' });
        }

        await deleteMarksByEntry(req.params.id);
        await deleteEntry(req.params.id);

        res.json({ message: 'Entry deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// ========================
//  USER MANAGEMENT (faculty only)
// ========================
app.get('/api/users', authenticate('faculty'), async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json({ users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', authenticate('faculty'), async (req, res) => {
    try {
        const { username, password, role, name, usn } = req.body;
        if (!username || !password || !role || !name) {
            return res.status(400).json({ error: 'Username, password, role, and name are required' });
        }
        if (!['faculty', 'student'].includes(role)) {
            return res.status(400).json({ error: 'Role must be faculty or student' });
        }

        const existing = await findUserByUsername(username);
        if (existing) return res.status(400).json({ error: 'Username already exists' });

        const id = uuidv4();
        await insertUser(id, username, password, role, name, usn || null);
        res.json({ message: 'User created', userId: id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.delete('/api/users/:id', authenticate('faculty'), async (req, res) => {
    try {
        const user = await findUserById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await deleteSessionsByUser(req.params.id);
        await deleteUser(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- Start ---
app.listen(PORT, () => {
    console.log('IPCC Marks Entry Server running at http://localhost:' + PORT);
});
