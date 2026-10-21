// ========================================
// Student Dashboard Logic
// ========================================

// Protect this page - only students can access
if (!firebaseApp.protectPage('student')) {
  // Page will redirect if not authenticated or wrong role
}

// Current user
const currentUser = firebaseApp.getCurrentUser();

// ========================================
// DOM Elements
// ========================================

const studentNameEl = document.getElementById('studentName');
const userInitialsEl = document.getElementById('userInitials');
const totalQuizzesEl = document.getElementById('totalQuizzes');
const completedQuizzesEl = document.getElementById('completedQuizzes');
const pendingQuizzesEl = document.getElementById('pendingQuizzes');
const upcomingDeadlinesEl = document.getElementById('upcomingDeadlines');
const quizzesListEl = document.getElementById('quizzesList');
const scoresListEl = document.getElementById('scoresList');
const recommendationsListEl = document.getElementById('recommendationsList');

// Sections
const sections = {
  overview: document.getElementById('overviewSection'),
  graduated: document.getElementById('graduatedSection'),
  quizzes: document.getElementById('quizzesSection'),
  quizhistory: document.getElementById('quizhistorySection'),
  scores: document.getElementById('scoresSection'),
  recommendations: document.getElementById('recommendationsSection')
};

// State
let allQuizzes = [];
let quizResults = [];
let pastQuizzes = [];
let currentQuizFilter = 'active';
let quizSearchQuery = '';
let performanceChart = null;

// ========================================
// Initialize Dashboard
// ========================================

async function initDashboard() {
  try {
    // Set user name and initials
    if (currentUser) {
      const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
      studentNameEl.textContent = fullName;
      userInitialsEl.textContent = `${currentUser.firstName[0]}${currentUser.lastName[0]}`;

      // Update last active time in Firestore
      await firebaseApp.db.collection(firebaseApp.collections.users).doc(currentUser.uid).update({
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Display last active time
      updateLastActiveTime();
    }

    // ── Graduated Student Mode ─────────────────────────────────────────────
    const isGraduated = (currentUser.gradeLevel === 'Graduated' || currentUser.grade === 'Graduated');

    if (isGraduated) {
      // Hide nav items irrelevant to graduates
      document.querySelectorAll('[data-hide-graduated]').forEach(el => el.style.display = 'none');

      // Also redirect "Overview" nav click → graduatedSection
      const overviewNav = document.querySelector('[data-section="overview"]');
      if (overviewNav) {
        overviewNav.addEventListener('click', (e) => {
          e.stopImmediatePropagation();
          e.preventDefault();
          document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
          document.getElementById('graduatedSection').classList.remove('hidden');
        }, true); // capture phase so it fires before the generic nav listener
      }

      // Populate graduation hero card from gradeHistory (last entry)
      const history = currentUser.gradeHistory || [];
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;
      const gradLastGradeEl = document.getElementById('gradLastGrade');
      const gradLastSectionEl = document.getElementById('gradLastSection');
      const gradLastSYEl = document.getElementById('gradLastSY');
      if (gradLastGradeEl) gradLastGradeEl.textContent = lastEntry ? `Grade ${lastEntry.grade}` : '10';
      if (gradLastSectionEl) gradLastSectionEl.textContent = lastEntry?.section || currentUser.section || '—';
      if (gradLastSYEl) gradLastSYEl.textContent = lastEntry?.schoolYear || currentUser.schoolYear || '—';

      // Show graduatedSection as the default view
      document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
      document.getElementById('graduatedSection').classList.remove('hidden');

      // Make "Overview" nav active but point to graduatedSection
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      if (overviewNav) overviewNav.classList.add('active');

      // Only load quiz results (so the Scores tab still works) + notifications
      await Promise.all([
        loadQuizResults(),
        loadNotifications()
      ]);
      renderScores();
      return; // ← skip everything else for graduated students
    }
    // ── Normal Student Mode ────────────────────────────────────────────────

    // Load data
    await Promise.all([
      loadQuizzes(),
      loadQuizResults(),
      loadQuizHistory(),
      loadRecommendations(),
      loadNotifications()
    ]);

    // Update dashboard
    updateStats();
    renderUpcomingDeadlines();
    renderQuizzes();
    renderScores();
    renderQuizHistory();
    renderPerformanceChart();

  } catch (error) {
    console.error('Dashboard initialization error:', error);
    firebaseApp.showToast('Failed to load dashboard data', 'error');
  }
}

// Update last active time display
function updateLastActiveTime() {
  const lastActiveEl = document.getElementById('lastActivityTime');
  if (lastActiveEl) {
    lastActiveEl.textContent = 'Just now';

    // Update every minute
    setInterval(() => {
      const now = new Date();
      const minutes = Math.floor((now - new Date()) / 60000);
      if (minutes < 1) {
        lastActiveEl.textContent = 'Just now';
      } else if (minutes < 60) {
        lastActiveEl.textContent = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      } else {
        const hours = Math.floor(minutes / 60);
        lastActiveEl.textContent = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      }
    }, 60000);
  }
}

// ========================================
// Load Data from Firestore
// ========================================

async function loadQuizzes() {
  try {
    const quizzesRef = firebaseApp.db.collection(firebaseApp.collections.quizzes);

    // Get active quizzes
    let snapshot;
    try {
      snapshot = await quizzesRef
        .where('status', '==', 'active')
        .get();
    } catch (e) {
      console.warn('status query failed, trying isActive:', e);
      snapshot = await quizzesRef
        .where('isActive', '==', true)
        .get();
    }

    let quizzes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Also fetch scheduled quizzes
    try {
      const scheduledSnapshot = await quizzesRef
        .where('status', '==', 'scheduled')
        .get();
      scheduledSnapshot.docs.forEach(doc => {
        if (!quizzes.find(q => q.id === doc.id)) {
          quizzes.push({ id: doc.id, ...doc.data() });
        }
      });
    } catch (e) {
      console.warn('Could not fetch scheduled quizzes:', e);
    }

    // Filter quizzes assigned to this student
    allQuizzes = quizzes.filter(quiz => {
      // 'all' means everyone
      if (quiz.targetStudents === 'all' || quiz.assignmentType === 'all') {
        return true;
      }

      // Individual assignment - check if this student's UID is in the array
      if (Array.isArray(quiz.targetStudents) && quiz.targetStudents.includes(currentUser.uid)) {
        return true;
      }
      if (Array.isArray(quiz.assignedToStudents) && quiz.assignedToStudents.includes(currentUser.uid)) {
        return true;
      }

      // Section assignment - match grade and section
      if (quiz.assignmentType === 'section' && currentUser.grade && currentUser.section) {
        if (quiz.assignedGrade === currentUser.grade && quiz.assignedSectionName === currentUser.section) {
          return true;
        }
        // Also check combined format "grade-section"
        if (quiz.assignedToSection === `${currentUser.grade}-${currentUser.section}`) {
          return true;
        }
      }

      return false;
    });

    // Sort by deadline (quizzes without deadlines go last)
    allQuizzes.sort((a, b) => {
      const dateA = a.deadline ? (a.deadline.toDate ? a.deadline.toDate() : new Date(a.deadline)) : new Date('2999-12-31');
      const dateB = b.deadline ? (b.deadline.toDate ? b.deadline.toDate() : new Date(b.deadline)) : new Date('2999-12-31');
      return dateA - dateB;
    });

    // 4. Also fetch specific quiz docs for any results we have that weren't in the 'active' list
    const missingQuizIds = quizResults
      .map(r => r.quizId)
      .filter(id => !allQuizzes.find(q => q.id === id));

    if (missingQuizIds.length > 0) {
      // Fetch missing quizzes in chunks (Firestore limit 10 for 'in' query)
      for (let i = 0; i < missingQuizIds.length; i += 10) {
        const chunk = missingQuizIds.slice(i, i + 10);
        const missingSnapshot = await quizzesRef
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();

        missingSnapshot.docs.forEach(doc => {
          allQuizzes.push({ id: doc.id, ...doc.data() });
        });
      }
    }

  } catch (error) {
    console.error('Error loading quizzes:', error);
    // don't reset allQuizzes here as we might have partial data from results
  }

  // Set up real-time listener for new quizzes
  setupQuizListener();
}

// Real-time listener so new quizzes appear immediately
let unsubQuizListener = null;
function setupQuizListener() {
  try {
    if (unsubQuizListener) unsubQuizListener(); // Cleanup previous

    unsubQuizListener = firebaseApp.db.collection(firebaseApp.collections.quizzes)
      .where('status', '==', 'active')
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const newQuiz = { id: change.doc.id, ...change.doc.data() };
            // Check if we already have it
            if (!allQuizzes.find(q => q.id === newQuiz.id)) {
              // Check assignment
              const isForMe = newQuiz.targetStudents === 'all'
                || newQuiz.assignmentType === 'all'
                || (Array.isArray(newQuiz.targetStudents) && newQuiz.targetStudents.includes(currentUser.uid))
                || (Array.isArray(newQuiz.assignedToStudents) && newQuiz.assignedToStudents.includes(currentUser.uid))
                || (newQuiz.assignmentType === 'section' && currentUser.grade && currentUser.section
                  && newQuiz.assignedToSection === `${currentUser.grade}-${currentUser.section}`);

              if (isForMe) {
                allQuizzes.push(newQuiz);
                updateStats();
                renderQuizzes();
                renderUpcomingDeadlines();
                firebaseApp.showToast(`📝 New quiz available: ${newQuiz.title}`, 'info');
              }
            }
          }
        });
      }, error => {
        console.warn('Quiz real-time listener error:', error);
      });
  } catch (e) {
    console.warn('Could not set up quiz listener:', e);
  }
}

