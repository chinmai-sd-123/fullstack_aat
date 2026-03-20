// Faculty Dashboard Logic
if (!requireAuth('faculty')) throw new Error('Unauthorized');
document.getElementById('navUserName').textContent = localStorage.getItem('userName') || 'Faculty';

var uploadedStudents = [];
var currentEntryId = null;

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

        uploadedStudents = data.students.map(function (s) {
            return {
                usn: s.usn,
                name: s.name,
                theory: {
                    ia1: s.theory && s.theory.ia1 !== undefined ? s.theory.ia1 : '',
                    ia2: s.theory && s.theory.ia2 !== undefined ? s.theory.ia2 : '',
                    ia3: s.theory && s.theory.ia3 !== undefined ? s.theory.ia3 : '',
                    assignment: s.theory && s.theory.assignment !== undefined ? s.theory.assignment : ''
                },
                lab: {
                    internal: s.lab && s.lab.internal !== undefined ? s.lab.internal : '',
                    external: s.lab && s.lab.external !== undefined ? s.lab.external : ''
                }
            };
        });

        var badge = document.getElementById('studentCountBadge');
        badge.style.display = 'inline-flex';
        badge.textContent = uploadedStudents.length + ' students loaded from ' + file.name;

        buildMarksTable();
        document.getElementById('marksCard').style.display = 'block';
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
            '<td class="col-usn">' + s.usn + '</td>' +
            '<td class="col-name" title="' + s.name + '">' + s.name + '</td>' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia1" value="' + s.theory.ia1 + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia2" value="' + s.theory.ia2 + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="ia3" value="' + s.theory.ia3 + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="assignment" value="' + s.theory.assignment + '" placeholder="-">';
        theoryBody.appendChild(tRow);

        var lRow = document.createElement('tr');
        lRow.innerHTML =
            '<td class="col-sl">' + (i + 1) + '</td>' +
            '<td class="col-usn">' + s.usn + '</td>' +
            '<td class="col-name" title="' + s.name + '">' + s.name + '</td>' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="labInternal" value="' + s.lab.internal + '" placeholder="-">' +
            '<td><input type="number" min="0" max="50" data-idx="' + i + '" data-field="labExternal" value="' + s.lab.external + '" placeholder="-">';
        labBody.appendChild(lRow);
    });

    document.getElementById('theoryTable').addEventListener('input', function (e) {
        if (e.target.tagName === 'INPUT') {
            var val = e.target.value;
            if (val !== '' && (Number(val) > 50 || Number(val) < 0)) {
                e.target.style.border = '2px solid #ef4444';
                showToast('Marks must be between 0 and 50', 'error');
                return;
            }
            e.target.style.border = '';
            var idx = +e.target.dataset.idx;
            var field = e.target.dataset.field;
            uploadedStudents[idx].theory[field] = val;
        }
    });

    document.getElementById('labTable').addEventListener('input', function (e) {
        if (e.target.tagName === 'INPUT') {
            var val = e.target.value;
            if (val !== '' && (Number(val) > 50 || Number(val) < 0)) {
                e.target.style.border = '2px solid #ef4444';
                showToast('Marks must be between 0 and 50', 'error');
                return;
            }
            e.target.style.border = '';
            var idx = +e.target.dataset.idx;
            var field = e.target.dataset.field;
            if (field === 'labInternal') uploadedStudents[idx].lab.internal = val;
            if (field === 'labExternal') uploadedStudents[idx].lab.external = val;
        }
    });
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

    if (!semester || !section || !subject) {
        showToast('Please fill semester, section, and subject', 'error');
        return;
    }
    if (!uploadedStudents.length) {
        showToast('Upload a student list first', 'error');
        return;
    }

    // Client-side validation: no marks > 50
    for (var vi = 0; vi < uploadedStudents.length; vi++) {
        var st = uploadedStudents[vi];
        var allVals = [st.theory.ia1, st.theory.ia2, st.theory.ia3, st.theory.assignment, st.lab.internal, st.lab.external];
        for (var vj = 0; vj < allVals.length; vj++) {
            if (allVals[vj] !== '' && allVals[vj] !== null && allVals[vj] !== undefined) {
                var num = Number(allVals[vj]);
                if (isNaN(num) || num < 0 || num > 50) {
                    showToast('Marks must be between 0 and 50. Check ' + st.usn, 'error');
                    return;
                }
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
            body: JSON.stringify({ semester: semester, section: section, subject: subject, students: uploadedStudents })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentEntryId = data.entryId;
        showToast('Marks saved successfully');

        document.getElementById('downloadExcelBtn').style.display = 'inline-flex';
        document.getElementById('downloadCsvBtn').style.display = 'inline-flex';
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
    window.location.href = '/api/download/excel/' + currentEntryId + getTokenParam();
}

function downloadCSV() {
    if (!currentEntryId) return showToast('Save marks first', 'error');
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
            return '<div class="entry-row" style="animation-delay:' + (i * 0.06) + 's">' +
                '<div class="entry-info">' +
                '<div class="entry-name">' + e.subject + '</div>' +
                '<div class="entry-detail">Sem ' + e.semester + ' &middot; Sec ' + e.section + ' &middot; ' + e.studentCount + ' students &middot; ' + new Date(e.updatedAt).toLocaleString() + '</div>' +
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

        uploadedStudents = entry.students;
        currentEntryId = entry.id;

        var badge = document.getElementById('studentCountBadge');
        badge.style.display = 'inline-flex';
        badge.textContent = uploadedStudents.length + ' students loaded';

        buildMarksTable();
        document.getElementById('marksCard').style.display = 'block';
        document.getElementById('downloadExcelBtn').style.display = 'inline-flex';
        document.getElementById('downloadCsvBtn').style.display = 'inline-flex';

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
    var role = document.getElementById('newRole').value;
    var usn = document.getElementById('newUsn').value.trim();

    if (!name || !username || !password) {
        showToast('Fill in name, username, and password', 'error');
        return;
    }

    try {
        var res = await fetch('/api/users', {
            method: 'POST',
            headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ name: name, username: username, password: password, role: role, usn: usn })
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Account created for ' + name);
        document.getElementById('newName').value = '';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newUsn').value = '';
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
