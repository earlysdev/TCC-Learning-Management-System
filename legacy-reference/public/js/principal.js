/**
 * Principal Dashboard Logic
 * FULL SYSTEM ACCESS - Manage all users, view security, configure system
 */

// Protect this page - only principal can access
if (!firebaseApp.protectPage('principal')) {
    // Page will redirect if not authenticated or wrong role
}

const currentUser = firebaseApp.getCurrentUser();

// State
let allUsers = [];
let securityLogs = [];
let activityLogs = [];
let unsubActivityLogs = null;
let notifications = [];
let currentUserFilter = 'all';

// ========================================
// Initialize Dashboard
// ========================================

async function initDashboard() {
    try {
        // Set user info
        if (currentUser) {
            const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
            document.getElementById('principalName').textContent = fullName;
            document.getElementById('userInitials').textContent = `${currentUser.firstName[0]}${currentUser.lastName[0]}`;

            // Update last activity time
            if (currentUser.lastActive) {
                const lastActive = currentUser.lastActive.toDate ? currentUser.lastActive.toDate() : new Date(currentUser.lastActive);
                document.getElementById('lastActivityTime').textContent = formatTimeAgo(lastActive);
            }
        }

        await Promise.all([
            loadAllUsers(),
            loadSecurityLogs(),
            loadNotifications(),
            loadSystemStats(),
            loadQuizzes(),
            loadSystemHealth()
        ]);

        loadPrincipalActivityLogs();

        // Wire activity filter
        const activityFilter = document.getElementById('principalActivityFilter');
        if (activityFilter) {
            activityFilter.addEventListener('change', (e) => {
                renderPrincipalActivityLogs(e.target.value);
            });
        }

        updateOverviewStats();

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        firebaseApp.showToast('Failed to load dashboard data', 'error');
    }
}

// ========================================
// Load Data
// ========================================

async function loadAllUsers() {
    try {
        const snapshot = await firebaseApp.db.collection('users').get();
        // Exclude principal accounts from User Management table
        allUsers = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => u.role !== 'principal');

        renderUsersTable();

    } catch (error) {
        console.error('Error loading users:', error);
    }
}

let unsubSecurityLogs = null;

function loadSecurityLogs() {
    if (unsubSecurityLogs) unsubSecurityLogs();

    unsubSecurityLogs = firebaseApp.db.collection('securityLogs')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            securityLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderSecurityLogs();
            updateSecurityStats();
            renderRecentSecurityEvents();
        }, error => {
            console.error('Error listening to security logs:', error);
        });
}

async function loadNotifications() {
    try {
        const snapshot = await firebaseApp.db.collection('notifications')
            .where('recipientRole', '==', 'principal')
            .orderBy('createdAt', 'desc')
            .get();

        notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderNotifications();
        updateNotificationCount();

    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function loadPrincipalActivityLogs() {
    if (unsubActivityLogs) unsubActivityLogs();

    unsubActivityLogs = firebaseApp.db.collection('activityLogs')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            activityLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Re-render with current filter
            const filterEl = document.getElementById('principalActivityFilter');
            const currentFilter = filterEl ? filterEl.value : 'all';
            renderPrincipalActivityLogs(currentFilter);
        }, error => {
            console.error('Error listening to activity logs:', error);
        });
}

async function loadSystemStats() {
    try {
        const quizzesSnapshot = await firebaseApp.db.collection('quizzes').get();
        document.getElementById('totalQuizzes').textContent = quizzesSnapshot.size;

        const resultsSnapshot = await firebaseApp.db.collection('quizResults').get();
        const results = resultsSnapshot.docs.map(doc => doc.data());

        if (results.length > 0) {
            const avgScore = results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
            document.getElementById('avgScore').textContent = `${avgScore.toFixed(1)}%`;

            const completed = results.length;
            const total = quizzesSnapshot.size * allUsers.filter(u => u.role === 'student').length;
            const completionRate = total > 0 ? (completed / total * 100) : 0;
            document.getElementById('completionRate').textContent = `${completionRate.toFixed(1)}%`;
        }

        // Update analytics section
        if (document.getElementById('analyticsQuizzes')) {
            document.getElementById('analyticsQuizzes').textContent = quizzesSnapshot.size;
        }
        if (document.getElementById('analyticsAvgScore') && results.length > 0) {
            const avgScore = results.reduce((sum, r) => sum + r.percentage, 0) / results.length;
            document.getElementById('analyticsAvgScore').textContent = `${avgScore.toFixed(1)}%`;
        }
        if (document.getElementById('analyticsCompletionRate')) {
            const completed = results.length;
            const total = quizzesSnapshot.size * allUsers.filter(u => u.role === 'student').length;
            const completionRate = total > 0 ? (completed / total * 100) : 0;
            document.getElementById('analyticsCompletionRate').textContent = `${completionRate.toFixed(1)}%`;
        }

        // Count active users
        const activeUsers = allUsers.filter(u => {
            if (!u.lastActive) return false;
            const lastActive = u.lastActive.toDate ? u.lastActive.toDate() : new Date(u.lastActive);
            const daysSince = (new Date() - lastActive) / (1000 * 60 * 60 * 24);
            return daysSince < 7; // Active in last 7 days
        }).length;
        if (document.getElementById('activeUsers')) {
            document.getElementById('activeUsers').textContent = activeUsers;
        }

    } catch (error) {
        console.error('Error loading system stats:', error);
    }
}

// ========================================
// Performance Trends Chart
// ========================================

let principalTrendsChartInstance = null;

async function renderPerformanceTrends() {
    const canvas = document.getElementById('principalPerformanceTrendsChart');
    const emptyMsg = document.getElementById('principalTrendsEmpty');
    if (!canvas) return;

    try {
        const snap = await firebaseApp.db.collection('quizResults').orderBy('submittedAt', 'asc').limit(200).get();
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (results.length === 0) {
            canvas.style.display = 'none';
            if (emptyMsg) emptyMsg.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        if (emptyMsg) emptyMsg.style.display = 'none';

        // Group by week label (e.g. "Feb W1")
        const weekGroups = {};
        results.forEach(r => {
            const date = r.submittedAt ? (r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt)) : new Date();
            const week = Math.ceil(date.getDate() / 7);
            const label = `${date.toLocaleString('en', { month: 'short' })} W${week}`;
            if (!weekGroups[label]) weekGroups[label] = [];
            weekGroups[label].push(r.percentage || 0);
        });

        const labels = Object.keys(weekGroups);
        const avgScores = labels.map(k => Math.round(weekGroups[k].reduce((s, v) => s + v, 0) / weekGroups[k].length));

        if (principalTrendsChartInstance) { principalTrendsChartInstance.destroy(); principalTrendsChartInstance = null; }

        const isDark = !document.body.classList.contains('light-mode');
        const textColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)';
        const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

        principalTrendsChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Avg Score (%)',
                    data: avgScores,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.15)',
                    borderWidth: 3,
                    pointBackgroundColor: '#667eea',
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } },
                    tooltip: {
                        callbacks: { label: ctx => ` Avg: ${ctx.parsed.y}%` }
                    }
                },
                scales: {
                    y: {
                        min: 0, max: 100,
                        ticks: { color: textColor, callback: v => v + '%', stepSize: 20 },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { display: false }
                    }
                }
            }
        });

    } catch (e) {
        console.error('Performance trends chart error:', e);
    }
}

async function loadQuizzes() {
    try {
        const quizzesSnapshot = await firebaseApp.db.collection('quizzes').orderBy('createdAt', 'desc').get();
        allQuizzes = quizzesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderQuizzes(allQuizzes);

    } catch (error) {
        console.error('Error loading quizzes:', error);
    }
}

