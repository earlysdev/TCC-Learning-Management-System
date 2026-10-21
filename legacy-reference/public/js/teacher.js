/**
 * Teacher Dashboard Logic
 * Full quiz creation, student sync, section filtering, real-time updates
 */

// Protect this page
if (!firebaseApp.protectPage('teacher')) {
    // Redirect handled by protectPage
}

const currentUser = firebaseApp.getCurrentUser();

// ========================================
// DOM Elements
// ========================================
const teacherNameEl = document.getElementById('teacherName');
const userInitialsEl = document.getElementById('userInitials');
const totalQuizzesEl = document.getElementById('totalQuizzes');
const totalStudentsEl = document.getElementById('totalStudents');
const avgScoreEl = document.getElementById('avgScore');
const completionRateEl = document.getElementById('completionRate');
const recentActivityEl = document.getElementById('recentActivity');
const quizzesListEl = document.getElementById('quizzesList');
const studentsListEl = document.getElementById('studentsList');
const topPerformersEl = document.getElementById('topPerformers');
const aiInsightsListEl = document.getElementById('aiInsightsList');

const sections = {
    overview: document.getElementById('overviewSection'),
    quizzes: document.getElementById('quizzesSection'),
    students: document.getElementById('studentsSection'),
    analytics: document.getElementById('analyticsSection'),
    'ai-insights': document.getElementById('aiInsightsSection')
};

// ========================================
// State
// ========================================
let allQuizzes = [];
let allStudents = [];
let allResults = [];
let currentQuizFilter = 'all';
let studentGradeFilter = '';
let studentSectionFilter = '';
let studentSearchQuery = '';
let unsubQuizzes = null; // Real-time listener cleanup
let unsubResults = null;
let editingQuizId = null; // null = creating new quiz, string = editing existing draft