async function loadQuizResults() {
  try {
    const resultsRef = firebaseApp.db.collection(firebaseApp.collections.quizResults);

    // Initial load
    const snapshot = await resultsRef
      .where('studentId', '==', currentUser.uid)
      .orderBy('submittedAt', 'desc')
      .get();

    quizResults = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Setup listener
    setupResultsListener();

  } catch (error) {
    console.error('Error loading quiz results:', error);
    quizResults = [];
  }
}

let unsubResultsListener = null;
function setupResultsListener() {
  if (unsubResultsListener) unsubResultsListener();

  unsubResultsListener = firebaseApp.db.collection(firebaseApp.collections.quizResults)
    .where('studentId', '==', currentUser.uid)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const result = { id: change.doc.id, ...change.doc.data() };
        if (change.type === 'added') {
          if (!quizResults.find(r => r.id === result.id)) {
            quizResults.unshift(result);
            updateStats();
            renderQuizzes();
            renderScores();
            // Update chart too
            renderPerformanceChart();
            // Automatically refresh recommendations too
            loadRecommendations();
          }
        }
      });
    });
}

async function loadQuizHistory() {
  try {
    const history = currentUser.gradeHistory || [];
    if (history.length === 0) {
      pastQuizzes = [];
      return;
    }

    // Prepare filter options
    const shFilterSelect = document.getElementById('shFilterSelect');
    if (shFilterSelect) {
      shFilterSelect.innerHTML = '<option value="all">All Previous Grades</option>' +
        history.map(h => `<option value="${h.grade}_${h.section}">${h.schoolYear ? h.schoolYear + ' — ' : ''}Grade ${h.grade} (${h.section || 'No Sec'})</option>`).join('');
    }

    const resultsRef = firebaseApp.db.collection(firebaseApp.collections.quizResults);
    const quizzesRef = firebaseApp.db.collection(firebaseApp.collections.quizzes);

    // We fetch ALL results for this student, then filter for those that belong to a previous grade/section
    const snapshot = await resultsRef
      .where('studentId', '==', currentUser.uid)
      .orderBy('submittedAt', 'desc')
      .get();

    const allMyResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Find all unique quiz IDs from these results
    const quizIds = [...new Set(allMyResults.map(r => r.quizId))];

    // We only need to fetch quizzes that are NOT in allQuizzes
    const missingQuizIds = quizIds.filter(id => !allQuizzes.find(q => q.id === id));

    let historyQuizzes = [];

    // Fetch missing quizzes in chunks
    if (missingQuizIds.length > 0) {
      for (let i = 0; i < missingQuizIds.length; i += 10) {
        const chunk = missingQuizIds.slice(i, i + 10);
        const missingSnapshot = await quizzesRef
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();

        missingSnapshot.docs.forEach(doc => {
          historyQuizzes.push({ id: doc.id, ...doc.data() });
        });
      }
    }

    // Combine newly fetched quizzes with existing ones (a quiz might be in allQuizzes if it's still active or was loaded for current scores)
    const combinedQuizzes = [...allQuizzes, ...historyQuizzes];

    // Build the pastQuizzes array
    pastQuizzes = [];

    for (const entry of history) {
      // Find results that match this grade's timeframe. 
      // Since we don't have explicit timeframe boundaries in the result, 
      // we check if the quiz was assigned to this specific grade/section.

      const entryResults = allMyResults.filter(r => {
        const q = combinedQuizzes.find(quiz => quiz.id === r.quizId);
        if (!q) return false;

        // A past quiz is one that was explicitly assigned to this past grade and section
        if (q.assignmentType === 'section' && String(q.assignedGrade) === String(entry.grade) && q.assignedSectionName === entry.section) {
          return true;
        }
        if (q.assignmentType === 'section' && q.assignedToSection === `${entry.grade}-${entry.section}`) {
          return true;
        }

        // OR it's a quiz they took during that school year (we'd need accurate dates for this, so matching by assignment is safer for now)
        return false;
      });

      if (entryResults.length > 0) {
        pastQuizzes.push({
          historyEntry: entry,
          results: entryResults.map(r => {
            return {
              result: r,
              quiz: combinedQuizzes.find(q => q.id === r.quizId)
            };
          }).filter(qr => qr.quiz) // ensure quiz exists
        });
      }
    }
  } catch (error) {
    console.error('Error loading quiz history:', error);
    pastQuizzes = [];
  }
}