function renderQuizzes(quizzes, filter = 'all') {
    const container = document.getElementById('quizzesList');

    if (!container) return;

    const now = new Date();
    let filteredQuizzes = quizzes;
    if (filter !== 'all') {
        filteredQuizzes = quizzes.filter(quiz => {
            const deadline = quiz.deadline ? (quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline)) : null;
            if (filter === 'present') {
                return quiz.status === 'active' && deadline && deadline >= now;
            }
            if (filter === 'upcoming') {
                return quiz.status === 'scheduled';
            }
            if (filter === 'past') {
                return (deadline && deadline < now) || quiz.status === 'archived';
            }
            return true;
        });
    }

    if (filteredQuizzes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <h3>No quizzes found</h3>
                <p>No quizzes match the current filter</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredQuizzes.map(quiz => {
        const createdDate = quiz.createdAt ? (quiz.createdAt.toDate ? quiz.createdAt.toDate() : new Date(quiz.createdAt)) : new Date();
        const deadline = quiz.deadline ? (quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline)) : null;
        const isOverdue = deadline && deadline < now && quiz.status === 'active';

        // Determine display status label
        let displayStatus;
        if (isOverdue || (deadline && deadline < now)) {
            displayStatus = 'past';
        } else if (quiz.status === 'scheduled') {
            displayStatus = 'upcoming';
        } else {
            displayStatus = 'present';
        }

        const statusColors = {
            present: 'background:rgba(16,185,129,0.15);color:#10b981;',
            upcoming: 'background:rgba(59,130,246,0.15);color:#3b82f6;',
            past: 'background:rgba(156,163,175,0.15);color:#9ca3af;'
        };

        return `
            <div class="quiz-card ${displayStatus}" style="display:flex;flex-direction:column;">
                <div class="quiz-header">
                    <h3 class="quiz-title">${quiz.title || 'Untitled Quiz'}</h3>
                    <span class="quiz-status" style="${statusColors[displayStatus] || ''} padding:0.25rem 0.75rem;border-radius:20px;font-size:0.75rem;font-weight:600;text-transform:capitalize;">${displayStatus}</span>
                </div>
                <p class="quiz-description" style="margin-bottom:1rem;">${quiz.description || 'No description'}</p>
                <div class="quiz-meta" style="text-align:center;justify-content:center;margin-bottom:1rem;">
                    <div class="quiz-meta-item">
                        <span>📝 Questions:</span> ${quiz.questions?.length || 0}
                    </div>
                    <div class="quiz-meta-item">
                        <span>👤 Created by:</span> ${quiz.createdByName || 'Unknown'}
                    </div>
                    <div class="quiz-meta-item">
                        <span>📅 Created:</span> ${createdDate.toLocaleDateString()}
                    </div>
                    ${deadline ? `
                        <div class="quiz-meta-item">
                            <span>⏰ Deadline:</span> ${deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    ` : ''}
                </div>
                <div class="quiz-actions" style="margin-top:auto;text-align:center;">
                    <button class="btn btn-outline btn-sm" onclick="viewQuizDetails('${quiz.id}')">
                        👁️ View Details
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function viewQuizDetails(quizId) {
    const quiz = allQuizzes.find(q => q.id === quizId);
    if (!quiz) { firebaseApp.showToast('Quiz not found', 'error'); return; }

    // Remove stale modal
    const oldModal = document.getElementById('principalQuizDetailsModal');
    if (oldModal) oldModal.remove();

    // Fetch submissions for this quiz
    let submissions = [];
    try {
        const snap = await firebaseApp.db.collection('quizResults').where('quizId', '==', quizId).get();
        submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* continue without results */ }

    const createdDate = quiz.createdAt ? (quiz.createdAt.toDate ? quiz.createdAt.toDate() : new Date(quiz.createdAt)).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    const deadline = quiz.deadline ? (quiz.deadline.toDate ? quiz.deadline.toDate() : new Date(quiz.deadline)).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No deadline';
    const avgPct = submissions.length ? Math.round(submissions.reduce((s, r) => s + (r.percentage || 0), 0) / submissions.length) : null;
    const assignType = quiz.assignmentType === 'section' ? `Grade ${quiz.assignedGrade} – Sec. ${quiz.assignedSectionName}` : quiz.assignmentType === 'individual' ? 'Individual Students' : 'All Students';

    const modal = document.createElement('div');
    modal.id = 'principalQuizDetailsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.innerHTML = `
        <div style="background:var(--card-bg,#1a1a3e);border-radius:20px;padding:0;width:100%;max-width:700px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 32px 64px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.12);">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.75rem 2rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.1);">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                        <span style="font-size:1.5rem;">📝</span>
                        <h2 style="font-size:1.3rem;font-weight:700;color:#fff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${quiz.title || 'Untitled Quiz'}</h2>
                    </div>
                    <p style="color:rgba(255,255,255,0.6);margin:0;font-size:0.85rem;">${quiz.description || 'No description provided'}</p>
                </div>
                <button onclick="document.getElementById('principalQuizDetailsModal').remove()" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);border-radius:8px;width:36px;height:36px;cursor:pointer;font-size:1.1rem;flex-shrink:0;margin-left:1rem;">✕</button>
            </div>

            <!-- Scrollable Body -->
            <div style="flex:1;overflow-y:auto;padding:1.5rem 2rem;">

                <!-- Info Grid -->
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
                    ${[
            ['👨‍🏫 Created By', quiz.createdByName || 'Unknown Teacher'],
            ['📅 Created', createdDate],
            ['⏰ Deadline', deadline],
            ['🎯 Questions', quiz.totalQuestions || quiz.questions?.length || 0],
            ['💯 Total Points', quiz.totalPoints || 0],
            ['🏫 Assigned To', assignType],
            ['📊 Submissions', submissions.length],
            ['📈 Avg Score', avgPct !== null ? `${avgPct}%` : 'No data'],
        ].map(([label, val]) => `
                        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:1rem;">
                            <div style="font-size:0.72rem;color:rgba(255,255,255,0.5);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.35rem;">${label}</div>
                            <div style="font-size:0.95rem;color:#fff;font-weight:600;">${val}</div>
                        </div>
                    `).join('')}
                </div>

                <!-- Questions -->
                <div style="margin-bottom:1.5rem;">
                    <h3 style="font-size:1rem;font-weight:700;color:#fff;margin:0 0 0.75rem;display:flex;align-items:center;gap:0.5rem;">📋 Questions <span style="font-size:0.8rem;color:rgba(255,255,255,0.4);font-weight:400;">(${quiz.questions?.length || 0} total)</span></h3>
                    <div style="display:flex;flex-direction:column;gap:0.5rem;">
                        ${(quiz.questions || []).slice(0, 10).map((q, i) => `
                            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:0.75rem 1rem;display:flex;align-items:flex-start;gap:0.75rem;">
                                <span style="background:rgba(102,126,234,0.3);color:#a5b4fc;border-radius:6px;padding:0.2rem 0.55rem;font-size:0.75rem;font-weight:700;flex-shrink:0;">${i + 1}</span>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:0.9rem;color:rgba(255,255,255,0.9);">${q.question}</div>
                                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-top:0.25rem;">${q.type?.replace(/-/g, ' ') || 'multiple-choice'} · ${q.points || 1} pt${(q.points || 1) !== 1 ? 's' : ''}</div>
                                </div>
                            </div>
                        `).join('')}
                        ${(quiz.questions?.length || 0) > 10 ? `<div style="text-align:center;color:rgba(255,255,255,0.4);font-size:0.82rem;padding:0.5rem;">… and ${quiz.questions.length - 10} more questions</div>` : ''}
                        ${!quiz.questions?.length ? '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:1rem;">No questions found</div>' : ''}
                    </div>
                </div>

                <!-- Submissions -->
                <div>
                    <h3 style="font-size:1rem;font-weight:700;color:#fff;margin:0 0 0.75rem;display:flex;align-items:center;gap:0.5rem;">👥 Student Submissions <span style="font-size:0.8rem;color:rgba(255,255,255,0.4);font-weight:400;">(${submissions.length})</span></h3>
                    ${submissions.length === 0 ? `
                        <div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.4);">
                            <div style="font-size:2rem;margin-bottom:0.5rem;">📭</div>
                            <p style="margin:0;">No submissions yet</p>
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:0.4rem;">
                            ${submissions.sort((a, b) => (b.percentage || 0) - (a.percentage || 0)).map(s => {
            const pct = Math.round(s.percentage || 0);
            const color = pct >= 80 ? '#34d399' : pct >= 60 ? '#60a5fa' : pct >= 50 ? '#fbbf24' : '#f87171';
            return `
                                    <div style="display:flex;align-items:center;gap:1rem;background:rgba(255,255,255,0.04);border-radius:8px;padding:0.6rem 0.875rem;">
                                        <div style="flex:1;font-size:0.9rem;color:rgba(255,255,255,0.85);">${s.studentName || 'Unknown Student'}</div>
                                        <div style="font-size:0.85rem;color:rgba(255,255,255,0.5);">${s.score || 0}/${s.totalPoints || quiz.totalPoints || '?'}</div>
                                        <div style="font-weight:700;color:${color};min-width:42px;text-align:right;">${pct}%</div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;

    // Close on overlay click
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}


// ========================================
// Update Stats
// ========================================

function updateOverviewStats() {
    const students = allUsers.filter(u => u.role === 'student');
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const unresolvedSecurity = securityLogs.filter(log => !log.resolved);

    document.getElementById('totalStudents').textContent = students.length;
    document.getElementById('totalTeachers').textContent = teachers.length;
    document.getElementById('securityAlerts').textContent = unresolvedSecurity.length;
}

function updateSecurityStats() {
    const critical = securityLogs.filter(log => log.severity === 'critical').length;
    const high = securityLogs.filter(log => log.severity === 'high').length;
    const medium = securityLogs.filter(log => log.severity === 'medium').length;
    const low = securityLogs.filter(log => log.severity === 'low').length;

    document.getElementById('criticalCount').textContent = critical;
    document.getElementById('highCount').textContent = high;
    document.getElementById('mediumCount').textContent = medium;
    document.getElementById('lowCount').textContent = low;
}

function updateNotificationCount() {
    const unread = notifications.filter(n => !n.isRead).length;
    const badge = document.getElementById('notifCount');
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

// ========================================
// Render Functions
// ========================================

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');

    let filteredUsers = allUsers;
    if (currentUserFilter !== 'all') {
        filteredUsers = allUsers.filter(u => u.role === currentUserFilter);
    }

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3rem; color: var(--gray-500);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
                    <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">No Users Found</div>
                    <div style="font-size: 0.875rem;">Try adjusting your filters or create a new user</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredUsers.map(user => {
        const initials = (user.firstName?.[0] || '') + (user.lastName?.[0] || '');
        const isActive = user.isActive !== false;
        const lastActive = user.lastActive
            ? formatTimeAgo(user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive))
            : 'Never';

        const statusStyle = isActive
            ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);'
            : 'background:rgba(156,163,175,0.15);color:#9ca3af;border:1px solid rgba(156,163,175,0.3);';

        return `
        <tr data-user-id="${user.id}" data-user-name="${user.firstName} ${user.lastName}" data-user-email="${user.email}" data-user-status="${isActive ? 'active' : 'inactive'}" style="vertical-align:middle;">
            <td style="min-width:180px;">
                <div style="display:flex;align-items:center;gap:0.625rem;">
                    <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary-500),var(--primary-600));display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.8rem;">${initials}</div>
                    <div style="min-width:0;">
                        <div class="user-name-text" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.firstName} ${user.lastName}</div>
                        ${user.lrn ? `<div class="user-meta-text" style="font-size:0.72rem;">LRN: ${user.lrn}</div>` : ''}
                    </div>
                </div>
            </td>
            <td class="user-email-text" style="font-size:0.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">${user.email}</td>
            <td style="text-align:center;"><span class="role-badge ${user.role}" style="text-transform:capitalize;white-space:nowrap;">${user.role}</span></td>
            <td style="text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:0.3rem;${statusStyle}font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.3rem 0.65rem;border-radius:99px;white-space:nowrap;letter-spacing:0.03em;">${isActive ? '●' : '○'} ${isActive ? 'Active' : 'Inactive'}</span>
            </td>
            <td class="user-email-text" style="font-size:0.85rem;text-align:center;white-space:nowrap;">${user.schoolYear || 'N/A'}</td>
            <td class="user-meta-text" style="font-size:0.82rem;white-space:nowrap;text-align:center;">${lastActive}</td>
            <td>
                <div style="display:flex;flex-direction:column;gap:0.3rem;align-items:flex-start;">
                    <button class="table-action-btn edit" onclick="editUser('${user.id}')" style="white-space:nowrap;width:100%;">✏️ Edit</button>
                    <button class="table-action-btn ${isActive ? 'deactivate' : 'activate'}" onclick="toggleUserStatus('${user.id}', ${!isActive})" style="white-space:nowrap;width:100%;">${isActive ? '🔒 Deactivate' : '🔓 Activate'}</button>
                    <button class="table-action-btn delete" onclick="deleteUser('${user.id}')" style="white-space:nowrap;width:100%;">🗑️ Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}


// Filter users table based on search and status
function filterUsersTable() {
    const searchInput = document.getElementById('userSearchInput');
    const statusFilter = document.getElementById('userStatusFilter');

    if (!searchInput || !statusFilter) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const statusValue = statusFilter.value;

    const rows = document.querySelectorAll('#usersTableBody tr');

    rows.forEach(row => {
        const userName = row.dataset.userName?.toLowerCase() || '';
        const userEmail = row.dataset.userEmail?.toLowerCase() || '';
        const userStatus = row.dataset.userStatus || '';
        const userSchoolYear = row.cells[4]?.textContent || ''; // SY column

        const syFilter = document.getElementById('userSchoolYearFilter')?.value || 'all';

        // Check search match
        const searchMatch = !searchTerm ||
            userName.includes(searchTerm) ||
            userEmail.includes(searchTerm);

        // Check status match
        const statusMatch = statusValue === 'all' || userStatus === statusValue;

        // Check SY match
        const syMatch = syFilter === 'all' || userSchoolYear.includes(syFilter);

        // Show/hide row
        if (searchMatch && statusMatch && syMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function renderSecurityLogs() {
    const container = document.getElementById('securityLogsList');
    if (!container) return;

    if (securityLogs.length === 0) {
        container.innerHTML = '<p>No security logs found</p>';
        return;
    }

    container.innerHTML = securityLogs.map(log => {
        const dateStr = log.timestamp
            ? (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';

        return `
        <div class="security-log-item ${log.severity}" style="margin-bottom:0.75rem;">
            <div class="log-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span class="log-severity ${log.severity}" style="text-transform:uppercase;font-weight:700;font-size:0.75rem;">${log.severity}</span>
                <span style="font-size:0.8rem;color:var(--gray-400);">${formatTimeAgo(log.timestamp)} · ${dateStr}</span>
            </div>
            <div class="log-description" style="margin-bottom:0.5rem;color:var(--gray-200);">${log.description}</div>
            <div class="log-meta" style="display:flex;gap:1rem;font-size:0.8rem;color:var(--gray-400);">
                <span>👤 ${log.userName || 'Unknown'}</span>
                <span>🏷️ ${log.type}</span>
            </div>
            ${!log.resolved ? `
                <div class="log-actions" style="margin-top:0.5rem;">
                    <button class="btn btn-sm btn-primary" onclick="resolveSecurityLog('${log.id}')">
                        Mark as Resolved
                    </button>
                </div>
            ` : '<div class="log-meta" style="margin-top:0.5rem;"><span>✅ Resolved</span></div>'}
        </div>
        `;
    }).join('');
}

function renderPrincipalActivityLogs(filter = 'all') {
    const listEl = document.getElementById('principalActivityLogsList');
    if (!listEl) return;

    if (activityLogs.length === 0) {
        listEl.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:2rem;">No system activity recorded yet.</p>';
        return;
    }

    let filteredLogs = activityLogs;
    if (filter === 'login') {
        filteredLogs = activityLogs.filter(log => log.type === 'login' || log.type === 'logout' || log.action?.includes('log'));
    } else if (filter === 'quiz') {
        filteredLogs = activityLogs.filter(log => log.type === 'quiz_start' || log.type === 'quiz_taken' || log.type === 'quiz' || log.action?.includes('quiz'));
    } else if (filter === 'user_management') {
        filteredLogs = activityLogs.filter(log => log.type === 'user_created' || log.type === 'user_updated' || log.type === 'user_deleted' || log.action?.includes('user'));
    }

    if (filteredLogs.length === 0) {
        listEl.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:2rem;">No system activity matches the current filter.</p>';
        return;
    }

    listEl.innerHTML = filteredLogs.map(log => {
        const time = log.timestamp ? firebaseApp.formatDateTime(log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)) : 'Unknown time';

        // Icon and styling mapping based on log.type/action
        let icon = '📝';
        let bgStyle = 'background: rgba(255,255,255,0.05);';

        const typeStr = (log.type || log.action || '').toLowerCase();

        if (typeStr.includes('log')) {
            icon = typeStr.includes('in') ? '🔑' : '🚪';
            bgStyle = 'background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6;';
        } else if (typeStr.includes('quiz')) {
            icon = '📋';
            bgStyle = 'background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981;';
        } else if (typeStr.includes('user')) {
            icon = '👤';
            bgStyle = 'background: rgba(139, 92, 246, 0.1); border-left: 3px solid #8b5cf6;';
        }

        let detailsString = log.details || '';
        if (typeof detailsString === 'object') {
            detailsString = JSON.stringify(detailsString);
        }

        const details = detailsString ? `<div style="font-size: 0.8rem; color: var(--gray-400); margin-top: 0.25rem;">${detailsString}</div>` : '';
        const userStr = log.userName || log.userEmail || log.userId || 'System';

        return `
            <div style="padding: 1rem; margin-bottom: 0.5rem; border-radius: 8px; ${bgStyle}">
                <div style="display: flex; gap: 1rem; align-items: flex-start;">
                    <div style="font-size: 1.5rem;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <strong style="color: white; font-size: 0.95rem;">${log.action || log.type || 'System Action'}</strong>
                            <span style="font-size: 0.8rem; color: var(--gray-400);">${time}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: var(--gray-300);">User: ${userStr}</div>
                        ${details}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentSecurityEvents() {
    const container = document.getElementById('recentSecurityEvents');
    const recentLogs = securityLogs.slice(0, 5);

    if (recentLogs.length === 0) {
        container.innerHTML = '<p>No recent security events</p>';
        return;
    }

    container.innerHTML = recentLogs.map(log => `
        <div class="security-event ${log.severity}">
            <div class="event-title">${log.type.replace(/_/g, ' ').toUpperCase()}</div>
            <div class="event-description">${log.description}</div>
            <div class="event-time">${formatTimeAgo(log.timestamp)}</div>
        </div>
    `).join('');
}

function renderNotifications() {
    const container = document.getElementById('notificationsList');

    if (notifications.length === 0) {
        container.innerHTML = '<p>No notifications</p>';
        return;
    }

    container.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.isRead ? '' : 'unread'}" onclick="markNotificationAsRead('${notif.id}')">
            <div class="notification-header">
                <span class="notification-title">${notif.title}</span>
                <span class="notification-time">${formatTimeAgo(notif.createdAt)}</span>
            </div>
            <div class="notification-message">${notif.message}</div>
        </div>
    `).join('');
}

// ========================================
// User Management
// ========================================

function createUser() {
    // Open the principal create account modal
    const modal = document.getElementById('principalCreateAccountModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

window.closePrincipalCreateModal = function () {
    const modal = document.getElementById('principalCreateAccountModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('principalCreateUserForm');
    if (form) form.reset();
    // Hide student-specific fields
    ['pLrnGroup', 'pGradeGroup', 'pSectionGroup', 'pSchoolYearGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.closePrincipalAccountModal = function () {
    const modal = document.getElementById('principalAccountCreatedModal');
    if (modal) modal.classList.add('hidden');
};

window.principalGeneratePassword = function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    const el = document.getElementById('pUserPassword');
    if (el) el.value = pwd;
};

let principalLastCreatedCredentials = null;

window.principalCopyCredentials = function () {
    if (!principalLastCreatedCredentials) return;
    const c = principalLastCreatedCredentials;
    const text = `Name: ${c.name}\nRole: ${c.role}\nEmail: ${c.email}\nPassword: ${c.password}${c.lrn ? '\nLRN: ' + c.lrn : ''}`;
    navigator.clipboard.writeText(text).then(() => {
        firebaseApp.showToast('📋 Credentials copied to clipboard!', 'success');
    }).catch(() => firebaseApp.showToast('Failed to copy', 'error'));
};

// Principal create account — role change handler
document.addEventListener('DOMContentLoaded', () => {
    const roleSelect = document.getElementById('pUserRole');
    if (roleSelect) {
        roleSelect.addEventListener('change', function () {
            const isStudent = this.value === 'student';
            ['pLrnGroup', 'pGradeGroup', 'pSectionGroup', 'pSchoolYearGroup'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = isStudent ? 'block' : 'none';
            });
        });
    }

    const createForm = document.getElementById('principalCreateUserForm');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const role = document.getElementById('pUserRole').value;
            const firstName = document.getElementById('pUserFirstName').value.trim();
            const middleInitial = (document.getElementById('pUserMiddleInitial')?.value || '').trim();
            const lastName = document.getElementById('pUserLastName').value.trim();
            const email = document.getElementById('pUserEmail').value.trim();
            const password = document.getElementById('pUserPassword').value;

            if (!role || !firstName || !lastName || !email || !password) {
                firebaseApp.showToast('Please fill in all required fields.', 'error');
                return;
            }

            try {
                let secondaryApp;
                try {
                    secondaryApp = firebase.app('accountCreator');
                } catch (e) {
                    secondaryApp = firebase.initializeApp(firebase.app().options, 'accountCreator');
                }
                const secondaryAuth = secondaryApp.auth();
                const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                const uid = userCredential.user.uid;
                await secondaryAuth.signOut();

                const userData = {
                    uid, email, firstName, lastName, role,
                    isActive: true,
                    emailVerified: false,
                    settings: { darkMode: false, notifications: true, language: 'English' },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: firebase.auth().currentUser?.uid || 'principal',
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (middleInitial) userData.middleInitial = middleInitial;
                if (role === 'student') {
                    userData.schoolYear = document.getElementById('pUserSchoolYear').value;
                    const lrn = document.getElementById('pUserLRN').value.trim();
                    userData.lrn = lrn;
                    userData.grade = document.getElementById('pUserGrade').value;
                    userData.section = document.getElementById('pUserSection').value.trim();
                    if (lrn) await firebaseApp.db.collection('lrnMapping').doc(lrn).set({ email });
                }

                await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).set(userData);
                firebaseApp.showToast(`✅ ${role.charAt(0).toUpperCase() + role.slice(1)} account created!`, 'success');

                principalLastCreatedCredentials = {
                    name: middleInitial ? `${firstName} ${middleInitial}. ${lastName}` : `${firstName} ${lastName}`,
                    role, email, password,
                    lrn: role === 'student' ? document.getElementById('pUserLRN').value.trim() : null
                };

                // Log activity
                try {
                    if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                        await activityTracker.logActivity('user_created', {
                            createdUserId: uid,
                            createdUserRole: role,
                            createdUserName: principalLastCreatedCredentials.name
                        });
                    }
                } catch (logError) {
                    console.warn('Activity log failed (non-critical):', logError);
                }

                closePrincipalCreateModal();

                // Show credentials modal
                const c = principalLastCreatedCredentials;
                const credModal = document.getElementById('principalAccountCreatedModal');
                document.getElementById('pCredName').textContent = c.name;
                document.getElementById('pCredRole').textContent = c.role;
                document.getElementById('pCredEmail').textContent = c.email;
                document.getElementById('pCredPassword').textContent = c.password;
                const lrnRow = document.getElementById('pCredLRNRow');
                if (c.lrn) {
                    document.getElementById('pCredLRN').textContent = c.lrn;
                    lrnRow.style.display = 'block';
                } else {
                    lrnRow.style.display = 'none';
                }
                credModal.classList.remove('hidden');

                // Refresh users list
                if (typeof loadAllUsers === 'function') loadAllUsers();

            } catch (error) {
                console.error('Create user error:', error);
                if (error.code === 'auth/email-already-in-use') {
                    firebaseApp.showToast('This email is already registered.', 'error');
                } else {
                    firebaseApp.showToast('Failed to create account. Please try again.', 'error');
                }
            }
        });
    }
});

function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    alert(`Edit user: ${user.firstName} ${user.lastName}\n\nEdit form will be implemented here`);
}

async function toggleUserStatus(userId, newStatus) {
    try {
        const user = allUsers.find(u => u.id === userId);
        const action = newStatus ? 'activate' : 'deactivate';

        if (!confirm(`Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`)) return;

        await firebaseApp.db.collection('users').doc(userId).update({
            isActive: newStatus
        });

        if (window.activityTracker) {
            await activityTracker.logActivity('user_status_change', {
                targetUserId: userId,
                newStatus: newStatus ? 'active' : 'inactive'
            });
        }

        firebaseApp.showToast(`User ${action}d successfully`, 'success');
        await loadAllUsers();
        updateOverviewStats();

    } catch (error) {
        console.error('Error toggling user status:', error);
        firebaseApp.showToast('Failed to update user status', 'error');
    }
}

async function deleteUser(userId) {
    try {
        const user = allUsers.find(u => u.id === userId);

        if (!confirm(`⚠️ WARNING: Delete ${user.firstName} ${user.lastName}?\n\nThis action CANNOT be undone!`)) return;

        await firebaseApp.db.collection('users').doc(userId).delete();

        if (window.activityTracker) {
            await activityTracker.logActivity('user_deleted', {
                deletedUserId: userId,
                deletedUserName: `${user.firstName} ${user.lastName}`
            });
        }

        firebaseApp.showToast('User deleted successfully', 'success');
        await loadAllUsers();
        updateOverviewStats();

    } catch (error) {
        console.error('Error deleting user:', error);
        firebaseApp.showToast('Failed to delete user', 'error');
    }
}

// ========================================
// Security Management
// ========================================

async function resolveSecurityLog(logId) {
    try {
        await firebaseApp.db.collection('securityLogs').doc(logId).update({
            resolved: true,
            resolvedBy: currentUser.uid,
            resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        firebaseApp.showToast('Security log marked as resolved', 'success');
        await loadSecurityLogs();

    } catch (error) {
        console.error('Error resolving security log:', error);
        firebaseApp.showToast('Failed to resolve security log', 'error');
    }
}

// ========================================
// Notifications
// ========================================

async function markNotificationAsRead(notifId) {
    try {
        await firebaseApp.db.collection('notifications').doc(notifId).update({
            isRead: true,
            readAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await loadNotifications();

    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        const batch = firebaseApp.db.batch();
        notifications.filter(n => !n.isRead).forEach(notif => {
            const ref = firebaseApp.db.collection('notifications').doc(notif.id);
            batch.update(ref, {
                isRead: true,
                readAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        firebaseApp.showToast('All notifications marked as read', 'success');
        await loadNotifications();

    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

// ========================================
// Settings
// ========================================

function saveSettings() {
    const schoolName = document.getElementById('schoolName').value;
    const systemEmail = document.getElementById('systemEmail').value;

    firebaseApp.showToast('Settings saved successfully!', 'success');
}

function saveSecuritySettings() {
    const sessionTimeout = document.getElementById('sessionTimeout').value;
    const maxLoginAttempts = document.getElementById('maxLoginAttempts').value;

    firebaseApp.showToast('Security settings saved successfully!', 'success');
}

// ========================================
// Global Activity Logs (Principal View)
// ========================================

let unsubAllActivityLogs = null;

function loadAllActivityLogs() {
    const container = document.getElementById('principalActivityLogsList');
    if (!container) return;

    // Clean up previous listener
    if (unsubAllActivityLogs) unsubAllActivityLogs();

    container.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--gray-400);">Loading activity logs…</p>';

    const filter = document.getElementById('principalActivityFilter')?.value || 'all';

    unsubAllActivityLogs = firebaseApp.db.collection('activityLogs')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderActivityLogs(logs, filter);
        }, error => {
            console.error('Error listening to activity logs:', error);
            container.innerHTML = '<p style="color:#ef4444;text-align:center;padding:2rem;">Failed to load activity logs.</p>';
        });
}

function renderActivityLogs(logs, filter = 'all') {
    const container = document.getElementById('principalActivityLogsList');
    if (!container) return;

    let filteredLogs = logs;
    if (filter !== 'all') {
        filteredLogs = logs.filter(log => {
            const action = log.action || log.type || '';
            if (filter === 'login') return action === 'login' || action === 'logout';
            if (filter === 'quiz') return action.startsWith('quiz_');
            if (filter === 'user_management') return action.startsWith('user_');
            return true;
        });
    }

    if (filteredLogs.length === 0) {
        container.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 2rem;">No logs found for this filter.</p>';
        return;
    }

    container.innerHTML = filteredLogs.map(log => {
        const date = log.timestamp ? (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)) : new Date();
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const logAction = log.action || log.type || '';
        const icon = logAction.startsWith('quiz_') ? '📝' : logAction.startsWith('user_') ? '👥' : '🔑';
        const color = logAction === 'login' ? '#10b981' : logAction === 'logout' ? '#f59e0b' : '#3b82f6';
        const roleColors = { student: '#3b82f6', teacher: '#10b981', secretary: '#f59e0b', principal: '#8b5cf6', developer: '#ef4444' };
        const userRole = log.role || '';
        const roleColor = roleColors[userRole] || '#6b7280';

        return `
            <div class="log-item" style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: flex-start;">
                <div style="background: ${color}20; color: ${color}; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ${icon}
                </div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; align-items: center; flex-wrap: wrap; gap: 0.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <strong style="color: var(--gray-100); font-size: 0.9rem;">${log.userName || 'System'}</strong>
                            ${userRole ? `<span style="background:${roleColor}20;color:${roleColor};font-size:0.65rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:20px;text-transform:capitalize;">${userRole}</span>` : ''}
                        </div>
                        <span style="font-size: 0.75rem; color: var(--gray-500);">${formatTimeAgo(date)} · ${dateStr}</span>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--gray-400); margin: 0;">${log.description || (log.action || log.type || 'Activity').replace(/_/g, ' ')}</p>
                    ${log.metadata ? `<div style="font-size: 0.7rem; color: var(--gray-600); margin-top: 0.4rem; padding: 0.4rem; background: rgba(0,0,0,0.1); border-radius: 4px;">${JSON.stringify(log.metadata)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// System Health (moved from Secretary)
// ========================================

async function loadSystemHealth() {
    try {
        const collectionNames = ['users', 'quizzes', 'quizResults', 'activityLogs', 'securityLogs', 'sessions', 'notifications'];
        let totalDocs = 0;
        let collectionSizes = {};

        for (const col of collectionNames) {
            try {
                const snap = await firebaseApp.db.collection(col).get();
                collectionSizes[col] = snap.size;
                totalDocs += snap.size;
            } catch (e) { collectionSizes[col] = 0; }
        }

        // Active sessions in last 30 minutes
        let activeSessions = 0;
        try {
            const sessSnap = await firebaseApp.db.collection('sessions')
                .where('isActive', '==', true)
                .get();
            activeSessions = sessSnap.size;
        } catch (e) { /* sessions collection may not exist */ }

        // Estimate storage usage (rough KB per doc per collection)
        const kbPerDoc = {
            users: 1.0,
            quizzes: 2.0,
            quizResults: 0.5,
            activityLogs: 0.2,
            securityLogs: 0.3,
            sessions: 0.15,
            notifications: 0.2
        };
        let totalKB = 0;
        for (const col of collectionNames) {
            totalKB += (collectionSizes[col] || 0) * (kbPerDoc[col] || 0.3);
        }
        const totalMB = totalKB / 1024;

        // Update stat cards
        const docCountEl = document.getElementById('healthDocCount');
        const activeSessionsEl = document.getElementById('healthActiveSessions');
        const documentCountEl = document.getElementById('healthDocumentCount');
        const collectionCountEl = document.getElementById('healthCollectionCount');
        const currentSessionsEl = document.getElementById('healthCurrentSessions');
        const peakSessionsEl = document.getElementById('healthPeakSessions');
        const storageUsedEl = document.getElementById('healthStorageUsed');

        if (docCountEl) docCountEl.textContent = totalDocs.toLocaleString();
        if (activeSessionsEl) activeSessionsEl.textContent = activeSessions;
        if (documentCountEl) documentCountEl.textContent = totalDocs.toLocaleString();
        if (collectionCountEl) collectionCountEl.textContent = collectionNames.length;
        if (currentSessionsEl) currentSessionsEl.textContent = activeSessions;
        if (peakSessionsEl) peakSessionsEl.textContent = activeSessions; // approximation
        if (storageUsedEl) storageUsedEl.textContent = totalMB >= 1 ? totalMB.toFixed(1) + ' MB' : (totalKB).toFixed(0) + ' KB';

    } catch (error) {
        console.error('Error loading system health:', error);
    }
}

// ========================================
// Navigation
// ========================================

let allQuizzes = [];

const sections = {
    overview: document.getElementById('overviewSection'),
    users: document.getElementById('usersSection'),
    quizzes: document.getElementById('quizzesSection'),
    security: document.getElementById('securitySection'),
    analytics: document.getElementById('analyticsSection'),
    settings: document.getElementById('settingsSection'),
    health: document.getElementById('healthSection'),
    activity: document.getElementById('activitySection'),
    'student-records': document.getElementById('studentRecordsSection'),
    'school-year': document.getElementById('schoolYearSection'),
    'graduated': document.getElementById('pGraduatedSection')
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionName = item.dataset.section;

        // Settings opens the shared modal instead of the inline section
        if (sectionName === 'settings') {
            if (typeof openSettingsModal === 'function') openSettingsModal();
            return;
        }

        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        // Hide all sections first
        Object.values(sections).forEach(section => {
            if (section) section.classList.add('hidden');
        });

        // Show the selected section
        if (sections[sectionName]) {
            sections[sectionName].classList.remove('hidden');
        }

        if (sectionName === 'activity') {
            loadAllActivityLogs();
        }
        if (sectionName === 'analytics') {
            renderPerformanceTrends();
        }
        if (sectionName === 'health') {
            loadSystemHealth();
        }
        if (sectionName === 'student-records') {
            renderPrincipalStudentRecords();
        }
        if (sectionName === 'school-year') {
            pLoadCurrentSchoolYear();
        }
        if (sectionName === 'graduated') {
            renderPrincipalGraduatedStudents();
        }
    });
});

// Filter tabs - User Management
document.querySelectorAll('.tab-btn[data-role]').forEach(btn => {
    btn.addEventListener('click', () => {
        currentUserFilter = btn.dataset.role;
        document.querySelectorAll('.tab-btn[data-role]').forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');
        renderUsersTable();
    });
});

// Filter tabs - Quiz Management
document.querySelectorAll('.tab-btn[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        document.querySelectorAll('.tab-btn[data-status]').forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');
        renderQuizzes(allQuizzes, status);
    });
});

// ========================================
// Helper Functions
// ========================================

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

// ========================================
// Logout
// ========================================

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        localStorage.setItem('lnhs-logout-reason', 'manual');
        await firebaseApp.auth.signOut();
        window.location.href = firebaseApp.getRoute('login');
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// ========================================
// Account Settings Modal
// ========================================

function openAccountSettingsModal() {
    // Populate account info
    if (currentUser) {
        const nameEl = document.getElementById('acctSettingsFullName');
        const emailEl = document.getElementById('acctSettingsEmail');
        const roleEl = document.getElementById('acctSettingsRole');
        const dateEl = document.getElementById('acctSettingsDateCreated');

        if (nameEl) nameEl.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        if (emailEl) emailEl.textContent = currentUser.email || '—';
        if (roleEl) roleEl.textContent = '🏢 Principal';
        if (dateEl) {
            if (currentUser.createdAt) {
                try {
                    const date = currentUser.createdAt.toDate ? currentUser.createdAt.toDate() : new Date(currentUser.createdAt);
                    dateEl.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                } catch (e) { dateEl.textContent = '—'; }
            }
        }
    }

    const modal = document.getElementById('accountSettingsModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAccountSettingsModal() {
    const modal = document.getElementById('accountSettingsModal');
    if (modal) modal.classList.add('hidden');
    ['acctCurrentPassword', 'acctNewPassword', 'acctConfirmPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function changeAccountPassword() {
    const currentPwd = document.getElementById('acctCurrentPassword')?.value;
    const newPwd = document.getElementById('acctNewPassword')?.value;
    const confirmPwd = document.getElementById('acctConfirmPassword')?.value;

    if (!currentPwd || !newPwd || !confirmPwd) {
        firebaseApp.showToast('Please fill in all password fields', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        firebaseApp.showToast('New passwords do not match', 'error');
        return;
    }
    if (newPwd.length < 6) {
        firebaseApp.showToast('New password must be at least 6 characters', 'error');
        return;
    }

    try {
        const user = firebaseApp.auth.currentUser;
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPwd);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPwd);
        firebaseApp.showToast('🔐 Password updated successfully!', 'success');
        closeAccountSettingsModal();
    } catch (error) {
        console.error('Password change error:', error);
        if (error.code === 'auth/wrong-password') {
            firebaseApp.showToast('Current password is incorrect', 'error');
        } else {
            firebaseApp.showToast('Failed to update password: ' + error.message, 'error');
        }
    }
}

// Settings modal button
const settingsModalBtn = document.getElementById('settingsModalBtn');
if (settingsModalBtn) {
    settingsModalBtn.addEventListener('click', openAccountSettingsModal);
}

// ========================================
// Student Records by SY-Section (Principal)
// ========================================

function renderPrincipalStudentRecords() {
    const syFilter = document.getElementById('pSrSchoolYearFilter')?.value || 'all';
    const gradeFilter = document.getElementById('pSrGradeFilter')?.value || 'all';
    const sectionFilter = document.getElementById('pSrSectionFilter')?.value || 'all';
    const searchQuery = (document.getElementById('pSrSearchInput')?.value || '').toLowerCase().trim();

    // Filter only students (exclude Graduated)
    let students = allUsers.filter(u => u.role === 'student' && String(u.gradeLevel || u.grade || '') !== 'Graduated');

    if (syFilter !== 'all') students = students.filter(s => s.schoolYear === syFilter);
    if (gradeFilter !== 'all') students = students.filter(s => String(s.gradeLevel || s.grade || '') === gradeFilter);
    if (sectionFilter !== 'all') students = students.filter(s => s.section === sectionFilter);
    if (searchQuery) {
        students = students.filter(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            return name.includes(searchQuery) || (s.lrn || '').toLowerCase().includes(searchQuery);
        });
    }

    // Populate SY dropdown dynamically
    const sySelect = document.getElementById('pSrSchoolYearFilter');
    if (sySelect) {
        const allStudents = allUsers.filter(u => u.role === 'student');
        const uniqueSYs = [...new Set(allStudents.map(s => s.schoolYear).filter(Boolean))].sort().reverse();
        const cv = sySelect.value;
        sySelect.innerHTML = '<option value="all">All School Years</option>';
        uniqueSYs.forEach(sy => sySelect.innerHTML += `<option value="${sy}">${sy}</option>`);
        sySelect.value = cv;
    }

    // Populate section dropdown
    const secSelect = document.getElementById('pSrSectionFilter');
    if (secSelect) {
        const allStudents = allUsers.filter(u => u.role === 'student');
        const uniqueSections = [...new Set(allStudents.map(s => s.section).filter(Boolean))].sort();
        const cv = secSelect.value;
        secSelect.innerHTML = '<option value="all">All Sections</option>';
        uniqueSections.forEach(sec => secSelect.innerHTML += `<option value="${sec}">${sec}</option>`);
        secSelect.value = cv;
    }

    // Stats
    const statsContainer = document.getElementById('pStudentRecordsStats');
    if (statsContainer) {
        const active = students.filter(s => s.isActive !== false).length;

        // Count unique sections per grade instead of total students per grade
        const gradeSectionSets = {};
        students.forEach(s => {
            const g = s.gradeLevel || s.grade || 'N/A';
            const sec = s.section;
            if (!gradeSectionSets[g]) gradeSectionSets[g] = new Set();
            if (sec) gradeSectionSets[g].add(sec);
        });

        statsContainer.innerHTML = `
            <div class="stat-card" style="flex:1;min-width:120px;padding:0.75rem 1rem;">
                <div class="stat-value" style="font-size:1.3rem;">${students.length}</div>
                <div class="stat-label">Students Found</div>
            </div>
            <div class="stat-card" style="flex:1;min-width:120px;padding:0.75rem 1rem;">
                <div class="stat-value" style="font-size:1.3rem;">${active}</div>
                <div class="stat-label">Active</div>
            </div>
            ${Object.entries(gradeSectionSets).sort(([a], [b]) => a.localeCompare(b)).map(([grade, sectionSet]) => `
                <div class="stat-card" style="flex:1;min-width:120px;padding:0.75rem 1rem;">
                    <div class="stat-value" style="font-size:1.3rem;">${sectionSet.size}</div>
                    <div class="stat-label">Grade ${grade} Sections</div>
                </div>
            `).join('')}
        `;
    }

    const tbody = document.getElementById('pStudentRecordsBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--gray-500);"><div style="font-size:3rem;margin-bottom:1rem;">📚</div><div style="font-size:1.1rem;font-weight:600;">No Students Found</div><div style="font-size:0.85rem;">Try adjusting your filters</div></td></tr>`;
        return;
    }

    students.sort((a, b) => {
        const ga = String(a.gradeLevel || a.grade || '').padStart(2, '0');
        const gb = String(b.gradeLevel || b.grade || '').padStart(2, '0');
        if (ga !== gb) return ga.localeCompare(gb);
        const sa = (a.section || '').toLowerCase();
        const sb = (b.section || '').toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    tbody.innerHTML = students.map(s => {
        const isActive = s.isActive !== false;
        const ss = isActive
            ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);'
            : 'background:rgba(156,163,175,0.15);color:#9ca3af;border:1px solid rgba(156,163,175,0.3);';
        return `<tr>
            <td style="font-weight:500;color:var(--gray-100);">${s.firstName || ''} ${s.middleInitial ? s.middleInitial + '.' : ''} ${s.lastName || ''}</td>
            <td style="text-align:center;color:var(--gray-300);font-size:0.85rem;">${s.lrn || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.gradeLevel || s.grade || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.section || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.schoolYear || 'N/A'}</td>
            <td style="text-align:center;"><span style="display:inline-flex;align-items:center;gap:0.3rem;${ss}font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.3rem 0.65rem;border-radius:99px;">● ${isActive ? 'Active' : 'Inactive'}</span></td>
            <td style="color:var(--gray-400);font-size:0.82rem;">${s.email || 'N/A'}</td>
        </tr>`;
    }).join('');
}

// Principal Student Records filter listeners
['pSrSchoolYearFilter', 'pSrGradeFilter', 'pSrSectionFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderPrincipalStudentRecords);
});
const pSrSearchInput = document.getElementById('pSrSearchInput');
if (pSrSearchInput) {
    let pSrDebounce;
    pSrSearchInput.addEventListener('input', () => {
        clearTimeout(pSrDebounce);
        pSrDebounce = setTimeout(renderPrincipalStudentRecords, 300);
    });
}

