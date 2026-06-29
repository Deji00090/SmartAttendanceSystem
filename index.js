 let currentRole = 'lecturer';

  // =========================
  // BACKEND BASE URL
  // =========================
  //const API_BASE = "https://localhost:7040"; 
   const API_BASE = "https://smartattendance2-001-site1.gtempurl.com";
  // CHANGE THIS TO YOUR REAL API URL

  function switchRole(role) {
    currentRole = role;

    document.querySelectorAll('.tab-btn')
      .forEach(b => b.classList.remove('active'));

    document
      .querySelector(`.tab-btn[data-role="${role}"]`)
      .classList.add('active');
     
      

    const container = document.getElementById('loginContainer');
    container.className = `login-container role-${role}`;

    document.getElementById('loginTitle').textContent =
      role === 'lecturer'
        ? 'Lecturer Login'
        : 'Student Login';

    document.getElementById('loginSubtitle').textContent =
      role === 'lecturer'
        ? 'Sign in with your staff credentials'
        : 'Sign in with your student credentials';

    document.getElementById('userId').placeholder =
      role === 'lecturer'
        ? 'e.g. LEC-2024-001'
        : 'e.g. FUO220049';

    hideError();
  }

  // =========================
  // ERROR UI
  // =========================
  function showError(message) {
    const err = document.getElementById('errorMsg');
    err.style.display = 'block';
    err.textContent = message;
  }

  function hideError() {
    const err = document.getElementById('errorMsg');
    err.style.display = 'none';
  }

  // =========================
  // LOGIN
  // =========================
 // =========================
// LOGIN
// =========================
async function handleLogin() {

  const uid = document.getElementById('userId').value.trim();
  const pwd = document.getElementById('password').value.trim();

  if (!uid || !pwd) {
    showError("Please enter username and password");
    return;
  }

  const btn = document.querySelector('.login-btn');

  try {
    btn.disabled = true;
    btn.textContent = "Signing in...";
    hideError();

    const endpoint = currentRole === 'lecturer'
      ? '/api/Auth/RegisterLoginlecture'
      : '/api/Auth/RegisterLogin';

    const response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: uid, password: pwd })
    });

    const result = await response.json();
    console.log(result);

    if (result.statuscode >= 400) {
      showError(result.message || "Login failed");
      return;
    }

    // ============================
    // LECTURER — straight redirect
    // ============================
    if (currentRole === 'lecturer') {
      localStorage.setItem("token", result.data.token);
      localStorage.setItem("role", "lecturer");
      localStorage.setItem("username", uid);
      window.location.href = "lecturer.html";
      return;
    }

    if (result.statuscode === 201) {
      btn.textContent = "Setting up account...";

      const secondRes = await fetch(API_BASE + '/api/Auth/RegisterLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: uid, password: pwd })
      });

      const secondResult = await secondRes.json();

      if (secondResult.statuscode === 200) {
        localStorage.setItem("token", secondResult.data.token);
        localStorage.setItem("role", "student");
        localStorage.setItem("username", uid);
        window.location.href = "register-image.html"; // ← face capture page
      } else {
        showError("Account created but login failed. Please try again.");
      }
      return;
    }

    // ============================
    // STUDENT 200 — returning user
    // ============================
    if (result.statuscode === 200) {
      localStorage.setItem("token", result.data.token);
      localStorage.setItem("role", "student");
      localStorage.setItem("username", uid);
      window.location.href = "student.html";
    }

  } catch (error) {
    console.error(error);
    showError("Unable to connect to server");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In →";
  }
}
  // =========================
  // ENTER KEY SUPPORT
  // =========================
  document
    .getElementById('password')
    .addEventListener('keydown', e => {

      if (e.key === 'Enter') {
        handleLogin();
      }
    });

  // Design and Development of a Location-Aware, Time-Constrained Digital Attendance Solution
  switchRole('lecturer');