// ========================================
// Initialize Dashboard
// ========================================
async function initDashboard() {
    try {
        if (currentUser) {
            const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
            teacherNameEl.textContent = fullName;
            userInitialsEl.textContent = `${currentUser.firstName[0]}${currentUser.lastName[0]}`;

            // Update lastActive silently
            try {
                await firebaseApp.db.collection(firebaseApp.collections.users).doc(currentUser.uid).update({
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) { console.warn('lastActive update failed:', e); }

            updateLastActiveTime();
        }

        // Load students first (needed by quiz assignment UI)
        await loadStudents();

        // Load quizzes and results
        await Promise.all([
            loadQuizzes(),
            loadResults()
        ]);

        // Render everything
        updateStats();
        renderRecentActivity();
        renderQuizzes();
        renderStudents();
        renderAnalytics();
        renderAIInsights();

        // Setup real-time listeners 
        setupRealtimeListeners();

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        firebaseApp.showToast('Failed to load dashboard data', 'error');
    }
}

function updateLastActiveTime() {
    const lastActiveEl = document.getElementById('lastActivityTime');
    if (lastActiveEl) {
        lastActiveEl.textContent = 'Just now';
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
// Data Loading
// ========================================

async function loadQuizzes() {
    try {
        const snapshot = await firebaseApp.db.collection(firebaseApp.collections.quizzes)
            .where('createdBy', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();

        allQuizzes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error loading quizzes:', error);
        allQuizzes = [];
    }
}

async function loadStudents() {
    try {
        const snapshot = await firebaseApp.db.collection(firebaseApp.collections.users)
            .where('role', '==', 'student')
            .where('isActive', '==', true)
            .get();

        allStudents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).filter(s => {
            const grade = (s.grade || s.gradeLevel || '').toString().toLowerCase();
            return !grade.includes('graduated') && !grade.includes('alumnus') && !grade.includes('alumni');
        });
    } catch (error) {
        console.error('Error loading students:', error);
        allStudents = [];
    }
}

async function loadResults() {
    try {
        const quizIds = allQuizzes.map(q => q.id);
        if (quizIds.length === 0) {
            allResults = [];
            return;
        }

        // Firestore 'in' queries limited to 10 items
        const batchSize = 10;
        const allDocs = [];
        for (let i = 0; i < quizIds.length; i += batchSize) {
            const batch = quizIds.slice(i, i + batchSize);
            const snapshot = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
                .where('quizId', 'in', batch)
                .get();
            allDocs.push(...snapshot.docs);
        }

        allResults = allDocs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error loading results:', error);
        allResults = [];
    }
}

// ========================================
// Real-Time Listeners
// ========================================

function setupRealtimeListeners() {
    // Listen for new quiz results in real-time
    if (allQuizzes.length > 0) {
        const quizIds = allQuizzes.map(q => q.id).slice(0, 10); // First 10 for real-time

        try {
            unsubResults = firebaseApp.db.collection(firebaseApp.collections.quizResults)
                .where('quizId', 'in', quizIds)
                .onSnapshot(snapshot => {
                    // Only process changes, not initial load
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const newResult = { id: change.doc.id, ...change.doc.data() };
                            // Check if we already have this result
                            if (!allResults.find(r => r.id === newResult.id)) {
                                allResults.push(newResult);
                                // Update UI
                                updateStats();
                                renderRecentActivity();
                                renderQuizzes();
                            }
                        }
                    });
                }, error => {
                    console.warn('Real-time results listener error:', error);
                });
        } catch (e) {
            console.warn('Could not set up real-time listener:', e);
        }
    }
}

// ========================================
// Statistics
// ========================================

function updateStats() {
    totalQuizzesEl.textContent = allQuizzes.length;
    totalStudentsEl.textContent = allStudents.length;

    if (allResults.length > 0) {
        const totalScore = allResults.reduce((sum, r) => sum + (r.percentage || 0), 0);
        const avg = Math.round(totalScore / allResults.length);
        avgScoreEl.textContent = `${avg}%`;
    } else {
        avgScoreEl.textContent = '0%';
    }

    if (allQuizzes.length > 0 && allStudents.length > 0) {
        // Only count published quizzes for completion rate
        const publishedQuizzes = allQuizzes.filter(q => q.status === 'active');
        const totalPossible = publishedQuizzes.length * allStudents.length;
        const completed = allResults.length;
        const rate = totalPossible > 0 ? Math.round((completed / totalPossible) * 100) : 0;
        completionRateEl.textContent = `${Math.min(rate, 100)}%`;
    } else {
        completionRateEl.textContent = '0%';
    }
}

// ========================================
// Recent Activity
// ========================================

function renderRecentActivity() {
    // Safe sort - handle missing submittedAt
    const recentResults = allResults
        .filter(r => r.submittedAt) // Only results with timestamp
        .sort((a, b) => {
            const dateA = a.submittedAt.toDate ? a.submittedAt.toDate() : new Date(a.submittedAt);
            const dateB = b.submittedAt.toDate ? b.submittedAt.toDate() : new Date(b.submittedAt);
            return dateB - dateA;
        })
        .slice(0, 5);

    if (recentResults.length === 0) {
        recentActivityEl.innerHTML = '<p style="color: var(--gray-500);">No recent activity</p>';
        return;
    }

    recentActivityEl.innerHTML = recentResults.map(result => {
        const student = allStudents.find(s => s.id === result.studentId);
        const quiz = allQuizzes.find(q => q.id === result.quizId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown Student';
        const quizTitle = quiz ? quiz.title : 'Unknown Quiz';

        return `
            <div class="activity-item" style="padding: var(--space-3); border-bottom: 1px solid var(--gray-200);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${studentName}</strong> completed <strong>${quizTitle}</strong>
                        <br>
                        <small style="color: var(--gray-500);">${result.submittedAt ? firebaseApp.formatDateTime(result.submittedAt) : ''}</small>
                    </div>
                    <div class="badge ${result.percentage >= 75 ? 'badge-success' : result.percentage >= 50 ? 'badge-warning' : 'badge-error'}" style="font-size:0.9rem; font-weight:700; padding:0.35rem 0.85rem;">
                        ${result.percentage || 0}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// Render Quizzes
// ========================================

function renderQuizzes() {
    const now = new Date();

    // Compute effective status for each quiz (handles auto-archive)
    const quizzesWithStatus = allQuizzes.map(quiz => {
        let effectiveStatus = quiz.status || 'active';

        // Auto-activate: if status is 'scheduled' and start time has arrived
        if (effectiveStatus === 'scheduled' && quiz.scheduledDate && quiz.scheduledStartTime) {
            try {
                const startDateTime = new Date(`${quiz.scheduledDate}T${quiz.scheduledStartTime}`);
                if (startDateTime <= now) {
                    effectiveStatus = 'active';
                    // Also update in Firestore (fire-and-forget)
                    firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(quiz.id).update({
                        status: 'active', isActive: true
                    }).catch(() => { });
                }
            } catch (e) { /* keep current status */ }
        }

        // Auto-archive: if status is 'active' but deadline has passed
        if (effectiveStatus === 'active' && quiz.deadline) {
            try {
                const deadline = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
                if (deadline < now) {
                    effectiveStatus = 'archived';
                }
            } catch (e) { /* keep current status */ }
        }

        return { ...quiz, effectiveStatus };
    });

    // Filter based on selected tab
    const filteredQuizzes = currentQuizFilter === 'all'
        ? quizzesWithStatus.filter(quiz => quiz.effectiveStatus !== 'archived')
        : quizzesWithStatus.filter(quiz => {
            if (currentQuizFilter === 'active') {
                return quiz.effectiveStatus === 'active';
            } else if (currentQuizFilter === 'draft') {
                return quiz.effectiveStatus === 'draft';
            } else if (currentQuizFilter === 'scheduled') {
                return quiz.effectiveStatus === 'scheduled';
            } else if (currentQuizFilter === 'archived') {
                return quiz.effectiveStatus === 'archived';
            }
            return true;
        });

    // Empty state messages per tab
    const emptyMessages = {
        all: 'Create your first quiz to get started',
        active: 'No active quizzes. Create and publish one!',
        draft: 'No draft quizzes. Create one and save as draft!',
        scheduled: 'No scheduled quizzes with upcoming deadlines',
        archived: 'No archived quizzes. Past-deadline quizzes appear here automatically.'
    };

    if (filteredQuizzes.length === 0) {
        quizzesListEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <h3>No quizzes found</h3>
                <p>${emptyMessages[currentQuizFilter] || emptyMessages.all}</p>
            </div>
        `;
        return;
    }

    quizzesListEl.innerHTML = filteredQuizzes.map(quiz => {
        const results = allResults.filter(r => r.quizId === quiz.id);
        const submissions = results.length;
        const avgScore = results.length > 0
            ? Math.round(results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length)
            : 0;

        // Safe deadline formatting
        let deadlineStr = 'No deadline set';
        if (quiz.deadline) {
            try {
                deadlineStr = firebaseApp.formatDateTime(quiz.deadline);
            } catch (e) {
                deadlineStr = 'Invalid date';
            }
        }

        // Status badge based on effective status
        let statusClass, statusLabel;
        if (quiz.effectiveStatus === 'archived') {
            statusClass = 'archived';
            statusLabel = 'Archived';
        } else if (quiz.effectiveStatus === 'draft') {
            statusClass = 'draft';
            statusLabel = 'Draft';
        } else if (quiz.effectiveStatus === 'scheduled') {
            statusClass = 'scheduled';
            statusLabel = '📅 Scheduled';
        } else {
            statusClass = 'active';
            statusLabel = 'Active';
        }

        // Schedule info for scheduled quizzes
        let scheduleInfoHTML = '';
        if (quiz.scheduledDate && quiz.scheduledStartTime) {
            const schedDate = new Date(`${quiz.scheduledDate}T${quiz.scheduledStartTime}`);
            const durText = quiz.scheduledDuration ? `${quiz.scheduledDuration} min` : 'No limit';
            scheduleInfoHTML = `
                <div class="quiz-meta-item">
                    <span>📅 Scheduled:</span>
                    <span>${schedDate.toLocaleString()}</span>
                </div>
                <div class="quiz-meta-item">
                    <span>⏱️ Duration:</span>
                    <span>${durText}</span>
                </div>
            `;
        }

        // Assignment info
        let assignInfo = 'All Students';
        if (quiz.assignmentType === 'section') {
            if (quiz.assignedToSections && quiz.assignedToSections.length > 0) {
                assignInfo = quiz.assignedToSections.map(s => {
                    const [g, ...sec] = s.split('-');
                    return `G${g}-${sec.join('-')}`;
                }).join(', ');
                assignInfo = 'Section(s): ' + assignInfo;
            } else {
                assignInfo = `Section: Grade ${quiz.assignedGrade || '?'} - ${quiz.assignedSectionName || quiz.assignedToSection || '?'}`;
            }
        } else if (quiz.assignmentType === 'individual') {
            const count = quiz.assignedToStudents ? quiz.assignedToStudents.length : 0;
            assignInfo = `${count} Selected Student${count !== 1 ? 's' : ''}`;
        }

        // Action buttons based on effective status
        let actionButtons = '';

        if (quiz.effectiveStatus === 'draft') {
            actionButtons += `
                <button class="btn btn-outline btn-sm" onclick="editQuiz('${quiz.id}')">
                    ✏️ Edit
                </button>
                <button class="btn btn-primary btn-sm" onclick="publishDraft('${quiz.id}')">
                    🚀 Publish
                </button>
            `;
        }

        if (quiz.effectiveStatus === 'archived') {
            // Re-publish button moved to header
        }

        actionButtons += `
            <button class="btn btn-outline btn-sm" onclick="exportQuizToPDF('${quiz.id}')">
                📄 Export PDF
            </button>
            <button class="btn btn-accent btn-sm" onclick="viewQuizResults('${quiz.id}')">
                📊 Results
            </button>
            <button class="btn btn-error btn-sm" onclick="deleteQuiz('${quiz.id}')">
                🗑️ Delete
            </button>
        `;

        return `
            <div class="quiz-card card">
                <div class="quiz-header">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;flex:1;min-width:0;">
                        <h3 class="quiz-title" style="margin:0;">${quiz.title}</h3>
                        ${quiz.subject ? `<span style="background:rgba(102,126,234,0.2);color:#a5b4fc;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.72rem;font-weight:700;flex-shrink:0;">${quiz.subject}</span>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                        <span class="quiz-status ${statusClass}">${statusLabel}</span>
                        ${quiz.effectiveStatus === 'archived' ? `
                            <button class="btn btn-primary btn-sm" onclick="republishQuiz('${quiz.id}')" style="font-size:0.85rem; padding:0.5rem 1.15rem; background:linear-gradient(135deg,#6366f1,#4f46e5); font-weight:700; border-radius:8px; box-shadow:0 4px 12px rgba(99,102,241,0.35); letter-spacing:0.02em;">
                                🔄 Re-publish Quiz
                            </button>
                        ` : ''}
                    </div>
                </div>
                <p class="quiz-description" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${quiz.description || 'No description provided'}</p>
                <div class="quiz-meta">
                    <div class="quiz-meta-item">
                        <span>📅 Deadline:</span>
                        <span>${deadlineStr}</span>
                    </div>
                    <div class="quiz-meta-item">
                        <span>❓ Questions:</span>
                        <span>${quiz.questions ? quiz.questions.length : 0}</span>
                    </div>
                    <div class="quiz-meta-item">
                        <span>📊 Submissions:</span>
                        <span>${submissions}</span>
                    </div>
                    <div class="quiz-meta-item">
                        <span>🎯 Avg Score:</span>
                        <span>${avgScore}%</span>
                    </div>
                    <div class="quiz-meta-item">
                        <span>👥 Assigned:</span>
                        <span>${assignInfo}</span>
                    </div>
                    ${scheduleInfoHTML}
                </div>
                <div class="quiz-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// Render Students (with Grade & Section)
// ========================================

function getUniqueGrades() {
    const grades = [...new Set(allStudents.map(s => s.grade).filter(Boolean))];
    return grades.sort((a, b) => parseInt(a) - parseInt(b));
}

function getUniqueSections(grade = null) {
    let students = allStudents;
    if (grade) {
        students = students.filter(s => s.grade === grade);
    }
    const sects = [...new Set(students.map(s => s.section).filter(Boolean))];
    return sects.sort();
}

function renderStudents() {
    // Get unique grades and sections for filter dropdowns
    const grades = getUniqueGrades();
    const sectionsForGrade = studentGradeFilter ? getUniqueSections(studentGradeFilter) : getUniqueSections();

    // Apply filters
    let filteredStudents = [...allStudents];
    if (studentGradeFilter) {
        filteredStudents = filteredStudents.filter(s => s.grade === studentGradeFilter);
    }
    if (studentSectionFilter) {
        filteredStudents = filteredStudents.filter(s => s.section === studentSectionFilter);
    }
    // Apply text search
    if (studentSearchQuery.trim()) {
        const q = studentSearchQuery.trim().toLowerCase();
        filteredStudents = filteredStudents.filter(s =>
            (`${s.firstName || ''} ${s.lastName || ''}`).toLowerCase().includes(q) ||
            (s.lrn || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.section || '').toLowerCase().includes(q)
        );
    }

    // Build filter bar HTML
    const filterBarHTML = `
        <div class="student-filter-bar" style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: flex-end;">
            <div style="flex: 1; min-width: 160px;">
                <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Filter by Grade</label>
                <select id="studentGradeFilter" class="form-input" onchange="filterStudentsByGrade(this.value)">
                    <option value="">All Grades</option>
                    ${grades.map(g => `<option value="${g}" ${studentGradeFilter === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}
                </select>
            </div>
            <div style="flex: 1; min-width: 160px;">
                <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Filter by Section</label>
                <select id="studentSectionFilter" class="form-input" onchange="filterStudentsBySection(this.value)">
                    <option value="">All Sections</option>
                    ${sectionsForGrade.map(s => `<option value="${s}" ${studentSectionFilter === s ? 'selected' : ''}>Section ${s}</option>`).join('')}
                </select>
            </div>
            <div style="flex: 2; min-width: 220px; position: relative;">
                <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">🔍 Search Students</label>
                <span style="position:absolute;left:0.9rem;bottom:0.72rem;font-size:0.95rem;pointer-events:none;">🔍</span>
                <input type="text" id="studentSearchInput" class="form-input"
                    placeholder="Name, LRN, email, section..."
                    oninput="filterStudentsBySearch(this.value)"
                    value="${studentSearchQuery}"
                    style="padding-left:2.5rem;">
            </div>
            <div style="display: flex; align-items: flex-end; padding-bottom:0.4rem;">
                <span style="color: var(--gray-500); font-size: 0.85rem;">
                    Showing ${filteredStudents.length} of ${allStudents.length} students
                </span>
            </div>
        </div>
    `;

    if (filteredStudents.length === 0 && allStudents.length === 0) {
        studentsListEl.innerHTML = `
            ${filterBarHTML}
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3>No students found</h3>
                <p>Students will appear here once they are registered by the secretary</p>
            </div>
        `;
        return;
    }

    if (filteredStudents.length === 0) {
        studentsListEl.innerHTML = `
            ${filterBarHTML}
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No students match this filter</h3>
                <p>Try selecting a different Grade or Section</p>
            </div>
        `;
        return;
    }

    // Build table
    const tableHTML = `
        <div class="table-container">
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>LRN</th>
                        <th>Grade</th>
                        <th>Section</th>
                        <th>Email</th>
                        <th class="hide-mobile" style="text-align:center;">Quizzes Done</th>
                        <th>Avg Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredStudents.map((student, index) => {
        const studentResults = allResults.filter(r => r.studentId === student.id);
        const completed = studentResults.length;
        const avgScore = studentResults.length > 0
            ? Math.round(studentResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / studentResults.length)
            : 0;

        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td><strong>${student.firstName} ${student.lastName}</strong></td>
                                <td>${student.lrn || '—'}</td>
                                <td>${student.grade ? 'Grade ' + student.grade : '—'}</td>
                                <td>${student.section || '—'}</td>
                                <td class="hide-mobile">${student.email || '—'}</td>
                                <td class="hide-mobile" style="text-align:center; font-size:1.05rem; font-weight:600;">${completed}</td>
                                <td>
                                    <span class="badge ${avgScore >= 75 ? 'badge-success' : avgScore >= 50 ? 'badge-warning' : avgScore > 0 ? 'badge-error' : ''}" 
                                          style="font-size:1.05rem; font-weight:700; padding: 0.35rem 0.85rem; ${avgScore === 0 ? 'color: var(--gray-400);' : ''}">
                                        ${avgScore > 0 ? avgScore + '%' : '—'}
                                    </span>
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    studentsListEl.innerHTML = filterBarHTML + tableHTML;
}

// Student filter handlers
function filterStudentsByGrade(grade) {
    studentGradeFilter = grade;
    studentSectionFilter = ''; // Reset section when grade changes
    renderStudents();
}

function filterStudentsBySection(section) {
    studentSectionFilter = section;
    renderStudents();
}

function filterStudentsBySearch(value) {
    studentSearchQuery = value;
    renderStudents();
}

// ========================================
// Render Analytics
// ========================================

// Track chart instances so we can destroy before re-render
let perfChartInstance = null;
let completionChartInstance = null;

function renderAnalytics() {
    // ── Top Performers ──
    const studentPerformance = allStudents.map(student => {
        const studentResults = allResults.filter(r => r.studentId === student.id);
        const avgScore = studentResults.length > 0
            ? studentResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / studentResults.length
            : 0;
        return { ...student, avgScore, completed: studentResults.length };
    }).sort((a, b) => b.avgScore - a.avgScore).slice(0, 10);

    if (studentPerformance.length === 0) {
        topPerformersEl.innerHTML = '<p style="color: var(--gray-500);">No quiz data available yet. Results will appear once students take quizzes.</p>';
    } else {
        topPerformersEl.innerHTML = studentPerformance.map((student, index) => `
            <div class="score-item">
                <div class="score-info">
                    <h3>#${index + 1} ${student.firstName} ${student.lastName}</h3>
                    <p>${student.grade ? 'Grade ' + student.grade : ''} ${student.section ? '• Section ' + student.section : ''} • ${student.completed} quiz${student.completed !== 1 ? 'zes' : ''} completed</p>
                </div>
                <div class="score-value">
                    <div class="score-percentage ${Math.round(student.avgScore) >= 75 ? 'text-success' : Math.round(student.avgScore) >= 50 ? 'text-warning' : 'text-error'}">${Math.round(student.avgScore)}%</div>
                </div>
            </div>
        `).join('');
    }

    // ── Class Performance Bar Chart (avg score per quiz) ──
    renderClassPerformanceChart();

    // ── Quiz Completion Doughnut Chart ──
    renderQuizCompletionChart();
}

function getChartColors() {
    const isLight = document.body.classList.contains('light-mode');
    return {
        gridColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
        tickColor: isLight ? '#374151' : '#94a3b8',
        legendColor: isLight ? '#374151' : '#e2e8f0',
    };
}

function renderClassPerformanceChart() {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;

    if (perfChartInstance) { perfChartInstance.destroy(); perfChartInstance = null; }

    if (allResults.length === 0) {
        canvas.closest('.card-body').innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:160px;flex-direction:column;gap:0.5rem;">
                <span style="font-size:2.5rem;">📊</span>
                <p style="color:var(--gray-500);margin:0;">No quiz results yet</p>
            </div>`;
        return;
    }

    // Compute avg score per quiz (only quizzes with at least one result)
    const quizData = allQuizzes
        .map(quiz => {
            const results = allResults.filter(r => r.quizId === quiz.id);
            if (results.length === 0) return null;
            const avg = Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
            return { label: quiz.title.length > 20 ? quiz.title.slice(0, 18) + '…' : quiz.title, avg, count: results.length };
        })
        .filter(Boolean)
        .sort((a, b) => b.avg - a.avg);

    const colors = getChartColors();
    const ctx = canvas.getContext('2d');
    perfChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: quizData.map(d => d.label),
            datasets: [{
                label: 'Avg Score (%)',
                data: quizData.map(d => d.avg),
                backgroundColor: quizData.map(d =>
                    d.avg >= 75 ? 'rgba(72, 199, 142, 0.8)' :
                        d.avg >= 50 ? 'rgba(255, 189, 68, 0.8)' : 'rgba(255, 99, 132, 0.8)'
                ),
                borderColor: quizData.map(d =>
                    d.avg >= 75 ? '#48c78e' : d.avg >= 50 ? '#ffbd44' : '#ff6384'
                ),
                borderWidth: 2,
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => `Submissions: ${quizData[ctx.dataIndex].count}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: colors.tickColor, callback: v => v + '%' },
                    grid: { color: colors.gridColor }
                },
                x: {
                    ticks: { color: colors.tickColor },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderQuizCompletionChart() {
    const canvas = document.getElementById('completionChart');
    if (!canvas) return;

    if (completionChartInstance) { completionChartInstance.destroy(); completionChartInstance = null; }

    const activeQuizzes = allQuizzes.filter(q => (q.status || 'active') === 'active');
    const totalPossible = activeQuizzes.length * allStudents.length;

    if (totalPossible === 0) {
        canvas.closest('.card-body').innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:160px;flex-direction:column;gap:0.5rem;">
                <span style="font-size:2.5rem;">📈</span>
                <p style="color:var(--gray-500);margin:0;">No active quizzes yet</p>
            </div>`;
        return;
    }

    const completed = Math.min(allResults.length, totalPossible);
    const notCompleted = totalPossible - completed;

    const colors = getChartColors();
    const ctx = canvas.getContext('2d');
    completionChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Completed', 'Not Yet'],
            datasets: [{
                data: [completed, notCompleted],
                backgroundColor: [
                    'rgba(72, 199, 142, 0.85)',
                    colors.gridColor === 'rgba(0,0,0,0.08)' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'
                ],
                borderColor: [
                    '#48c78e',
                    colors.gridColor === 'rgba(0,0,0,0.08)' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)'
                ],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: colors.legendColor, padding: 16, boxWidth: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const pct = Math.round((ctx.raw / totalPossible) * 100);
                            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ========================================
// AI Insights (Data-Driven)
// ========================================

function renderAIInsights() {
    if (allResults.length === 0 || allStudents.length === 0 || allQuizzes.length === 0) {
        aiInsightsListEl.innerHTML = `
            <div class="insight-banner" style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-xl); padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
                <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🤖</div>
                <h3 style="margin: 0 0 0.5rem;">Not Enough Data Yet</h3>
                <p style="color: var(--gray-500); margin: 0;">Publish quizzes and wait for students to submit — AI insights will generate automatically once results are available.</p>
            </div>`;
        return;
    }

    const insights = [];

    // 1. Overall class health
    const overallAvg = Math.round(allResults.reduce((s, r) => s + (r.percentage || 0), 0) / allResults.length);
    const healthEmoji = overallAvg >= 80 ? '🏆' : overallAvg >= 65 ? '📈' : overallAvg >= 50 ? '⚠️' : '🚨';
    const healthLabel = overallAvg >= 80 ? 'Excellent' : overallAvg >= 65 ? 'Good' : overallAvg >= 50 ? 'Needs Attention' : 'Critical';
    const healthColor = overallAvg >= 80 ? '#48c78e' : overallAvg >= 65 ? '#3b82f6' : overallAvg >= 50 ? '#f59e0b' : '#ef4444';
    insights.push({
        icon: healthEmoji,
        title: `Class Health: ${healthLabel}`,
        body: `The overall class average is <strong>${overallAvg}%</strong> across <strong>${allResults.length}</strong> quiz submission${allResults.length !== 1 ? 's' : ''} from <strong>${allStudents.length}</strong> student${allStudents.length !== 1 ? 's' : ''}.`,
        color: healthColor,
        type: 'overview'
    });

    // 2. Struggling students (avg < 60%)
    const struggling = allStudents
        .map(s => {
            const res = allResults.filter(r => r.studentId === s.id);
            if (res.length === 0) return null;
            const avg = Math.round(res.reduce((sum, r) => sum + (r.percentage || 0), 0) / res.length);
            return { ...s, avg, count: res.length };
        })
        .filter(s => s && s.avg < 60)
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5);

    if (struggling.length > 0) {
        insights.push({
            icon: '⚠️',
            title: `${struggling.length} Student${struggling.length > 1 ? 's' : ''} Need${struggling.length === 1 ? 's' : ''} Support`,
            body: `The following students are averaging below 60%: <strong>${struggling.map(s => `${s.firstName} ${s.lastName} (${s.avg}%)`).join(', ')}</strong>. Consider reviewing their quiz history or scheduling a catch-up session.`,
            color: '#ef4444',
            type: 'warning'
        });
    }

    // 3. Top performers
    const topPerfs = allStudents
        .map(s => {
            const res = allResults.filter(r => r.studentId === s.id);
            if (res.length === 0) return null;
            const avg = Math.round(res.reduce((sum, r) => sum + (r.percentage || 0), 0) / res.length);
            return { ...s, avg };
        })
        .filter(s => s && s.avg >= 80)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

    if (topPerfs.length > 0) {
        insights.push({
            icon: '🏅',
            title: 'Top Performers This Period',
            body: `Outstanding work from: <strong>${topPerfs.map(s => `${s.firstName} ${s.lastName} (${s.avg}%)`).join(', ')}</strong>. These students demonstrate strong understanding of the material.`,
            color: '#48c78e',
            type: 'success'
        });
    }

    // 4. Low-completion quizzes
    const activeQuizzes = allQuizzes.filter(q => (q.status || 'active') === 'active');
    const lowCompletion = activeQuizzes
        .map(q => {
            const count = allResults.filter(r => r.quizId === q.id).length;
            const rate = allStudents.length > 0 ? Math.round((count / allStudents.length) * 100) : 0;
            return { ...q, submissionCount: count, completionRate: rate };
        })
        .filter(q => q.completionRate < 50)
        .sort((a, b) => a.completionRate - b.completionRate)
        .slice(0, 3);

    if (lowCompletion.length > 0) {
        insights.push({
            icon: '📋',
            title: `${lowCompletion.length} Quiz${lowCompletion.length > 1 ? 'zes' : ''} with Low Participation`,
            body: `These quizzes have fewer than 50% completion: ${lowCompletion.map(q => `<strong>${q.title}</strong> (${q.completionRate}%)`).join(', ')}. Consider sending a reminder to students.`,
            color: '#f59e0b',
            type: 'info'
        });
    }

    // 5. Quiz difficulty analysis
    const hardQuizzes = allQuizzes
        .map(q => {
            const res = allResults.filter(r => r.quizId === q.id);
            if (res.length < 2) return null;
            const avg = Math.round(res.reduce((s, r) => s + (r.percentage || 0), 0) / res.length);
            return { ...q, avg, count: res.length };
        })
        .filter(q => q && q.avg < 55)
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 2);

    if (hardQuizzes.length > 0) {
        insights.push({
            icon: '🎯',
            title: 'Difficult Topics Detected',
            body: `Students are struggling with: ${hardQuizzes.map(q => `<strong>${q.title}</strong> (class avg: ${q.avg}%)`).join(', ')}. These topics may need re-teaching or additional practice materials.`,
            color: '#8b5cf6',
            type: 'insight'
        });
    }

    // 6. Students who haven't taken any quiz
    const inactive = allStudents.filter(s => !allResults.find(r => r.studentId === s.id));
    if (inactive.length > 0) {
        insights.push({
            icon: '👤',
            title: `${inactive.length} Student${inactive.length > 1 ? 's' : ''} Haven't Taken Any Quiz Yet`,
            body: `${inactive.slice(0, 5).map(s => `<strong>${s.firstName} ${s.lastName}</strong>`).join(', ')}${inactive.length > 5 ? ` and ${inactive.length - 5} more` : ''} have not submitted any quiz results yet. Encourage them to participate!`,
            color: '#6b7280',
            type: 'info'
        });
    }

    // Render insight cards
    aiInsightsListEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem; padding:1rem 1.25rem; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:var(--radius-xl);">
            <span style="font-size:1.75rem;">🤖</span>
            <div>
                <h3 style="margin:0;font-size:1rem;">AI-Powered Insights</h3>
                <p style="margin:0;font-size:0.82rem;color:var(--gray-500);">Automatically generated from your quiz data — updated every time you refresh</p>
            </div>
        </div>
        <div style="display:grid;gap:1rem;">
            ${insights.map(insight => `
                    <div class="card" style="border-left:4px solid ${insight.color}; padding:0;">
                    <div class="card-body" style="padding:1.25rem 1.5rem; background: transparent;">
                        <div style="display:flex;align-items:flex-start;gap:1rem;">
                            <span style="font-size:1.75rem;flex-shrink:0;">${insight.icon}</span>
                            <div style="flex:1;">
                                <h3 style="margin:0 0 0.4rem;font-size:1rem;color:${insight.color};">${insight.title}</h3>
                                <p style="margin:0;font-size:0.9rem;line-height:1.55;">${insight.body}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
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

        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        Object.keys(sections).forEach(key => {
            if (sections[key]) sections[key].classList.add('hidden');
        });
        if (sections[sectionName]) sections[sectionName].classList.remove('hidden');
    });
});

// ========================================
// Quiz Tabs (now includes Draft tab)
// ========================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentQuizFilter = btn.dataset.status;

        document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');

        renderQuizzes();
    });
});

// ========================================
// Quick Actions
// ========================================

let quizQuestions = [];
let questionCounter = 0;

document.getElementById('createQuizBtn').addEventListener('click', () => openQuizModal());
document.getElementById('createQuizBtnTop').addEventListener('click', () => openQuizModal());

document.getElementById('viewStudentsBtn').addEventListener('click', () => {
    document.querySelector('[data-section="students"]').click();
});

document.getElementById('viewAnalyticsBtn').addEventListener('click', () => {
    document.querySelector('[data-section="analytics"]').click();
});

// ========================================
// Quiz Creation Modal
// ========================================

function openQuizModal() {
    editingQuizId = null; // clear edit mode
    const modal = document.getElementById('quizCreationModal');
    modal.classList.remove('hidden');

    // Update modal title to show creation mode
    const modalTitle = modal.querySelector('h2, .modal-title');
    if (modalTitle) modalTitle.textContent = '📝 Create New Quiz';

    // Reset form
    document.getElementById('quizCreationForm').reset();
    quizQuestions = [];
    questionCounter = 0;
    document.getElementById('questionsContainer').innerHTML = '';

    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const minDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const minDateTime = `${minDate}T${pad(today.getHours())}:${pad(today.getMinutes())}`;

    // Reset scheduling fields
    const schedDateEl = document.getElementById('quizScheduleDate');
    const schedTimeEl = document.getElementById('quizScheduleTime');
    const schedEndTimeEl = document.getElementById('quizScheduleEndTime');
    const deadlineEl = document.getElementById('quizDeadline');
    if (schedDateEl) {
        schedDateEl.value = '';
        schedDateEl.min = minDate;
    }
    if (schedTimeEl) schedTimeEl.value = '';
    if (schedEndTimeEl) schedEndTimeEl.value = '';
    if (deadlineEl) {
        deadlineEl.value = '';
        deadlineEl.min = minDateTime;
    }

    // Reset settings toggles
    const randomizeEl = document.getElementById('quizRandomizeQuestions');
    if (randomizeEl) randomizeEl.checked = false;
    const allowReviewEl = document.getElementById('quizAllowReview');
    if (allowReviewEl) allowReviewEl.checked = true;



    // Reset submit button label
    const submitBtn = document.querySelector('#quizCreationForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Publish Quiz';

    // Show section selector by default, hide student selector
    document.getElementById('sectionSelectGroup').classList.remove('hidden');
    document.getElementById('studentSelectGroup').classList.add('hidden');
    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) searchInput.value = '';

    // Add first question by default
    addQuestion();

    // Populate section & student assignment dropdowns from actual student data
    populateAssignmentOptions();

    // Setup assignment change handler (remove old, add new)
    const assignSelect = document.getElementById('quizAssignTo');
    assignSelect.removeEventListener('change', handleAssignToChange);
    assignSelect.addEventListener('change', handleAssignToChange);
}

function closeQuizModal() {
    editingQuizId = null; // always clear edit mode on close
    document.getElementById('quizCreationModal').classList.add('hidden');
}

function handleAssignToChange(e) {
    const value = e.target.value;
    const sectionGroup = document.getElementById('sectionSelectGroup');
    const studentGroup = document.getElementById('studentSelectGroup');

    if (value === 'section') {
        sectionGroup.classList.remove('hidden');
        studentGroup.classList.add('hidden');
    } else if (value === 'individual') {
        sectionGroup.classList.add('hidden');
        studentGroup.classList.remove('hidden');
    } else {
        sectionGroup.classList.add('hidden');
        studentGroup.classList.add('hidden');
    }
}

/**
 * Populate section and student assignment options from real student data
 * Sections are rendered as checkboxes so teacher can pick multiple.
 */
function populateAssignmentOptions() {
    // --- Section checkboxes ---
    const sectionList = document.getElementById('sectionCheckboxList');
    if (sectionList) {
        sectionList.innerHTML = '';

        // Build grade-section combos from student data
        const gradeSections = {};
        allStudents.forEach(student => {
            if (student.grade && student.section) {
                const key = `${student.grade}-${student.section}`;
                if (!gradeSections[key]) {
                    gradeSections[key] = { grade: student.grade, section: student.section, count: 0 };
                }
                gradeSections[key].count++;
            }
        });

        const sortedGradeSections = Object.values(gradeSections).sort((a, b) => {
            const gradeDiff = parseInt(a.grade) - parseInt(b.grade);
            return gradeDiff !== 0 ? gradeDiff : a.section.localeCompare(b.section);
        });

        if (sortedGradeSections.length === 0) {
            sectionList.innerHTML = '<p style="color:var(--gray-500);padding:0.5rem;">No sections found (students have no grade/section set)</p>';
        } else {
            sortedGradeSections.forEach(gs => {
                const cbId = `secCb-${gs.grade}-${gs.section}`;
                const div = document.createElement('div');
                div.className = 'checkbox-item';
                div.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.5rem;border-radius:0.5rem;cursor:pointer;';
                div.innerHTML = `
                    <input type="checkbox" id="${cbId}" name="selectedSections" value="${gs.grade}-${gs.section}"
                        style="width:17px;height:17px;accent-color:var(--primary-500);cursor:pointer;flex-shrink:0;">
                    <label for="${cbId}" style="cursor:pointer;font-size:0.88rem;">
                        Grade ${gs.grade} — Section ${gs.section}
                        <span style="color:var(--gray-500);font-size:0.78rem;">(${gs.count} students)</span>
                    </label>`;
                sectionList.appendChild(div);
            });
        }
    }

    // --- Student checkboxes (for Individual assignment) ---
    const container = document.getElementById('studentCheckboxList');

    if (allStudents.length === 0) {
        container.innerHTML = '<p style="color: var(--gray-500);">No students found</p>';
        return;
    }

    // Group students by grade-section for better organization
    const grouped = {};
    allStudents.forEach(s => {
        const key = s.grade && s.section ? `Grade ${s.grade} - Section ${s.section}` : 'Unassigned';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(s);
    });

    let html = '<div class="student-select-all" style="margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--gray-200);">';
    html += '<label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600;">';
    html += '<input type="checkbox" id="selectAllStudents" onchange="toggleAllStudents(this.checked)">';
    html += `<span>Select All (${allStudents.length} students)</span></label></div>`;

    Object.keys(grouped).sort().forEach(groupName => {
        html += `<div class="student-group" style="margin-bottom: 0.75rem;">`;
        html += `<div class="student-group-label" style="font-weight: 600; font-size: 0.8rem; color: var(--primary-600); margin-bottom: 0.35rem; padding: 0.25rem 0.5rem; background: var(--primary-50); border-radius: 6px;">${groupName} (${grouped[groupName].length})</div>`;

        grouped[groupName].forEach(student => {
            const studentId = student.uid || student.id;
            html += `
                <div class="checkbox-item" style="padding: 0.35rem 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" name="selectedStudents" value="${studentId}">
                        <span>${student.firstName} ${student.lastName} ${student.lrn ? '(' + student.lrn + ')' : ''}</span>
                    </label>
                </div>
            `;
        });

        html += '</div>';
    });

    container.innerHTML = html;
}

function toggleAllStudents(checked) {
    document.querySelectorAll('input[name="selectedStudents"]').forEach(cb => {
        cb.checked = checked;
    });
}

function filterStudents(query) {
    const term = query.toLowerCase();
    const container = document.getElementById('studentCheckboxList');
    if (!container) return;

    const items = container.querySelectorAll('.checkbox-item');
    items.forEach(item => {
        const labelText = item.textContent.toLowerCase();
        item.style.display = labelText.includes(term) ? 'block' : 'none';
    });

    const groups = container.querySelectorAll('.student-group');
    groups.forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll('.checkbox-item')).filter(i => i.style.display !== 'none');
        const label = group.querySelector('.student-group-label');
        if (visibleItems.length === 0) {
            if (label) label.style.display = 'none';
            group.style.display = 'none';
        } else {
            if (label) label.style.display = 'block';
            group.style.display = 'block';
        }
    });
}

// ========================================
// Question Management
// ========================================

function addQuestion() {
    questionCounter++;
    const questionId = `q${questionCounter}`;

    // Remove the floating add-btn if it already exists
    const existing = document.getElementById('floatingAddQuestionBtn');
    if (existing) existing.remove();

    const questionCard = document.createElement('div');
    questionCard.className = 'question-card-builder';
    questionCard.id = questionId;
    questionCard.dataset.questionIndex = questionCounter - 1;
    questionCard.dataset.questionType = 'multiple-choice';

    questionCard.innerHTML = `
        <div class="question-header">
            <span class="question-number-badge">Question ${questionCounter}</span>
            <button type="button" class="question-remove-btn" onclick="removeQuestion('${questionId}')">
                🗑️ Remove
            </button>
        </div>
        
        <div class="form-group">
            <label class="form-label">Question Type *</label>
            <select class="form-input question-type-select" onchange="changeQuestionType('${questionId}', this.value)">
                <option value="multiple-choice">Multiple Choice</option>
                <option value="multiple-selection">Multiple Selection (Check all that apply)</option>
                <option value="identification">Identification (One-line Answer)</option>
                <option value="true-false">True or False</option>
                <option value="essay">Essay (Written Answer)</option>
            </select>
        </div>
        
        <div class="form-group">
            <label class="form-label">Question Text *</label>
            <textarea class="form-input question-text" rows="2" placeholder="Enter your question..." required></textarea>
        </div>
        
        <div class="question-type-content">
            ${getQuestionTypeHTML(questionId, 'multiple-choice')}
        </div>
        
        <div class="grid grid-2 gap-4">
            <div class="form-group">
                <label class="form-label">Points</label>
                <input type="number" class="form-input question-points" value="1" min="1" max="100">
            </div>
        </div>
    `;

    document.getElementById('questionsContainer').appendChild(questionCard);

    // Create and append the floating Add Question button BELOW this new card
    const addBtn = document.createElement('div');
    addBtn.id = 'floatingAddQuestionBtn';
    addBtn.style.cssText = 'display:flex;justify-content:center;padding:1rem 0 0.5rem;';
    addBtn.innerHTML = `<button type="button" class="btn btn-primary" onclick="addQuestion()" style="gap:0.5rem;">
        ➕ Add Another Question
    </button>`;
    document.getElementById('questionsContainer').appendChild(addBtn);

    // Auto-scroll to the newly added question
    setTimeout(() => questionCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function getQuestionTypeHTML(questionId, type) {
    if (type === 'multiple-choice') {
        // Start with 4 options by default
        return `
            <div class="form-group">
                <label class="form-label">Options * <small style="font-weight:400;color:var(--gray-400);">Select the radio button next to the correct answer</small></label>
                <div class="options-container" id="${questionId}-options">
                    ${[0, 1, 2, 3].map(i => `
                    <div class="option-input-group" id="${questionId}-opt-${i}">
                        <input type="radio" name="${questionId}-correct" value="${i}">
                        <input type="text" class="form-input option-text" placeholder="Option ${String.fromCharCode(65 + i)}">
                        ${i >= 2 ? `<button type="button" class="btn-icon-remove" onclick="removeOptionRow('${questionId}', '${questionId}-opt-${i}')" title="Remove option">✕</button>` : ''}
                    </div>`).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top:0.5rem;" onclick="addOptionRow('${questionId}', 'radio')">
                    ➕ Add Option
                </button>
                <small class="form-help">Minimum 2 options required.</small>
            </div>
        `;
    } else if (type === 'multiple-selection') {
        return `
            <div class="form-group">
                <label class="form-label">Options * <small style="font-weight:400;color:var(--gray-400);">(Check ALL correct answers)</small></label>
                <div class="options-container" id="${questionId}-options">
                    ${[0, 1, 2, 3].map(i => `
                    <div class="option-input-group" id="${questionId}-opt-${i}">
                        <input type="checkbox" class="ms-correct-cb" name="${questionId}-ms-correct" value="${i}" style="width:18px;height:18px;accent-color:var(--primary-500);flex-shrink:0;cursor:pointer;">
                        <input type="text" class="form-input option-text" placeholder="Option ${String.fromCharCode(65 + i)}">
                        ${i >= 2 ? `<button type="button" class="btn-icon-remove" onclick="removeOptionRow('${questionId}', '${questionId}-opt-${i}')" title="Remove option">✕</button>` : ''}
                    </div>`).join('')}
                </div>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top:0.5rem;" onclick="addOptionRow('${questionId}', 'checkbox')">
                    ➕ Add Option
                </button>
                <small class="form-help">Check the box(es) next to every correct answer. Minimum 2 options required.</small>
            </div>
        `;
    } else if (type === 'identification') {
        return `
            <div class="form-group">
                <label class="form-label">Accepted Answers * <small style="font-weight:400;color:var(--gray-400);">Add all acceptable answers — any match counts</small></label>
                <div class="ident-answers-container" id="${questionId}-ident-answers">
                    <div class="option-input-group" id="${questionId}-ident-0">
                        <input type="text" class="form-input identification-answer" placeholder="Correct answer (e.g. Photosynthesis)">
                        <!-- first row: no remove button -->
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top:0.5rem;" onclick="addIdentificationAnswer('${questionId}')">
                    ➕ Add Alternate Answer
                </button>
                <small class="form-help">All accepted answers are case-insensitive. Students can answer with any of the listed answers.</small>
            </div>
        `;
    } else if (type === 'true-false') {
        return `
            <div class="form-group">
                <label class="form-label">Correct Answer *</label>
                <div class="options-container">
                    <div class="option-input-group">
                        <input type="radio" name="${questionId}-tf-correct" value="true">
                        <label style="margin-left: 0.5rem; font-weight: 500;">True</label>
                    </div>
                    <div class="option-input-group">
                        <input type="radio" name="${questionId}-tf-correct" value="false">
                        <label style="margin-left: 0.5rem; font-weight: 500;">False</label>
                    </div>
                </div>
                <small class="form-help">Select the correct answer</small>
            </div>
        `;
    } else if (type === 'essay') {
        return `
            <div class="form-group">
                <label class="form-label">Model Answer <small style="font-weight:400;color:var(--gray-400);">(Optional — for teacher reference only)</small></label>
                <textarea class="form-input essay-model-answer" rows="3" placeholder="Enter a model/sample answer (optional). This is not shown to students during the quiz."></textarea>
                <small class="form-help">✏️ Essay answers require manual grading. Points will not be auto-scored.</small>
            </div>
        `;
    }
    return '';
}

// ========================================
// Dynamic Option Helpers (MC / MS)
// ========================================

/**
 * Add a new option row to a MC or MS question.
 * @param {string} questionId - The question element ID
 * @param {'radio'|'checkbox'} inputType - Type of selector
 */
function addOptionRow(questionId, inputType) {
    const container = document.getElementById(`${questionId}-options`);
    if (!container) return;

    const currentRows = container.querySelectorAll('.option-input-group');
    const newIndex = currentRows.length;
    const letter = String.fromCharCode(65 + newIndex); // A, B, C, D, E, F...
    const rowId = `${questionId}-opt-${newIndex}`;

    const row = document.createElement('div');
    row.className = 'option-input-group';
    row.id = rowId;

    if (inputType === 'radio') {
        row.innerHTML = `
            <input type="radio" name="${questionId}-correct" value="${newIndex}">
            <input type="text" class="form-input option-text" placeholder="Option ${letter}">
            <button type="button" class="btn-icon-remove" onclick="removeOptionRow('${questionId}', '${rowId}')" title="Remove option">✕</button>
        `;
    } else {
        row.innerHTML = `
            <input type="checkbox" class="ms-correct-cb" name="${questionId}-ms-correct" value="${newIndex}" style="width:18px;height:18px;accent-color:var(--primary-500);flex-shrink:0;cursor:pointer;">
            <input type="text" class="form-input option-text" placeholder="Option ${letter}">
            <button type="button" class="btn-icon-remove" onclick="removeOptionRow('${questionId}', '${rowId}')" title="Remove option">✕</button>
        `;
    }

    container.appendChild(row);
    row.querySelector('.option-text').focus();
}

/**
 * Remove an option row from MC/MS (minimum 2 must remain).
 */
function removeOptionRow(questionId, rowId) {
    const container = document.getElementById(`${questionId}-options`);
    if (!container) return;
    const rows = container.querySelectorAll('.option-input-group');
    if (rows.length <= 2) {
        firebaseApp.showToast('At least 2 options are required.', 'error');
        return;
    }
    const row = document.getElementById(rowId);
    if (row) row.remove();

    // Re-index radio/checkbox values so they stay 0-based sequential
    const remainingRows = container.querySelectorAll('.option-input-group');
    remainingRows.forEach((r, i) => {
        const radio = r.querySelector('input[type="radio"]');
        const cb = r.querySelector('input[type="checkbox"]');
        if (radio) radio.value = String(i);
        if (cb) cb.value = String(i);
    });
}

// ========================================
// Dynamic Answer Helpers (Identification)
// ========================================

/**
 * Add an alternate accepted answer row to an identification question.
 */
function addIdentificationAnswer(questionId) {
    const container = document.getElementById(`${questionId}-ident-answers`);
    if (!container) return;

    const newIndex = container.querySelectorAll('.option-input-group').length;
    const rowId = `${questionId}-ident-${newIndex}`;

    const row = document.createElement('div');
    row.className = 'option-input-group';
    row.id = rowId;
    row.innerHTML = `
        <input type="text" class="form-input identification-answer" placeholder="Alternate answer ${newIndex + 1}">
        <button type="button" class="btn-icon-remove" onclick="removeIdentificationAnswer('${questionId}', '${rowId}')" title="Remove answer">✕</button>
    `;
    container.appendChild(row);
    row.querySelector('.identification-answer').focus();
}

/**
 * Remove an alternate identification answer (must keep at least 1).
 */
function removeIdentificationAnswer(questionId, rowId) {
    const container = document.getElementById(`${questionId}-ident-answers`);
    if (!container) return;
    const rows = container.querySelectorAll('.option-input-group');
    if (rows.length <= 1) {
        firebaseApp.showToast('At least one accepted answer is required.', 'error');
        return;
    }
    const row = document.getElementById(rowId);
    if (row) row.remove();
}

function changeQuestionType(questionId, newType) {
    const questionCard = document.getElementById(questionId);
    if (!questionCard) return;

    questionCard.dataset.questionType = newType;
    const contentContainer = questionCard.querySelector('.question-type-content');
    contentContainer.innerHTML = getQuestionTypeHTML(questionId, newType);
}

function removeQuestion(questionId) {
    const questionCard = document.getElementById(questionId);
    if (questionCard) {
        questionCard.remove();
        renumberQuestions();
    }
}

function renumberQuestions() {
    const questions = document.querySelectorAll('.question-card-builder');
    questions.forEach((card, index) => {
        const badge = card.querySelector('.question-number-badge');
        if (badge) {
            badge.textContent = `Question ${index + 1}`;
        }
        card.dataset.questionIndex = index;
    });
    questionCounter = questions.length;

    // Reposition the floating Add Question button after the last card
    const floatingBtn = document.getElementById('floatingAddQuestionBtn');
    const container = document.getElementById('questionsContainer');
    if (floatingBtn && container && questions.length > 0) {
        container.appendChild(floatingBtn); // move to end
    }
}

// ========================================
// Quiz Form Submission
// ========================================

document.getElementById('quizCreationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveQuiz('active');
});

async function saveQuizDraft() {
    await saveQuiz('draft');
}

async function saveQuizScheduled() {
    // Validate scheduling fields before calling saveQuiz
    const schedDate = document.getElementById('quizScheduleDate')?.value || '';
    const schedTime = document.getElementById('quizScheduleTime')?.value || '';
    if (!schedDate || !schedTime) {
        firebaseApp.showToast('⚠️ Please set both a Schedule Date and Start Time to schedule a quiz', 'error');
        return;
    }

    // Validate the scheduled time is in the future
    const scheduledDateTime = new Date(`${schedDate}T${schedTime}`);
    if (scheduledDateTime <= new Date()) {
        firebaseApp.showToast('⚠️ Schedule date and time must be in the future', 'error');
        return;
    }

    await saveQuiz('scheduled');
}

async function saveQuiz(status) {
    // Determine which button triggered this
    const isDraft = status === 'draft';
    const submitBtn = isDraft
        ? document.querySelector('.btn-accent[onclick*="saveQuizDraft"]') || document.querySelector('#quizCreationForm button[type="submit"]')
        : document.querySelector('#quizCreationForm button[type="submit"]');

    const originalText = submitBtn ? submitBtn.textContent : '';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = isDraft ? '💾 Saving Draft...' : '🚀 Publishing...';
        }

        // Collect form data
        const title = document.getElementById('quizTitle').value.trim();
        const subject = document.getElementById('quizSubject')?.value || '';
        const description = document.getElementById('quizDescription').value.trim();
        const deadlineInput = document.getElementById('quizDeadline').value;
        const timeLimit = parseInt(document.getElementById('quizTimeLimit').value) || null;
        const assignTo = document.getElementById('quizAssignTo').value;

        // Validate title
        if (!title) {
            throw new Error('Quiz title is required');
        }
        if (!isDraft && !subject) {
            throw new Error('Please select a subject');
        }

        // Validate deadline is required and not in the past (when publishing, not scheduled)
        if (!isDraft && status !== 'scheduled') {
            if (!deadlineInput) {
                throw new Error('Deadline is required when publishing a quiz!');
            }
            const deadlineDate = new Date(deadlineInput);
            if (deadlineDate <= new Date()) {
                throw new Error('Deadline must be in the future!');
            }
        }

        // Collect questions
        const questionCards = document.querySelectorAll('.question-card-builder');

        // For drafts, allow 0 questions. For publish, require at least 1
        if (!isDraft && questionCards.length === 0) {
            throw new Error('Please add at least one question to publish');
        }

        const questions = [];
        let hasErrors = false;

        questionCards.forEach((card, index) => {
            const questionText = card.querySelector('.question-text').value.trim();
            const questionType = card.dataset.questionType || 'multiple-choice';
            const points = parseInt(card.querySelector('.question-points').value) || 1;

            // For drafts, skip empty questions silently
            if (isDraft && !questionText) return;

            if (!isDraft && !questionText) {
                firebaseApp.showToast(`Question ${index + 1}: Question text is required`, 'error');
                hasErrors = true;
                return;
            }

            const questionData = {
                question: questionText,
                type: questionType,
                points: points
            };

            if (questionType === 'multiple-choice') {
                const optionInputs = card.querySelectorAll('.option-text');
                const options = Array.from(optionInputs).map(input => input.value.trim());

                if (!isDraft && options.some(opt => !opt)) {
                    firebaseApp.showToast(`Question ${index + 1}: All options must be filled`, 'error');
                    hasErrors = true;
                    return;
                }

                // Duplicate answer check
                const uniqueOpts = new Set(options.filter(o => o).map(o => o.toLowerCase()));
                if (!isDraft && uniqueOpts.size < options.filter(o => o).length) {
                    firebaseApp.showToast(`Question ${index + 1}: Duplicate answer options are not allowed`, 'error');
                    hasErrors = true;
                    return;
                }

                const correctRadio = card.querySelector(`input[name$="-correct"]:checked`);
                if (!isDraft && !correctRadio) {
                    firebaseApp.showToast(`Question ${index + 1}: Please select the correct answer`, 'error');
                    hasErrors = true;
                    return;
                }

                questionData.options = options;
                questionData.correctAnswer = correctRadio ? parseInt(correctRadio.value) : null;

            } else if (questionType === 'multiple-selection') {
                const optionInputs = card.querySelectorAll('.option-text');
                const options = Array.from(optionInputs).map(input => input.value.trim());

                if (!isDraft && options.some(opt => !opt)) {
                    firebaseApp.showToast(`Question ${index + 1}: All options must be filled`, 'error');
                    hasErrors = true;
                    return;
                }

                // Duplicate answer check
                const uniqueOptsMs = new Set(options.filter(o => o).map(o => o.toLowerCase()));
                if (!isDraft && uniqueOptsMs.size < options.filter(o => o).length) {
                    firebaseApp.showToast(`Question ${index + 1}: Duplicate answer options are not allowed`, 'error');
                    hasErrors = true;
                    return;
                }

                const checkedBoxes = card.querySelectorAll('.ms-correct-cb:checked');
                if (!isDraft && checkedBoxes.length === 0) {
                    firebaseApp.showToast(`Question ${index + 1}: Please select at least one correct answer`, 'error');
                    hasErrors = true;
                    return;
                }

                questionData.options = options;
                questionData.correctAnswer = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

            } else if (questionType === 'essay') {
                const modelAnswerEl = card.querySelector('.essay-model-answer');
                questionData.modelAnswer = modelAnswerEl ? modelAnswerEl.value.trim() : '';
                questionData.correctAnswer = null; // Essay is manually graded

            } else if (questionType === 'identification') {
                // Read ALL identification-answer inputs (multi-answer support)
                const identInputs = card.querySelectorAll('.identification-answer');
                const identAnswers = Array.from(identInputs)
                    .map(el => el.value.trim())
                    .filter(v => v !== '');

                if (!isDraft && identAnswers.length === 0) {
                    firebaseApp.showToast(`Question ${index + 1}: Please enter at least one accepted answer`, 'error');
                    hasErrors = true;
                    return;
                }

                // Primary correctAnswer for backward compat, plus correctAnswers array
                questionData.correctAnswer = identAnswers[0] || '';
                questionData.correctAnswers = identAnswers;

            } else if (questionType === 'true-false') {
                const tfRadio = card.querySelector('input[name$="-tf-correct"]:checked');
                if (!isDraft && !tfRadio) {
                    firebaseApp.showToast(`Question ${index + 1}: Please select True or False`, 'error');
                    hasErrors = true;
                    return;
                }
                questionData.correctAnswer = tfRadio ? tfRadio.value === 'true' : null;
            }

            questions.push(questionData);
        });

        if (hasErrors) {
            throw new Error('Please fix the errors in your questions');
        }

        // Build quiz data
        const quizData = {
            title: title,
            subject: subject,
            description: description,
            questions: questions,
            createdBy: currentUser.uid,
            createdByName: `${currentUser.firstName} ${currentUser.lastName}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: status,
            isActive: status === 'active',
            totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
            totalQuestions: questions.length,
            timeLimit: timeLimit,
            allowReview: document.getElementById('quizAllowReview')?.checked !== false, // default true
            randomizeQuestions: document.getElementById('quizRandomizeQuestions')?.checked === true // default false
        };

        // Handle scheduling fields
        const schedDate = document.getElementById('quizScheduleDate')?.value || '';
        const schedTime = document.getElementById('quizScheduleTime')?.value || '';
        const schedEndTime = document.getElementById('quizScheduleEndTime')?.value || '';
        
        // Compute duration from start and end times
        let schedDuration = null;
        if (schedTime && schedEndTime) {
            const [startH, startM] = schedTime.split(':').map(Number);
            const [endH, endM] = schedEndTime.split(':').map(Number);
            let startMins = startH * 60 + startM;
            let endMins = endH * 60 + endM;
            if (endMins < startMins) {
                // assume crosses midnight
                endMins += 24 * 60;
            }
            schedDuration = endMins - startMins;
        }

        if (status === 'scheduled') {
            if (!schedDate || !schedTime || !schedEndTime) {
                throw new Error('Please set a schedule date, start time, and end time for scheduled quizzes');
            }
            
            const startMs = new Date(`${schedDate}T${schedTime}`).getTime();
            if (startMs < Date.now()) {
                throw new Error('You cannot schedule a quiz for a past date or time. Please choose a future schedule.');
            }
            
            quizData.scheduledDate = schedDate;
            quizData.scheduledStartTime = schedTime;
            quizData.scheduledDuration = schedDuration;
            // Compute deadline from schedule date + duration (or default 24h)
            const durationMs = schedDuration ? schedDuration * 60 * 1000 : 24 * 60 * 60 * 1000;
            quizData.deadline = firebase.firestore.Timestamp.fromDate(new Date(startMs + durationMs));
        } else if (schedDate && schedTime && schedDuration !== null) {
            // Save scheduling info even for non-scheduled quizzes if provided
            quizData.scheduledDate = schedDate;
            quizData.scheduledStartTime = schedTime;
            quizData.scheduledDuration = schedDuration;
        }

        // Add deadline (only if not already set by scheduling)
        if (deadlineInput && !quizData.deadline) {
            quizData.deadline = firebase.firestore.Timestamp.fromDate(new Date(deadlineInput));
        }

        // Handle assignment
        if (assignTo === 'section') {
            const checkedSections = Array.from(document.querySelectorAll('input[name="selectedSections"]:checked'))
                .map(cb => cb.value); // e.g. ["7-A", "7-B"]
            if (!isDraft && checkedSections.length === 0) {
                throw new Error('Please select at least one section');
            }
            quizData.assignedToSections = checkedSections;
            quizData.assignmentType = 'section';

            // Collect all student UIDs from selected sections
            const targetStudentIds = [];
            checkedSections.forEach(sv => {
                const [grade, ...sectionParts] = sv.split('-');
                const section = sectionParts.join('-');
                allStudents
                    .filter(s => s.grade === grade && s.section === section)
                    .forEach(s => targetStudentIds.push(s.uid || s.id));
            });
            quizData.targetStudents = targetStudentIds;

            // For backward compat keep single-section fields if only 1 selected
            if (checkedSections.length === 1) {
                const [grade, ...sectionParts] = checkedSections[0].split('-');
                const section = sectionParts.join('-');
                quizData.assignedToSection = checkedSections[0];
                quizData.assignedGrade = grade;
                quizData.assignedSectionName = section;
            }

        } else if (assignTo === 'individual') {
            const selectedStudents = Array.from(document.querySelectorAll('input[name="selectedStudents"]:checked'))
                .map(cb => cb.value);
            if (!isDraft && selectedStudents.length === 0) {
                throw new Error('Please select at least one student');
            }
            quizData.assignedToStudents = selectedStudents;
            quizData.targetStudents = selectedStudents;
            quizData.assignmentType = 'individual';
        } else {
            quizData.assignmentType = 'all';
            quizData.targetStudents = 'all'; // For student.js filtering
        }


        // Save or update in Firestore
        let docRef;
        if (editingQuizId) {
            // Editing an existing draft — update instead of add
            // Preserve original createdAt by removing it from the update payload
            delete quizData.createdAt;
            await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(editingQuizId).update(quizData);
            docRef = { id: editingQuizId };
            editingQuizId = null; // clear edit mode after save
        } else {
            docRef = await firebaseApp.db.collection(firebaseApp.collections.quizzes).add(quizData);
        }

        // Log activity
        if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
            await activityTracker.logActivity(isDraft ? 'quiz_draft_saved' : 'quiz_created', {
                quizId: docRef.id,
                quizTitle: title
            });
        }

        let message;
        if (isDraft) {
            message = '📋 Quiz saved as draft! You can publish it later.';
        } else if (status === 'scheduled') {
            message = '📅 Quiz scheduled successfully! Students will see it when it becomes available.';
        } else {
            message = '🚀 Quiz published successfully! Students can now see it.';
        }
        firebaseApp.showToast(message, 'success');

        // Close modal and refresh
        closeQuizModal();
        await loadQuizzes();
        renderQuizzes();
        updateStats();

    } catch (error) {
        console.error('Error saving quiz:', error);
        firebaseApp.showToast(error.message || 'Failed to save quiz', 'error');
    } finally {
        // Reset both buttons
        const pubBtn = document.querySelector('#quizCreationForm button[type="submit"]');
        const draftBtn = document.querySelector('.btn-accent[onclick*="saveQuizDraft"]');
        if (pubBtn) { pubBtn.disabled = false; pubBtn.textContent = 'Publish Quiz'; }
        if (draftBtn) { draftBtn.disabled = false; draftBtn.textContent = 'Save as Draft'; }
    }
}

// ========================================
// Quiz Actions
// ========================================

async function publishDraft(quizId) {
    showConfirmModal(
        '🚀 Publish Quiz',
        'Publish this quiz? Students will be able to see and take it.',
        async () => {
            try {
                const quiz = allQuizzes.find(q => q.id === quizId);
                if (quiz && (!quiz.questions || quiz.questions.length === 0)) {
                    firebaseApp.showToast('Cannot publish a quiz with no questions. Edit the quiz first.', 'error');
                    return;
                }

                await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(quizId).update({
                    status: 'active',
                    isActive: true,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                firebaseApp.showToast('🚀 Quiz published! Students can now take it.', 'success');

                if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                    await activityTracker.logActivity('quiz_published', {
                        quizId: quizId,
                        quizTitle: quiz ? quiz.title : 'Unknown'
                    });
                }
                await loadQuizzes();
                renderQuizzes();
                updateStats();
            } catch (error) {
                console.error('Error publishing quiz:', error);
                firebaseApp.showToast('Failed to publish quiz', 'error');
            }
        },
        'Publish',
        'linear-gradient(135deg,#6366f1,#4f46e5)'
    );
}

let activeRepublishQuizId = null;

function republishQuiz(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    if (!quiz) return;

    activeRepublishQuizId = quizId;

    // Reset inputs
    const republishDeadlineEl = document.getElementById('republishDeadline');
    if (republishDeadlineEl) {
        republishDeadlineEl.value = '';
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        republishDeadlineEl.min = today.toISOString().slice(0, 16);
    }

    // Open modal
    document.getElementById('republishQuizModal').classList.remove('hidden');
}

function closeRepublishModal() {
    activeRepublishQuizId = null;
    document.getElementById('republishQuizModal').classList.add('hidden');
}

// Bind modal buttons once
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('republishConfirmBtn');
    const editBtn = document.getElementById('republishEditBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteQuizBtn');

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!activeDeleteQuizId) return;

            const deleteReason = document.getElementById('deleteQuizReasonInput').value.trim();
            if (!deleteReason) {
                firebaseApp.showToast('A reason is required to delete a published quiz.', 'error');
                return;
            }

            const quiz = allQuizzes.find(q => q.id === activeDeleteQuizId);
            if (!quiz) {
                closeDeleteQuizModal();
                return;
            }

            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.textContent = '🗑️ Deleting...';

            try {
                await notifyStudentsOfDeletion(quiz, deleteReason);

                try {
                    const resultsSnapshot = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
                        .where('quizId', '==', activeDeleteQuizId)
                        .get();
                    const batch = firebaseApp.db.batch();
                    resultsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                    if (!resultsSnapshot.empty) await batch.commit();
                } catch (e) {
                    console.warn('Could not cleanup quiz results:', e);
                }

                await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(activeDeleteQuizId).delete();
                firebaseApp.showToast('Quiz deleted successfully', 'success');

                if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                    await activityTracker.logActivity('quiz_deleted', {
                        quizId: activeDeleteQuizId,
                        quizTitle: quiz.title,
                        reason: deleteReason
                    });
                }

                closeDeleteQuizModal();
                await loadQuizzes();
                renderQuizzes();
                updateStats();
            } catch (error) {
                console.error('Error deleting quiz:', error);
                firebaseApp.showToast('Failed to delete quiz', 'error');
            } finally {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.textContent = '🗑️ Delete Quiz';
            }
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!activeRepublishQuizId) return;

            const newDeadlineStr = document.getElementById('republishDeadline').value;
            if (!newDeadlineStr) {
                firebaseApp.showToast('Please enter a new deadline.', 'error');
                return;
            }

            const deadlineDate = new Date(newDeadlineStr);
            if (isNaN(deadlineDate.getTime())) {
                firebaseApp.showToast('Invalid date format.', 'error');
                return;
            }

            if (deadlineDate <= new Date()) {
                firebaseApp.showToast('New deadline must be in the future!', 'error');
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = '🔄 Publishing...';

            try {
                await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(activeRepublishQuizId).update({
                    status: 'active',
                    isActive: true,
                    deadline: firebase.firestore.Timestamp.fromDate(deadlineDate),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                firebaseApp.showToast('🔄 Quiz re-published with new deadline!', 'success');

                if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                    const quiz = allQuizzes.find(q => q.id === activeRepublishQuizId);
                    await activityTracker.logActivity('quiz_republished', {
                        quizId: activeRepublishQuizId,
                        quizTitle: quiz ? quiz.title : 'Unknown',
                        newDeadline: newDeadlineStr
                    });
                }

                closeRepublishModal();
                await loadQuizzes();
                renderQuizzes();
                updateStats();
            } catch (error) {
                console.error('Error re-publishing quiz:', error);
                firebaseApp.showToast('Failed to re-publish quiz', 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '🔄 Re-publish Now';
            }
        });
    }

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (!activeRepublishQuizId) return;
            const targetId = activeRepublishQuizId;
            closeRepublishModal();
            // Call the normal edit flow
            editQuiz(targetId);
        });
    }
});

