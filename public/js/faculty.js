// Faculty Dashboard Logic
if (!requireAuth('faculty')) throw new Error('Unauthorized');
document.getElementById('navUserName').textContent = localStorage.getItem('userName') || 'Faculty';

var uploadedStudents = [];
var currentEntryId = null;
var courseDetailsSaved = false;
var entryDirty = true;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
}

function readStudentPayload(s) {
    var theory = s.theory || {};
    var lab = s.lab || {};
    return {
        usn: s.usn,
        name: s.name,
        theory: {
            ia1: theory.ia1 !== undefined ? theory.ia1 : '',
            ia2: theory.ia2 !== undefined ? theory.ia2 : '',
            ia3: theory.ia3 !== undefined ? theory.ia3 : '',
            quiz: theory.quiz !== undefined ? theory.quiz : '',
            aat: theory.aat !== undefined ? theory.aat : ''
        },
        lab: {
            exam: lab.exam !== undefined ? lab.exam : (lab.marks !== undefined ? lab.marks : (lab.internal !== undefined ? lab.internal : ''))
        }
    };
}

function setCourseDetailsSaved(isSaved) {
    courseDetailsSaved = isSaved;
    var badge = document.getElementById('courseSavedBadge');
    var btn = document.getElementById('saveCourseBtn');
    if (!badge || !btn) return;
    badge.style.display = isSaved ? 'inline-flex' : 'none';
    btn.textContent = isSaved ? 'Course Details Saved' : 'Save Course Details';
}

function setDownloadsReady(isReady) {
    entryDirty = !isReady;
    var excelBtn = document.getElementById('downloadExcelBtn');
    var csvBtn = document.getElementById('downloadCsvBtn');
    if (excelBtn) excelBtn.style.display = isReady ? 'inline-flex' : 'none';
    if (csvBtn) csvBtn.style.display = isReady ? 'inline-flex' : 'none';
}

function markEntryDirty() {
    setDownloadsReady(false);
}

function syncMarksFromInputs() {
    document.querySelectorAll('#theoryTable input').forEach(function (input) {
        var idx = Number(input.dataset.idx);
        var field = input.dataset.field;
        if (!Number.isNaN(idx) && uploadedStudents[idx] && field) {
            uploadedStudents[idx].theory[field] = input.value;
        }
    });

    document.querySelectorAll('#labTable input').forEach(function (input) {
        var idx = Number(input.dataset.idx);
        if (!Number.isNaN(idx) && uploadedStudents[idx]) {
            uploadedStudents[idx].lab.exam = input.value;
        }
    });
}

function saveCourseDetails() {
    var semester = document.getElementById('semester').value;
    var section = document.getElementById('section').value;
    var subject = document.getElementById('subject').value.trim();
    var courseCode = document.getElementById('courseCode').value.trim();

    if (!semester || !section || !subject || !courseCode) {
        setCourseDetailsSaved(false);
        showToast('Please fill semester, section, subject, and course code', 'error');
        return;
    }

    setCourseDetailsSaved(true);
    showToast('Course details saved');
}

['semester', 'section', 'subject', 'courseCode'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { setCourseDetailsSaved(false); markEntryDirty(); });
    if (el) el.addEventListener('change', function () { setCourseDetailsSaved(false); markEntryDirty(); });
});

// ---- STATS ----
async function loadStats() {
    try {
        var [entriesRes, usersRes] = await Promise.all([
            fetch('/api/entries', { headers: getAuthHeaders() }),
            fetch('/api/users', { headers: getAuthHeaders() })
        ]);
        var entriesData = await entriesRes.json();
        var usersData = await usersRes.json();

        var totalStudents = entriesData.entries.reduce(function (sum, e) { return sum + e.studentCount; }, 0);

        document.getElementById('statEntries').textContent = entriesData.entries.length;
        document.getElementById('statStudents').textContent = totalStudents;
        document.getElementById('statUsers').textContent = usersData.users.length;
    } catch (err) {
        console.error(err);
    }
}

// ---- FILE UPLOAD ----
var fileInput = document.getElementById('fileInput');
var uploadZone = document.getElementById('uploadZone');

uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', function () { uploadZone.classList.remove('dragover'); });
uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileUpload();
    }
});
fileInput.addEventListener('change', handleFileUpload);

