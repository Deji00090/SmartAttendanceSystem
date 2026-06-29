
// const API_BASE = "http://ayodeji1230-001-site1.ntempurl.com";

const API_BASE = "https://localhost:7040";
const token = localStorage.getItem("token");

const authHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
};


let lecturerEnrolledCourses = [];
let lecturerUnenrolledCourses = [];
let currentLat = null;
let currentLng = null;
let lecturerHistoryData = [];
let eligibilityData = [];


async function loadOverview() {
  setOverviewGreeting();

  // Fire all requests in parallel
  const [sessionsResult, historyResult, enrolledResult] = await Promise.allSettled([
    fetch(`${API_BASE}/api/Lecturer/ActiveSessions`,      { headers: authHeaders }).then(r => r.json()),
    fetch(`${API_BASE}/api/Lecturer/GetAttendanceRecord`, { headers: authHeaders }).then(r => r.json()),
    fetch(`${API_BASE}/api/Lecturer/EnrolledCourse`,      { headers: authHeaders }).then(r => r.json())
  ]);

  const activeSessions = sessionsResult.status === 'fulfilled' ? (sessionsResult.value.data || []) : [];
  const historyData    = historyResult.status  === 'fulfilled' ? (historyResult.value.data  || []) : [];
  const enrolledCourses = enrolledResult.status === 'fulfilled' ? (enrolledResult.value.data || []) : [];

  /* ── Stat: Active sessions ── */
  const liveCount = activeSessions.filter(s => s.isActive ?? s.IsActive).length;
  document.getElementById('ovActiveCount').textContent = liveCount;
  if (liveCount > 0) {
    const badge = document.getElementById('ovActiveBadge');
    badge.textContent = liveCount === 1 ? '1 session live' : `${liveCount} sessions live`;
    badge.style.display = 'inline-block';
  }

  /* ── Stat: Total sessions (from history) ── */
  document.getElementById('ovTotalSessions').textContent = historyData.length;

  /* ── Stat: Avg attendance rate ── */
  if (historyData.length > 0) {
    const rates = historyData
      .map(s => parseFloat((s.rate ?? s.Rate ?? '0').toString()))
      .filter(n => !isNaN(n));
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    document.getElementById('ovAvgRate').textContent = avg + '%';
    if (avg > 0) {
      const badge = document.getElementById('ovAvgBadge');
      badge.textContent = avg >= 75 ? 'Above threshold' : 'Below threshold';
      badge.className = `stat-badge ${avg >= 75 ? 'badge-green' : 'badge-orange'}`;
      badge.style.display = 'inline-block';
    }
  } else {
    document.getElementById('ovAvgRate').textContent = 'N/A';
  }

  /* ── Stat: At-risk students (fetch eligibility per course) ── */
  const lecturerId = localStorage.getItem('lecturerId');
  let atRisk = 0;
  if (enrolledCourses.length && lecturerId) {
    const eligResults = await Promise.allSettled(enrolledCourses.map(c =>
      fetch(
        `${API_BASE}/api/Lecturer/GetStudentEligibilityStatus?lectureid=${lecturerId}&courseid=${c.courseId ?? c.CourseId}`,
        { headers: authHeaders }
      ).then(r => r.ok ? r.json() : null)
    ));
    for (const er of eligResults) {
      if (er.status === 'fulfilled' && er.value?.data) {
        er.value.data.forEach(s => {
          const pct = parseFloat((s.eligibilitypercentage ?? s.EligibilityPercentage ?? '0').toString());
          if (pct < 75) atRisk++;
        });
      }
    }
  }
  document.getElementById('ovAtRisk').textContent = atRisk;
  if (atRisk > 0) {
    const badge = document.getElementById('ovRiskBadge');
    badge.textContent = 'Needs attention';
    badge.style.display = 'inline-block';
  }

  /* ── Active sessions table ── */
  renderOverviewActiveSessions(activeSessions);

  /* ── Recent records table (last 5) ── */
  renderOverviewRecentRecords(historyData.slice(0, 5));

  /* ── Update subtitle with live count ── */
  document.getElementById('overviewSub').textContent =
    new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    (liveCount > 0 ? ` · ${liveCount} live session${liveCount > 1 ? 's' : ''} running` : ' · No active sessions');
}

function setOverviewGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const username = localStorage.getItem('username') || 'Doctor';
  document.getElementById('overviewGreeting').textContent = `${greet}, ${username} 👋`;
}

function renderOverviewActiveSessions(sessions) {
  const tbody = document.getElementById('ovActiveSessionsBody');

  if (!sessions.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">
        No active sessions right now. Launch one above.
      </td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const tag      = s.courseTag ?? s.CourseTag ?? '—';
    const duration = s.duration  ?? s.Duration  ?? '—';
    const isLive   = s.isActive  ?? s.IsActive;
    const statusBadge = isLive
      ? `<span class="status status-live">Live</span>`
      : `<span class="status status-ended">Ended</span>`;
    const action = isLive
      ? `<button class="btn btn-outline btn-sm" onclick="showView('monitor',document.querySelector('[onclick*=monitor]'))">Monitor</button>`
      : '';
    return `
      <tr>
        <td><strong>${tag}</strong></td>
        <td>${duration} min</td>
        <td>${statusBadge}</td>
        <td>${action}</td>
      </tr>`;
  }).join('');
}

function renderOverviewRecentRecords(records) {
  const tbody = document.getElementById('ovRecentBody');

  if (!records.length) {
    tbody.innerHTML = `
      <tr><td colspan="3" style="text-align:center;color:var(--muted);padding:24px">
        No attendance records yet.
      </td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(s => {
    const tag     = s.courseTag ?? s.CourseTag ?? '—';
    const rawDate = s.date ?? s.Date;
    const date    = rawDate
      ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : '—';
    const rate    = s.rate ?? s.Rate ?? '0%';
    const rateNum = parseFloat(rate);
    const color   = rateNum >= 80 ? 'var(--success)' : rateNum >= 70 ? 'var(--warn)' : 'var(--danger)';
    return `
      <tr>
        <td>${tag}</td>
        <td style="color:var(--muted)">${date}</td>
        <td><strong style="color:${color}">${rate}</strong></td>
      </tr>`;
  }).join('');
}

/* ═══════════════════════════════ ELIGIBILITY ═══════════════════════════════ */

async function loadEligibility() {
  const courseId   = document.getElementById('eligCourseFilter').value;
  const lecturerId = localStorage.getItem('lecturerId');
  const tbody      = document.getElementById('eligBody');

  if (!courseId) {
    tbody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">
        Select a course to view eligibility.
      </td></tr>`;
    eligibilityData = [];
    return;
  }

  tbody.innerHTML = `
    <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">
      Loading...
    </td></tr>`;

  try {
    const [eligRes, studentsRes] = await Promise.all([
      fetch(`${API_BASE}/api/Lecturer/GetStudentEligibilityStatus?lectureid=${lecturerId}&courseid=${courseId}`, { headers: authHeaders }),
      fetch(`${API_BASE}/api/Lecturer/GetEnrolledStudentforcourse?courseid=${courseId}`, { headers: authHeaders })
    ]);

    if (!eligRes.ok || !studentsRes.ok) throw new Error("Failed to fetch eligibility data");

    const [eligResult, studentsResult] = await Promise.all([eligRes.json(), studentsRes.json()]);

    if (eligResult.statuscode === 400) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">
          ${eligResult.message}
        </td></tr>`;
      return;
    }

    eligibilityData = eligResult.data || [];

    const studentMap = {};
    (studentsResult.data || []).forEach(s => {
      studentMap[s.id ?? s.Id] = s.userName ?? s.UserName;
    });

    if (!eligibilityData.length) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">
          No students found for this course.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = eligibilityData.map((s, i) => {
      const pct      = parseFloat((s.eligibilitypercentage ?? s.EligibilityPercentage ?? '0').toString().trim());
      const barColor = pct >= 75 ? 'var(--success)' : pct >= 65 ? 'var(--warn)' : 'var(--danger)';
      const badge    = pct >= 75
        ? `<span style="color:var(--success);font-weight:600">✅ Eligible</span>`
        : pct >= 65
          ? `<span style="color:var(--warn);font-weight:600">⚠️ Warning</span>`
          : `<span style="color:var(--danger);font-weight:600">❌ Ineligible</span>`;
      const studentId = s.studentId ?? s.StudentId;
      const matric    = studentMap[studentId] ?? studentId ?? '—';
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${matric}</td>
          <td><strong style="color:${barColor}">${pct.toFixed(1)}%</strong></td>
          <td>
            <div style="background:#e0e0e0;border-radius:999px;height:8px;width:100%;min-width:80px">
              <div style="background:${barColor};width:${Math.min(pct, 100)}%;height:8px;border-radius:999px;transition:width 0.4s"></div>
            </div>
          </td>
          <td>${badge}</td>
        </tr>`;
    }).join('');

  } catch (err) {
    console.error("loadEligibility failed:", err);
    tbody.innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">
        Could not load eligibility data.
      </td></tr>`;
  }
}

async function downloadEligibilityFile() {
  const courseId = document.getElementById('eligCourseFilter').value;
  if (!courseId) { alert('Please select a course first.'); return; }
  try {
    const res = await fetch(`${API_BASE}/download/eligibilityfile/course?courseid=${courseId}`, { headers: authHeaders });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `eligibility_${courseId}.csv`; a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error("downloadEligibilityFile failed:", err);
    alert("Could not download file. Please try again.");
  }
}


async function loadLecturerHistory() {
  const courseFilter = document.getElementById('filterCourse').value;
  lecturerHistoryData = [];
  document.getElementById('historyBody').innerHTML = `
    <tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Loading...</td></tr>`;
  try {
    const url = courseFilter
  ? `${API_BASE}/api/Lecturer/GetAttendanceRecord?coursefilter=${courseFilter}`
  : `${API_BASE}/api/Lecturer/GetAttendanceRecord`;
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to fetch history");
    const result = await res.json();
    lecturerHistoryData = result.data || [];
    renderLecturerHistory();
  } catch (err) {
    console.error("loadLecturerHistory failed:", err);
    document.getElementById('historyBody').innerHTML = `
      <tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">
        Could not load attendance history.
      </td></tr>`;
  }
}

function renderLecturerHistory() {
  const tbody = document.getElementById('historyBody');
  if (!lecturerHistoryData.length) {
    tbody.innerHTML = `
      <tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">
        No attendance records found.
      </td></tr>`;
    return;
  }
  tbody.innerHTML = lecturerHistoryData.map((s, i) => {
    const tag      = s.courseTag  ?? s.CourseTag  ?? '';
    const duration = s.duration   ?? s.Duration   ?? 0;
    const enrolled = s.enrolled   ?? s.Enrolled   ?? 0;
    const present  = s.present    ?? s.Present    ?? 0;
    const absent   = enrolled - present;
    const rate     = s.rate       ?? s.Rate       ?? '0%';
    const date     = new Date(s.date ?? s.Date).toLocaleDateString('en-GB', {
                       day: '2-digit', month: 'short', year: 'numeric'
                     });
    const rateNum   = parseFloat(rate);
    const rateColor = rateNum >= 80 ? 'var(--success)' : rateNum >= 70 ? 'var(--warn)' : 'var(--danger)';
    return `
      <tr>
        <td><strong>${tag}</strong></td>
        <td>${date}</td>
        <td>${duration} min</td>
        <td>${enrolled}</td>
        <td style="color:var(--success)">${present}</td>
        <td style="color:var(--danger)">${absent}</td>
        <td><strong style="color:${rateColor}">${rate}</strong></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewSessionDetail(${i})">View</button>
        </td>
      </tr>`;
  }).join('');
}

function viewSessionDetail(index) {
  const s = lecturerHistoryData[index];
  if (!s) return;
  document.getElementById('historyList').style.display       = 'none';
  document.getElementById('sessionDetailView').style.display = 'block';

  const tag      = s.courseTag ?? s.CourseTag ?? '';
  const duration = s.duration  ?? s.Duration  ?? 0;
  const enrolled = s.enrolled  ?? s.Enrolled  ?? 0;
  const present  = s.present   ?? s.Present   ?? 0;
  const absent   = enrolled - present;
  const rate     = s.rate      ?? s.Rate      ?? '0%';
  const date     = new Date(s.date ?? s.Date).toLocaleDateString('en-GB', {
                     day: '2-digit', month: 'short', year: 'numeric'
                   });

  document.getElementById('sessionDetailTitle').textContent = `${tag} — Attendance Record`;
  document.getElementById('sessionDetailMeta').textContent  = `${date} · ${duration} min`;

  document.getElementById('sessionDetailStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label-sm">Enrolled</div>
      <div class="stat-value">${enrolled}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label-sm">Present</div>
      <div class="stat-value" style="color:var(--success)">${present}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label-sm">Absent</div>
      <div class="stat-value" style="color:var(--danger)">${absent}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label-sm">Rate</div>
      <div class="stat-value">${rate}</div>
    </div>`;

  const presentStudents = s.presentstudents ?? s.Presentstudents ?? [];
  document.getElementById('presentBody').innerHTML = presentStudents.length
    ? presentStudents.map((id, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><code style="font-size:.8rem">${id}</code></td>
          <td><span class="present-pill">Present</span></td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No present students.</td></tr>`;

  const absentStudents = s.absentstudents ?? s.Absentstudents ?? [];
  document.getElementById('absentBody').innerHTML = absentStudents.length
    ? absentStudents.map((id, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><code style="font-size:.8rem">${id}</code></td>
          <td><span class="absent-pill">Absent</span></td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:16px">No absent students.</td></tr>`;

  document.getElementById('present-tab').style.display = 'block';
  document.getElementById('absent-tab').style.display  = 'none';
  document.getElementById('sessionDetailView')
    .querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
}

function showHistoryList() {
  document.getElementById('historyList').style.display       = 'block';
  document.getElementById('sessionDetailView').style.display = 'none';
}

function populateLecturerCourseFilters() {
  // History filter
  const histSelect = document.getElementById('filterCourse');
  histSelect.innerHTML = `<option value="">All Courses</option>`;
  lecturerEnrolledCourses.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.courseId  ?? c.CourseId;
    opt.textContent = `${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}`;
    histSelect.appendChild(opt);
  });

  // Eligibility filter
  const eligSelect = document.getElementById('eligCourseFilter');
  eligSelect.innerHTML = `<option value="">Select a Course</option>`;
  lecturerEnrolledCourses.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.courseId  ?? c.CourseId;
    opt.textContent = `${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}`;
    eligSelect.appendChild(opt);
  });
}