function editQuiz(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    if (!quiz) {
        firebaseApp.showToast('Quiz not found', 'error');
        return;
    }

    // Compute effective status
    let effectiveStatus = quiz.status || 'active';
    if (effectiveStatus === 'active' && quiz.deadline) {
        const deadline = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
        if (deadline < new Date()) {
            effectiveStatus = 'archived';
        }
    }

    if (effectiveStatus !== 'draft' && effectiveStatus !== 'archived') {
        firebaseApp.showToast('Only draft or archived quizzes can be edited.', 'warning');
        return;
    }

    // Set edit mode (Copy if archived)
    if (effectiveStatus === 'archived') {
        editingQuizId = null; // Save as new quiz
    } else {
        editingQuizId = quizId;
    }

    // Open the modal fresh first
    const modal = document.getElementById('quizCreationModal');
    modal.classList.remove('hidden');

    // Update modal title to show edit mode
    const modalTitle = modal.querySelector('h2, .modal-title');
    if (modalTitle) {
        modalTitle.textContent = effectiveStatus === 'archived' ? '📝 Re-use Archived Quiz' : '✏️ Edit Draft Quiz';
    }

    // Reset questions
    quizQuestions = [];
    questionCounter = 0;
    document.getElementById('questionsContainer').innerHTML = '';

    // Populate assignment options first (needed before we set values)
    populateAssignmentOptions();

    // Setup assignment change handler
    const assignSelect = document.getElementById('quizAssignTo');
    assignSelect.removeEventListener('change', handleAssignToChange);
    assignSelect.addEventListener('change', handleAssignToChange);

    // ── Pre-fill basic fields ──
    const titleVal = quiz.title || '';
    document.getElementById('quizTitle').value = effectiveStatus === 'archived' ? titleVal + ' (Copy)' : titleVal;
    const subjectEl = document.getElementById('quizSubject');
    if (subjectEl) subjectEl.value = quiz.subject || '';
    document.getElementById('quizDescription').value = quiz.description || '';

    // Deadline — set value AND enforce min = now
    const deadlineEditEl = document.getElementById('quizDeadline');
    if (deadlineEditEl) {
        const nowEdit = new Date();
        const padE = n => String(n).padStart(2, '0');
        deadlineEditEl.min = `${nowEdit.getFullYear()}-${padE(nowEdit.getMonth() + 1)}-${padE(nowEdit.getDate())}T${padE(nowEdit.getHours())}:${padE(nowEdit.getMinutes())}`;
        if (quiz.deadline) {
            try {
                const dl = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
                const dlLocal = `${dl.getFullYear()}-${padE(dl.getMonth() + 1)}-${padE(dl.getDate())}T${padE(dl.getHours())}:${padE(dl.getMinutes())}`;
                deadlineEditEl.value = dlLocal;
            } catch (e) { /* ignore invalid date */ }
        }
    }

    // Time limit
    const timeLimitEl = document.getElementById('quizTimeLimit');
    if (timeLimitEl) timeLimitEl.value = quiz.timeLimit || '';

    // Allow review toggle
    const allowReviewEl = document.getElementById('quizAllowReview');
    if (allowReviewEl) allowReviewEl.checked = quiz.allowReview !== false;

    // ── Pre-fill assignment ──
    let assignType = quiz.assignmentType || 'section';
    const isLegacyAll = assignType === 'all';
    if (isLegacyAll) assignType = 'section';
    
    assignSelect.value = assignType;
    handleAssignToChange({ target: { value: assignType } });

    if (assignType === 'section') {
        setTimeout(() => {
            if (isLegacyAll) {
                document.querySelectorAll('input[name="selectedSections"]').forEach(cb => cb.checked = true);
            } else if (quiz.assignedToSections || quiz.assignedToSection) {
                const sections = quiz.assignedToSections || (quiz.assignedToSection ? [quiz.assignedToSection] : []);
                sections.forEach(sv => {
                    const cb = document.querySelector(`input[name="selectedSections"][value="${sv}"]`);
                    if (cb) cb.checked = true;
                });
            }
        }, 50);
    } else if (assignType === 'individual' && quiz.assignedToStudents) {
        setTimeout(() => {
            quiz.assignedToStudents.forEach(uid => {
                const cb = document.querySelector(`input[name="selectedStudents"][value="${uid}"]`);
                if (cb) cb.checked = true;
            });
        }, 50);
    }

    // ── Pre-fill questions ──
    const questions = quiz.questions || [];
    if (questions.length === 0) {
        addQuestion(); // at least one blank question
    } else {
        questions.forEach((q, idx) => {
            questionCounter++;
            const questionId = `q${questionCounter}`;

            const questionCard = document.createElement('div');
            questionCard.className = 'question-card-builder';
            questionCard.id = questionId;
            questionCard.dataset.questionIndex = idx;
            questionCard.dataset.questionType = q.type || 'multiple-choice';

            questionCard.innerHTML = `
                <div class="question-header">
                    <span class="question-number-badge">Question ${questionCounter}</span>
                    <button type="button" class="question-remove-btn" onclick="removeQuestion('${questionId}')">
                        🗑️ Remove
                    </button>
                </div>

                <div class="form-group">
                    <label class="form-label">Question Type *</label>
                    <select class="form-input question-type-select" onchange="changeQuestionType('${questionId}', this.value)">
                        <option value="multiple-choice" ${q.type === 'multiple-choice' || !q.type ? 'selected' : ''}>Multiple Choice</option>
                        <option value="multiple-selection" ${q.type === 'multiple-selection' ? 'selected' : ''}>Multiple Selection (Check all that apply)</option>
                        <option value="identification" ${q.type === 'identification' ? 'selected' : ''}>Identification (One-line Answer)</option>
                        <option value="true-false" ${q.type === 'true-false' ? 'selected' : ''}>True or False</option>
                        <option value="essay" ${q.type === 'essay' ? 'selected' : ''}>Essay (Written Answer)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Question Text *</label>
                    <textarea class="form-input question-text" rows="2" placeholder="Enter your question...">${q.question || ''}</textarea>
                </div>

                <div class="question-type-content">
                    ${getQuestionTypeHTML(questionId, q.type || 'multiple-choice')}
                </div>

                <div class="grid grid-2 gap-4">
                    <div class="form-group">
                        <label class="form-label">Points</label>
                        <input type="number" class="form-input question-points" value="${q.points || 1}" min="1" max="100">
                    </div>
                </div>
            `;

            document.getElementById('questionsContainer').appendChild(questionCard);

            // Now populate the answer fields based on type
            if (q.type === 'multiple-choice' || !q.type) {
                const optionInputs = questionCard.querySelectorAll('.option-text');
                (q.options || []).forEach((opt, i) => {
                    if (optionInputs[i]) optionInputs[i].value = opt;
                });
                if (q.correctAnswer !== null && q.correctAnswer !== undefined) {
                    const radio = questionCard.querySelector(`input[name="${questionId}-correct"][value="${q.correctAnswer}"]`);
                    if (radio) {
                        radio.checked = true;
                        radio.closest('.option-input-group')?.classList.add('correct-answer');
                    }
                }
                questionCard.querySelectorAll(`input[name="${questionId}-correct"]`).forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        questionCard.querySelectorAll('.option-input-group').forEach(g => g.classList.remove('correct-answer'));
                        e.target.closest('.option-input-group')?.classList.add('correct-answer');
                    });
                });
            } else if (q.type === 'multiple-selection') {
                const optionInputs = questionCard.querySelectorAll('.option-text');
                (q.options || []).forEach((opt, i) => {
                    if (optionInputs[i]) optionInputs[i].value = opt;
                });
                const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
                correctArr.forEach(idx => {
                    const cb = questionCard.querySelector(`input[name="${questionId}-ms-correct"][value="${idx}"]`);
                    if (cb) cb.checked = true;
                });
            } else if (q.type === 'identification') {
                const identInput = questionCard.querySelector('.identification-answer');
                if (identInput) identInput.value = q.correctAnswer || '';
            } else if (q.type === 'true-false') {
                const tfValue = q.correctAnswer === true ? 'true' : q.correctAnswer === false ? 'false' : null;
                if (tfValue) {
                    const radio = questionCard.querySelector(`input[name="${questionId}-tf-correct"][value="${tfValue}"]`);
                    if (radio) radio.checked = true;
                }
            } else if (q.type === 'essay') {
                const modelInput = questionCard.querySelector('.essay-model-answer');
                if (modelInput) modelInput.value = q.modelAnswer || '';
            }
        });
    }

    // Update submit button label to indicate update mode
    const submitBtn = document.querySelector('#quizCreationForm button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Save & Publish';

    // Populate scheduling fields if present — enforce min = today (local time)
    const nowSched = new Date();
    const padS = n => String(n).padStart(2, '0');
    const minDateSched = `${nowSched.getFullYear()}-${padS(nowSched.getMonth() + 1)}-${padS(nowSched.getDate())}`;
    
    const schedDateEl = document.getElementById('quizScheduleDate');
    if (schedDateEl) {
        schedDateEl.min = minDateSched;
        if (quiz.scheduledDate) schedDateEl.value = quiz.scheduledDate;
    }
    if (quiz.scheduledStartTime) {
        const schedTimeEl = document.getElementById('quizScheduleTime');
        if (schedTimeEl) schedTimeEl.value = quiz.scheduledStartTime;
    }
    if (quiz.scheduledDuration && quiz.scheduledStartTime) {
        const schedEndTimeEl = document.getElementById('quizScheduleEndTime');
        if (schedEndTimeEl) {
            const [startH, startM] = quiz.scheduledStartTime.split(':').map(Number);
            let endMins = startH * 60 + startM + quiz.scheduledDuration;
            let endH = Math.floor(endMins / 60) % 24;
            let endM = endMins % 60;
            schedEndTimeEl.value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        }
    }

    // Populate toggles
    const randomizeElForm = document.getElementById('quizRandomizeQuestions');
    if (randomizeElForm) randomizeElForm.checked = !!quiz.randomizeQuestions;
    const allowReviewElForm = document.getElementById('quizAllowReview');
    if (allowReviewElForm) allowReviewElForm.checked = quiz.allowReview !== false;

    firebaseApp.showToast('📝 Draft loaded for editing', 'info');
}