// ========================================
// Graduated Students (Principal)
// ========================================

function renderPrincipalGraduatedStudents() {
    const syFilter = document.getElementById('pGradSyFilter')?.value || 'all';
    const searchQuery = (document.getElementById('pGradSearchInput')?.value || '').toLowerCase().trim();

    let graduated = allUsers.filter(u =>
        u.role === 'student' &&
        String(u.gradeLevel || u.grade || '') === 'Graduated'
    );

    // Populate SY dropdown dynamically
    const sySelect = document.getElementById('pGradSyFilter');
    if (sySelect) {
        const uniqueSYs = [...new Set(graduated.map(s => s.schoolYear).filter(Boolean))].sort().reverse();
        const currentVal = sySelect.value;
        sySelect.innerHTML = '<option value="all">All School Years</option>';
        uniqueSYs.forEach(sy => {
            sySelect.innerHTML += `<option value="${sy}">${sy}</option>`;
        });
        sySelect.value = currentVal;
    }

    // Apply filters
    if (syFilter !== 'all') {
        graduated = graduated.filter(s => s.schoolYear === syFilter);
    }
    if (searchQuery) {
        graduated = graduated.filter(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            return name.includes(searchQuery) || (s.lrn || '').toLowerCase().includes(searchQuery);
        });
    }

    // Stats
    const statsContainer = document.getElementById('pGraduatedStats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card" style="flex:1;min-width:120px;padding:0.75rem 1rem;">
                <div class="stat-value" style="font-size:1.3rem;">${graduated.length}</div>
                <div class="stat-label">Graduated Found</div>
            </div>
            <div class="stat-card" style="flex:1;min-width:120px;padding:0.75rem 1rem;">
                <div class="stat-value" style="font-size:1.3rem;">${graduated.filter(s => s.isActive !== false).length}</div>
                <div class="stat-label">Active Accounts</div>
            </div>
        `;
    }

    // Table body
    const tbody = document.getElementById('pGraduatedStudentsBody');
    if (!tbody) return;

    if (graduated.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--gray-500);"><div style="font-size:3rem;margin-bottom:1rem;">🎓</div><div style="font-size:1.1rem;font-weight:600;">No Graduated Students Found</div><div style="font-size:0.85rem;">Try adjusting your filters</div></td></tr>`;
        return;
    }

    graduated.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    tbody.innerHTML = graduated.map(s => {
        const isActive = s.isActive !== false;
        const ss = isActive
            ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);'
            : 'background:rgba(156,163,175,0.15);color:#9ca3af;border:1px solid rgba(156,163,175,0.3);';
        const hasHistory = (s.gradeHistory || []).length > 0;
        return `<tr>
            <td style="font-weight:500;color:var(--gray-100);">${s.firstName || ''} ${s.middleInitial ? s.middleInitial + '.' : ''} ${s.lastName || ''}</td>
            <td style="text-align:center;color:var(--gray-300);font-size:0.85rem;">${s.lrn || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.schoolYear || 'N/A'}</td>
            <td style="text-align:center;"><span style="display:inline-flex;align-items:center;gap:0.3rem;${ss}font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.3rem 0.65rem;border-radius:99px;">● ${isActive ? 'Active' : 'Inactive'}</span></td>
            <td style="color:var(--gray-400);font-size:0.82rem;">${s.email || 'N/A'}</td>
            <td style="text-align:center;">
                <button onclick="pViewStudentHistory('${s.id}')"
                    style="background:${hasHistory ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)'};color:${hasHistory ? 'var(--primary-400)' : 'var(--gray-500)'};border:1px solid ${hasHistory ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:6px;padding:0.25rem 0.6rem;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
                    📋 ${hasHistory ? 'History (' + (s.gradeHistory || []).length + ')' : 'No History'}
                </button>
            </td>
        </tr>`;
    }).join('');
}