async function loadRecommendations() {
  try {
    const recommendationsRef = firebaseApp.db.collection(firebaseApp.collections.aiRecommendations);

    const snapshot = await recommendationsRef
      .where('studentId', '==', currentUser.uid)
      .orderBy('generatedAt', 'desc')
      .limit(10)
      .get();

    const recommendations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderRecommendations(recommendations);

  } catch (error) {
    console.error('Error loading recommendations:', error);
    recommendationsListEl.innerHTML = '<div class="empty-state"><p>No recommendations yet. Complete quizzes to get personalized AI recommendations!</p></div>';
  }
}

// ========================================
// Statistics
// ========================================

function updateStats() {
  const completedQuizIds = quizResults.map(r => r.quizId);
  const completed = quizResults.length;
  const total = allQuizzes.length;
  const pending = allQuizzes.filter(q => !completedQuizIds.includes(q.id)).length;

  totalQuizzesEl.textContent = total;
  completedQuizzesEl.textContent = completed;
  pendingQuizzesEl.textContent = pending;
}

function renderPerformanceChart() {
  const ctx = document.getElementById('performanceChart');
  const noDataMsg = document.getElementById('noDataMessage');

  if (!ctx) return;

  if (quizResults.length === 0) {
    if (noDataMsg) noDataMsg.classList.remove('hidden');
    ctx.style.display = 'none';
    return;
  }

  if (noDataMsg) noDataMsg.classList.add('hidden');
  ctx.style.display = 'block';

  const sortedResults = [...quizResults].sort((a, b) => {
    const dateA = a.submittedAt?.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt);
    const dateB = b.submittedAt?.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt);
    return dateA - dateB;
  });

  const labels = sortedResults.map(r => {
    const quiz = allQuizzes.find(q => q.id === r.quizId);
    return quiz ? quiz.title : 'Quiz';
  });

  const data = sortedResults.map(r => r.percentage);

  if (performanceChart) {
    performanceChart.destroy();
  }

  const isMobile = window.innerWidth <= 768;

  // Truncate long quiz titles for mobile
  const mobileLabels = labels.map(l => {
    if (isMobile && l.length > 10) return l.substring(0, 10) + '…';
    if (!isMobile && l.length > 20) return l.substring(0, 20) + '…';
    return l;
  });

  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: mobileLabels,
      datasets: [{
        label: 'Score %',
        data: data,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.12)',
        borderWidth: isMobile ? 2 : 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#667eea',
        pointRadius: isMobile ? 4 : 6,
        pointHoverRadius: isMobile ? 6 : 8,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleFont: { size: isMobile ? 12 : 14, weight: 'bold' },
          bodyFont: { size: isMobile ? 11 : 13 },
          padding: isMobile ? 8 : 12,
          displayColors: false,
          callbacks: {
            // Show full title in tooltip even if label is truncated
            title: (items) => labels[items[0].dataIndex] || '',
            label: (context) => `Score: ${context.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: isMobile ? 25 : 20,
            callback: value => value + '%',
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: isMobile ? 10 : 12 }
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: { size: isMobile ? 9 : 12 },
            maxRotation: isMobile ? 45 : 0,
            minRotation: isMobile ? 30 : 0
          },
          grid: { display: false }
        }
      }
    }
  });

  // Show legend div after chart renders
  const legendEl = document.getElementById('chartLegend');
  if (legendEl && data.length > 0) legendEl.style.display = 'flex';

  // Light mode adjustments
  const isDark = !document.body.classList.contains('light-mode');
  if (!isDark) {
    performanceChart.options.scales.y.ticks.color = 'rgba(0,0,0,0.5)';
    performanceChart.options.scales.x.ticks.color = 'rgba(0,0,0,0.5)';
    performanceChart.options.scales.y.grid.color = 'rgba(0,0,0,0.05)';
    performanceChart.update();
  }
}

function renderUpcomingDeadlines() {
  const now = new Date();

  // Get incomplete quizzes with upcoming deadlines
  const completedQuizIds = quizResults.map(r => r.quizId);
  const upcomingQuizzes = allQuizzes
    .filter(quiz => {
      if (!quiz.deadline) return false; // Skip quizzes without deadline
      try {
        const deadline = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
        return !completedQuizIds.includes(quiz.id) && deadline > now;
      } catch (e) {
        return false;
      }
    })
    .sort((a, b) => {
      const da = a.deadline.toDate ? a.deadline.toDate() : new Date(a.deadline);
      const db = b.deadline.toDate ? b.deadline.toDate() : new Date(b.deadline);
      return da - db;
    })
    .slice(0, 5);

  if (upcomingQuizzes.length === 0) {
    upcomingDeadlinesEl.innerHTML = `
      <div style="text-align:center;padding:1.5rem;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">✅</div>
        <p style="color: var(--gray-500); margin:0;">No upcoming deadlines — you\'re all caught up!</p>
      </div>`;
    return;
  }

  upcomingDeadlinesEl.innerHTML = upcomingQuizzes.map(quiz => {
    const deadline = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
    const hoursLeft = Math.max(0, (deadline - now) / (1000 * 60 * 60));
    const daysLeft = Math.floor(hoursLeft / 24);

    // Urgency colors
    let urgencyColor, urgencyBg, urgencyLabel;
    if (hoursLeft < 24) {
      urgencyColor = '#ef4444'; urgencyBg = 'rgba(239,68,68,0.12)'; urgencyLabel = hoursLeft < 1 ? 'Less than 1h left' : `${Math.floor(hoursLeft)}h left`;
    } else if (daysLeft < 3) {
      urgencyColor = '#f59e0b'; urgencyBg = 'rgba(245,158,11,0.12)'; urgencyLabel = `${daysLeft} day${daysLeft > 1 ? 's' : ''} left`;
    } else {
      urgencyColor = '#10b981'; urgencyBg = 'rgba(16,185,129,0.12)'; urgencyLabel = `${daysLeft} days left`;
    }

    const deadlineStr = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `
      <div style="display:flex;align-items:center;gap:0.875rem;padding:0.875rem;background:${urgencyBg};border:1px solid ${urgencyColor}22;border-radius:12px;margin-bottom:0.5rem;">
        <div style="width:40px;height:40px;border-radius:10px;background:${urgencyColor}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:1.1rem;">📝</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--gray-100);font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${quiz.title}</div>
          <div style="font-size:0.78rem;color:var(--gray-400);margin-top:0.15rem;">👨‍🏫 ${quiz.createdByName || 'Unknown'} · 📅 ${deadlineStr}</div>
        </div>
        <div style="flex-shrink:0;text-align:right;">
          <span style="display:inline-block;background:${urgencyColor}20;color:${urgencyColor};font-size:0.72rem;font-weight:700;padding:0.25rem 0.6rem;border-radius:20px;white-space:nowrap;">⏰ ${urgencyLabel}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// Render Quizzes
// ========================================



function renderQuizzes() {
  const completedQuizIds = quizResults.map(r => r.quizId);

  let filteredQuizzes = allQuizzes.filter(quiz => {
    const isCompleted = completedQuizIds.includes(quiz.id);

    // Handle scheduled quizzes
    if (quiz.status === 'scheduled') {
      return currentQuizFilter === 'scheduled';
    }

    const status = firebaseApp.getQuizStatus(quiz.deadline, isCompleted);
    return status === currentQuizFilter;
  });

  // Apply text search (title, subject, teacher name)
  if (quizSearchQuery.trim()) {
    const q = quizSearchQuery.trim().toLowerCase();
    filteredQuizzes = filteredQuizzes.filter(quiz =>
      (quiz.title || '').toLowerCase().includes(q) ||
      (quiz.subject || '').toLowerCase().includes(q) ||
      (quiz.createdByName || '').toLowerCase().includes(q)
    );
  }

  if (filteredQuizzes.length === 0) {
    quizzesListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <h3>${quizSearchQuery.trim() ? 'No matching quizzes' : 'No ' + currentQuizFilter + ' quizzes'}</h3>
        <p>${quizSearchQuery.trim() ? 'Try a different search term' : 'Check back later for new quizzes'}</p>
      </div>
    `;
    return;
  }

  quizzesListEl.innerHTML = filteredQuizzes.map(quiz => {
    const isCompleted = completedQuizIds.includes(quiz.id);
    const status = firebaseApp.getQuizStatus(quiz.deadline, isCompleted);
    const result = quizResults.find(r => r.quizId === quiz.id);
    const isOverdue = status === 'overdue';

    // Determine action button
    let actionButton = '';
    let scheduleInfoHTML = '';

    // Check if quiz is scheduled (not yet started)
    if (quiz.status === 'scheduled' && quiz.scheduledDate && quiz.scheduledStartTime) {
      const startDateTime = new Date(`${quiz.scheduledDate}T${quiz.scheduledStartTime}`);
      const now = new Date();
      const isAvailable = now >= startDateTime;

      if (isAvailable) {
        // Scheduled quiz has started — allow taking
        actionButton = `
          <button class="btn btn-primary" onclick="takeQuiz('${quiz.id}')">
            ✏️ Take Quiz
          </button>
        `;
      } else {
        // Not started yet — show countdown
        const diffMs = startDateTime - now;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        let countdownText = '';
        if (diffHrs > 24) {
          const days = Math.floor(diffHrs / 24);
          countdownText = `${days} day${days > 1 ? 's' : ''}`;
        } else if (diffHrs > 0) {
          countdownText = `${diffHrs}h ${diffMins}m`;
        } else {
          countdownText = `${diffMins} min`;
        }

        actionButton = `
          <button class="btn btn-outline" disabled style="opacity:0.6;cursor:not-allowed;">
            🔒 Not Available Yet
          </button>
          <span style="font-size:0.75rem;color:var(--primary-400);display:block;margin-top:0.5rem;">
            ⏰ Starts in: ${countdownText}
          </span>
        `;
      }

      const durText = quiz.scheduledDuration ? `${quiz.scheduledDuration} min` : 'No limit';
      scheduleInfoHTML = `
        <div class="quiz-meta-item">
          <span>📅 Available:</span>
          <span>${startDateTime.toLocaleString()}</span>
        </div>
        <div class="quiz-meta-item">
          <span>⏱️ Duration:</span>
          <span>${durText}</span>
        </div>
      `;
    } else if (isCompleted) {
      actionButton = `
        <button class="btn btn-outline" onclick="viewResults('${quiz.id}')">
          📊 View Results
        </button>
      `;
    } else if (isOverdue) {
      actionButton = `
        <button class="btn btn-outline" onclick="viewQuizReadonly('${quiz.id}')" style="opacity: 0.8;">
          👁️ View Only
        </button>
        <span style="font-size: 0.75rem; color: var(--error-500); display: block; margin-top: 0.5rem;">
          ⚠️ Deadline has passed
        </span>
      `;
    } else {
      actionButton = `
        <button class="btn btn-primary" onclick="takeQuiz('${quiz.id}')">
          ✏️ Take Quiz
        </button>
      `;
    }

    let statusBadgeStyle = '';
    const displayStatus = quiz.status === 'scheduled' ? 'scheduled' : status;
    if (displayStatus === 'active') statusBadgeStyle = 'background: var(--success-100, #e8f5e9); color: var(--success-600, #2e7d32);';
    else if (displayStatus === 'overdue') statusBadgeStyle = 'background: var(--error-100, #ffebee); color: var(--error-600, #c62828);';
    else if (displayStatus === 'finished') statusBadgeStyle = 'background: var(--primary-100, #e8eaf6); color: var(--primary-600, #3949ab);';
    else if (displayStatus === 'scheduled') statusBadgeStyle = 'background: rgba(102,126,234,0.15); color: #a5b4fc;';

    return `
      <div class="quiz-card ${status}" style="display:flex;flex-direction:column;">
        <div class="quiz-header">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;flex:1;min-width:0;">
            <h3 class="quiz-title" style="margin:0;">${quiz.title}</h3>
            ${quiz.subject ? `<span style="background:rgba(102,126,234,0.2);color:#a5b4fc;border-radius:20px;padding:0.12rem 0.55rem;font-size:0.7rem;font-weight:700;flex-shrink:0;">${quiz.subject}</span>` : ''}
          </div>
          <span class="quiz-status ${displayStatus}" style="${statusBadgeStyle} padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize;">${displayStatus === 'scheduled' ? '📅 Scheduled' : displayStatus}</span>
        </div>
        <p class="quiz-description" style="margin-bottom:1rem;">${quiz.description || 'No description provided'}</p>
        <div class="quiz-meta" style="text-align:center;justify-content:center;margin-bottom:1rem;">
          <div class="quiz-meta-item">
            <span>📅 Deadline:</span>
            <span>${firebaseApp.formatDateTime(quiz.deadline)}</span>
          </div>
          <div class="quiz-meta-item">
            <span>❓ Questions:</span>
            <span>${quiz.questions ? quiz.questions.length : 0}</span>
          </div>
          <div class="quiz-meta-item">
            <span>👨‍🏫 Teacher:</span>
            <span>${quiz.createdByName || 'Unknown'}</span>
          </div>
          ${result ? `
            <div class="quiz-meta-item">
              <span>🎯 Your Score:</span>
              <span>${result.score}/${result.maxScore} (${result.percentage}%)</span>
            </div>
          ` : ''}
          ${scheduleInfoHTML}

        </div>
        <div class="quiz-actions" style="margin-top:auto;text-align:center;">
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// Render Scores
// ========================================

function renderScores() {
  if (quizResults.length === 0) {
    scoresListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎯</div>
        <h3>No scores yet</h3>
        <p>Take quizzes to see your scores here</p>
      </div>
    `;
    return;
  }

  // Compute overall average
  const validPcts = quizResults.filter(r => typeof r.percentage === 'number');
  const avg = validPcts.length > 0
    ? (validPcts.reduce((sum, r) => sum + r.percentage, 0) / validPcts.length).toFixed(1)
    : null;

  const avgColor = avg === null ? '#9ca3af'
    : avg >= 85 ? '#22c55e'
      : avg >= 70 ? '#f59e0b'
        : '#ef4444';

  const avgBanner = avg !== null ? `
    <div style="display:flex;align-items:center;gap:1.25rem;padding:1rem 1.25rem;
      background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.22);
      border-radius:12px;margin-bottom:1.25rem;">
      <div>
        <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;
          color:var(--gray-400);font-weight:700;">Overall Average</div>
        <div style="font-size:2rem;font-weight:800;color:${avgColor};line-height:1;">${avg}%</div>
      </div>
      <div style="flex:1;font-size:0.82rem;color:var(--gray-400);">
        Based on <strong style="color:var(--gray-400);">${validPcts.length}</strong> completed quiz${validPcts.length !== 1 ? 'zes' : ''}
      </div>
    </div>` : '';

  scoresListEl.innerHTML = avgBanner + quizResults.map(result => {
    const quiz = allQuizzes.find(q => q.id === result.quizId);
    const quizTitle = quiz ? quiz.title : 'Unknown Quiz';

    return `
      <div class="score-item">
        <div class="score-info">
          <h3>${quizTitle}</h3>
          <p>Submitted: ${firebaseApp.formatDateTime(result.submittedAt)}</p>
        </div>
        <div class="score-value">
          <div class="score-percentage">${Math.round(result.percentage || 0)}%</div>
          <div class="score-points">${result.score}/${result.maxScore} points</div>
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// Render Quiz History
// ========================================

window.renderQuizHistory = function () {
  const container = document.getElementById('quizHistoryListContainer');
  const filter = document.getElementById('shFilterSelect')?.value || 'all';

  if (!container) return;

  if (pastQuizzes.length === 0) {
    container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">📚</div>
                <h3>No History Available</h3>
                <p>You don't have any quizzes from previous grades or school years yet.</p>
            </div>
        `;
    return;
  }

  let displayGroups = pastQuizzes;

  if (filter !== 'all') {
    const [fGrade, fSection] = filter.split('_');
    displayGroups = pastQuizzes.filter(g => String(g.historyEntry.grade) === String(fGrade) && String(g.historyEntry.section) === String(fSection));
  }

  if (displayGroups.length === 0) {
    container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">🔍</div>
                <h3>No Quizzes Found</h3>
                <p>No past quizzes found for the selected grade and section.</p>
            </div>
        `;
    return;
  }

  container.innerHTML = displayGroups.map(group => {
    const entry = group.historyEntry;
    const groupTitle = `${entry.schoolYear ? entry.schoolYear + ' — ' : ''}Grade ${entry.grade} (${entry.section || 'Unassigned'})`;

    const validPcts = group.results.filter(qr => typeof qr.result.percentage === 'number');
    const avg = validPcts.length > 0 ? (validPcts.reduce((sum, qr) => sum + qr.result.percentage, 0) / validPcts.length).toFixed(1) : 'N/A';

    const quizzesHTML = group.results.map(qr => {
      const quiz = qr.quiz;
      const res = qr.result;
      const pct = res.percentage || 0;
      const gradeColor = pct >= 80 ? '#34d399' : pct >= 75 ? '#60a5fa' : pct >= 60 ? '#fbbf24' : '#f87171';

      return `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1rem;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
                        <h4 style="margin:0;font-size:0.95rem;font-weight:600;color:var(--gray-100);">${quiz.title}</h4>
                        <span style="background:${gradeColor}22;color:${gradeColor};padding:0.15rem 0.5rem;border-radius:20px;font-size:0.75rem;font-weight:700;">${pct}%</span>
                    </div>
                    <div style="font-size:0.8rem;color:var(--gray-400);display:flex;flex-direction:column;gap:0.25rem;">
                        <span>👨‍🏫 ${quiz.createdByName || 'Unknown'}</span>
                        <span>📅 Taken: ${firebaseApp.formatDateTime(res.submittedAt)}</span>
                        <span>🎯 Score: ${res.score}/${res.maxScore}</span>
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="viewResults('${quiz.id}')" style="width:100%;margin-top:1rem;padding:0.4rem;font-size:0.8rem;">
                        📊 View Details
                    </button>
                </div>
            `;
    }).join('');

    return `
            <div style="grid-column: 1 / -1; margin-bottom: 2rem;">
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid rgba(255,255,255,0.1);">
                    <h3 style="margin:0;font-size:1.15rem;font-weight:700;color:var(--primary-300);">🎓 ${groupTitle}</h3>
                    <span style="background:var(--surface-3);padding:0.2rem 0.6rem;border-radius:20px;font-size:0.75rem;color:var(--gray-300);">Average: ${avg}%</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:1rem;">
                    ${quizzesHTML}
                </div>
            </div>
        `;
  }).join('');
};

// ========================================
// Render Recommendations
// ========================================

function renderRecommendations(recommendations) {
  if (recommendations.length === 0) {
    recommendationsListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🤖</div>
        <h3>No recommendations yet</h3>
        <p>Complete quizzes to receive personalized AI-powered study recommendations!</p>
      </div>
    `;
    return;
  }

  recommendationsListEl.innerHTML = recommendations.map(rec => {
    const quiz = allQuizzes.find(q => q.id === rec.quizId);
    const quizTitle = quiz ? quiz.title : 'Quiz';
    const quizCategory = quiz ? (quiz.category || quiz.subject || 'General') : 'General';
    const quizType = quiz && quiz.questions ? (quiz.questions[0]?.type || 'Standard') : 'Standard';

    // Format recommendations text (convert markdown-like stars to bold if present)
    const formattedText = rec.recommendations
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    return `
      <div class="recommendation-card">
        <div class="recommendation-header">
          <div class="recommendation-icon">🤖</div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
                <h3 class="recommendation-title">Results for "${quizTitle}"</h3>
                <span class="badge" style="background: var(--primary-100); color: var(--primary-700); font-size: 0.7rem;">${quizCategory} • ${quizType.replace('-', ' ')}</span>
            </div>
          </div>
        </div>
        <div class="recommendation-content" style="background: rgba(102, 126, 234, 0.05); padding: 1.25rem; border-radius: 12px; margin-bottom: 1rem; border-left: 4px solid var(--primary-400);">
            ${formattedText}
        </div>
        ${rec.topics && rec.topics.length > 0 ? `
          <div class="recommendation-topics">
            <span class="focus-topics-label">Focus Topics:</span>
            ${rec.topics.map(topic => `<span class="topic-tag">${topic}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ========================================
// Navigation
// ========================================

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const sectionName = item.dataset.section;

    // Settings opens modal instead of section
    if (sectionName === 'settings') {
      if (typeof openSettingsModal === 'function') openSettingsModal();
      return;
    }

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Show selected section
    Object.keys(sections).forEach(key => {
      if (sections[key]) sections[key].classList.add('hidden');
    });
    if (sections[sectionName]) sections[sectionName].classList.remove('hidden');
  });
});

// ========================================
// Quiz Tabs
// ========================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentQuizFilter = btn.dataset.status;

    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');

    // Re-render quizzes
    renderQuizzes();
  });
});