function viewQuizResults(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    const results = allResults.filter(r => r.quizId === quizId);
    const modal = document.getElementById('quizResultsModal');
    if (!modal) return;

    // Update title
    document.getElementById('resultsModalTitle').textContent =
        `📊 ${quiz ? quiz.title : 'Quiz'} — Results`;

    // Stats summary
    const statsEl = document.getElementById('resultsModalStats');
    if (results.length === 0) {
        statsEl.innerHTML = '';
        document.getElementById('resultsModalEmpty').classList.remove('hidden');
        document.getElementById('resultsModalTableBody').innerHTML = '';
    } else {
        document.getElementById('resultsModalEmpty').classList.add('hidden');
        const avgPct = Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
        const topScore = Math.max(...results.map(r => r.percentage || 0));
        const lowScore = Math.min(...results.map(r => r.percentage || 0));
        const passed = results.filter(r => (r.percentage || 0) >= 75).length;

        statsEl.innerHTML = [
            { label: 'Submissions', value: results.length, icon: '📝' },
            { label: 'Avg Score', value: avgPct + '%', icon: '🎯' },
            { label: 'Highest', value: topScore + '%', icon: '🏆' },
            { label: 'Passed (≥75%)', value: passed, icon: '✅' }
        ].map(s => `
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:0.75rem;padding:1rem;text-align:center;">
                <div style="font-size:1.5rem;margin-bottom:0.25rem;">${s.icon}</div>
                <div style="font-size:1.4rem;font-weight:700;color:var(--primary-400);">${s.value}</div>
                <div style="font-size:0.75rem;color:var(--gray-500);">${s.label}</div>
            </div>
        `).join('');

        // Sort by score descending
        const sorted = [...results].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
        document.getElementById('resultsModalTableBody').innerHTML = sorted.map((r, i) => {
            const submitted = r.submittedAt
                ? (r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)).toLocaleString()
                : '—';
            const pct = r.percentage || 0;
            const badgeClass = pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-error';
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${r.studentName || 'Unknown'}</strong></td>
                    <td style="text-align:center;">${r.score || 0}/${r.maxScore || 0}</td>
                    <td style="text-align:center;"><span class="badge ${badgeClass}">${pct}%</span></td>
                    <td style="font-size:0.8rem;color:var(--gray-500);">${submitted}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="viewStudentSubmission('${quizId}', '${r.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                            👀 View/Grade
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function showResultsModal(contentHTML) {
    // Remove existing if any
    const existing = document.getElementById('resultsViewModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'resultsViewModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="document.getElementById('resultsViewModal').remove()"></div>
        <div class="modal-content large-modal" style="max-height: 90vh; display: flex; flex-direction: column;">
            <div class="modal-header">
                <h2 class="modal-title">📄 Student Submission</h2>
                <button class="modal-close" onclick="document.getElementById('resultsViewModal').remove()">✕</button>
            </div>
            <div class="modal-body" style="overflow-y: auto; flex: 1;">${contentHTML}</div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ==== Essay Grading ==== 
window.viewStudentSubmission = async function (quizId, resultId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    let result = allResults.find(r => r.id === resultId);
    if (!quiz) return;

    if (!result) {
        // Try fetching it if it was fully missing from allResults (rare)
        try {
            const doc = await firebaseApp.db.collection(firebaseApp.collections.quizResults).doc(resultId).get();
            if (doc.exists) result = { id: doc.id, ...doc.data() };
        } catch (e) {
            console.error('Cannot retrieve result document:', e);
        }
    }
    if (!result) return firebaseApp.showToast('Result data not found.', 'error');

    // Read the current student score maps
    const storedScores = result.questionScores || {};

    let questionsHTML = '';
    quiz.questions.forEach((q, index) => {
        const studentAns = result.answers ? result.answers[index] : null;
        let pLabel = 'No Answer';

        if (q.type === 'multiple-choice') {
            const isCorrect = studentAns === q.correctAnswer;
            const displayAns = q.options ? (q.options[studentAns] || '—') : studentAns;
            const cAns = q.options ? q.options[q.correctAnswer] : q.correctAnswer;
            pLabel = `<strong style="color:${isCorrect ? '#22c55e' : '#ef4444'};">${isCorrect ? '✅ Correct' : '❌ Incorrect'}</strong>. Answer: ${displayAns}. Correct: ${cAns}`;
        } else if (q.type === 'true-false') {
            const isCorrect = studentAns === q.correctAnswer;
            const displayAns = studentAns === true ? 'True' : studentAns === false ? 'False' : '—';
            const cAns = q.correctAnswer === true ? 'True' : q.correctAnswer === false ? 'False' : '—';
            pLabel = `<strong style="color:${isCorrect ? '#22c55e' : '#ef4444'};">${isCorrect ? '✅ Correct' : '❌ Incorrect'}</strong>. Answer: ${displayAns}. Correct: ${cAns}`;
        } else if (q.type === 'identification') {
            const displayAns = String(studentAns || '').trim().toLowerCase();
            const accepted = Array.isArray(q.correctAnswers) ? q.correctAnswers.map(a => String(a).toLowerCase()) : [String(q.correctAnswer || '').toLowerCase()];
            const isCorrect = accepted.includes(displayAns);
            pLabel = `<strong style="color:${isCorrect ? '#22c55e' : '#ef4444'};">${isCorrect ? '✅ Correct' : '❌ Incorrect'}</strong>. Answer: ${studentAns || '—'}. Correct: ${accepted.join(' or ')}`;
        } else if (q.type === 'multiple-selection') {
            const cSet = (q.correctAnswer || []).slice().sort().join(',');
            const aSet = (Array.isArray(studentAns) ? studentAns : []).slice().sort().join(',');
            const isCorrect = cSet === aSet;
            const displayAns = aSet; // Index mapping isn't cleanly resolved here out of scope, but we provide pass/fail.
            pLabel = `<strong style="color:${isCorrect ? '#22c55e' : '#ef4444'};">${isCorrect ? '✅ Correct' : '❌ Incorrect'}</strong>`;
        } else if (q.type === 'essay') {
            const maxPts = q.points || 1;
            const currentGranted = storedScores[index] !== undefined ? storedScores[index] : 0;
            pLabel = `
                <div style="background: rgba(102,126,234,0.1); border: 1px solid rgba(102,126,234,0.3); border-radius: 8px; padding: 1rem; margin-top: 0.5rem;">
                   <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary-300);">✍️ Manual Grading</div>
                   <div style="margin-bottom: 0.5rem;">
                       <strong>Student's Essay:</strong><br>
                       <p style="white-space: pre-wrap; margin-top: 0.2rem; margin-bottom: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px;">${studentAns || '<em>No answer provided</em>'}</p>
                   </div>
                   ${q.modelAnswer ? `<div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Model Answer:</strong><br><p style="white-space: pre-wrap; margin-top: 0.2rem; color: #a5b4fc;">${q.modelAnswer}</p></div>` : ''}
                   <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
                       <label>Score for Essay (out of ${maxPts}):</label>
                       <input type="number" id="essay-grade-${index}" value="${currentGranted}" min="0" max="${maxPts}" class="form-input" style="width: 80px; text-align: center; padding: 0.2rem;">
                       <button class="btn btn-sm btn-primary" onclick="saveEssayScore('${resultId}', '${quizId}', ${index}, ${maxPts})" style="padding: 0.35rem 0.75rem;">Save Score</button>
                   </div>
                </div>
            `;
        }

        questionsHTML += `
            <div style="margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem; color: #fff;">${index + 1}. ${q.question}</h4>
                <div style="font-size: 0.9rem; color: var(--gray-300);">${pLabel}</div>
            </div>
        `;
    });

    const headerHTML = `
        <div style="margin-bottom: 1rem; padding: 1rem; background: var(--glass-bg); border-radius: 8px; border: 1px solid var(--glass-border);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                   <h3 style="margin: 0 0 0.25rem;">${result.studentName || 'Student'}</h3>
                   <div style="font-size: 0.85rem; color: var(--gray-400);">Submitted: ${result.submittedAt ? (result.submittedAt.toDate ? result.submittedAt.toDate() : new Date(result.submittedAt)).toLocaleString() : '—'}</div>
                </div>
                <div style="text-align: right;">
                   <div style="font-size: 1.6rem; font-weight: 800; color: ${result.percentage >= 75 ? '#22c55e' : result.percentage >= 50 ? '#f59e0b' : '#ef4444'};">${result.percentage}%</div>
                   <div style="font-size: 0.85rem; color: var(--gray-400);">Current Score: ${result.score} / ${result.maxScore}</div>
                </div>
            </div>
        </div>
    `;

    showResultsModal(headerHTML + questionsHTML);
};

window.saveEssayScore = async function (resultId, quizId, questionIndex, maxQuestionPoints) {
    const scoreValRaw = document.getElementById(`essay-grade-${questionIndex}`).value;
    const addedScore = parseInt(scoreValRaw);
    if (isNaN(addedScore) || addedScore < 0 || addedScore > maxQuestionPoints) {
        return firebaseApp.showToast('Please enter a valid score within the range.', 'error');
    }

    try {
        const resultRef = firebaseApp.db.collection(firebaseApp.collections.quizResults).doc(resultId);
        const doc = await resultRef.get();
        if (!doc.exists) return firebaseApp.showToast('Submission data missing.', 'error');

        const data = doc.data();
        const storedScores = data.questionScores || {};
        const oldGranted = storedScores[questionIndex] !== undefined ? storedScores[questionIndex] : 0;

        let newScore = data.score - oldGranted + addedScore;
        // In the quiz submission logic out of our scope, maxScore only accrues points for non-essay questions.
        // Therefore, we add maxQuestionPoints if this is the first time we are grading this OR if it wasn't recorded in maxScore.
        // It's cleaner to re-calculate maxScore and score outright based on the quiz document but we can assume maxScore on document already did not include essay points.

        let newMaxScore = data.maxScore;
        if (storedScores[questionIndex] === undefined) {
            // First time grading this essay question, add it to maxScore
            newMaxScore += maxQuestionPoints;
        }

        const newPercentage = newMaxScore > 0 ? Math.round((newScore / newMaxScore) * 100) : 0;

        storedScores[questionIndex] = addedScore;

        await resultRef.update({
            score: newScore,
            maxScore: newMaxScore,
            percentage: newPercentage,
            questionScores: storedScores
        });

        firebaseApp.showToast('Essay score updated!', 'success');

        // Update local cache
        const rIndex = allResults.findIndex(r => r.id === resultId);
        if (rIndex >= 0) {
            allResults[rIndex].score = newScore;
            allResults[rIndex].maxScore = newMaxScore;
            allResults[rIndex].percentage = newPercentage;
            allResults[rIndex].questionScores = storedScores;
        }

        // Reopen Student submission modal logic inline to refresh
        viewStudentSubmission(quizId, resultId);
        // Refresh underlying table
        viewQuizResults(quizId);

    } catch (err) {
        console.error(err);
        firebaseApp.showToast('Error updating score.', 'error');
    }
};

// Close the HTML-based quiz results modal
function closeQuizResultsModal() {
    const modal = document.getElementById('quizResultsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========================================
// Export Quiz to PDF
// ========================================
function exportQuizToPDF(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    if (!quiz) {
        firebaseApp.showToast('Quiz not found', 'error');
        return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
        firebaseApp.showToast('Please allow popups to export the quiz', 'error');
        return;
    }

    const questions = quiz.questions || [];
    let questionsHTML = '';
    let answerKeyHTML = '';

    questions.forEach((q, i) => {
        const qNum = i + 1;
        questionsHTML += `
            <div class="question-block">
                <div class="question-text"><strong>${qNum}.</strong> ${q.question}</div>
        `;

        let answerText = q.correctAnswer;

        if (q.type === 'multiple-choice') {
            const opts = q.options || {};
            questionsHTML += `<ul class="options-list">`;
            ['A', 'B', 'C', 'D'].forEach(letter => {
                if (opts[letter]) {
                    questionsHTML += `<li><strong>${letter}.</strong> ${opts[letter]}</li>`;
                }
            });
            questionsHTML += `</ul>`;
            answerText = `${q.correctAnswer} - ${opts[q.correctAnswer] || ''}`;
        } else if (q.type === 'multiple-selection') {
            const opts = q.options || {};
            questionsHTML += `<ul class="options-list">`;
            ['A', 'B', 'C', 'D'].forEach(letter => {
                if (opts[letter]) {
                    questionsHTML += `<li>[ ] <strong>${letter}.</strong> ${opts[letter]}</li>`;
                }
            });
            questionsHTML += `</ul>`;
        } else if (q.type === 'true-false') {
            questionsHTML += `
                <ul class="options-list">
                    <li>[ ] True</li>
                    <li>[ ] False</li>
                </ul>
            `;
        } else if (q.type === 'identification') {
            questionsHTML += `<div style="margin-top:20px; border-bottom:1px solid #000; width:300px; height:20px;"></div>`;
        } else if (q.type === 'essay') {
            questionsHTML += `
                <div style="margin-top:20px; border:1px solid #ccc; width:100%; height:150px;"></div>
            `;
            answerText = '<em>Essay (Manual Grading)</em><br>Model Answer: ' + (q.correctAnswer || 'None provided');
        }

        questionsHTML += `</div>`;

        answerKeyHTML += `
            <div style="margin-bottom: 8px;">
                <strong>${qNum}.</strong> ${answerText}
            </div>
        `;
    });

    const deadlineStr = quiz.deadline ? new Date(quiz.deadline).toLocaleString() : 'No deadline';
    const durationStr = quiz.timeLimit ? `${quiz.timeLimit} minutes` : 'No limit';

    // Format assigned to
    let assignInfo = 'All Students';
    if (quiz.assignmentType === 'section') {
        if (quiz.assignedToSections && quiz.assignedToSections.length > 0) {
            assignInfo = quiz.assignedToSections.map(s => {
                const [g, ...sec] = s.split('-');
                return `Grade ${g} Section ${sec.join('-')}`;
            }).join(', ');
        } else {
            assignInfo = `Grade ${quiz.assignedGrade || '?'} Section ${quiz.assignedSectionName || quiz.assignedToSection || '?'}`;
        }
    } else if (quiz.assignmentType === 'individual') {
        const count = quiz.assignedToStudents ? quiz.assignedToStudents.length : 0;
        assignInfo = `${count} Selected Student(s)`;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${quiz.title} - PDF Export</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; padding: 20px; font-size: 12pt; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .school-name { font-size: 18pt; font-weight: bold; margin: 0; }
            .quiz-title { font-size: 16pt; font-weight: bold; margin: 10px 0; text-transform: uppercase; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 11pt; }
            .meta-item { border-bottom: 1px dotted #ccc; padding-bottom: 4px; }
            .question-block { margin-bottom: 25px; break-inside: avoid; }
            .question-text { font-weight: bold; margin-bottom: 10px; }
            .options-list { list-style-type: none; padding-left: 20px; margin: 0; }
            .options-list li { margin-bottom: 5px; }
            .page-break { page-break-before: always; border-top: 2px dashed #ccc; padding-top: 20px; margin-top: 40px; }
            
            @media print {
                body { padding: 0; font-size: 11pt; }
                .no-print { display: none; }
                @page { margin: 1.5cm; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1 class="school-name">Tagoloan Community College</h1>
            <h2 class="quiz-title">${quiz.title}</h2>
        </div>

        <div class="meta-grid">
            <div class="meta-item"><strong>Subject:</strong> ${quiz.subject || 'N/A'}</div>
            <div class="meta-item"><strong>Teacher:</strong> ${quiz.createdByName || 'N/A'}</div>
            <div class="meta-item"><strong>Score:</strong> ____________ / ${quiz.totalPoints || '?'}</div>
            <div class="meta-item"><strong>Date:</strong> _______________</div>
            <div class="meta-item" style="grid-column: span 2;"><strong>Name:</strong> ________________________________________________</div>
            <div class="meta-item"><strong>Grade & Section:</strong> ______________________</div>
            <div class="meta-item"><strong>Assigned To:</strong> ${assignInfo}</div>
        </div>
        
        <div style="margin-bottom: 30px; font-style: italic; border: 1px solid #ccc; padding: 10px;">
            <strong>Instructions:</strong> ${quiz.description || 'Answer the following questions.'}
            <br><strong>Time Limit:</strong> ${durationStr}
        </div>

        <div class="questions">
            ${questionsHTML}
        </div>

        <div class="page-break">
            <h2 class="quiz-title">ANSWER KEY</h2>
            <div class="meta-grid" style="grid-template-columns: 1fr; font-size:10pt;">
                <div><strong>Quiz:</strong> ${quiz.title}</div>
                <div><strong>Teacher:</strong> ${quiz.createdByName || 'N/A'}</div>
            </div>
            
            <div style="margin-top: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                ${answerKeyHTML}
            </div>
        </div>

        <script>
            window.onload = function() {
                setTimeout(function() {
                    window.print();
                }, 500);
            };
        </script>
    </body>
    </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
}
window.closeQuizResultsModal = closeQuizResultsModal;
window.exportQuizToPDF = exportQuizToPDF;

// Escape key closes quiz results modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const qrModal = document.getElementById('quizResultsModal');
        if (qrModal && !qrModal.classList.contains('hidden')) {
            closeQuizResultsModal();
        }
    }
});

let activeDeleteQuizId = null;

function closeDeleteQuizModal() {
    activeDeleteQuizId = null;
    const modal = document.getElementById('deleteQuizModal');
    if (modal) modal.classList.add('hidden');
}
window.closeDeleteQuizModal = closeDeleteQuizModal;

async function deleteQuiz(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    if (!quiz) return;

    let effectiveStatus = quiz.status || 'active';
    if (effectiveStatus === 'active' && quiz.deadline) {
        const deadline = quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline);
        if (deadline < new Date()) {
            effectiveStatus = 'archived';
        }
    }

    if (effectiveStatus !== 'draft') {
        activeDeleteQuizId = quizId;
        const modal = document.getElementById('deleteQuizModal');
        const reasonInput = document.getElementById('deleteQuizReasonInput');
        if (reasonInput) reasonInput.value = '';
        if (modal) modal.classList.remove('hidden');
    } else {
        // Drafts: delete immediately, no reason needed
        showConfirmModal(
            '🗑️ Delete Draft Quiz',
            'Delete this draft quiz? This action cannot be undone.',
            async () => {
                try {
                    // Delete associated quiz results
                    try {
                        const resultsSnapshot = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
                            .where('quizId', '==', quizId)
                            .get();
                        const batch = firebaseApp.db.batch();
                        resultsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                        if (!resultsSnapshot.empty) await batch.commit();
                    } catch (e) {
                        console.warn('Could not cleanup quiz results:', e);
                    }
                    await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(quizId).delete();
                    firebaseApp.showToast('Quiz deleted successfully', 'success');
                    if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                        await activityTracker.logActivity('quiz_deleted', {
                            quizId: quizId,
                            quizTitle: quiz.title,
                            reason: 'Draft deletion'
                        });
                    }
                    await loadQuizzes();
                    renderQuizzes();
                    updateStats();
                } catch (error) {
                    console.error('Error deleting quiz:', error);
                    firebaseApp.showToast('Failed to delete quiz', 'error');
                }
            }
        );
    }
}

/**
 * Notify students when a published quiz is deleted.
 * Creates a notification for each targeted student.
 */
async function notifyStudentsOfDeletion(quiz, reason) {
    try {
        // Determine which students to notify
        let studentIds = [];

        if (quiz.targetStudents === 'all') {
            // All students
            studentIds = allStudents.map(s => s.uid || s.id);
        } else if (Array.isArray(quiz.targetStudents)) {
            studentIds = quiz.targetStudents;
        } else if (quiz.assignedToStudents && Array.isArray(quiz.assignedToStudents)) {
            studentIds = quiz.assignedToStudents;
        }

        if (studentIds.length === 0) return;

        // Check which students already took the quiz
        const resultsSnapshot = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
            .where('quizId', '==', quiz.id)
            .get();
        const studentsTaken = new Set(resultsSnapshot.docs.map(doc => doc.data().studentId));

        // Create notifications in batch
        const batch = firebaseApp.db.batch();
        const teacherName = `${currentUser.firstName} ${currentUser.lastName}`;

        studentIds.forEach(studentId => {
            const hasTaken = studentsTaken.has(studentId);
            const notifRef = firebaseApp.db.collection(firebaseApp.collections.notifications).doc();
            batch.set(notifRef, {
                userId: studentId,
                type: 'quiz_deleted',
                title: `Quiz Removed: ${quiz.title}`,
                message: hasTaken
                    ? `The quiz "${quiz.title}" you already took has been removed by ${teacherName}. Reason: ${reason}`
                    : `The quiz "${quiz.title}" has been removed by ${teacherName} before you could take it. Reason: ${reason}`,
                quizTitle: quiz.title,
                reason: reason,
                deletedBy: teacherName,
                hasTaken: hasTaken,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        firebaseApp.showToast(`📢 ${studentIds.length} student(s) notified about quiz deletion`, 'info');
    } catch (error) {
        console.error('Error notifying students:', error);
        // Don't block quiz deletion if notification fails
    }
}

// ========================================
// Logout
// ========================================

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        // Cleanup real-time listeners
        if (unsubResults) unsubResults();
        if (unsubQuizzes) unsubQuizzes();

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
            await Promise.all([loadQuizzes(), loadStudents(), loadResults()]);
            updateStats();
            renderRecentActivity();
            renderQuizzes();
            renderStudents();
            renderAnalytics();
            renderAIInsights();
            firebaseApp.showToast('🔄 Dashboard refreshed!', 'success');
        } catch (e) {
            firebaseApp.showToast('Failed to refresh', 'error');
        }
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
    });
}

// ========================================
// Quiz Scheduling
// ========================================

function saveQuizScheduled() {
    saveQuiz('scheduled');
}

// ========================================
// Quiz Import
// ========================================

/**
 * Generate and download a blank quiz template CSV with clear instructions built in.
 */
function downloadQuizTemplate() {
    const rows = [
        // Row 1: Quiz Title
        ['My Quiz Title Here'],
        // Row 2: Column Headers
        ['type', 'question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'points'],
        // --- MULTIPLE CHOICE example ---
        ['multiple-choice', 'What is the capital of the Philippines?', 'Cebu', 'Manila', 'Davao', 'Baguio', 'B', '2'],
        // --- MULTIPLE SELECTION example (comma-separated letters, no spaces) ---
        ['multiple-selection', 'Which of the following are primary colors?', 'Red', 'Green', 'Blue', 'Orange', 'A,C', '2'],
        // --- TRUE OR FALSE example (write: true or false) ---
        ['true-false', 'The Earth revolves around the Sun.', '', '', '', '', 'true', '1'],
        // --- IDENTIFICATION example (write the expected answer) ---
        ['identification', 'What is the chemical symbol for water?', '', '', '', '', 'H2O', '1'],
        // --- ESSAY example (correctAnswer can be a model/sample answer or leave blank) ---
        ['essay', 'Explain in your own words why the sky appears blue.', '', '', '', '', 'The sky appears blue due to Rayleigh scattering of sunlight.', '3'],
    ];

    // Convert rows to CSV string (wrap fields containing commas in quotes)
    const csvContent = rows.map(row =>
        row.map(cell => {
            const s = String(cell);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? '"' + s.replace(/"/g, '""') + '"'
                : s;
        }).join(',')
    ).join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'quiz_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    firebaseApp.showToast('📄 Template downloaded! Open it in Excel to fill in your questions.', 'success');
}


function openImportQuizModal() {
    const modal = document.getElementById('quizImportModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset file input
        const fileInput = document.getElementById('quizImportFile');
        if (fileInput) fileInput.value = '';
    }
}

function closeImportQuizModal() {
    const modal = document.getElementById('quizImportModal');
    if (modal) modal.classList.add('hidden');
}

// ---- CSV/Excel Quiz Import Helpers ----

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Convert a 2-D array of rows (from CSV or SheetJS) into quiz data object.
 * Row 0 = quiz title, Row 1 = header (ignored), Row 2+ = questions.
 * Columns: type, question, optionA, optionB, optionC, optionD, correctAnswer, points
 */
function rowsToQuizData(rows) {
    if (!rows || rows.length < 3) throw new Error('File must have at least 3 rows (title, header, 1 question)');
    const title = String(rows[0][0] || '').trim();
    if (!title) throw new Error('Row 1 must contain the quiz title');

    const VALID_TYPES = ['multiple-choice', 'multiple-selection', 'identification', 'true-false', 'essay'];
    const questions = [];
    // Start from row index 2 (skip title row 0 and header row 1)
    for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(c => !String(c || '').trim())) continue; // skip blank rows
        const type = String(row[0] || '').trim().toLowerCase();
        const questionText = String(row[1] || '').trim();
        const optA = String(row[2] || '').trim();
        const optB = String(row[3] || '').trim();
        const optC = String(row[4] || '').trim();
        const optD = String(row[5] || '').trim();
        const correctRaw = String(row[6] || '').trim();
        const points = parseInt(row[7]) || 1;

        if (!VALID_TYPES.includes(type)) throw new Error(`Row ${r + 1}: Unknown type "${type}". Valid: ${VALID_TYPES.join(', ')}`);
        if (!questionText) throw new Error(`Row ${r + 1}: Question text is empty`);

        const q = { type, question: questionText, points };

        if (type === 'multiple-choice') {
            const opts = [optA, optB, optC, optD].filter(o => o);
            if (opts.length < 2) throw new Error(`Row ${r + 1}: multiple-choice needs at least 2 options`);
            q.options = opts;
            const letterMap = { A: 0, B: 1, C: 2, D: 3 };
            const cIdx = letterMap[correctRaw.toUpperCase()];
            if (cIdx === undefined) throw new Error(`Row ${r + 1}: correctAnswer for multiple-choice must be A, B, C, or D`);
            if (cIdx >= opts.length) throw new Error(`Row ${r + 1}: correctAnswer "${correctRaw}" out of range`);
            q.correctAnswer = cIdx;
        } else if (type === 'multiple-selection') {
            const opts = [optA, optB, optC, optD].filter(o => o);
            if (opts.length < 2) throw new Error(`Row ${r + 1}: multiple-selection needs at least 2 options`);
            q.options = opts;
            const letterMap = { A: 0, B: 1, C: 2, D: 3 };
            const correctIndices = correctRaw.split(',').map(l => letterMap[l.trim().toUpperCase()]).filter(i => i !== undefined);
            if (correctIndices.length === 0) throw new Error(`Row ${r + 1}: multiple-selection correctAnswer must be comma-separated letters (e.g. A,C)`);
            q.correctAnswer = correctIndices;
        } else if (type === 'true-false') {
            const tv = correctRaw.toLowerCase();
            if (tv !== 'true' && tv !== 'false') throw new Error(`Row ${r + 1}: true-false correctAnswer must be "true" or "false"`);
            q.correctAnswer = tv === 'true';
        } else if (type === 'identification') {
            if (!correctRaw) throw new Error(`Row ${r + 1}: identification correctAnswer cannot be empty`);
            q.correctAnswer = correctRaw;
        } else if (type === 'essay') {
            q.modelAnswer = correctRaw || '';
            q.correctAnswer = null;
        }
        questions.push(q);
    }
    if (questions.length === 0) throw new Error('No valid questions found in the file');
    return { title, questions };
}

/**
 * Populate the quiz creation modal with parsed quiz data.
 */
function populateImportedQuiz(data) {
    closeImportQuizModal();
    openQuizModal();
    setTimeout(() => {
        document.getElementById('quizTitle').value = data.title;
        document.getElementById('questionsContainer').innerHTML = '';
        quizQuestions = [];
        questionCounter = 0;

        data.questions.forEach(q => {
            addQuestion();
            const cards = document.querySelectorAll('.question-card-builder');
            const lastCard = cards[cards.length - 1];
            if (!lastCard) return;
            const qId = lastCard.id;

            const textInput = lastCard.querySelector('.question-text');
            if (textInput) textInput.value = q.question;
            const pointsInput = lastCard.querySelector('.question-points');
            if (pointsInput) pointsInput.value = q.points || 1;

            const typeSelect = lastCard.querySelector('.question-type-select');
            if (typeSelect && typeSelect.value !== q.type) {
                typeSelect.value = q.type;
                changeQuestionType(qId, q.type);
            }

            setTimeout(() => {
                if (q.type === 'multiple-choice' && q.options) {
                    lastCard.querySelectorAll('.option-text').forEach((inp, i) => { if (q.options[i]) inp.value = q.options[i]; });
                    const radio = lastCard.querySelector(`input[name="${qId}-correct"][value="${q.correctAnswer}"]`);
                    if (radio) radio.checked = true;
                } else if (q.type === 'multiple-selection' && q.options) {
                    lastCard.querySelectorAll('.option-text').forEach((inp, i) => { if (q.options[i]) inp.value = q.options[i]; });
                    (q.correctAnswer || []).forEach(idx => {
                        const cb = lastCard.querySelector(`input[name="${qId}-ms-correct"][value="${idx}"]`);
                        if (cb) cb.checked = true;
                    });
                } else if (q.type === 'true-false') {
                    const tfVal = q.correctAnswer === true ? 'true' : 'false';
                    const radio = lastCard.querySelector(`input[value="${tfVal}"][type="radio"]`);
                    if (radio) radio.checked = true;
                } else if (q.type === 'identification') {
                    const inp = lastCard.querySelector('.identification-answer');
                    if (inp) inp.value = q.correctAnswer || '';
                } else if (q.type === 'essay') {
                    const inp = lastCard.querySelector('.essay-model-answer');
                    if (inp) inp.value = q.modelAnswer || '';
                }
            }, 100);
        });
        firebaseApp.showToast(`✅ Imported ${data.questions.length} questions from "${data.title}"`, 'success');
    }, 200);
}

function importQuizFromFile() {
    const fileInput = document.getElementById('quizImportFile');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        firebaseApp.showToast('Please select a .csv or .xlsx file to import', 'error');
        return;
    }
    const file = fileInput.files[0];
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isXlsx && !isCsv) {
        firebaseApp.showToast('Only .csv or .xlsx files are supported', 'error');
        return;
    }

    const reader = new FileReader();

    if (isXlsx) {
        reader.onload = function (e) {
            try {
                if (typeof XLSX === 'undefined') throw new Error('SheetJS (XLSX) library not loaded. Please check your internet connection.');
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                const data = rowsToQuizData(rows);
                populateImportedQuiz(data);
            } catch (err) {
                console.error('Quiz import error:', err);
                firebaseApp.showToast('❌ Import failed: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = function (e) {
            try {
                const text = e.target.result;
                const lines = text.split(/\r?\n/);
                const rows = lines.map(l => parseCSVLine(l));
                const data = rowsToQuizData(rows);
                populateImportedQuiz(data);
            } catch (err) {
                console.error('Quiz import error:', err);
                firebaseApp.showToast('❌ Import failed: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    reader.onerror = function () {
        firebaseApp.showToast('❌ Failed to read file', 'error');
    };
}

// ========================================
// Quiz Print/Report
// ========================================

let currentResultsQuizId = null;

function printQuizReport() {
    // Get the current quiz data from the results modal
    const titleEl = document.getElementById('resultsModalTitle');
    const quizTitle = titleEl ? titleEl.textContent.replace('📊 ', '').replace(' — Results', '') : 'Quiz Results';

    // Find the quiz and its results
    const quiz = allQuizzes.find(q => quizTitle.includes(q.title));
    const quizId = quiz ? quiz.id : null;
    const results = quizId ? allResults.filter(r => r.quizId === quizId) : [];

    if (results.length === 0) {
        firebaseApp.showToast('No results to print', 'error');
        return;
    }

    // Calculate stats
    const avgPct = Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
    const topScore = Math.max(...results.map(r => r.percentage || 0));
    const lowScore = Math.min(...results.map(r => r.percentage || 0));
    const passed = results.filter(r => (r.percentage || 0) >= 75).length;
    const failed = results.length - passed;

    // Sort by score descending
    const sorted = [...results].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));

    // Build print HTML
    const printHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${quizTitle} - Report</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 2rem; color: #333; }
            .header { text-align: center; margin-bottom: 2rem; border-bottom: 2px solid #333; padding-bottom: 1rem; }
            .header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
            .header h2 { font-size: 1.1rem; color: #555; font-weight: normal; }
            .header .date { font-size: 0.85rem; color: #777; margin-top: 0.5rem; }
            .stats { display: flex; justify-content: space-around; margin-bottom: 1.5rem; padding: 1rem; background: #f5f5f5; border-radius: 8px; }
            .stat-box { text-align: center; }
            .stat-box .value { font-size: 1.4rem; font-weight: bold; color: #333; }
            .stat-box .label { font-size: 0.75rem; color: #666; margin-top: 0.15rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th { background: #333; color: white; padding: 0.6rem 0.75rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; }
            td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; font-size: 0.85rem; }
            tr:nth-child(even) { background: #f9f9f9; }
            .pass { color: #2e7d32; font-weight: bold; }
            .fail { color: #c62828; font-weight: bold; }
            .footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #999; border-top: 1px solid #ddd; padding-top: 0.75rem; }
            @media print {
                body { padding: 0.5rem; }
                .stats { background: #f0f0f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                th { background: #333 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>LNHS Learning Management System</h1>
            <h2>${quizTitle}</h2>
            ${quiz ? `<div class="date">Subject: ${quiz.subject || 'N/A'} | Questions: ${quiz.questions ? quiz.questions.length : 'N/A'} | Total Points: ${quiz.totalPoints || 'N/A'}</div>` : ''}
            <div class="date">Report Generated: ${new Date().toLocaleString()}</div>
        </div>

        <div class="stats">
            <div class="stat-box">
                <div class="value">${results.length}</div>
                <div class="label">Submissions</div>
            </div>
            <div class="stat-box">
                <div class="value">${avgPct}%</div>
                <div class="label">Average Score</div>
            </div>
            <div class="stat-box">
                <div class="value">${topScore}%</div>
                <div class="label">Highest Score</div>
            </div>
            <div class="stat-box">
                <div class="value">${lowScore}%</div>
                <div class="label">Lowest Score</div>
            </div>
            <div class="stat-box">
                <div class="value">${passed}</div>
                <div class="label">Passed (≥75%)</div>
            </div>
            <div class="stat-box">
                <div class="value">${failed}</div>
                <div class="label">Failed (<75%)</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Student Name</th>
                    <th>Score</th>
                    <th>Percentage</th>
                    <th>Status</th>
                    <th>Submitted</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map((r, i) => {
        const pct = r.percentage || 0;
        const submitted = r.submittedAt
            ? (r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)).toLocaleString()
            : '—';
        return `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${r.studentName || 'Unknown'}</td>
                        <td>${r.score || 0}/${r.maxScore || 0}</td>
                        <td>${pct}%</td>
                        <td class="${pct >= 75 ? 'pass' : 'fail'}">${pct >= 75 ? 'PASSED' : 'FAILED'}</td>
                        <td>${submitted}</td>
                    </tr>`;
    }).join('')}
            </tbody>
        </table>

        <div class="footer">
            <p>Teacher: ${currentUser.firstName} ${currentUser.lastName} | LNHS LMS Report</p>
        </div>
    </body>
    </html>`;

    // Open print window
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
}

// ========================================
// Initialize
// ========================================

function clearReviewerFile() {
    const input = document.getElementById('quizReviewerFile');
    if (input) input.value = '';
    const info = document.getElementById('reviewerFileInfo');
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
}

function previewReviewerFiles() {
    const input = document.getElementById('quizReviewerFile');
    const info = document.getElementById('reviewerFileInfo');
    if (!input || !info) return;

    const files = Array.from(input.files);
    if (files.length === 0) {
        info.style.display = 'none';
        info.innerHTML = '';
        return;
    }

    if (files.length > 5) {
        firebaseApp.showToast('Maximum 5 files allowed. Please remove some files.', 'error');
        input.value = '';
        info.style.display = 'none';
        return;
    }

    info.style.display = 'block';
    info.innerHTML = files.map((f, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.3rem 0;${i > 0 ? 'border-top:1px solid rgba(255,255,255,0.05);' : ''}">
            <span>📄 ${f.name} <span style="opacity:0.6;">(${(f.size / 1024 / 1024).toFixed(1)}MB)</span></span>
        </div>
    `).join('') + `
        <button type="button" onclick="clearReviewerFile()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.8rem;margin-top:0.35rem;font-weight:600;">✕ Remove All</button>
    `;
}

document.addEventListener('DOMContentLoaded', initDashboard);

// Make functions globally available for onclick handlers
window.openQuizModal = openQuizModal;
window.closeQuizModal = closeQuizModal;
window.addQuestion = addQuestion;
window.removeQuestion = removeQuestion;
window.changeQuestionType = changeQuestionType;
window.saveQuizDraft = saveQuizDraft;
window.saveQuizScheduled = saveQuizScheduled;
window.publishDraft = publishDraft;
window.editQuiz = editQuiz;
window.viewQuizResults = viewQuizResults;
window.deleteQuiz = deleteQuiz;
window.filterStudentsByGrade = filterStudentsByGrade;
window.filterStudentsBySection = filterStudentsBySection;
window.toggleAllStudents = toggleAllStudents;
window.openImportQuizModal = openImportQuizModal;
window.closeImportQuizModal = closeImportQuizModal;
window.importQuizFromFile = importQuizFromFile;
window.downloadQuizTemplate = downloadQuizTemplate;
window.printQuizReport = printQuizReport;
window.clearReviewerFile = clearReviewerFile;
window.previewReviewerFiles = previewReviewerFiles;

// ========================================
// Shared Confirm Modal
// ========================================

/**
 * Show a styled confirmation modal instead of browser confirm().
 * @param {string} title - Modal heading text
 * @param {string} message - Body message
 * @param {Function} onConfirm - Async/sync callback executed on confirm
 * @param {string} [btnLabel='Confirm'] - Label for the confirm button
 * @param {string} [btnGradient] - CSS gradient for confirm button (default red)
 */
function showConfirmModal(title, message, onConfirm, btnLabel = 'Confirm', btnGradient = null) {
    const modal = document.getElementById('confirmModal');
    if (!modal) { if (onConfirm && confirm(message)) onConfirm(); return; }

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;

    const okBtn = document.getElementById('confirmModalOkBtn');
    okBtn.textContent = btnLabel;
    okBtn.style.background = btnGradient || 'linear-gradient(135deg,#ef4444,#b91c1c)';
    okBtn.style.border = 'none';

    const hdr = document.getElementById('confirmModalHeader');
    if (hdr) hdr.style.background = btnGradient || 'linear-gradient(135deg,#ef4444,#b91c1c)';

    // Remove stale listeners
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);
    newBtn.addEventListener('click', async () => {
        closeConfirmModal();
        if (typeof onConfirm === 'function') await onConfirm();
    });

    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('hidden');
}

window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;