async function handleFileUpload() {
    var file = fileInput.files[0];
    if (!file) return;

    var formData = new FormData();
    formData.append('file', file);

    try {
        var res = await fetch('/api/upload-students', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        uploadedStudents = data.students.map(readStudentPayload);
        currentEntryId = null;

        var badge = document.getElementById('studentCountBadge');
        badge.style.display = 'inline-flex';
        badge.textContent = uploadedStudents.length + ' students loaded from ' + file.name;

        buildMarksTable();
        document.getElementById('marksCard').style.display = 'block';
        setDownloadsReady(false);
        showToast(uploadedStudents.length + ' students uploaded successfully');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---- MARKS TABLE ----
function buildMarksTable() {
    var theoryBody = document.getElementById('theoryBody');
    var labBody = document.getElementById('labBody');
    theoryBody.innerHTML = '';
    labBody.innerHTML = '';

    uploadedStudents.forEach(function (s, i) {
        var tRow = document.createElement('tr');
        tRow.innerHTML =
            '<td class="col-sl">' + (i + 1) + '</td>' +
            '<td class="col-usn">' + escapeHtml(s.usn) + '</td>' +
            '<td class="col-name" title="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</td>' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia1" value="' + escapeHtml(s.theory.ia1) + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia2" value="' + escapeHtml(s.theory.ia2) + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia3" value="' + escapeHtml(s.theory.ia3) + '" placeholder="-">' +
            '<td><input type="number" min="0" max="30" data-idx="' + i + '" data-field="quiz" value="' + escapeHtml(s.theory.quiz) + '" placeholder="-">' +
            '<td><input type="number" min="0" max="10" data-idx="' + i + '" data-field="aat" value="' + escapeHtml(s.theory.aat) + '" placeholder="-">';
        theoryBody.appendChild(tRow);

        var lRow = document.createElement('tr');
        lRow.innerHTML =
            '<td class="col-sl">' + (i + 1) + '</td>' +
            '<td class="col-usn">' + escapeHtml(s.usn) + '</td>' +
            '<td class="col-name" title="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</td>' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="labExam" value="' + escapeHtml(s.lab.exam) + '" placeholder="-">';
        labBody.appendChild(lRow);
    });

    document.getElementById('theoryTable').oninput = function (e) {
        if (e.target.tagName === 'INPUT') {
            var val = e.target.value;
            var field = e.target.dataset.field;
            var maxVal = field === 'quiz' ? 30 : (field === 'aat' ? 10 : 50);
            if (val !== '' && (Number(val) > maxVal || Number(val) < 0)) {
                e.target.style.border = '2px solid #ef4444';
                showToast('Marks must be between 0 and ' + maxVal, 'error');
                return;
            }
            e.target.style.border = '';
            var idx = +e.target.dataset.idx;
            uploadedStudents[idx].theory[field] = val;
            markEntryDirty();
        }
    };

    document.getElementById('labTable').oninput = function (e) {
        if (e.target.tagName === 'INPUT') {
            var val = e.target.value;
            if (val !== '' && (Number(val) > 50 || Number(val) < 0)) {
                e.target.style.border = '2px solid #ef4444';
                showToast('Marks must be between 0 and 50', 'error');
                return;
            }
            e.target.style.border = '';
            var idx = +e.target.dataset.idx;
            uploadedStudents[idx].lab.exam = val;
            markEntryDirty();
        }
    };
}

// ---- TABS ----
function switchTab(tab) {
    document.getElementById('theorySection').style.display = tab === 'theory' ? 'block' : 'none';
    document.getElementById('labSection').style.display = tab === 'lab' ? 'block' : 'none';
    document.getElementById('tabTheory').className = tab === 'theory' ? 'active' : '';
    document.getElementById('tabLab').className = tab === 'lab' ? 'active' : '';
}

// ---- SAVE ----
async function saveMarks() {
    var semester = document.getElementById('semester').value;
    var section = document.getElementById('section').value;
    var subject = document.getElementById('subject').value.trim();
    var courseCode = document.getElementById('courseCode').value.trim();

    if (!semester || !section || !subject || !courseCode) {
        showToast('Please fill semester, section, subject, and course code', 'error');
        return;
    }
    if (!courseDetailsSaved) {
        showToast('Save course details first', 'error');
        return;
    }
    if (!uploadedStudents.length) {
        showToast('Upload a student list first', 'error');
        return;
    }
    syncMarksFromInputs();

    // Client-side validation
    for (var vi = 0; vi < uploadedStudents.length; vi++) {
        var st = uploadedStudents[vi];
        // IA1, IA2, IA3 max 50
        var iaVals = [st.theory.ia1, st.theory.ia2, st.theory.ia3];
        for (var vj = 0; vj < iaVals.length; vj++) {
            if (iaVals[vj] !== '' && iaVals[vj] !== null && iaVals[vj] !== undefined) {
                var num = Number(iaVals[vj]);
                if (isNaN(num) || num < 0 || num > 50) {
                    showToast('IA marks must be between 0 and 50. Check ' + st.usn, 'error');
                    return;
                }
            }
        }
        if (st.theory.quiz !== '' && st.theory.quiz !== null && st.theory.quiz !== undefined) {
            var quizNum = Number(st.theory.quiz);
            if (isNaN(quizNum) || quizNum < 0 || quizNum > 30) {
                showToast('Quiz marks must be between 0 and 30. Check ' + st.usn, 'error');
                return;
            }
        }
        if (st.theory.aat !== '' && st.theory.aat !== null && st.theory.aat !== undefined) {
            var aatNum = Number(st.theory.aat);
            if (isNaN(aatNum) || aatNum < 0 || aatNum > 10) {
                showToast('AAT marks must be between 0 and 10. Check ' + st.usn, 'error');
                return;
            }
        }
        if (st.lab.exam !== '' && st.lab.exam !== null && st.lab.exam !== undefined) {
            var labNum = Number(st.lab.exam);
            if (isNaN(labNum) || labNum < 0 || labNum > 50) {
                showToast('Lab exam marks must be between 0 and 50. Check ' + st.usn, 'error');
                return;
            }
        }
    }

    var saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        var res = await fetch('/api/marks', {
            method: 'POST',
            headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ semester: semester, section: section, subject: subject, courseCode: courseCode, students: uploadedStudents })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentEntryId = data.entryId;
        showToast('Marks saved successfully');

        setDownloadsReady(true);
        loadSavedEntries();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Marks';
    }
}

// ---- DOWNLOADS ----
function getTokenParam() { return '?token=' + (localStorage.getItem('token') || ''); }

function downloadExcel() {
    if (!currentEntryId) return showToast('Save marks first', 'error');
    if (entryDirty) return showToast('Save marks before downloading the latest Excel', 'error');
    window.location.href = '/api/download/excel/' + currentEntryId + getTokenParam();
}

function downloadCSV() {
    if (!currentEntryId) return showToast('Save marks first', 'error');
    if (entryDirty) return showToast('Save marks before downloading the latest CSV', 'error');
    window.location.href = '/api/download/csv/' + currentEntryId + getTokenParam();
}

// ---- SAVED ENTRIES ----
async function loadSavedEntries() {
    try {
        var res = await fetch('/api/entries', { headers: getAuthHeaders() });
        var data = await res.json();
        var list = document.getElementById('entriesList');

        if (!data.entries.length) {
            list.innerHTML = '<div class="empty">No entries saved yet. Create one above.</div>';
            return;
        }

        list.innerHTML = data.entries.map(function (e, i) {
            var courseCodeText = e.courseCode ? ' &middot; ' + escapeHtml(e.courseCode) : '';
            return '<div class="entry-row" style="animation-delay:' + (i * 0.06) + 's">' +
                '<div class="entry-info">' +
                '<div class="entry-name">' + escapeHtml(e.subject) + '</div>' +
                '<div class="entry-detail">Sem ' + escapeHtml(e.semester) + ' &middot; Sec ' + escapeHtml(e.section) + courseCodeText + ' &middot; ' + e.studentCount + ' students &middot; ' + new Date(e.updatedAt).toLocaleString() + '</div>' +
                '</div>' +
                '<div class="entry-btns">' +
                '<button class="btn btn-primary btn-sm" onclick="downloadEntryExcel(\'' + e.id + '\')">Excel</button>' +
                '<button class="btn btn-outline btn-sm" onclick="downloadEntryCsv(\'' + e.id + '\')">CSV</button>' +
                '<button class="btn btn-outline btn-sm" onclick="loadEntry(\'' + e.id + '\')">Edit</button>' +
                '<button class="btn btn-danger btn-sm" onclick="confirmDeleteEntry(\'' + e.id + '\', \'' + e.subject.replace(/'/g, "\\'") + '\')">Delete</button>' +
                '</div>' +
                '</div>';
        }).join('');
    } catch (err) {
        console.error(err);
    }
}

function downloadEntryExcel(id) { window.location.href = '/api/download/excel/' + id + getTokenParam(); }
function downloadEntryCsv(id) { window.location.href = '/api/download/csv/' + id + getTokenParam(); }

async function loadEntry(id) {
    try {
        var res = await fetch('/api/marks/' + id, { headers: getAuthHeaders() });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        var entry = data.entry;
        document.getElementById('semester').value = entry.semester;
        document.getElementById('section').value = entry.section;
        document.getElementById('subject').value = entry.subject;
        document.getElementById('courseCode').value = entry.courseCode || '';
        setCourseDetailsSaved(true);

        uploadedStudents = entry.students.map(readStudentPayload);
        currentEntryId = entry.id;

        var badge = document.getElementById('studentCountBadge');
        badge.style.display = 'inline-flex';
        badge.textContent = uploadedStudents.length + ' students loaded';

        buildMarksTable();
        document.getElementById('marksCard').style.display = 'block';
        setDownloadsReady(true);

        showToast('Entry loaded for editing');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==============================
//  USER MANAGEMENT
// ==============================
function toggleAddUserForm() {
    var form = document.getElementById('addUserForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function toggleUsnField() {
    var role = document.getElementById('newRole').value;
    document.getElementById('usnFieldGroup').style.display = role === 'student' ? 'block' : 'none';
}

async function createUser() {
    var name = document.getElementById('newName').value.trim();
    var username = document.getElementById('newUsername').value.trim();
    var password = document.getElementById('newPassword').value.trim();
    var role = 'faculty';

    if (!name || !username || !password) {
        showToast('Fill in name, username, and password', 'error');
        return;
    }

    try {
        var res = await fetch('/api/users', {
            method: 'POST',
            headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ name: name, username: username, password: password, role: role })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Account created for ' + name);
        document.getElementById('newName').value = '';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        toggleAddUserForm();
        loadUsers();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteUser(id, name) {
    if (!confirm('Delete user "' + name + '"? This cannot be undone.')) return;
    try {
        var res = await fetch('/api/users/' + id, { method: 'DELETE', headers: getAuthHeaders() });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('User removed');
        loadUsers();
        loadStats();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadUsers() {
    try {
        var res = await fetch('/api/users', { headers: getAuthHeaders() });
        var data = await res.json();
        var list = document.getElementById('userList');

        if (!data.users.length) {
            list.innerHTML = '<div class="empty">No users found.</div>';
            return;
        }

        list.innerHTML = data.users.map(function (u) {
            var initials = u.name.split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
            var avClass = u.role === 'student' ? 'user-avatar student-av' : 'user-avatar';
            return '<div class="user-row">' +
                '<div class="user-meta">' +
                '<div class="' + avClass + '">' + initials + '</div>' +
                '<div>' +
                '<div class="user-name">' + u.name + '</div>' +
                '<div class="user-detail">@' + u.username + ' &middot; ' + u.role + (u.usn ? ' &middot; ' + u.usn : '') + '</div>' +
                '</div>' +
                '</div>' +
                '<button class="btn btn-danger btn-xs" onclick="deleteUser(\'' + u.id + '\', \'' + u.name.replace(/'/g, "\\'") + '\')">Remove</button>' +
                '</div>';
        }).join('');
    } catch (err) {
        console.error(err);
    }
}

// ==============================
//  DELETE ENTRY WITH CONFIRMATION
// ==============================
function confirmDeleteEntry(id, subjectName) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
        '<div class="modal-box">' +
        '<h3>Delete Entry</h3>' +
        '<p>You are about to permanently delete the marks entry for <strong>' + subjectName + '</strong>. This action cannot be undone.</p>' +
        '<div class="modal-warn">All student marks for this entry will be permanently removed.</div>' +
        '<label style="font-size:0.78rem;font-weight:600;color:#475569;margin-bottom:0.35rem;display:block;">Type <strong>DELETE</strong> to confirm:</label>' +
        '<input type="text" class="modal-input" id="deleteConfirmInput" placeholder="Type DELETE here" autocomplete="off">' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost btn-sm" id="modalCancelBtn">Cancel</button>' +
        '<button class="btn btn-danger btn-sm" id="modalDeleteBtn" disabled>Delete Entry</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var input = document.getElementById('deleteConfirmInput');
    var deleteBtn = document.getElementById('modalDeleteBtn');
    var cancelBtn = document.getElementById('modalCancelBtn');

    input.focus();
    input.addEventListener('input', function () {
        deleteBtn.disabled = input.value.trim() !== 'DELETE';
    });

    cancelBtn.addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    deleteBtn.addEventListener('click', async function () {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        try {
            var res = await fetch('/api/marks/' + id, { method: 'DELETE', headers: getAuthHeaders() });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error);
            overlay.remove();
            showToast('Entry deleted');
            loadSavedEntries();
            loadStats();
        } catch (err) {
            showToast(err.message, 'error');
            overlay.remove();
        }
    });
}

// ---- INIT ----
loadSavedEntries();
loadUsers();
loadStats();
