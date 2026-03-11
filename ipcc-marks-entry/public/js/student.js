// Student Dashboard Logic
if (!requireAuth('student')) throw new Error('Unauthorized');
document.getElementById('navUserName').textContent = localStorage.getItem('userName') || 'Student';

function markColor(val, max) {
  if (!val || val === '' || val === '—') return 'empty';
  var n = parseInt(val);
  if (isNaN(n)) return 'empty';
  var pct = (n / max) * 100;
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'avg';
  return 'low';
}

function displayVal(val) {
  if (!val || val === '') return '—';
  return val;
}

async function loadStudentMarks() {
  var container = document.getElementById('studentMarks');
  var statsBar = document.getElementById('statsBar');

  try {
    var res = await fetch('/api/marks', { headers: getAuthHeaders() });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (!data.entries.length) {
      container.innerHTML = '<div class="empty">No marks have been entered for your USN yet. Check back later.</div>';
      statsBar.style.display = 'none';
      return;
    }

    // Calculate summary stats
    var totalSubjects = data.entries.length;
    var allTheoryMarks = [];
    var allLabMarks = [];

    data.entries.forEach(function (entry) {
      var s = entry.students[0];
      if (!s) return;
      ['ia1', 'ia2', 'ia3'].forEach(function (k) {
        var v = parseInt(s.theory && s.theory[k]);
        if (!isNaN(v)) allTheoryMarks.push(v);
      });
      ['internal', 'external'].forEach(function (k) {
        var v = parseInt(s.lab && s.lab[k]);
        if (!isNaN(v)) allLabMarks.push(v);
      });
    });

    var avgTheory = allTheoryMarks.length ? Math.round(allTheoryMarks.reduce(function (a, b) { return a + b; }, 0) / allTheoryMarks.length) : 0;
    var avgLab = allLabMarks.length ? Math.round(allLabMarks.reduce(function (a, b) { return a + b; }, 0) / allLabMarks.length) : 0;

    // Update stats
    document.getElementById('statSubjects').textContent = totalSubjects;
    document.getElementById('statTheoryAvg').textContent = avgTheory;
    document.getElementById('statLabAvg').textContent = avgLab;

    // Build cards
    container.innerHTML = data.entries.map(function (entry, idx) {
      var student = entry.students[0];
      if (!student) return '';

      return '<div class="marks-card" style="animation-delay:' + (idx * 0.1) + 's">' +
        '<div class="subject-header">' +
        '<h3>' + entry.subject + '</h3>' +
        '<div>' +
        '<span class="sub-badge theory">Sem ' + entry.semester + '</span> ' +
        '<span class="sub-badge lab">Sec ' + entry.section + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="meta">' +
        '<span>USN: ' + student.usn + '</span>' +
        '<span class="dot"></span>' +
        '<span>Updated: ' + new Date(entry.updatedAt).toLocaleDateString() + '</span>' +
        '</div>' +

        '<div class="marks-section-label theory-label">Theory Marks</div>' +
        '<div class="marks-row">' +
        '<div class="mark-box"><div class="mk-label">IA 1</div><div class="mk-val ' + markColor(student.theory && student.theory.ia1, 50) + '">' + displayVal(student.theory && student.theory.ia1) + '</div></div>' +
        '<div class="mark-box"><div class="mk-label">IA 2</div><div class="mk-val ' + markColor(student.theory && student.theory.ia2, 50) + '">' + displayVal(student.theory && student.theory.ia2) + '</div></div>' +
        '<div class="mark-box"><div class="mk-label">IA 3</div><div class="mk-val ' + markColor(student.theory && student.theory.ia3, 50) + '">' + displayVal(student.theory && student.theory.ia3) + '</div></div>' +
        '<div class="mark-box"><div class="mk-label">Assignment</div><div class="mk-val ' + markColor(student.theory && student.theory.assignment, 20) + '">' + displayVal(student.theory && student.theory.assignment) + '</div></div>' +
        '</div>' +

        '<div class="marks-section-label lab-label">Lab Marks</div>' +
        '<div class="marks-row">' +
        '<div class="mark-box"><div class="mk-label">Internal</div><div class="mk-val ' + markColor(student.lab && student.lab.internal, 50) + '">' + displayVal(student.lab && student.lab.internal) + '</div></div>' +
        '<div class="mark-box"><div class="mk-label">External</div><div class="mk-val ' + markColor(student.lab && student.lab.external, 50) + '">' + displayVal(student.lab && student.lab.external) + '</div></div>' +
        '</div>' +
        '</div>';
    }).join('');

  } catch (err) {
    container.innerHTML = '<div class="empty">Error loading marks: ' + err.message + '</div>';
  }
}

loadStudentMarks();