function pViewStudentHistory(studentId) {
    const student = allUsers.find(u => u.id === studentId);
    if (!student) return;

    const history = student.gradeHistory || [];
    const name = `${student.firstName} ${student.lastName}`;

    let historyHTML = history.length === 0
        ? '<p style="color:var(--gray-400);text-align:center;padding:1rem;">No grade history yet.</p>'
        : `<div style="display:flex;flex-direction:column;gap:0.75rem;">` +
        [...history].sort((a, b) => new Date(a.promotedAt) - new Date(b.promotedAt)).map((h, i, arr) => `
            <div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 1rem;border-radius:10px;background:rgba(255,255,255,0.06);border-left:4px solid var(--primary-500);">
                <div style="font-size:1.5rem;">📚</div>
                <div style="flex:1;">
                    <div style="font-weight:700;color:var(--gray-100);">Grade ${h.grade}${h.section ? ' — Section ' + h.section : ''}</div>
                    <div style="font-size:0.8rem;color:var(--gray-400);">School Year: ${h.schoolYear || '—'} · Promoted: ${h.promotedAt ? new Date(h.promotedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                </div>
                ${i === arr.length - 1 ? '<span style="font-size:0.7rem;background:rgba(34,197,94,0.12);color:#22c55e;padding:0.2rem 0.5rem;border-radius:10px;font-weight:700;">Latest</span>' : ''}
            </div>`).join('') +
        `</div>`;

    const curGrade = student.gradeLevel || student.grade || '—';
    const curSY = student.schoolYear || '—';

    const modal = document.createElement('div');
    modal.id = 'pGradeHistoryModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);" onclick="document.getElementById('pGradeHistoryModal').remove()"></div>
        <div style="position:relative;background:var(--surface-2,#1e293b);border-radius:16px;width:100%;max-width:560px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="padding:1.5rem 1.75rem;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--gray-100);">📋 Grade History</h3>
                    <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--gray-400);">${name}</p>
                </div>
                <button onclick="document.getElementById('pGradeHistoryModal').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--gray-400);">✕</button>
            </div>
            <div style="padding:1.5rem 1.75rem;">
                <div style="padding:0.75rem 1rem;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);margin-bottom:1.25rem;">
                    <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--primary-400);margin-bottom:0.4rem;">Current Status</div>
                    <div style="font-weight:700;color:var(--gray-100);">${curGrade}</div>
                    <div style="font-size:0.8rem;color:var(--gray-400);">School Year: ${curSY}</div>
                </div>
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:0.75rem;">Previous Grades</div>
                ${historyHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Filter listeners for Principal Graduated Students section
const pGradSyFilter = document.getElementById('pGradSyFilter');
if (pGradSyFilter) pGradSyFilter.addEventListener('change', renderPrincipalGraduatedStudents);
const pGradSearchInput = document.getElementById('pGradSearchInput');
if (pGradSearchInput) {
    let pGradDebounce;
    pGradSearchInput.addEventListener('input', () => {
        clearTimeout(pGradDebounce);
        pGradDebounce = setTimeout(renderPrincipalGraduatedStudents, 300);
    });
}

window.renderPrincipalGraduatedStudents = renderPrincipalGraduatedStudents;
window.pViewStudentHistory = pViewStudentHistory;

// Refresh dashboard button
const refreshBtn = document.getElementById('refreshDashboardBtn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '⏳ Refreshing...';
        try {
            await Promise.all([
                loadAllUsers(),
                loadSecurityLogs(),
                loadNotifications(),
                loadSystemStats(),
                loadQuizzes(),
                loadSystemHealth()
            ]);
            updateOverviewStats();
            firebaseApp.showToast('🔄 Dashboard refreshed!', 'success');
        } catch (e) {
            firebaseApp.showToast('Failed to refresh', 'error');
        }
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
    });
}

