
//const API_BASE = "http://ayodeji1230-001-site1.ntempurl.com";
const API_BASE = "https://localhost:7040";
const token = localStorage.getItem("token");

const authHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
};

let availableCourses  = [];
let enrolledCourses   = [];
let historyData       = [];
let eligibilityData   = [];


function capturePhotoFromCamera() {
  return new Promise((resolve, reject) => {
    const overlay    = document.getElementById('cameraOverlay');
    const video      = document.getElementById('cameraVideo');
    const captureBtn = document.getElementById('captureBtn');
    const cancelBtn  = document.getElementById('cancelCameraBtn');
    let stream = null;
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => {
        stream = s;
        video.srcObject = stream;
        overlay.classList.add('open');
      })
      .catch(err => {
        reject(new Error("Camera access denied. Please allow camera permissions."));
      });
    const onCapture = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      cleanup();
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
    };
    const onCancel = () => {
      cleanup();
      resolve(null); // null = cancelled
    };
    function cleanup() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      overlay.classList.remove('open');
      captureBtn.removeEventListener('click', onCapture);
      cancelBtn.removeEventListener('click', onCancel);
    }
    captureBtn.addEventListener('click', onCapture);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/* ─────────────────────────────────────
   FACE VERIFY — calls your /api/Face/verify
   Returns true if verified, false otherwise
─────────────────────────────────────*/
async function verifyFace(photoBlob) {
  const formData = new FormData();
  formData.append("LivePhoto", photoBlob, "live.jpg");

  // NOTE: Do NOT set Content-Type header — browser sets it automatically for FormData
  const res = await fetch(`${API_BASE}/api/Student/verify`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: formData
  });

  const result = await res.json();
  // Your backend returns: { statuscode: 200, message: "..." } on success
  // and { statuscode: 401, message: "..." } on failure
  return result;
}

/* ─────────────────────────────────────
   MARK ATTENDANCE
   Flow: Face verify → GPS check → Mark
─────────────────────────────────────*/
async function markAttendance(courseTag, courseId) {
  const btn = document.getElementById(`markBtn-${courseTag}`);
  btn.textContent = 'Verifying face...';
  btn.disabled = true;

  // ── STEP 1: Capture photo ──
  let photoBlob;
  try {
    photoBlob = await capturePhotoFromCamera();
  } catch (err) {
    alert(err.message || "Could not access camera.");
    btn.textContent = 'Mark Present ✓';
    btn.disabled = false;
    return;
  }

  // User cancelled the camera
  if (!photoBlob) {
    btn.textContent = 'Mark Present ✓';
    btn.disabled = false;
    return;
  }

  // ── STEP 2: Verify face ──
  btn.textContent = 'Verifying face...';
  let verifyResult;
  try {
    verifyResult = await verifyFace(photoBlob);
  } catch (err) {
    alert("Face verification request failed. Please try again.");
    btn.textContent = 'Mark Present ✓';
    btn.disabled = false;
    return;
  }

  // Check backend response — statuscode 200 = match, anything else = fail
  if (verifyResult.statuscode !== 200) {
    alert(`❌ ${verifyResult.message}`); // shows your exact backend message
    btn.textContent = 'Mark Present ✓';
    btn.disabled = false; return; 
  }
  btn.textContent = 'Getting location...';
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    btn.textContent = 'Mark Present ✓';
    btn.disabled = false;
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude  = position.coords.latitude;
      const longitude = position.coords.longitude;

      btn.textContent = 'Marking...';
      try {
        const res = await fetch(`${API_BASE}/api/Student/MarkAttendance`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ courseId, latitude, longitude })
        });

        const result = await res.json();

        if (!res.ok || result.statuscode !== 200) {
          alert(result.message || "Failed to mark attendance.");
          btn.textContent = 'Mark Present ✓';
          btn.disabled = false;
          return;
        }

        const status = result.data?.attendanceStatus ?? result.data?.AttendanceStatus;

        if (status === true) {
          btn.textContent = '✓ Present — You\'re in range';
          btn.style.background = 'var(--success)';
        } else {
          btn.textContent = '✗ Absent — You\'re out of range';
          btn.style.background = 'var(--danger)';
        }
        btn.disabled = true;
        btn.style.cursor = 'default';

      } catch (err) {
        console.error(err);
        alert("Could not connect to server.");
        btn.textContent = 'Mark Present ✓';
        btn.disabled = false;
      }
    },
    (err) => {
      const messages = {
        1: "Location permission denied. Please allow it in your browser settings.",
        2: "Location unavailable. Check your device's location settings.",
        3: "Location request timed out. Try again.",
      };
      alert(messages[err.code] || "Unknown location error.");
      btn.textContent = 'Mark Present ✓';
      btn.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
  );
}


