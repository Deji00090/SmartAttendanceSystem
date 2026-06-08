

   // const API_BASE = "https://localhost:7040"; 
  const API_BASE = "http://ayodeji1230-001-site1.ntempurl.com";

  let selectedFile = null;

  
  const zone = document.getElementById('uploadZone');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  // ============================
  // FILE SELECT
  // ============================
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
  }

  function processFile(file) {
    hideMessages();

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError("Image is too large. Maximum size is 5MB.");
      return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('previewImg').src = e.target.result;
      document.getElementById('previewName').textContent = file.name;
      document.getElementById('uploadZone').style.display = 'none';
      document.getElementById('previewWrap').style.display = 'block';
      document.getElementById('submitBtn').disabled = false;
    };
    reader.readAsDataURL(file);
  }

  function changePhoto() {
    selectedFile = null;
    document.getElementById('photoInput').value = '';
    document.getElementById('previewWrap').style.display = 'none';
    document.getElementById('uploadZone').style.display = 'block';
    document.getElementById('submitBtn').disabled = true;
    hideMessages();
  }

  // ============================
  // SUBMIT
  // ============================
  async function submitPhoto() {
    if (!selectedFile) {
      showError("Please select a photo first.");
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      showError("Session expired. Please log in again.");
      setTimeout(() => window.location.href = "index.html", 2000);
      return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = "Uploading...";
    hideMessages();

    // Animate progress bar
    showProgress();
    animateProgress(80, 1200);

    try {
      const formData = new FormData();
      formData.append('Photo', selectedFile);

      const response = await fetch(API_BASE + '/api/Student/registerimage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      animateProgress(100, 300);

      if (response.ok) {
        hideProgress();
        showSuccess("Face registered successfully! Redirecting to your dashboard...");
        btn.textContent = "✓ Done";

        // Step 3 — go to dashboard
        setTimeout(() => {
          window.location.href = "student.html";
        }, 1800);

      } else {
        hideProgress();
        showError(result.message || "Upload failed. Please try again.");
        btn.disabled = false;
        btn.textContent = "Register Face →";
      }

    } catch (err) {
      console.error(err);
      hideProgress();
      showError("Unable to connect to server. Please try again.");
      btn.disabled = false;
      btn.textContent = "Register Face →";
    }
  }

  // ============================
  // SKIP
  // ============================
  // function skipForNow() {
  //   if (confirm("You can register your face later from your profile. Continue to dashboard?")) {
  //     window.location.href = "student2.html";
  //   }
  // }

  // ============================
  // PROGRESS BAR
  // ============================
  function showProgress() {
    document.getElementById('progressWrap').style.display = 'block';
  }

  function hideProgress() {
    document.getElementById('progressWrap').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressPct').textContent = '0%';
  }

  function animateProgress(target, duration) {
    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPct');
    const current = parseInt(fill.style.width) || 0;
    const steps = 30;
    const increment = (target - current) / steps;
    const delay = duration / steps;
    let count = 0;

    const timer = setInterval(() => {
      count++;
      const val = Math.round(current + increment * count);
      fill.style.width = val + '%';
      pct.textContent = val + '%';
      if (count >= steps) clearInterval(timer);
    }, delay);
  }

  // ============================
  // MESSAGES
  // ============================
  function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function showSuccess(msg) {
    const el = document.getElementById('successMsg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideMessages() {
    document.getElementById('errorMsg').style.display = 'none';
    document.getElementById('successMsg').style.display = 'none';
  }

  // ============================
  // GUARD — if no token, redirect back
  // ============================
  window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = "index.html";
    }
  });