// ========================================
// User Management Actions
// ========================================

// createUser is defined above (line ~680) with the modal-based flow

async function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        firebaseApp.showToast('User not found', 'error');
        return;
    }

    // Create inline edit modal
    let modal = document.getElementById('principalEditUserModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'principalEditUserModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(modal);
    }

    const roleOptions = ['student', 'teacher', 'secretary', 'developer'].map(r =>
        `<option value="${r}" ${user.role === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
    ).join('');

    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;box-shadow:0 24px 48px rgba(0,0,0,0.4);border:1px solid var(--gray-200);">
            <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:1.5rem;color:var(--gray-800);">✏️ Edit User</h2>
            <div style="display:flex;flex-direction:column;gap:1rem;">
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;font-weight:600;text-transform:uppercase;">First Name</label>
                    <input id="editFirstName" type="text" value="${user.firstName || ''}" class="form-input" style="width:100%;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.9rem;">
                </div>
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;font-weight:600;text-transform:uppercase;">Last Name</label>
                    <input id="editLastName" type="text" value="${user.lastName || ''}" class="form-input" style="width:100%;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.9rem;">
                </div>
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;font-weight:600;text-transform:uppercase;">Role</label>
                    <select id="editRole" class="form-input" style="width:100%;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.9rem;">
                        ${roleOptions}
                    </select>
                </div>
                ${user.lrn ? `
                <div>
                    <label style="display:block;font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;font-weight:600;text-transform:uppercase;">LRN</label>
                    <input id="editLrn" type="text" value="${user.lrn}" class="form-input" style="width:100%;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.9rem;">
                </div>` : ''}
            </div>
            <div style="display:flex;gap:0.75rem;margin-top:1.5rem;justify-content:flex-end;">
                <button onclick="document.getElementById('principalEditUserModal').style.display='none'" class="btn btn-secondary" style="padding:0.6rem 1.25rem;font-size:0.9rem;">Cancel</button>
                <button onclick="saveEditUser('${userId}')" class="btn btn-primary" style="padding:0.6rem 1.5rem;font-size:0.9rem;">💾 Save Changes</button>
            </div>
        </div>`;

    modal.style.display = 'flex';

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

async function saveEditUser(userId) {
    const firstName = document.getElementById('editFirstName')?.value?.trim();
    const lastName = document.getElementById('editLastName')?.value?.trim();
    const role = document.getElementById('editRole')?.value;
    const lrn = document.getElementById('editLrn')?.value?.trim();

    if (!firstName || !lastName) {
        firebaseApp.showToast('Please fill in all required fields', 'error');
        return;
    }

    try {
        const updateData = {
            firstName,
            lastName,
            role,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (lrn) updateData.lrn = lrn;

        await firebaseApp.db.collection('users').doc(userId).update(updateData);

        // Reflect locally
        const localUser = allUsers.find(u => u.id === userId);
        if (localUser) {
            localUser.firstName = firstName;
            localUser.lastName = lastName;
            localUser.role = role;
            if (lrn) localUser.lrn = lrn;
        }

        renderUsersTable();
        document.getElementById('principalEditUserModal').style.display = 'none';
        firebaseApp.showToast(`✅ ${firstName} ${lastName}'s account updated`, 'success');
    } catch (error) {
        console.error('Error updating user:', error);
        firebaseApp.showToast('Failed to update user: ' + error.message, 'error');
    }
}

async function toggleUserStatus(userId, newStatus) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const action = newStatus ? 'activate' : 'deactivate';
    const confirmed = confirm(`Are you sure you want to ${action} ${user.firstName} ${user.lastName}'s account?`);
    if (!confirmed) return;

    try {
        await firebaseApp.db.collection('users').doc(userId).update({
            isActive: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Reflect locally
        user.isActive = newStatus;
        renderUsersTable();

        const label = newStatus ? '🔓 Activated' : '🔒 Deactivated';
        firebaseApp.showToast(`${label}: ${user.firstName} ${user.lastName}'s account has been ${action}d`, 'success');
    } catch (error) {
        console.error('Error toggling user status:', error);
        firebaseApp.showToast('Failed to update user status: ' + error.message, 'error');
    }
}

async function deleteUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // Double-confirm for safety
    const confirmed = confirm(
        `⚠️ Delete Account\n\nYou are about to permanently delete the account for:\n${user.firstName} ${user.lastName} (${user.email})\n\nThis action CANNOT be undone. Are you sure?`
    );
    if (!confirmed) return;

    try {
        await firebaseApp.db.collection('users').doc(userId).delete();

        // Remove from local list
        const idx = allUsers.findIndex(u => u.id === userId);
        if (idx !== -1) allUsers.splice(idx, 1);

        renderUsersTable();
        updateOverviewStats();
        firebaseApp.showToast(`🗑️ ${user.firstName} ${user.lastName}'s account has been deleted`, 'success');
    } catch (error) {
        console.error('Error deleting user:', error);
        firebaseApp.showToast('Failed to delete user: ' + error.message, 'error');
    }
}

// ========================================
// Initialize
// ========================================

document.addEventListener('DOMContentLoaded', initDashboard);

// Make functions globally available
window.createUser = createUser;
window.editUser = editUser;
window.saveEditUser = saveEditUser;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
window.filterUsersTable = filterUsersTable;
window.resolveSecurityLog = resolveSecurityLog;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllAsRead = markAllAsRead;
window.saveSettings = saveSettings;
window.saveSecuritySettings = saveSecuritySettings;
window.viewQuizDetails = viewQuizDetails;
window.openAccountSettingsModal = openAccountSettingsModal;
window.closeAccountSettingsModal = closeAccountSettingsModal;
window.changeAccountPassword = changeAccountPassword;
window.loadAllActivityLogs = loadAllActivityLogs;

// Helper: Custom Confirm Modal
function showConfirmModal(title, message, onConfirm, confirmText = 'Confirm', headerBg = 'linear-gradient(135deg, var(--primary-500), var(--primary-600))') {
    const existing = document.getElementById('principalConfirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'principalConfirmModal';
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;opacity:0;transition:opacity 0.2s;';

    modal.innerHTML = `
        <div style="background:var(--card-bg,#1a1a3e);border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 40px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);overflow:hidden;transform:scale(0.95);transition:transform 0.2s;">
            <div style="background:${headerBg};padding:1.25rem 1.5rem;">
                <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">${title}</h3>
            </div>
            <div style="padding:1.5rem;font-size:0.95rem;color:rgba(255,255,255,0.8);line-height:1.5;">
                ${message}
            </div>
            <div style="padding:1.25rem 1.5rem;background:rgba(0,0,0,0.2);display:flex;justify-content:flex-end;gap:0.75rem;border-top:1px solid rgba(255,255,255,0.05);">
                <button id="pConfirmCancelBtn" class="btn btn-secondary" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:0.6rem 1.25rem;">Cancel</button>
                <button id="pConfirmAcceptBtn" class="btn btn-primary" style="background:${headerBg};border:none;padding:0.6rem 1.25rem;font-weight:600;">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.querySelector('div').style.transform = 'scale(1)';
    });

    const close = () => {
        modal.style.opacity = '0';
        modal.querySelector('div').style.transform = 'scale(0.95)';
        setTimeout(() => modal.remove(), 200);
    };

    document.getElementById('pConfirmCancelBtn').onclick = close;
    document.getElementById('pConfirmAcceptBtn').onclick = () => {
        close();
        if (onConfirm) onConfirm();
    };
    modal.onclick = (e) => {
        if (e.target === modal) close();
    };
}

window.showConfirmModal = showConfirmModal;

// ========================================
// School Year Management (Principal)
// ========================================

async function pLoadCurrentSchoolYear() {
    const container = document.getElementById('pSchoolYearStatus');
    if (!container) return;
    try {
        const doc = await firebaseApp.db.collection('systemConfig').doc('schoolYear').get();
        if (!doc.exists) {
            container.innerHTML = '<em style="color:var(--gray-500);">No school year configured yet. Use the Set School Year Interval card below to get started.</em>';
            return;
        }
        const data = doc.data();
        const label = data.schoolYear || '—';
        const startDate = data.startDate ? (data.startDate.toDate ? data.startDate.toDate() : new Date(data.startDate)) : null;
        const endDate = data.endDate ? (data.endDate.toDate ? data.endDate.toDate() : new Date(data.endDate)) : null;

        let statusHTML = `
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center;">
                <div>
                    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--gray-400);font-weight:700;">Current School Year</div>
                    <div style="font-size:1.6rem;font-weight:800;color:var(--gray-100);">${label}</div>
                </div>`;

        if (startDate && endDate) {
            const now = new Date();
            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            const elapsed = totalDays - daysLeft;
            const pct = Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100)));
            const dColor = daysLeft <= 30 ? '#ef4444' : daysLeft <= 90 ? '#f59e0b' : '#22c55e';

            const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            statusHTML += `
                <div style="flex:1;min-width:220px;">
                    <div style="font-size:0.75rem;color:var(--gray-400);margin-bottom:0.4rem;">${fmt(startDate)} → ${fmt(endDate)}</div>
                    <div style="background:rgba(255,255,255,0.07);border-radius:99px;height:8px;overflow:hidden;margin-bottom:0.35rem;">
                        <div style="height:100%;border-radius:99px;background:${dColor};width:${pct}%;transition:width 0.6s;"></div>
                    </div>
                    <div style="font-size:0.78rem;color:${dColor};font-weight:700;">${daysLeft > 0 ? daysLeft + ' days left' : 'School year ended'}</div>
                </div>`;
        } else {
            statusHTML += `<div style="font-size:0.82rem;color:var(--gray-500);"><em>No start/end dates set. Use the Set School Year Interval card.</em></div>`;
        }
        statusHTML += '</div>';
        container.innerHTML = statusHTML;

        // Pre-fill the Set SY form with current values
        const syLabelEl = document.getElementById('pSyLabel');
        const syStartEl = document.getElementById('pSyStartDate');
        const syEndEl = document.getElementById('pSyEndDate');
        if (syLabelEl) syLabelEl.value = label !== '—' ? label : '';
        if (syStartEl && startDate) syStartEl.value = startDate.toISOString().slice(0, 10);
        if (syEndEl && endDate) syEndEl.value = endDate.toISOString().slice(0, 10);

    } catch (err) {
        console.error('pLoadCurrentSchoolYear error:', err);
        container.innerHTML = '<em style="color:#f87171;">Failed to load school year data.</em>';
    }
}

async function pSaveSchoolYear() {
    const label = document.getElementById('pSyLabel')?.value.trim();
    const startVal = document.getElementById('pSyStartDate')?.value;
    const endVal = document.getElementById('pSyEndDate')?.value;

    if (!label) { firebaseApp.showToast('Please enter a school year label.', 'error'); return; }
    if (!startVal || !endVal) { firebaseApp.showToast('Please select both start and end dates.', 'error'); return; }
    if (new Date(startVal) >= new Date(endVal)) { firebaseApp.showToast('End date must be after start date.', 'error'); return; }

    try {
        await firebaseApp.db.collection('systemConfig').doc('schoolYear').set({
            schoolYear: label,
            startDate: firebase.firestore.Timestamp.fromDate(new Date(startVal)),
            endDate: firebase.firestore.Timestamp.fromDate(new Date(endVal)),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        firebaseApp.showToast(`✅ School year "${label}" saved!`, 'success');
        await pLoadCurrentSchoolYear();
    } catch (err) {
        console.error('pSaveSchoolYear error:', err);
        firebaseApp.showToast('Failed to save school year.', 'error');
    }
}

// ========================================
// Moving Up (formerly Promote Students)
// ========================================

function pRenderMoveUpStudents() {
    const grade = document.getElementById('pMoveUpGradeFilter')?.value;
    const container = document.getElementById('pMoveUpStudentsListContainer');
    const list = document.getElementById('pMoveUpStudentsList');

    if (!container || !list) return;

    if (!grade) {
        container.style.display = 'none';
        return;
    }

    const students = allUsers.filter(u => u.role === 'student' && u.isActive === true && String(u.grade) === String(grade));

    if (students.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--gray-400);padding:1rem;">No active Grade ${grade} students found.</div>`;
    } else {
        list.innerHTML = students.map(student => `
            <div style="display:flex;align-items:center;padding:0.5rem;border-bottom:1px solid rgba(255,255,255,0.05);">
                <input type="checkbox" class="p-move-up-student-cb" value="${student.id}" style="width:16px;height:16px;cursor:pointer;margin-right:0.75rem;">
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.9rem;">${student.firstName} ${student.lastName}</div>
                    <div style="font-size:0.75rem;color:var(--gray-400);">Section: ${student.section || 'None'}</div>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('pSelectAllMoveUp').checked = false;
    container.style.display = 'block';
}

function pToggleAllMoveUp(checked) {
    document.querySelectorAll('.p-move-up-student-cb').forEach(cb => {
        cb.checked = checked;
    });
}

async function pMoveUpStudents() {
    const newSY = document.getElementById('pPromotionTargetSY')?.value.trim();
    if (!newSY) { firebaseApp.showToast('Please enter the new school year label.', 'error'); return; }

    const selectedIds = Array.from(document.querySelectorAll('.p-move-up-student-cb:checked')).map(cb => cb.value);

    if (selectedIds.length === 0) {
        firebaseApp.showToast('Please select at least one student to move up.', 'error');
        return;
    }

    showConfirmModal(
        '⚠️ Move Up Selected Students',
        `This will move ${selectedIds.length} selected student(s) up one grade level, archive their current grade & section, clear sections, and set school year to "${newSY}". This CANNOT be undone. Proceed?`,
        async () => {
            try {
                firebaseApp.showToast('⏳ Moving up students...', 'info');

                const batch = firebaseApp.db.batch();
                let count = 0;

                for (const studentId of selectedIds) {
                    const s = allUsers.find(u => u.id === studentId);
                    if (!s) continue;

                    const docRef = firebaseApp.db.collection('users').doc(studentId);
                    const rawGrade = s.gradeLevel || s.grade || '';

                    if (rawGrade === 'Graduated') {
                        batch.update(docRef, { schoolYear: newSY });
                        count++;
                        continue;
                    }

                    const curGrade = parseInt(rawGrade) || 7;
                    const historyEntry = {
                        grade: curGrade,
                        section: s.section || '',
                        schoolYear: s.schoolYear || '',
                        promotedAt: new Date().toISOString()
                    };

                    const graduated = curGrade + 1 > 10;
                    const newGrade = graduated ? 'Graduated' : String(curGrade + 1);

                    batch.update(docRef, {
                        gradeLevel: newGrade,
                        grade: newGrade,
                        section: '',
                        schoolYear: newSY,
                        gradeHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry)
                    });
                    count++;
                }

                await batch.commit();

                await firebaseApp.db.collection('systemConfig').doc('schoolYear').set(
                    { schoolYear: newSY, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                    { merge: true }
                );

                firebaseApp.showToast(`✅ ${count} student(s) moved up to ${newSY}!`, 'success');

                // Reset UI
                document.getElementById('pPromotionTargetSY').value = '';
                document.getElementById('pMoveUpGradeFilter').value = '';
                document.getElementById('pMoveUpStudentsListContainer').style.display = 'none';

                await pLoadCurrentSchoolYear();
                await loadAllUsers();
                pRenderUnassignedStudents(document.getElementById('pBulkAssignGrade')?.value || '');
            } catch (err) {
                console.error('pMoveUpStudents error:', err);
                firebaseApp.showToast('Move up failed. Please try again.', 'error');
            }
        },
        'Move Up Selected Students',
        'linear-gradient(135deg,#ef4444,#b91c1c)'
    );
}

function pRenderUnassignedStudents(grade) {
    const container = document.getElementById('pUnassignedStudentsList');
    if (!container) return;

    if (!grade) {
        container.innerHTML = '<em>Select a grade to see students without a section.</em>';
        return;
    }

    const studentsList = allUsers.filter(u =>
        u.role === 'student' &&
        String(u.gradeLevel || u.grade || '') === String(grade)
    );

    if (studentsList.length === 0) {
        container.innerHTML = `<div style="color:var(--gray-400);font-weight:600;">No Grade ${grade} students found.</div>`;
        return;
    }

    const sorted = [...studentsList].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <div style="font-weight:600;color:var(--gray-300);">
                ${sorted.length} student${sorted.length !== 1 ? 's' : ''} in Grade ${grade}:
            </div>
            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--gray-300);cursor:pointer;background:rgba(255,255,255,0.05);padding:0.3rem 0.6rem;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
                <input type="checkbox" id="pSelectAllUnassigned" onchange="pToggleAllUnassigned(this)">
                <span>Select All</span>
            </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.6rem;max-height:200px;overflow-y:auto;padding-right:0.5rem;" id="pUnassignedCheckboxes">
            ${sorted.map(s => `
                <label style="display:flex;align-items:center;gap:0.4rem;background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:0.4rem 0.75rem;font-size:0.82rem;font-weight:500;cursor:pointer;transition:all 0.2s;">
                    <input type="checkbox" class="p-bulk-assign-checkbox" value="${s.id}">
                    ${s.firstName} ${s.lastName} ${s.section ? `<span style="font-size:0.7rem;opacity:0.7;">(Sec: ${s.section})</span>` : '<span style="font-size:0.7rem;opacity:0.7;color:#fbbf24;">(No section)</span>'}
                </label>`).join('')}
        </div>`;
}

// Helper to toggle all checkboxes
function pToggleAllUnassigned(source) {
    const checkboxes = document.querySelectorAll('.p-bulk-assign-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

async function pBulkAssignSection() {
    const grade = document.getElementById('pBulkAssignGrade')?.value;
    const section = document.getElementById('pBulkAssignSection')?.value.trim();

    if (!grade) { firebaseApp.showToast('Please select a grade level.', 'error'); return; }
    if (!section) { firebaseApp.showToast('Please enter a section name.', 'error'); return; }

    // Collect IDs of checked students
    const checkedBoxes = Array.from(document.querySelectorAll('.p-bulk-assign-checkbox:checked'));
    const selectedIds = checkedBoxes.map(cb => cb.value);

    if (selectedIds.length === 0) {
        firebaseApp.showToast(`Please select at least one student to assign the section to.`, 'warning');
        return;
    }

    showConfirmModal(
        '📋 Bulk Assign Section',
        `Assign section "${section}" to ${selectedIds.length} selected ${selectedIds.length === 1 ? 'student' : 'students'} in Grade ${grade}?`,
        async () => {
            try {
                const batch = firebaseApp.db.batch();
                selectedIds.forEach(id => {
                    batch.update(firebaseApp.db.collection('users').doc(id), { section });
                });
                await batch.commit();
                firebaseApp.showToast(`✅ Section "${section}" assigned to ${selectedIds.length} student(s)!`, 'success');
                document.getElementById('pBulkAssignSection').value = '';
                await loadAllUsers();
                pRenderUnassignedStudents(grade);
            } catch (err) {
                console.error('pBulkAssignSection error:', err);
                firebaseApp.showToast('Failed to assign sections.', 'error');
            }
        },
        'Assign Sections',
        'linear-gradient(135deg,#6366f1,#4f46e5)'
    );
}

window.pSaveSchoolYear = pSaveSchoolYear;
window.pMoveUpStudents = pMoveUpStudents;
window.pRenderMoveUpStudents = pRenderMoveUpStudents;
window.pToggleAllMoveUp = pToggleAllMoveUp;
window.pRenderUnassignedStudents = pRenderUnassignedStudents;
window.pToggleAllUnassigned = pToggleAllUnassigned;
window.pBulkAssignSection = pBulkAssignSection;

// ========================================
// Security Logs Search & Filter
// ========================================

function filterSecurityLogs() {
    const searchQuery = (document.getElementById('securityLogsSearch')?.value || '').toLowerCase().trim();
    const severityFilter = document.getElementById('securityLogsSeverityFilter')?.value || 'all';
    const logsList = document.getElementById('securityLogsList');
    if (!logsList) return;

    const items = logsList.querySelectorAll('.security-log-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const matchesSearch = !searchQuery || text.includes(searchQuery);

        // Check severity class
        let matchesSeverity = severityFilter === 'all';
        if (!matchesSeverity) {
            matchesSeverity = item.classList.contains(severityFilter);
        }

        item.style.display = (matchesSearch && matchesSeverity) ? '' : 'none';
    });
}

window.filterSecurityLogs = filterSecurityLogs;