/* ─────────────────────────────────────
   VIEW NAVIGATION
─────────────────────────────────────*/
function showView(viewId, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    overview:'Overview', sessions:'Active Sessions',
    enroll:'Enroll / Unenrolled', history:'My History', eligibility:'Exam Eligibility'
  };
  document.getElementById('pageTitle').textContent = titles[viewId] || '';

  if (viewId === 'history')     renderHistory();
  if (viewId === 'eligibility') loadEligibility();
}

function switchTab(el, targetId) {
  el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-enrolled').style.display   = 'none';
  document.getElementById('tab-unenrolled').style.display = 'none';
  document.getElementById(targetId).style.display         = 'block';
}

/* ─────────────────────────────────────
   OVERVIEW
─────────────────────────────────────*/
function renderOverview() {
  const username = localStorage.getItem('username') || 'Student';
  const now      = new Date();

  document.getElementById('overviewGreeting').textContent = `Hey, ${username}! 👋`;
  document.getElementById('overviewDate').textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  const total    = historyData.length;
  const attended = historyData.filter(r => r.status === 'Present').length;
  const missed   = total - attended;
  const overall  = total > 0 ? Math.round(attended / total * 100) : 0;

  document.getElementById('ovOverall').textContent     = `${overall}%`;
  document.getElementById('ovAttended').textContent    = attended;
  document.getElementById('ovAttendedSub').textContent = `Out of ${total} total`;
  document.getElementById('ovMissed').textContent      = missed;

  const ovBadge = document.getElementById('ovOverallBadge');
  if (overall >= 75) {
    ovBadge.textContent = 'Above threshold';
    ovBadge.className   = 'stat-badge badge-green';
  } else {
    ovBadge.textContent = 'Below threshold';
    ovBadge.className   = 'stat-badge badge-red';
  }

  const circumference = 264;
  const offset = circumference - (overall / 100) * circumference;
  document.getElementById('ovDonutArc').setAttribute('stroke-dashoffset', offset);
  document.getElementById('ovDonutPct').textContent = `${overall}%`;

  const THRESHOLD = 75;
  const atRisk = eligibilityData.filter(c => {
    const pct = c.eligibilityPercentage ?? c.EligibilityPercentage ?? 0;
    return pct < THRESHOLD;
  });

  document.getElementById('ovAtRisk').textContent    = atRisk.length;
  document.getElementById('ovAtRiskSub').textContent =
    atRisk.length ? atRisk.map(c => c.courseTag ?? c.CourseTag).join(', ') : 'All courses on track';
  document.getElementById('ovCourseCount').textContent =
    `Across ${eligibilityData.length} course${eligibilityData.length !== 1 ? 's' : ''}`;

  document.getElementById('ovCourseBreakdown').innerHTML =
    eligibilityData.length
      ? eligibilityData.map(c => {
          const pct   = c.eligibilityPercentage ?? c.EligibilityPercentage ?? 0;
          const tag   = c.courseTag  ?? c.CourseTag  ?? '';
          const name  = c.courseName ?? c.CourseName ?? '';
          const color = pct >= 85 ? 'var(--success)' : pct >= THRESHOLD ? 'var(--warn)' : 'var(--danger)';
          return `
            <div class="course-progress">
              <div class="cp-header">
                <span class="cp-name">${tag} — ${name}</span>
                <span class="cp-pct" style="color:${color}">${pct}%</span>
              </div>
              <div class="cp-bar-wrap">
                <div class="cp-bar" style="width:${pct}%;background:${color}"></div>
              </div>
            </div>
          `;
        }).join('')
      : `<div style="color:var(--muted);font-size:.85rem">No course data yet.</div>`;

  const recent = [...historyData].slice(-5).reverse();
  document.getElementById('ovRecentBody').innerHTML = recent.length
    ? recent.map(r => `
        <tr>
          <td><strong>${r.course}</strong></td>
          <td>${r.date}</td>
          <td>${r.duration}</td>
          <td><span class="status status-${r.status.toLowerCase()}">${r.status}</span></td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">No attendance records yet.</td></tr>`;
}

/* ─────────────────────────────────────
   HISTORY
─────────────────────────────────────*/
function populateCourseFilter() {
  const select = document.getElementById('histCourse');
  select.innerHTML = `<option value="">All Courses</option>`;
  enrolledCourses.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.courseId ?? c.CourseId;
    opt.textContent = `${c.courseTag ?? c.CourseTag} — ${c.name ?? c.Name}`;
    select.appendChild(opt);
  });
  select.onchange = () => loadAttendanceHistory(select.value || null);
}