// ========================================
// Actions
// ========================================

function filterQuizzesBySearch(value) {
  quizSearchQuery = value;
  renderQuizzes();
}

function takeQuiz(quizId) {
  window.location.href = `${firebaseApp.getRoute('quiz')}?id=${quizId}`;
}

function viewQuizReadonly(quizId) {
  window.location.href = `${firebaseApp.getRoute('quiz')}?id=${quizId}&view=readonly`;
}

async function viewResults(quizId) {
  // Find quiz and result from local data first
  const quiz = allQuizzes.find(q => q.id === quizId);
  const result = quizResults.find(r => r.quizId === quizId);

  if (!result) {
    firebaseApp.showToast('Results not found', 'error');
    return;
  }

  // Remove any stale modal
  const old = document.getElementById('studentResultsModal');
  if (old) old.remove();

  // Try to load full result with answers from Firestore
  let fullResult = result;
  try {
    const snap = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
      .where('quizId', '==', quizId)
      .where('studentId', '==', currentUser.uid)
      .get();
    if (!snap.empty) fullResult = { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) { /* use cached result */ }

  const pct = Math.round(fullResult.percentage || 0);
  const score = fullResult.score || 0;
  const maxScore = fullResult.maxScore || fullResult.totalPoints || quiz?.totalPoints || '?';
  const grade = pct >= 90 ? '🏆 Excellent' : pct >= 80 ? '⭐ Good' : pct >= 75 ? '✅ Passed' : pct >= 60 ? '📘 Needs Review' : '⚠️ Below Passing';
  const gradeColor = pct >= 80 ? '#34d399' : pct >= 75 ? '#60a5fa' : pct >= 60 ? '#fbbf24' : '#f87171';
  const submittedDate = fullResult.submittedAt
    ? (fullResult.submittedAt.toDate ? fullResult.submittedAt.toDate() : new Date(fullResult.submittedAt)).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const createdDate = quiz?.createdAt
    ? (quiz.createdAt.toDate ? quiz.createdAt.toDate() : new Date(quiz.createdAt)).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  // Build question review
  const questions = quiz?.questions || [];
  const answers = fullResult.answers || {};
  const allowReview = quiz?.allowReview !== false;

  const questionsHTML = questions.length > 0 && allowReview
    ? `<div style="margin-top:1.25rem;">
        <h4 style="font-size:0.95rem;font-weight:700;color:#fff;margin:0 0 0.75rem;display:flex;align-items:center;gap:0.5rem;">📋 Question Review</h4>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${questions.map((q, i) => {
      const studentAns = answers[i] ?? answers[String(i)];
      const correct = q.correctAnswer;
      let isCorrect = false;
      if (q.type === 'multiple-choice') isCorrect = String(studentAns) === String(correct);
      else if (q.type === 'true-false') isCorrect = String(studentAns) === String(correct);
      else if (q.type === 'identification') isCorrect = String(studentAns || '').trim().toLowerCase() === String(correct || '').trim().toLowerCase();
      const bg = studentAns === undefined || studentAns === null ? 'rgba(107,114,128,0.15)' : isCorrect ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)';
      const icon = studentAns === undefined || studentAns === null ? '⬜' : isCorrect ? '✅' : '❌';
      const displayAns = q.type === 'multiple-choice' && q.options ? (q.options[studentAns] || 'No answer') : studentAns !== undefined && studentAns !== null ? String(studentAns) : 'No answer';
      const displayCorrect = q.type === 'multiple-choice' && q.options ? (q.options[correct] || '—') : String(correct ?? '—');
      return `
              <div style="background:${bg};border-radius:10px;padding:0.75rem 1rem;">
                <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;">
                  <span style="color:#a5b4fc;font-weight:700;font-size:0.8rem;flex-shrink:0;">Q${i + 1}</span>
                  <span style="font-size:0.88rem;color:rgba(255,255,255,0.9);">${q.question}</span>
                </div>
                <div style="font-size:0.8rem;display:flex;flex-direction:column;gap:0.18rem;padding-left:1.5rem;">
                  <span style="color:rgba(255,255,255,0.55);">Your answer: <strong style="color:rgba(255,255,255,0.85);">${displayAns}</strong> ${icon}</span>
                  ${!isCorrect ? `<span style="color:rgba(255,255,255,0.45);">Correct: <strong style="color:#86efac;">${displayCorrect}</strong></span>` : ''}
                </div>
              </div>`;
    }).join('')}
        </div>
      </div>`
    : allowReview === false
      ? `<p style="color:rgba(255,255,255,0.4);text-align:center;padding:1rem;font-size:0.875rem;">Answer review is disabled for this quiz.</p>`
      : '';

  const modal = document.createElement('div');
  modal.id = 'studentResultsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  modal.innerHTML = `
    <div style="background:var(--sidebar-bg,#13132b);border-radius:20px;width:100%;max-width:620px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 32px 64px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);">
      <!-- Header -->
      <div style="padding:1.5rem 1.75rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.4rem;">
            <span style="font-size:1.4rem;">📊</span>
            <h2 style="font-size:1.2rem;font-weight:700;color:#fff;margin:0;">${quiz?.title || 'Quiz Results'}</h2>
            ${quiz?.subject ? `<span style="background:rgba(102,126,234,0.25);color:#a5b4fc;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.72rem;font-weight:700;">${quiz.subject}</span>` : ''}
          </div>
          <p style="color:rgba(255,255,255,0.5);font-size:0.82rem;margin:0;">By ${quiz?.createdByName || 'Unknown Teacher'} · Created ${createdDate}</p>
        </div>
        <button onclick="document.getElementById('studentResultsModal').remove()" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:1rem;flex-shrink:0;margin-left:1rem;">✕</button>
      </div>
      <!-- Body -->
      <div style="flex:1;overflow-y:auto;padding:1.5rem 1.75rem;">
        <!-- Score card -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.875rem;margin-bottom:1.25rem;">
          <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:1rem;text-align:center;">
            <div style="font-size:2.25rem;font-weight:800;color:${gradeColor};">${pct}%</div>
            <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Score</div>
          </div>
          <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:1rem;text-align:center;">
            <div style="font-size:1.5rem;font-weight:700;color:#fff;">${score}/${maxScore}</div>
            <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Points</div>
          </div>
          <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:1rem;text-align:center;">
            <div style="font-size:1.3rem;font-weight:700;color:${gradeColor};">${grade}</div>
            <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Grade</div>
          </div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.5);">
          📅 Submitted on <strong style="color:rgba(255,255,255,0.75);">${submittedDate}</strong>
        </div>
        ${questionsHTML}
      </div>
    </div>
  `;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ========================================
// Notifications
// ========================================

let studentNotifications = [];
let unsubNotifListener = null;

async function loadNotifications() {
  if (!currentUser) return;
  try {
    const snapshot = await firebaseApp.db.collection(firebaseApp.collections.notifications)
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    studentNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderNotifications();
    setupNotificationListener();
  } catch (error) {
    console.warn('Could not load notifications:', error);
  }
}

function setupNotificationListener() {
  if (unsubNotifListener) unsubNotifListener();
  try {
    unsubNotifListener = firebaseApp.db.collection(firebaseApp.collections.notifications)
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const notif = { id: change.doc.id, ...change.doc.data() };
            if (!studentNotifications.find(n => n.id === notif.id)) {
              studentNotifications.unshift(notif);
            }
          } else if (change.type === 'modified') {
            const idx = studentNotifications.findIndex(n => n.id === change.doc.id);
            if (idx >= 0) studentNotifications[idx] = { id: change.doc.id, ...change.doc.data() };
          } else if (change.type === 'removed') {
            studentNotifications = studentNotifications.filter(n => n.id !== change.doc.id);
          }
        });
        renderNotifications();
      });
  } catch (e) {
    console.warn('Notification listener error:', e);
  }
}

function renderNotifications() {
  const listEl = document.getElementById('notificationList');
  const badgeEl = document.getElementById('notifBadge');
  if (!listEl || !badgeEl) return;

  const unreadCount = studentNotifications.filter(n => !n.read).length;

  // Update badge
  if (unreadCount > 0) {
    badgeEl.style.display = 'block';
    badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
  } else {
    badgeEl.style.display = 'none';
    badgeEl.textContent = '0';
  }

  if (studentNotifications.length === 0) {
    listEl.innerHTML = '<p class="notification-empty">No notifications</p>';
    return;
  }

  listEl.innerHTML = studentNotifications.map(notif => {
    const timeAgo = notif.createdAt ? formatTimeAgo(notif.createdAt) : '';
    const unreadDot = !notif.read ? '<span style="display:inline-block;width:8px;height:8px;background:#667eea;border-radius:50%;flex-shrink:0;"></span>' : '';
    const unreadClass = !notif.read ? ' unread' : '';
    const icon = notif.type === 'quiz_deleted' ? '🗑️' : '🔔';

    return `
      <div class="notification-item${unreadClass}" onclick="markNotifRead('${notif.id}')">
        <div style="display:flex;align-items:flex-start;gap:0.5rem;">
          <span style="font-size:1.1rem;flex-shrink:0;">${icon}</span>
          <div style="flex:1;min-width:0;">
            <div class="notif-title">${notif.title || 'Notification'}</div>
            <div class="notif-message">${notif.message || ''}</div>
            <div class="notif-time">${timeAgo}</div>
          </div>
          ${unreadDot}
        </div>
      </div>
    `;
  }).join('');
}

function formatTimeAgo(timestamp) {
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch (e) { return ''; }
}

async function markNotifRead(notifId) {
  try {
    await firebaseApp.db.collection(firebaseApp.collections.notifications).doc(notifId).update({ read: true });
    const notif = studentNotifications.find(n => n.id === notifId);
    if (notif) notif.read = true;
    renderNotifications();
  } catch (e) {
    console.warn('Could not mark notification as read:', e);
  }
}

async function markAllNotifsRead() {
  try {
    const batch = firebaseApp.db.batch();
    studentNotifications.filter(n => !n.read).forEach(n => {
      batch.update(firebaseApp.db.collection(firebaseApp.collections.notifications).doc(n.id), { read: true });
      n.read = true;
    });
    await batch.commit();
    renderNotifications();
  } catch (e) {
    console.warn('Could not mark all as read:', e);
  }
}

// Toggle notification panel
document.addEventListener('DOMContentLoaded', () => {
  const bellBtn = document.getElementById('notificationBellBtn');
  const panel = document.getElementById('notificationPanel');
  const markAllBtn = document.getElementById('markAllReadBtn');

  if (bellBtn && panel) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && !bellBtn.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllNotifsRead();
    });
  }
});

// ========================================
// Logout
// ========================================

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    // Cleanup real-time listeners
    if (unsubQuizListener) unsubQuizListener();

    localStorage.setItem('lnhs-logout-reason', 'manual');
    await firebaseApp.auth.signOut();
    window.location.href = firebaseApp.getRoute('login');
  } catch (error) {
    console.error('Logout error:', error);
    firebaseApp.showToast('Logout failed', 'error');
  }
});

// ========================================
// Refresh Dashboard
// ========================================

const refreshBtn = document.getElementById('refreshDashboardBtn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Refreshing...';
    try {
      await Promise.all([
        loadQuizzes(),
        loadQuizResults(),
        loadRecommendations()
      ]);
      updateStats();
      renderUpcomingDeadlines();
      renderQuizzes();
      renderScores();
      firebaseApp.showToast('🔄 Dashboard refreshed!', 'success');
    } catch (e) {
      firebaseApp.showToast('Failed to refresh', 'error');
    }
    refreshBtn.disabled = false;
    refreshBtn.textContent = '🔄 Refresh';
  });
}

// ========================================
// Initialize on Load
// ========================================

document.addEventListener('DOMContentLoaded', initDashboard);

// Re-render chart when theme toggles
document.addEventListener('DOMContentLoaded', () => {
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    darkToggle.addEventListener('change', () => {
      // Short delay so the class change on body is applied first
      setTimeout(() => {
        if (quizResults.length > 0) renderPerformanceChart();
      }, 50);
    });
  }
});