/* ═══════════════════════════════ CREATE ATTENDANCE ═══════════════════════════════ */

async function loadCreateFormData() {
  await Promise.all([loadCoursesForCreate(), loadRoomsForCreate()]);
}

async function loadCoursesForCreate() {
  try {
    const res    = await fetch(`${API_BASE}/api/Lecturer/EnrolledCourse`, { headers: authHeaders });
    const result = await res.json();
    const courses = result.data || [];
    const select  = document.getElementById('createCourseId');
    select.innerHTML = `<option value="">— Select a Course —</option>`;
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c.courseId  ?? c.CourseId;
      opt.textContent = `${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("loadCoursesForCreate failed:", err);
  }
}

async function loadRoomsForCreate() {
  try {
    const res    = await fetch(`${API_BASE}/api/Lecturer/LectureRooms`, { headers: authHeaders });
    const result = await res.json();
    const rooms  = result.data ?? result ?? [];
    const select = document.getElementById('createRoomId');
    select.innerHTML = `<option value="">— Select a Room —</option>`;
    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value       = r.id   ?? r.Id;
      opt.textContent = r.name ?? r.Name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("loadRoomsForCreate failed:", err);
  }
}

function detectLocation() {
  const status = document.getElementById('locationStatus');
  status.textContent = 'Detecting...';
  status.style.color = 'var(--muted)';

  if (!navigator.geolocation) {
    status.textContent = 'Geolocation not supported by your browser';
    status.style.color = 'var(--danger)';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      status.textContent = '✅ Location detected successfully';
      status.style.color = 'var(--success)';
      document.getElementById('locationCoords').style.display = 'block';
      document.getElementById('latDisplay').textContent = currentLat.toFixed(6);
      document.getElementById('lngDisplay').textContent = currentLng.toFixed(6);
    },
    (err) => {
      const msgs = {
        1: '❌ Location access denied. Please allow location in your browser settings.',
        2: '❌ Location unavailable. Check your connection and try again.',
        3: '❌ Detection timed out. Move to an open area and try again.'
      };
      status.textContent = msgs[err.code] || '❌ Could not get location. Please try again.';
      status.style.color = 'var(--danger)';
    },
    { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
  );
}

async function createAttendanceSession() {
  const courseId = document.getElementById('createCourseId').value;
  const roomId   = document.getElementById('createRoomId').value;
  const duration = parseInt(document.getElementById('createDuration').value);
  const errorBox = document.getElementById('createError');

  if (!courseId)              { showCreateError('Please select a course'); return; }
  if (!roomId)                { showCreateError('Please select a lecture room'); return; }
  if (!duration || duration < 1) { showCreateError('Please enter a valid duration'); return; }
  if (!currentLat || !currentLng) { showCreateError('Please detect your location first'); return; }

  errorBox.style.display = 'none';
  const btn = document.querySelector('#view-create .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Launching...';

  try {
    const res = await fetch(`${API_BASE}/api/Lecturer/CreatAttendanceSession`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        courseId,
        lectureroomid: roomId,
        duration,
        latitude:  currentLat,
        longitude: currentLng
      })
    });
    const result = await res.json();

    if (!res.ok) {
      showCreateError(result.message || 'Failed to create session');
      btn.disabled = false;
      btn.textContent = '🚀 Launch Session';
      return;
    }

    // Success — reset form and redirect to monitor
    resetCreateForm();
    showView('monitor', document.querySelector('[onclick*=monitor]'));

  } catch (err) {
    console.error(err);
    showCreateError('Could not connect to server');
    btn.disabled = false;
    btn.textContent = '🚀 Launch Session';
  }
}

function showCreateError(msg) {
  const box = document.getElementById('createError');
  box.textContent    = msg;
  box.style.display  = 'block';
}

function resetCreateForm() {
  document.getElementById('createCourseId').value    = '';
  document.getElementById('createRoomId').value      = '';
  document.getElementById('createDuration').value    = '';
  document.getElementById('locationStatus').textContent = 'Click detect to get your location';
  document.getElementById('locationStatus').style.color = 'var(--muted)';
  document.getElementById('locationCoords').style.display = 'none';
  document.getElementById('createError').style.display    = 'none';
  const btn = document.querySelector('#view-create .btn-primary');
  if (btn) { btn.disabled = false; btn.textContent = '🚀 Launch Session'; }
  currentLat = null;
  currentLng = null;
}

/* ═══════════════════════════════ ACTIVE SESSIONS MONITOR ═══════════════════════════════ */

async function loadActiveSessions() {
  try {
    const res     = await fetch(`${API_BASE}/api/Lecturer/ActiveSessions`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to fetch active sessions");
    const result  = await res.json();
    renderMonitor(result.data || []);
  } catch (err) {
    console.error("loadActiveSessions failed:", err);
    document.getElementById('monitorContainer').innerHTML = `
      <div style="background:white;border-radius:var(--radius);border:1px solid var(--border);
                  padding:28px;text-align:center;color:var(--muted)">
        Could not load active sessions.
      </div>`;
  }
}

function renderMonitor(sessions) {
  const container = document.getElementById('monitorContainer');

  if (!sessions.length) {
    container.innerHTML = `
      <div style="background:white;border-radius:var(--radius);border:1px solid var(--border);
                  padding:48px;text-align:center;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:8px">🕐</div>
        <div style="font-weight:500;margin-bottom:4px">No active sessions right now</div>
        <div style="font-size:0.83rem">Create a session to get started</div>
      </div>`;
    return;
  }

  const active   = sessions.filter(s =>  (s.isActive ?? s.IsActive));
  const inactive = sessions.filter(s => !(s.isActive ?? s.IsActive));

  container.innerHTML = `
    ${active.map(s => {
      const tag      = s.courseTag ?? s.CourseTag ?? '';
      const duration = s.duration  ?? s.Duration  ?? 0;
      return `
        <div class="live-card" style="border-color:#16a34a;border-left:4px solid #16a34a;margin-bottom:16px">
          <div class="live-card-header">
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <div class="live-card-title">${tag}</div>
                <span class="status status-live">Live</span>
              </div>
              <div class="live-card-meta">Duration: ${duration} min</div>
            </div>
          </div>
        </div>`;
    }).join('')}

    ${inactive.length ? `
      <div style="margin-top:24px">
        <div class="section-title" style="margin-bottom:12px">Inactive Sessions</div>
        ${inactive.map(s => {
          const tag      = s.courseTag ?? s.CourseTag ?? '';
          const duration = s.duration  ?? s.Duration  ?? 0;
          return `
            <div class="live-card" style="margin-bottom:12px">
              <div class="live-card-header">
                <div>
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                    <div class="live-card-title">${tag}</div>
                    <span class="status status-ended">Ended</span>
                  </div>
                  <div class="live-card-meta">Duration: ${duration} min</div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    ` : ''}`;
}

/* ═══════════════════════════════ MY COURSES ═══════════════════════════════ */

function renderMyCourses() {
  const container = document.getElementById('myCoursesContainer');
  if (!lecturerEnrolledCourses.length) {
    container.innerHTML = `
      <div style="background:white;padding:24px;border-radius:12px;
                  border:1px solid var(--border);color:var(--muted)">
        You are not enrolled in any course yet.
      </div>`;
    return;
  }
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      ${lecturerEnrolledCourses.map(c => `
        <div class="course-card">
          <div class="course-tag">${c.courseTag ?? c.CourseTag}</div>
          <div class="course-name">${c.name ?? c.Name}</div>
        </div>`).join('')}
    </div>`;
}

/* ═══════════════════════════════ ENROLLMENT ═══════════════════════════════ */

async function loadLecturerEnrolledCourses() {
  try {
    const res    = await fetch(`${API_BASE}/api/Lecturer/EnrolledCourse`, { headers: authHeaders });
    const result = await res.json();
    lecturerEnrolledCourses = result.data || [];
    renderLecturerEnrolledCourses();
    populateLecturerCourseFilters();
  } catch (err) {
    console.error("loadLecturerEnrolledCourses failed:", err);
  }
}

async function loadLecturerUnenrolledCourses() {
  try {
    const res    = await fetch(`${API_BASE}/api/Lecturer/UnEnrolledCourse`, { headers: authHeaders });
    const result = await res.json();
    lecturerUnenrolledCourses = result.data || [];
    renderLecturerUnenrolledCourses();
  } catch (err) {
    console.error("loadLecturerUnenrolledCourses failed:", err);
  }
}

function renderLecturerEnrolledCourses() {
  const container = document.getElementById('enrolledCoursesContainer');
  if (!lecturerEnrolledCourses.length) {
    container.innerHTML = `
      <div style="background:white;padding:24px;border-radius:12px;
                  border:1px solid var(--border);color:var(--muted)">
        You are not enrolled in any course yet.
      </div>`;
    return;
  }
  container.innerHTML = lecturerEnrolledCourses.map(c => `
    <div class="enroll-card">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700">
          ${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}
        </div>
      </div>
      <span class="stat-badge badge-green">Enrolled</span>
    </div>`).join('');
}

function renderLecturerUnenrolledCourses() {
  const container = document.getElementById('unenrolledCoursesContainer');
  if (!lecturerUnenrolledCourses.length) {
    container.innerHTML = `
      <div style="background:white;padding:24px;border-radius:12px;
                  border:1px solid var(--border);color:var(--muted)">
        No available courses to enroll in.
      </div>`;
    return;
  }
  container.innerHTML = lecturerUnenrolledCourses.map(c => `
    <div class="enroll-card">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700">
          ${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}
        </div>
      </div>
      <button class="btn btn-primary btn-sm"
        onclick="enrollLecturerCourse('${c.courseId ?? c.CourseId}')">
        Enroll
      </button>
    </div>`).join('');
}

async function enrollLecturerCourse(courseId) {
  try {
    const res    = await fetch(`${API_BASE}/api/Lecturer/EnrollCourse`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify([{ courseId }])
    });
    const result = await res.json();
    if (!res.ok) { alert(result.message || "Enrollment failed"); return; }

    const justEnrolled = lecturerUnenrolledCourses.find(c => (c.courseId ?? c.CourseId) === courseId);
    lecturerUnenrolledCourses = lecturerUnenrolledCourses.filter(c => (c.courseId ?? c.CourseId) !== courseId);
    if (justEnrolled) lecturerEnrolledCourses.push(justEnrolled);

    renderLecturerEnrolledCourses();
    renderLecturerUnenrolledCourses();
    populateLecturerCourseFilters();
  } catch (err) {
    console.error(err);
    alert("Could not connect to server");
  }
}

/* ═══════════════════════════════ VIEW NAVIGATION ═══════════════════════════════ */

function showView(viewId, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    overview:    'Overview',
    mycourses:   'My Courses',
    enroll:      'Enroll / Unenrolled',
    create:      'Create Attendance',
    monitor:     'Active Sessions',
    history:     'Attendance History',
    eligibility: 'Exam Eligibility'
  };
  document.getElementById('pageTitle').textContent = titles[viewId] || '';

  if (viewId === 'overview')     loadOverview();
  if (viewId === 'mycourses')    renderMyCourses();
  if (viewId === 'enroll')       { loadLecturerEnrolledCourses(); loadLecturerUnenrolledCourses(); }
  if (viewId === 'create')       loadCreateFormData();
  if (viewId === 'monitor')      loadActiveSessions();
  if (viewId === 'history')      { populateLecturerCourseFilters(); loadLecturerHistory(); }
  if (viewId === 'eligibility')  populateLecturerCourseFilters();
}

/* ═══════════════════════════════ TABS ═══════════════════════════════ */

function switchTab(el, targetId) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['enrolled-tab', 'unenrolled-tab'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'none';
  });
  const target = document.getElementById(targetId);
  if (target) target.style.display = 'block';
}

function switchDetailTab(el, targetId) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['present-tab', 'absent-tab'].forEach(id => {
    const e = document.getElementById(id); if (e) e.style.display = 'none';
  });
  const t = document.getElementById(targetId);
  if (t) t.style.display = 'block';
}

/* ═══════════════════════════════ AUTH ═══════════════════════════════ */

function signOut() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  localStorage.removeItem('lecturerId');
  window.location.href = 'index.html';
}

/* ═══════════════════════════════ INIT ═══════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  const username = localStorage.getItem('username') || 'Lecturer';
  const initials = username.slice(0, 2).toUpperCase();

  document.querySelectorAll('.avatar').forEach(el => el.textContent = initials);
  document.querySelector('.user-name').textContent = username;

  // Load enrolled courses first (needed for filters), then load overview
  loadLecturerEnrolledCourses().then(() => {
    loadOverview();
  });
});