function renderHistory() {
  const rows    = historyData;
  const present = rows.filter(r => r.status === 'Present').length;
  const absent  = rows.filter(r => r.status === 'Absent').length;

  document.getElementById('histSummary').innerHTML = `
    <span class="stat-badge badge-blue">${rows.length} sessions</span>
    <span class="stat-badge badge-green">${present} present</span>
    <span class="stat-badge badge-red">${absent} absent</span>
  `;

  document.getElementById('histBody').innerHTML = rows.length
    ? rows.map(r => `
        <tr>
          <td>${r.session}</td>
          <td><strong>${r.course}</strong></td>
          <td>${r.date}</td>
          <td>${r.duration}</td>
          <td><span class="status status-${r.status.toLowerCase()}">${r.status}</span></td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No records found.</td></tr>`;
}



async function loadEligibility() {
  const res = await fetch(`${API_BASE}/api/Student/EligibilityStatus`, { headers: authHeaders });
  const result = await res.json();
  eligibilityData = result.data || [];
  renderEligibility(eligibilityData);
}

function renderEligibility(data) {
  const THRESHOLD = 75;

  document.getElementById('eligCards').innerHTML = data.map(c => {
    const cls   = c.isEligible ? (c.eligibilityPercentage >= 85 ? 'badge-green' : 'badge-orange') : 'badge-red';
    const label = c.isEligible ? (c.eligibilityPercentage >= 85 ? 'Eligible ✓' : 'At Risk') : 'Ineligible ✗';
    return `
      <div class="stat-card">
        <div class="stat-label-sm">${c.courseTag}</div>
        <div class="stat-value">${c.eligibilityPercentage}%</div>
        <div class="stat-sub">${c.attendedSessions} / ${c.totalSessions} sessions</div>
        <span class="stat-badge ${cls}">${label}</span>
      </div>
    `;
  }).join('');


  document.getElementById('eligBody').innerHTML = data.map(c => {
    const cls   = c.isEligible ? (c.eligibilityPercentage >= 85 ? 'elig-eligible' : 'elig-warning') : 'elig-ineligible';
    const label = c.isEligible ? (c.eligibilityPercentage >= 85 ? 'Eligible' : 'At Risk') : 'Ineligible';
    const bar   = c.isEligible ? (c.eligibilityPercentage >= 85 ? 'var(--success)' : 'var(--warn)') : 'var(--danger)';
    return `
      <tr>
        <td><strong>${c.courseTag} — ${c.courseName}</strong></td>
        <td>${c.attendedSessions}</td>
        <td>${c.totalSessions}</td>
        <td><strong>${c.eligibilityPercentage}%</strong></td>
        <td style="min-width:100px">
          <div class="elig-bar-wrap">
            <div class="elig-bar" style="width:${c.eligibilityPercentage}%;background:${bar}"></div>
          </div>
        </td>
        <td><span class="elig-badge ${cls}">${label}</span></td>
      </tr>
    `;
  }).join('');

  document.getElementById('eligAdvice').innerHTML = data.map(c => {
    if (c.isEligible) return `
      <div style="font-size:.85rem;color:var(--success)">
        ✅ <strong>${c.courseTag}</strong> — You're eligible. Keep it up!
      </div>`;
    const needed = Math.ceil((THRESHOLD / 100 * c.totalSessions - c.attendedSessions) / (1 - THRESHOLD / 100));
    return `
      <div style="font-size:.85rem;color:var(--danger)">
        ⚠️ <strong>${c.courseTag}</strong> — You need at least 
        <strong>${needed} more consecutive session${needed !== 0 ? 's' : ''}</strong> to reach 75%.
      </div>`;
  }).join('');
}


async function loadAvailableCourses() {
  try {
    const res    = await fetch(API_BASE + "/api/Student/UnEnrolledCourse", { method:"GET", headers:authHeaders });
    const result = await res.json();
    availableCourses = result.data || [];
    renderAvailableCourses();
  } catch (err) { console.error(err); }
}

async function loadEnrolledCourses() {
  try {
    const res    = await fetch(API_BASE + "/api/Student/EnrolledCourse", { method:"GET", headers:authHeaders });
    const result = await res.json();
    enrolledCourses = result.data || [];
    renderEnrolledCourses();
    populateCourseFilter();
  } catch (err) { console.error(err); }
}

function renderEnrolledCourses() {
  const container = document.getElementById('enrolledCoursesContainer');
  if (!enrolledCourses.length) {
    container.innerHTML = `
      <div style="background:white;padding:24px;border-radius:12px;border:1px solid var(--border);color:var(--muted)">
        You are not enrolled in any course.
      </div>`;
    return;
  }
  container.innerHTML = enrolledCourses.map(c => `
    <div class="enroll-card">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:4px">${c.name}</div>
        <div style="font-size:.82rem;color:var(--muted)">${c.courseTag}</div>
      </div>
      <span class="stat-badge badge-green">Enrolled</span>
    </div>
  `).join('');
}

function renderAvailableCourses() {
  const container = document.getElementById('availableCoursesContainer');
  if (!availableCourses.length) {
    container.innerHTML = `
      <div style="background:white;padding:24px;border-radius:12px;border:1px solid var(--border);color:var(--muted)">
        No available courses.
      </div>`;
    return;
  }
  container.innerHTML = availableCourses.map(c => `
    <div class="enroll-card">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;margin-bottom:4px">${c.name}</div>
        <div style="font-size:.82rem;color:var(--muted)">${c.courseTag}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="enrollCourse('${c.courseId}')">Enroll</button>
    </div>
  `).join('');
}

async function enrollCourse(courseId) {
  try {
    const res = await fetch(API_BASE + "/api/Student/EnrollCourse", {
      method: "POST", headers: authHeaders, body: JSON.stringify([{ courseId }])
    });
    const result = await res.json();
    if (!res.ok) { alert(result.message || "Enrollment failed"); return; }

    const justEnrolled = availableCourses.find(c => c.courseId === courseId);
    availableCourses   = availableCourses.filter(c => c.courseId !== courseId);
    if (justEnrolled) enrolledCourses.push(justEnrolled);

    renderAvailableCourses();
    renderEnrolledCourses();
    populateCourseFilter();
  } catch (err) {
    console.error(err);
    alert("Unable to enroll course.");
  }
}

/* ─────────────────────────────────────
   API — attendance history
─────────────────────────────────────*/
async function loadAttendanceHistory() {

  const courseid = document.getElementById('histCourse').value;

  try {
  
    let url = `${API_BASE}/api/Student/GetattendanceRecord`;

if (courseid && courseid !== "") {
  url += `?courseid=${courseid}`;
}

    const res = await fetch(url, { method: "GET", headers: authHeaders });
    if (!res.ok) throw new Error("Error fetching attendance");

    const result = await res.json();
    historyData = (result.data || []).map((r, index) => ({
      session:  index + 1,
      course:   r.courseTag,
      date:     new Date(r.date).toLocaleDateString(),
      duration: `${r.duration} min`,
      status:   r.status ? 'Present' : 'Absent'
    }));
    renderHistory();
  } catch (err) {
    console.error("loadAttendanceHistory failed:", err);
  }
  
//renderOverview();
}

/* ─────────────────────────────────────
   API — active sessions
─────────────────────────────────────*/
async function loadActiveSessions() {
  try {
    const res = await fetch(`${API_BASE}/api/Student/ActiveSessions`, { method:"GET", headers:authHeaders });
    if (!res.ok) throw new Error("Failed to fetch active sessions");
    const result = await res.json();
    renderActiveSessions(result.data || []);
  } catch (err) {
    console.error("loadActiveSessions failed:", err);
  }
}

function renderActiveSessions(sessions) {
  const container = document.getElementById('sessionsContainer');
  const active    = sessions.filter(s => s.isActive ?? s.IsActive);
  const inactive  = sessions.filter(s => !(s.isActive ?? s.IsActive));

  if (!sessions.length) {
    container.innerHTML = `
      <div style="background:white;border-radius:var(--radius);border:1px solid var(--border);
                  padding:28px;text-align:center;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:8px">🕐</div>
        <div style="font-weight:500;margin-bottom:4px">No active sessions right now</div>
        <div style="font-size:0.83rem">Check back when your lecturer starts a session</div>
      </div>`;
    return;
  }

  container.innerHTML = `
    ${active.map(s => `
      <div class="session-card has-session" id="card-${s.courseTag ?? s.CourseTag}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;
                    gap:16px;flex-wrap:wrap;margin-bottom:16px">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <div class="session-course">${s.courseTag ?? s.CourseTag}</div>
              <span class="status status-live">Live</span>
            </div>
            <div class="session-meta">Duration: ${s.duration ?? s.Duration} min</div>
          </div>
          <button
            class="mark-btn"
            id="markBtn-${s.courseTag ?? s.CourseTag}"
            onclick="markAttendance('${s.courseTag ?? s.CourseTag}', '${s.courseid ?? s.Courseid}')">
            Mark Present ✓
          </button>
        </div>
      </div>
    `).join('')}

    ${inactive.length ? `
      <div style="background:white;border-radius:var(--radius);border:1px solid var(--border);
                  padding:28px;text-align:center;color:var(--muted)">
        <div style="font-weight:500;margin-bottom:4px">Upcoming sessions</div>
        <div style="font-size:0.83rem">${inactive.map(s => s.courseTag ?? s.CourseTag).join(' · ')}</div>
      </div>
    ` : ''}
  `;
}

/* ─────────────────────────────────────
   SIGN OUT
─────────────────────────────────────*/
function signOut() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
}

/* ─────────────────────────────────────
   INIT
─────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', async () => {
  const storedUsername = localStorage.getItem("username") || "Student";
  const initials = storedUsername.slice(0, 2).toUpperCase();
  document.querySelectorAll('.avatar').forEach(el => el.textContent = initials);
  document.querySelector('.user-name').textContent = storedUsername;
  document.getElementById('overviewGreeting').textContent = `Hey, ${storedUsername}! 👋`;
  document.getElementById('overviewDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  document.getElementById('histCourse').addEventListener('change', (e) => {
    loadAttendanceHistory(e.target.value || null);
  });

  await Promise.all([
    loadAttendanceHistory(),
    loadEligibility()
  ]);

  renderOverview();

  Promise.all([
    loadEnrolledCourses(),
    loadAvailableCourses(),
    loadActiveSessions()
  ]);
});


 // 846,400
 
 // 884,400