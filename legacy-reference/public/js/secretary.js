/**
 * Secretary Dashboard Logic
 * Manages users, monitors performance, generates reports
 */

// Protect this page - only secretary and principal can access
if (!firebaseApp.protectPage(['secretary', 'principal'])) {
    // Page will redirect if not authenticated or wrong role
}

const currentUser = firebaseApp.getCurrentUser();

// DOM Elements
const secretaryNameEl = document.getElementById('secretaryName');
const userInitialsEl = document.getElementById('userInitials');

// Stats
const totalStudentsEl = document.getElementById('totalStudents');
const totalTeachersEl = document.getElementById('totalTeachers');
const activeUsersEl = document.getElementById('activeUsers');
const totalQuizzesEl = document.getElementById('totalQuizzes');

// Sections
const sections = {
    overview: document.getElementById('overviewSection'),
    'create-user': document.getElementById('createUserSection'),
    'student-records': document.getElementById('studentRecordsSection'),
    performance: document.getElementById('performanceSection'),
    reports: document.getElementById('reportsSection'),
    health: document.getElementById('healthSection'),
    activity: document.getElementById('activitySection'),
    'school-year': document.getElementById('school-yearSection'),
    'graduated': document.getElementById('graduatedSection'),
    settings: null
};

// State
let allUsers = [];
let allActivityLogs = [];
let currentFilter = 'all';

// ========================================
// Initialize Dashboard
// ========================================

async function initDashboard() {
    try {
        // Set user info
        if (currentUser) {
            const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
            secretaryNameEl.textContent = fullName;
            userInitialsEl.textContent = `${currentUser.firstName[0]}${currentUser.lastName[0]}`;
        }

        // Load data
        await Promise.all([
            loadUsers(),
            loadQuizzes(),
            loadSystemHealth(),
            loadRecentActivity(),
            loadActivityLogs(),
            loadCurrentSchoolYear()
        ]);

        // Update stats
        updateStats();

        // Load performance metrics after users are loaded (needs allUsers)
        await loadPerformanceData();

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        firebaseApp.showToast('Failed to load dashboard data', 'error');
    }
}

// ========================================
// Load Data
// ========================================

async function loadUsers() {
    try {
        const usersSnapshot = await firebaseApp.db.collection('users').get();
        allUsers = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderUsersTable();

    } catch (error) {
        console.error('Error loading users:', error);
        allUsers = [];
    }
}

async function loadQuizzes() {
    try {
        const quizzesSnapshot = await firebaseApp.db.collection('quizzes').get();
        totalQuizzesEl.textContent = quizzesSnapshot.size;

    } catch (error) {
        console.error('Error loading quizzes:', error);
    }
}

async function loadSystemHealth() {
    try {
        // Active sessions
        const sessionsSnapshot = await firebaseApp.db.collection('sessions')
            .where('isActive', '==', true)
            .get();
        const activeCount = sessionsSnapshot.size;

        const elActiveSessions = document.getElementById('activeSessions');
        const elCurrentSessions = document.getElementById('currentSessions');
        if (elActiveSessions) elActiveSessions.textContent = activeCount;
        if (elCurrentSessions) elCurrentSessions.textContent = activeCount;

        // System uptime placeholder (real uptime requires server-side)
        const uptimeEl = document.getElementById('systemUptime');
        if (uptimeEl) uptimeEl.textContent = '99.9%';

        // DB reads — show total docs across key collections as proxy
        const [usersSnap, quizzesSnap, resultsSnap] = await Promise.all([
            firebaseApp.db.collection('users').get(),
            firebaseApp.db.collection('quizzes').get(),
            firebaseApp.db.collection('quizResults').get()
        ]);

        const dbReadsEl = document.getElementById('dbReads');
        if (dbReadsEl) dbReadsEl.textContent = usersSnap.size + quizzesSnap.size + resultsSnap.size;

        const totalUsersEl = document.getElementById('healthTotalUsers');
        if (totalUsersEl) totalUsersEl.textContent = usersSnap.size;

        const totalQuizzesEl2 = document.getElementById('healthTotalQuizzes');
        if (totalQuizzesEl2) totalQuizzesEl2.textContent = quizzesSnap.size;

    } catch (error) {
        console.error('Error loading system health:', error);
    }
}

function loadRecentActivity() {
    const activityList = document.getElementById('recentActivityList');
    if (!activityList) return;

    firebaseApp.db.collection('activityLogs')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
                return;
            }

            // Filter out non-student/teacher logs for Secretary view
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(log =>
                log.role === 'student' || log.role === 'teacher'
            );

            if (docs.length === 0) {
                activityList.innerHTML = '<div class="empty-state"><p>No recent student or teacher activity</p></div>';
                return;
            }

            activityList.innerHTML = docs.map(activity => {
                const dateStr = activity.timestamp
                    ? (activity.timestamp.toDate ? activity.timestamp.toDate() : new Date(activity.timestamp)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '';

                // Build details string for quiz-related activities
                let detailsHTML = '';
                const details = activity.details || {};
                const action = activity.action || activity.type || '';

                if (action === 'quiz_taken' && details.quizTitle) {
                    detailsHTML = `<div class="activity-log-details" style="font-size:0.78rem;color:var(--gray-400);margin-top:0.15rem;">
                        📝 <strong>${details.quizTitle}</strong>${details.percentage !== undefined ? ` — Score: ${details.percentage}%` : ''}
                    </div>`;
                } else if (action === 'quiz_start' && details.quizTitle) {
                    detailsHTML = `<div class="activity-log-details" style="font-size:0.78rem;color:var(--gray-400);margin-top:0.15rem;">
                        📝 Started <strong>${details.quizTitle}</strong>
                    </div>`;
                } else if (action === 'quiz_deleted' && details.quizTitle) {
                    detailsHTML = `<div class="activity-log-details" style="font-size:0.78rem;color:var(--gray-400);margin-top:0.15rem;">
                        🗑️ Deleted <strong>${details.quizTitle}</strong>${details.reason ? ` — ${details.reason}` : ''}
                    </div>`;
                }

                return `
                    <div class="activity-log-item">
                        <div class="activity-log-icon">${getActivityIcon(action)}</div>
                        <div class="activity-log-content">
                            <div class="activity-log-header">
                                <strong class="activity-log-user">${activity.userName || 'Unknown User'}</strong>
                                ${activity.role ? `<span class="role-badge ${activity.role}" style="font-size:0.65rem;">${activity.role}</span>` : ''}
                                <span class="activity-log-badge">${formatActionLabel(action)}</span>
                            </div>
                            ${detailsHTML}
                            <div class="activity-log-time">${formatTimeAgo(activity.timestamp)} · ${dateStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }, error => {
            console.error('Error loading recent activity:', error);
        });
}

// ========================================
// Activity Logs (Full logs with filter)
// ========================================

let activityLogsUnsubscribe = null;

function loadActivityLogs() {
    const logsList = document.getElementById('activityLogsList');
    if (!logsList) return;

    // Unsubscribe previous listener if any
    if (activityLogsUnsubscribe) activityLogsUnsubscribe();

    logsList.innerHTML = '<p style="color:var(--gray-500);padding:1rem;">Loading activity logs...</p>';

    activityLogsUnsubscribe = firebaseApp.db.collection('activityLogs')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            allActivityLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const activeFilter = document.getElementById('activityFilter')?.value || 'all';
            renderActivityLogs(activeFilter);
        }, error => {
            console.error('Error listening to activity logs:', error);
            if (logsList) logsList.innerHTML = '<div class="empty-state"><p>Failed to load activity logs</p></div>';
        });
}

function renderActivityLogs(filterType = 'all') {
    const logsList = document.getElementById('activityLogsList');
    if (!logsList) return;

    // Actions that should NEVER be visible to secretary
    const hiddenActions = ['page_access', 'auto_logout'];

    let filtered = allActivityLogs.filter(log =>
        !hiddenActions.includes(log.action)
    );

    if (filterType !== 'all') {
        filtered = filtered.filter(log => {
            const action = (log.action || log.type || '').toLowerCase();
            if (filterType === 'login') return action === 'login' || action === 'logout';
            if (filterType === 'quiz') return action.startsWith('quiz');
            if (filterType === 'user_management') return action.startsWith('user') || action.includes('account') || action.includes('status') || action.includes('password') || action.includes('bulk');
            return true;
        });
    }

    if (filtered.length === 0) {
        logsList.innerHTML = `
            <div class="empty-state" style="min-height: 200px; padding: 2rem;">
                <div class="empty-state-icon">📋</div>
                <h3>No activity logs found</h3>
                <p>${filterType !== 'all' ? 'Try selecting a different filter' : 'Activity logs will appear here as users interact with the system'}</p>
            </div>
        `;
        return;
    }

    logsList.innerHTML = filtered.map(log => {
        const actionType = log.action || log.type;
        const actionLabel = formatActionLabel(actionType);
        const icon = getActivityIcon(actionType);
        const timeStr = formatTimeAgo(log.timestamp);
        const dateStr = log.timestamp
            ? (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
        const userName = log.userName || 'Unknown User';
        const role = log.role ? `<span class="role-badge ${log.role}" style="font-size:0.65rem;">${log.role}</span>` : '';

        return `
            <div class="activity-log-item">
                <div class="activity-log-icon">${icon}</div>
                <div class="activity-log-content">
                    <div class="activity-log-header">
                        <strong class="activity-log-user">${userName}</strong>
                        ${role}
                        <span class="activity-log-badge">${actionLabel}</span>
                    </div>
                    <div class="activity-log-time">${timeStr} · ${dateStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatActionLabel(action) {
    if (!action) return 'Unknown';
    const labels = {
        'login': '🔐 Logged In',
        'logout': '🚪 Logged Out',
        'quiz_taken': '📝 Quiz Submitted',
        'quiz_start': '📝 Quiz Started',
        'quiz_created': '➕ Quiz Created',
        'quiz_updated': '✏️ Quiz Updated',
        'quiz_deleted': '🗑️ Quiz Deleted',
        'quiz_published': '📤 Quiz Published',
        'user_created': '➕ User Created',
        'user_status_change': '👤 Status Changed',
        'user_updated': '✏️ User Updated',
        'user_deleted': '🗑️ User Deleted',
        'password_change': '🔒 Password Changed',
        'bulk_students_imported': '📥 Bulk Import',
        'bulk_assign_section': '📋 Section Assigned',
        'section_assigned': '📋 Section Assigned',
        'student_promoted': '🎓 Students Promoted',
        'school_year_updated': '📅 School Year Updated',
        'page_access': '📄 Page Accessed',
    };
    return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ========================================
// Update Stats
// ========================================

function updateStats() {
    const students = allUsers.filter(u => u.role === 'student');
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const active = allUsers.filter(u => u.isActive);

    totalStudentsEl.textContent = students.length;
    totalTeachersEl.textContent = teachers.length;
    activeUsersEl.textContent = active.length;
}

// ========================================
// Render Users Table
// ========================================

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');

    // Filter users
    let filteredUsers = allUsers;
    if (currentFilter !== 'all') {
        filteredUsers = allUsers.filter(u => u.role === currentFilter);
    }

    // Only show students and teachers (secretary cannot manage other roles)
    filteredUsers = filteredUsers.filter(u =>
        u.role === 'student' || u.role === 'teacher'
    );

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = filteredUsers.map(user => `
        <tr>
            <td>${user.firstName} ${user.lastName}</td>
            <td>${user.email}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td>
                <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">
                    ${user.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${user.schoolYear || 'N/A'}</td>
            <td>${user.lastActive ? formatTimeAgo(user.lastActive) : 'Never'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-action edit" onclick="viewUser('${user.id}')" title="View Details">
                        👁️
                    </button>
                    <button class="btn-action toggle" onclick="toggleUserStatus('${user.id}', ${!user.isActive})" title="${user.isActive ? 'Deactivate' : 'Activate'}">
                        ${user.isActive ? '🔒' : '🔓'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ========================================
// User Management Functions
// ========================================

function viewUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    alert(`User Details:\n\nName: ${user.firstName} ${user.lastName}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: ${user.isActive ? 'Active' : 'Inactive'}\nLast Active: ${user.lastActive ? formatTimeAgo(user.lastActive) : 'Never'}`);
}

async function toggleUserStatus(userId, newStatus) {
    const user = allUsers.find(u => u.id === userId);
    const action = newStatus ? 'activate' : 'deactivate';

    showConfirmModal(
        `${newStatus ? '✅ Activate' : '⛔ Deactivate'} User`,
        `Are you sure you want to ${action} ${user ? user.firstName + ' ' + user.lastName : 'this user'}?`,
        async () => {
            try {
                await firebaseApp.db.collection('users').doc(userId).update({
                    isActive: newStatus
                });

                if (window.activityTracker) {
                    await activityTracker.logActivity('user_status_change', {
                        targetUserId: userId,
                        targetUserName: user ? `${user.firstName} ${user.lastName}` : userId,
                        newStatus: newStatus ? 'active' : 'inactive'
                    });
                }

                firebaseApp.showToast(`User ${action}d successfully`, 'success');
                await loadUsers();
                updateStats();
            } catch (error) {
                console.error('Error toggling user status:', error);
                firebaseApp.showToast('Failed to update user status', 'error');
            }
        },
        newStatus ? 'Activate' : 'Deactivate',
        newStatus ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#ef4444,#b91c1c)'
    );
}

// ========================================
// Report Generation
// ========================================

async function generateReport(reportType) {
    try {
        firebaseApp.showToast('Generating report...', 'info');

        let reportData = {};

        switch (reportType) {
            case 'student':
                reportData = await generateStudentReport();
                break;
            case 'teacher':
                reportData = await generateTeacherReport();
                break;
            case 'system':
                reportData = await generateSystemReport();
                break;
            case 'performance':
                reportData = await generatePerformanceReport();
                break;
        }

        // Open styled printable HTML report
        openPrintableReport(reportType, reportData);

        firebaseApp.showToast('Report generated successfully!', 'success');

    } catch (error) {
        console.error('Error generating report:', error);
        firebaseApp.showToast('Failed to generate report', 'error');
    }
}

async function generateStudentReport() {
    const students = allUsers.filter(u => u.role === 'student');
    const activeStudents = students.filter(s => s.isActive !== false);
    const resultsSnapshot = await firebaseApp.db.collection('quizResults').get();
    const results = resultsSnapshot.docs.map(doc => doc.data());

    // Calculate average score
    let avgScore = 0;
    if (results.length > 0) {
        avgScore = results.reduce((sum, r) => {
            if (typeof r.percentage === 'number') return sum + r.percentage;
            if (r.score != null && r.maxScore > 0) return sum + (r.score / r.maxScore) * 100;
            return sum;
        }, 0) / results.length;
    }

    // Get unique students who took quizzes
    const studentsWithResults = new Set(results.map(r => r.studentId).filter(Boolean));

    return {
        totalStudents: students.length,
        activeStudents: activeStudents.length,
        inactiveStudents: students.length - activeStudents.length,
        studentsWhoTookQuizzes: studentsWithResults.size,
        totalQuizSubmissions: resultsSnapshot.size,
        averageScore: avgScore.toFixed(1) + '%',
        reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
}

async function generateTeacherReport() {
    const teachers = allUsers.filter(u => u.role === 'teacher');
    const activeTeachers = teachers.filter(t => t.isActive !== false);
    const quizzesSnapshot = await firebaseApp.db.collection('quizzes').get();
    const quizzes = quizzesSnapshot.docs.map(doc => doc.data());

    // Count quizzes by teacher
    const quizzesByTeacher = {};
    quizzes.forEach(q => {
        const name = q.createdByName || 'Unknown';
        quizzesByTeacher[name] = (quizzesByTeacher[name] || 0) + 1;
    });
    const topTeacher = Object.entries(quizzesByTeacher).sort((a, b) => b[1] - a[1])[0];

    return {
        totalTeachers: teachers.length,
        activeTeachers: activeTeachers.length,
        inactiveTeachers: teachers.length - activeTeachers.length,
        totalQuizzesCreated: quizzesSnapshot.size,
        mostActiveTeacher: topTeacher ? `${topTeacher[0]} (${topTeacher[1]} quizzes)` : 'N/A',
        reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
}

async function generateSystemReport() {
    const sessionsSnapshot = await firebaseApp.db.collection('sessions').get();
    const activeSessions = sessionsSnapshot.docs.filter(doc => doc.data().isActive);
    const securityLogs = await firebaseApp.db.collection('securityLogs').get();
    const activityLogs = await firebaseApp.db.collection('activityLogs').get();

    return {
        totalUsers: allUsers.length,
        studentAccounts: allUsers.filter(u => u.role === 'student').length,
        teacherAccounts: allUsers.filter(u => u.role === 'teacher').length,
        secretaryAccounts: allUsers.filter(u => u.role === 'secretary').length,
        activeSessions: activeSessions.length,
        totalSessions: sessionsSnapshot.size,
        securityLogEntries: securityLogs.size,
        activityLogEntries: activityLogs.size,
        reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
}

async function generatePerformanceReport() {
    const resultsSnapshot = await firebaseApp.db.collection('quizResults').get();
    const results = resultsSnapshot.docs.map(doc => doc.data());
    const quizzesSnapshot = await firebaseApp.db.collection('quizzes').get();

    let avgScore = 0;
    if (results.length > 0) {
        avgScore = results.reduce((sum, r) => {
            if (typeof r.percentage === 'number') return sum + r.percentage;
            if (r.score != null && r.maxScore > 0) return sum + (r.score / r.maxScore) * 100;
            return sum;
        }, 0) / results.length;
    }

    // Completion rate: unique students who submitted / total students
    const totalStudents = allUsers.filter(u => u.role === 'student').length;
    const studentsWithResults = new Set(results.map(r => r.studentId).filter(Boolean)).size;
    const completionRate = totalStudents > 0 ? ((studentsWithResults / totalStudents) * 100).toFixed(1) : '0.0';

    // Passing rate (>=75%)
    const passingResults = results.filter(r => {
        let pct = 0;
        if (typeof r.percentage === 'number') pct = r.percentage;
        else if (r.score != null && r.maxScore > 0) pct = (r.score / r.maxScore) * 100;
        return pct >= 75;
    });
    const passingRate = results.length > 0 ? ((passingResults.length / results.length) * 100).toFixed(1) : '0.0';

    return {
        totalQuizzes: quizzesSnapshot.size,
        totalSubmissions: results.length,
        averageScore: avgScore.toFixed(1) + '%',
        completionRate: completionRate + '%',
        passingRate: passingRate + '%',
        studentsParticipated: studentsWithResults,
        reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
}

function openPrintableReport(type, data) {
    const reportTitles = {
        student: '🎓 Student Report',
        teacher: '👨‍🏫 Teacher Report',
        system: '🖥️ System Report',
        performance: '📊 Performance Report'
    };

    const title = reportTitles[type] || 'Report';
    const generatedAt = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    // Build table rows from data
    const rows = Object.entries(data).map(([key, val]) => {
        const label = key.replace(/([A-Z])/g, ' $1')
            .replace(/^./, s => s.toUpperCase())
            .trim();
        return `<tr><td class="label-cell">${label}</td><td class="value-cell">${val}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LNHS LMS — ${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #f0f4ff; color: #1f2937; min-height: 100vh; }
  .report-page { max-width: 860px; margin: 2rem auto; background: white; border-radius: 16px;
    box-shadow: 0 4px 32px rgba(102,126,234,0.12); overflow: hidden; }
  .report-header {
    background: linear-gradient(135deg, #1a237e 0%, #303f9f 50%, #7b1fa2 100%);
    padding: 2.5rem 3rem;
    color: white;
    position: relative;
    overflow: hidden;
  }
  .report-header::after {
    content: '';
    position: absolute;
    top: -60px; right: -60px;
    width: 200px; height: 200px;
    background: rgba(255,255,255,0.05);
    border-radius: 50%;
  }
  .report-school { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .report-school-logo {
    width: 56px; height: 56px; background: rgba(255,255,255,0.15);
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem;
  }
  .report-school-name h1 { font-family: 'Poppins', sans-serif; font-size: 1.5rem; line-height: 1.2; }
  .report-school-name p { font-size: 0.8rem; opacity: 0.75; margin-top: 0.15rem; }
  .report-title-area { margin-top: 1.5rem; }
  .report-type-label {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25);
    padding: 0.3rem 0.9rem;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  .report-main-title { font-family: 'Poppins', sans-serif; font-size: 2rem; font-weight: 800; line-height: 1.1; }
  .report-meta { font-size: 0.85rem; opacity: 0.7; margin-top: 0.5rem; }
  .report-body { padding: 2.5rem 3rem; }
  .report-section-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
  }
  .data-table-report { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  .data-table-report tr { border-bottom: 1px solid #f3f4f6; }
  .data-table-report tr:last-child { border-bottom: none; }
  .label-cell {
    padding: 1rem 1.25rem 1rem 0;
    color: #6b7280;
    font-size: 0.9rem;
    width: 50%;
    font-weight: 500;
  }
  .value-cell {
    padding: 1rem 0 1rem 1.25rem;
    color: #1a237e;
    font-size: 0.95rem;
    font-weight: 700;
    text-align: right;
  }
  .report-footer {
    background: #f9fafb;
    padding: 1.5rem 3rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #9ca3af;
  }
  .footer-badge {
    display: inline-flex; align-items: center; gap: 0.5rem;
    background: #ede9fe; color: #6d28d9; padding: 0.3rem 0.75rem;
    border-radius: 20px; font-weight: 600; font-size: 0.75rem;
  }
  @media print {
    body { background: white; }
    .report-page { box-shadow: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="report-page">
  <div class="report-header">
    <div class="report-school">
      <div class="report-school-logo">🏫</div>
      <div class="report-school-name">
        <h1>LNHS Learning Management System</h1>
        <p>Tagoloan Community College — Official Report</p>
      </div>
    </div>
    <div class="report-title-area">
      <div class="report-type-label">${type} report</div>
      <div class="report-main-title">${title}</div>
      <div class="report-meta">Generated on ${generatedAt}</div>
    </div>
  </div>
  <div class="report-body">
    <div class="report-section-title">Report Data</div>
    <table class="data-table-report">
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
  <div class="report-footer">
    <span>LNHS LMS · Confidential School Document</span>
    <span class="footer-badge">📄 LNHS Official</span>
  </div>
</div>
<script>
  window.onload = function() { window.print(); };
<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    } else {
        firebaseApp.showToast('Pop-up blocked. Please allow pop-ups for this site.', 'warning');
    }
}

// ========================================
// Performance Section
// ========================================

async function loadPerformanceData() {
    try {
        console.log('[Performance] Loading quiz results...');
        const resultsSnapshot = await firebaseApp.db.collection('quizResults').get();
        const results = resultsSnapshot.docs.map(doc => doc.data());
        console.log('[Performance] Quiz results found:', results.length);

        const performanceContainer = document.getElementById('performanceContent');
        if (!performanceContainer) {
            console.warn('[Performance] performanceContent element not found!');
            return;
        }

        if (results.length === 0) {
            console.warn('[Performance] No quiz results returned from Firestore');
            performanceContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No quiz results yet</h3><p>Performance data will appear here as students complete quizzes.</p></div>';
            return;
        }

        // Group by student
        const studentMap = {};
        results.forEach(r => {
            const id = r.studentId || 'unknown';
            if (!studentMap[id]) {
                // Fix name lookup logic — safely get user from allUsers
                let displayName = r.studentName || 'Unknown';
                if (displayName === 'Unknown') {
                    const found = allUsers.find(u => u.id === id);
                    if (found) displayName = `${found.firstName || ''} ${found.lastName || ''}`.trim() || 'Unknown';
                }
                studentMap[id] = {
                    name: displayName,
                    scores: [],
                    total: 0
                };
            }
            // Calculate accurate percentage from score/maxScore
            let pct = 0;
            if (typeof r.percentage === 'number') {
                pct = r.percentage;
            } else if (r.score != null && r.maxScore > 0) {
                pct = (r.score / r.maxScore) * 100;
            } else if (typeof r.score === 'number') {
                pct = r.score;
            }
            studentMap[id].scores.push(pct);
            studentMap[id].total++;
        });

        // Sort by average descending
        const sortedStudents = Object.values(studentMap).sort((a, b) => {
            const avgA = a.scores.reduce((s, v) => s + v, 0) / a.scores.length;
            const avgB = b.scores.reduce((s, v) => s + v, 0) / b.scores.length;
            return avgB - avgA;
        });

        const rows = sortedStudents.map(s => {
            const avg = (s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1);
            const color = avg >= 75 ? '#166534' : avg >= 50 ? '#854d0e' : '#991b1b';
            const bg = avg >= 75 ? '#dcfce7' : avg >= 50 ? '#fef9c3' : '#fee2e2';
            return `
                <tr>
                    <td style="padding:0.9rem 1.25rem; color:var(--gray-100); font-weight:500;">${s.name}</td>
                    <td style="padding:0.9rem 1.25rem; text-align:center; color:var(--gray-300);">${s.total}</td>
                    <td style="padding:0.9rem 1.25rem; text-align:center;">
                        <span style="background:${bg}; color:${color}; padding:0.25rem 0.75rem; border-radius:20px; font-weight:700; font-size:0.85rem;">${avg}%</span>
                    </td>
                </tr>`;
        }).join('');

        const overallAvg = results.length > 0
            ? (results.reduce((s, r) => {
                let pct = 0;
                if (typeof r.percentage === 'number') pct = r.percentage;
                else if (r.score != null && r.maxScore > 0) pct = (r.score / r.maxScore) * 100;
                else if (typeof r.score === 'number') pct = r.score;
                return s + pct;
            }, 0) / results.length).toFixed(1)
            : '0.0';

        // Calculate quiz completion rate
        const totalStudents = allUsers.filter(u => u.role === 'student').length;
        const activeTeachers = allUsers.filter(u => u.role === 'teacher' && u.isActive !== false).length;

        // Fetch all quizzes from Firestore instead of relying on undefined window.allQuizzes
        const quizzesSnapshot = await firebaseApp.db.collection('quizzes').get();
        const quizzes = quizzesSnapshot.docs.map(doc => doc.data());
        const totalQuizzes = quizzes.length;

        const completionRate = (totalStudents > 0 && totalQuizzes > 0)
            ? ((results.length / (totalStudents * totalQuizzes)) * 100).toFixed(1)
            : '0.0';

        console.log('[Performance] Stats:', {
            overallAvg, totalStudents, activeTeachers, totalQuizzes,
            completionRate, resultsCount: results.length
        });

        // Update dashboard stat cards
        const scoreEl = document.getElementById('avgStudentScore');
        console.log('[Performance] avgStudentScore element:', scoreEl ? 'FOUND' : 'NOT FOUND');
        if (scoreEl) scoreEl.textContent = `${overallAvg}%`;

        const compRateEl = document.getElementById('completionRate');
        if (compRateEl) compRateEl.textContent = `${completionRate}%`;

        const teachersEl = document.getElementById('activeTeachers');
        if (teachersEl) teachersEl.textContent = activeTeachers;

        // Quizzes today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const recentQuizzes = quizzes.filter(q => {
            if (!q.createdAt) return false;
            const d = q.createdAt.toDate ? q.createdAt.toDate() : new Date(q.createdAt);
            return d >= todayStart;
        }).length;

        const quizzesEl = document.getElementById('quizzesThisWeek');
        if (quizzesEl) quizzesEl.textContent = recentQuizzes;

        performanceContainer.innerHTML = `
            <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">
                <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                    <div class="stat-value">${results.length}</div>
                    <div class="stat-label">Total Submissions</div>
                </div>
                <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                    <div class="stat-value">${Object.keys(studentMap).length}</div>
                    <div class="stat-label">Students Tracked</div>
                </div>
                <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                    <div class="stat-value">${overallAvg}%</div>
                    <div class="stat-label">Overall Average</div>
                </div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th style="text-align:center;">Quizzes Taken</th>
                            <th style="text-align:center;">Average Score</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;

        // ---- Teacher Performance ----
        const teacherContainer = document.getElementById('teacherPerformanceList');
        if (teacherContainer) {
            // Group quizzes by teacher
            const teacherMap = {};
            quizzes.forEach(q => {
                const tid = q.createdBy || 'unknown';
                if (!teacherMap[tid]) {
                    teacherMap[tid] = {
                        name: q.createdByName || 'Unknown Teacher',
                        count: 0
                    };
                }
                teacherMap[tid].count++;
            });

            const teachersList = Object.values(teacherMap).sort((a, b) => b.count - a.count);
            const topTeacher = teachersList.length > 0 ? teachersList[0] : null;

            const teacherRows = teachersList.map(t => {
                const isTop = topTeacher && t.name === topTeacher.name;
                return `
                    <tr>
                        <td style="padding:0.9rem 1.25rem; color:var(--gray-100); font-weight:500;">${t.name} ${isTop ? '⭐' : ''}</td>
                        <td style="padding:0.9rem 1.25rem; text-align:center; color:var(--gray-300);">${t.count}</td>
                    </tr>`;
            }).join('');

            teacherContainer.innerHTML = `
                <div style="display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap;">
                    <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                        <div class="stat-value">${totalQuizzes}</div>
                        <div class="stat-label">Total Quizzes Created</div>
                    </div>
                    <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                        <div class="stat-value">${teachersList.length}</div>
                        <div class="stat-label">Teachers Tracked</div>
                    </div>
                    <div class="stat-card" style="flex:1; min-width:140px; padding:1rem 1.25rem;">
                        <div class="stat-label" style="margin-bottom:0.35rem;">Most Created Quizzes:</div>
                        <div class="stat-value" style="font-size:0.95rem; word-break:break-word;">${topTeacher ? topTeacher.name : 'N/A'}</div>
                    </div>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Teacher</th>
                                <th style="text-align:center;">Quizzes Created</th>
                            </tr>
                        </thead>
                        <tbody>${teacherRows}</tbody>
                    </table>
                </div>`;
        }

    } catch (error) {
        console.error('Error loading performance data:', error);
        const performanceContainer = document.getElementById('performanceContent');
        if (performanceContainer) {
            performanceContainer.innerHTML = '<div class="empty-state"><p>Failed to load performance data</p></div>';
        }
    }
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

        // Reload activity logs when navigating to activity section
        if (sectionName === 'activity') {
            loadActivityLogs();
        }

        // Load performance data on demand
        if (sectionName === 'performance') {
            loadPerformanceData();
        }

        // Load student records on demand
        if (sectionName === 'student-records') {
            renderStudentRecords();
        }

        // Load school year status on demand
        if (sectionName === 'school-year') {
            loadCurrentSchoolYear();
        }

        // Load graduated students on demand
        if (sectionName === 'graduated') {
            renderGraduatedStudents();
        }
    });
});

// ========================================
// Student Records Quick Access Buttons
// ========================================

// Graduated Students button inside Student Records
const goToGraduatedBtn = document.getElementById('goToGraduatedBtn');
if (goToGraduatedBtn) {
    goToGraduatedBtn.addEventListener('click', () => {
        Object.keys(sections).forEach(key => {
            if (sections[key]) sections[key].classList.add('hidden');
        });
        if (sections['graduated']) sections['graduated'].classList.remove('hidden');
        renderGraduatedStudents();
    });
}

// School Year button inside Student Records
const goToSchoolYearBtn = document.getElementById('goToSchoolYearBtn');
if (goToSchoolYearBtn) {
    goToSchoolYearBtn.addEventListener('click', () => {
        Object.keys(sections).forEach(key => {
            if (sections[key]) sections[key].classList.add('hidden');
        });
        if (sections['school-year']) sections['school-year'].classList.remove('hidden');
        loadCurrentSchoolYear();
    });
}

// ========================================
// Filter Tabs
// ========================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentFilter = btn.dataset.role;

        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
        btn.classList.add('active');

        // Re-render table
        renderUsersTable();
    });
});

// ========================================
// Search
// ========================================

document.getElementById('userSearch').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    const rows = document.querySelectorAll('#usersTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
});

// ========================================
// Helper Functions
// ========================================

function getActivityIcon(action) {
    const icons = {
        'login': '🔐',
        'logout': '🚪',
        'quiz_taken': '📝',
        'quiz_created': '➕',
        'user_status_change': '👤',
        'page_access': '📄'
    };
    return icons[action] || '📋';
}

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
// Activity Filter Handler
// ========================================

const activityFilterSelect = document.getElementById('activityFilter');
if (activityFilterSelect) {
    activityFilterSelect.addEventListener('change', () => {
        // Re-render from the already-loaded logs with the new filter
        renderActivityLogs(activityFilterSelect.value);
    });
}

// ========================================
// Create User Functionality
// ========================================

const userRoleSelect = document.getElementById('userRole');
const lrnGroup = document.getElementById('lrnGroup');
const gradeGroup = document.getElementById('gradeGroup');
const sectionGroup = document.getElementById('sectionGroup');
const createUserForm = document.getElementById('createUserForm');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');

// Show/hide fields based on role selection
userRoleSelect.addEventListener('change', () => {
    const role = userRoleSelect.value;
    const schoolYearGroup = document.getElementById('schoolYearGroup');

    if (role === 'student') {
        lrnGroup.style.display = 'block';
        gradeGroup.style.display = 'block';
        sectionGroup.style.display = 'block';
        if (schoolYearGroup) schoolYearGroup.style.display = 'block';
        document.getElementById('userLRN').required = true;
        document.getElementById('userGrade').required = true;
        document.getElementById('userSection').required = true;
    } else {
        // Teacher (or unset) — hide student-only fields
        lrnGroup.style.display = 'none';
        gradeGroup.style.display = 'none';
        sectionGroup.style.display = 'none';
        if (schoolYearGroup) schoolYearGroup.style.display = 'none';
        document.getElementById('userLRN').required = false;
        document.getElementById('userGrade').required = false;
        document.getElementById('userSection').required = false;
    }
});

// Handle create user form submission
createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = document.getElementById('userRole').value;
    const firstName = document.getElementById('userFirstName').value.trim();
    const middleInitial = (document.getElementById('userMiddleInitial')?.value || '').trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;

    try {
        // Use a SECONDARY Firebase app to create the user account
        // This prevents the current admin from being signed out
        let secondaryApp;
        try {
            secondaryApp = firebase.app('accountCreator');
        } catch (e) {
            // Create secondary app if it doesn't exist yet
            secondaryApp = firebase.initializeApp(firebase.app().options, 'accountCreator');
        }
        const secondaryAuth = secondaryApp.auth();

        // Create user in secondary Auth (does NOT affect current session)
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Sign out from secondary app immediately
        await secondaryAuth.signOut();

        // Prepare user data
        const userData = {
            uid,
            email,
            firstName,
            lastName,
            role,
            isActive: true,
            emailVerified: false,
            settings: {
                darkMode: false,
                notifications: true,
                language: 'English'
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid,
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Add middle initial if provided
        if (middleInitial) {
            userData.middleInitial = middleInitial;
        }

        // Only add school year for students
        if (role === 'student') {
            userData.schoolYear = document.getElementById('userSchoolYear').value;
        }

        // Add role-specific fields
        if (role === 'student') {
            const studentLRN = document.getElementById('userLRN').value.trim();
            userData.lrn = studentLRN;
            userData.grade = document.getElementById('userGrade').value;
            userData.section = document.getElementById('userSection').value.trim();

            // Store LRN to Email mapping for login lookup
            await firebaseApp.db.collection('lrnMapping').doc(studentLRN).set({
                email: email
            });
        }

        // Save to Firestore (admin is still signed in, so permissions work)
        await firebaseApp.db.collection('users').doc(uid).set(userData);

        // Log activity (safe - won't block account creation if logging fails)
        try {
            if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
                await activityTracker.logActivity('user_created', {
                    createdUserId: uid,
                    createdUserRole: role,
                    createdUserName: `${firstName} ${lastName}`
                });
            }
        } catch (logError) {
            console.warn('Activity log failed (non-critical):', logError);
        }

        // Store credentials temporarily for the modal
        lastCreatedCredentials = {
            name: middleInitial ? `${firstName} ${middleInitial}. ${lastName}` : `${firstName} ${lastName}`,
            role: role,
            email: email,
            password: password,
            lrn: role === 'student' ? document.getElementById('userLRN').value.trim() : null
        };

        // Show success modal with credentials
        showAccountCreatedModal(lastCreatedCredentials);

        // Automatically send credentials via email (SMTP)
        try {
            if (typeof sendAccountEmail === 'function') {
                const emailSent = await sendAccountEmail(lastCreatedCredentials);
                if (emailSent === true) {
                    firebaseApp.showToast(`✅ Account created & credentials sent to ${email}!`, 'success');
                    // Update the send button to show it's already sent
                    const sendBtn = document.querySelector('#accountCreatedModal .btn-primary');
                    if (sendBtn) {
                        sendBtn.textContent = '✅ Email Sent! (Click to resend)';
                        sendBtn.style.background = 'linear-gradient(135deg, #43a047, #66bb6a)';
                    }
                } else {
                    firebaseApp.showToast(`✅ Account created! Click "Send Email" to notify ${firstName}.`, 'info');
                }
            } else {
                firebaseApp.showToast(`✅ ${firstName} ${lastName} (${role}) account created!`, 'success');
            }
        } catch (emailError) {
            console.warn('Auto-email failed (non-critical):', emailError);
            firebaseApp.showToast(`✅ Account created! Email sending failed — click the button to retry.`, 'warning');
        }

        // Reset form
        createUserForm.reset();

        // Reload users
        await loadUsers();

    } catch (error) {
        console.error('Error creating user:', error);
        let errorMessage = 'Failed to create account';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email address is already in use';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak (minimum 6 characters)';
        }

        firebaseApp.showToast(errorMessage, 'error');
    }
});

// Cancel button
cancelCreateBtn.addEventListener('click', () => {
    createUserForm.reset();
    document.querySelector('.nav-item[data-section="overview"]').click();
});

// ========================================
// Password Generator & Credential Management
// ========================================

let lastCreatedCredentials = null;

// Generate a random 8-character strong password
function generateRandomPassword() {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%&*';

    // Ensure at least one of each type
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill remaining 4 characters from all pools
    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = 0; i < 4; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password characters
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    // Set the password field
    const passwordField = document.getElementById('userPassword');
    passwordField.value = password;
    passwordField.type = 'text'; // Show the generated password

    firebaseApp.showToast('🔑 Strong password generated!', 'success');
}

// Show the Account Created modal with credentials
function showAccountCreatedModal(credentials) {
    document.getElementById('credName').textContent = credentials.name;
    document.getElementById('credRole').textContent = credentials.role;
    document.getElementById('credEmail').textContent = credentials.email;
    document.getElementById('credPassword').textContent = credentials.password;

    const lrnRow = document.getElementById('credLRNRow');
    if (credentials.lrn) {
        document.getElementById('credLRN').textContent = credentials.lrn;
        lrnRow.style.display = 'block';
    } else {
        lrnRow.style.display = 'none';
    }

    document.getElementById('accountCreatedModal').classList.remove('hidden');
}

// Close the Account Created modal
function closeAccountModal() {
    document.getElementById('accountCreatedModal').classList.add('hidden');
}

// Send credentials via SMTP email (automatic)
async function sendCredentialEmail() {
    if (!lastCreatedCredentials) {
        firebaseApp.showToast('No credentials available to send', 'error');
        return;
    }

    // Disable the button while sending
    const sendBtn = document.querySelector('#accountCreatedModal .btn-primary');
    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Sending email...';

    try {
        // Use the EmailJS sendAccountEmail function from email-config.js
        if (typeof sendAccountEmail === 'function') {
            const result = await sendAccountEmail(lastCreatedCredentials);

            if (result === true) {
                // SMTP email sent successfully!
                firebaseApp.showToast(`📧 Credentials sent to ${lastCreatedCredentials.email} successfully!`, 'success');
                sendBtn.textContent = '✅ Email Sent!';
                sendBtn.style.background = 'linear-gradient(135deg, #43a047, #66bb6a)';

                // Re-enable after 3 seconds
                setTimeout(() => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = originalText;
                    sendBtn.style.background = '';
                }, 3000);
                return;
            } else {
                // Fallback was used (mailto opened)
                firebaseApp.showToast('📧 Email client opened. Please send the email manually.', 'info');
            }
        } else {
            // sendAccountEmail not available, use fallback
            fallbackMailto(lastCreatedCredentials);
            firebaseApp.showToast('📧 Email client opened. Please send the email manually.', 'info');
        }
    } catch (error) {
        console.error('Email sending failed:', error);
        firebaseApp.showToast('❌ Failed to send email. Please try copying credentials instead.', 'error');
    }

    // Re-enable button
    sendBtn.disabled = false;
    sendBtn.textContent = originalText;
}

// Copy credentials to clipboard
function copyCredentials() {
    if (!lastCreatedCredentials) {
        firebaseApp.showToast('No credentials available to copy', 'error');
        return;
    }

    const cred = lastCreatedCredentials;
    let text = `ACCOUNT CREDENTIALS\n`;
    text += `━━━━━━━━━━━━━━━━━━━\n`;
    text += `Name: ${cred.name}\n`;
    text += `Role: ${cred.role.charAt(0).toUpperCase() + cred.role.slice(1)}\n`;

    if (cred.lrn) {
        text += `LRN: ${cred.lrn}\n`;
    }

    text += `Email: ${cred.email}\n`;
    text += `Password: ${cred.password}\n`;

    navigator.clipboard.writeText(text).then(() => {
        firebaseApp.showToast('📋 Credentials copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        firebaseApp.showToast('📋 Credentials copied to clipboard!', 'success');
    });
}

// ========================================
// Student Records by SY-Section
// ========================================

function renderStudentRecords() {
    const syFilter = document.getElementById('srSchoolYearFilter')?.value || 'all';
    const gradeFilter = document.getElementById('srGradeFilter')?.value || 'all';
    const sectionFilter = document.getElementById('srSectionFilter')?.value || 'all';
    const searchQuery = (document.getElementById('srSearchInput')?.value || '').toLowerCase().trim();

    // Filter only students (exclude Graduated)
    let students = allUsers.filter(u => u.role === 'student' && String(u.gradeLevel || u.grade || '') !== 'Graduated');

    // Apply filters
    if (syFilter !== 'all') {
        students = students.filter(s => s.schoolYear === syFilter);
    }
    if (gradeFilter !== 'all') {
        students = students.filter(s => {
            const g = String(s.gradeLevel || s.grade || '');
            return g === gradeFilter;
        });
    }
    if (sectionFilter !== 'all') {
        students = students.filter(s => s.section === sectionFilter);
    }
    if (searchQuery) {
        students = students.filter(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
            const lrn = (s.lrn || '').toLowerCase();
            return name.includes(searchQuery) || lrn.includes(searchQuery);
        });
    }

    // Populate section dropdown dynamically from current students
    const sectionSelect = document.getElementById('srSectionFilter');
    if (sectionSelect) {
        const allStudents = allUsers.filter(u => u.role === 'student');
        const uniqueSections = [...new Set(allStudents.map(s => s.section).filter(Boolean))].sort();
        const currentVal = sectionSelect.value;
        sectionSelect.innerHTML = '<option value="all">All Sections</option>';
        uniqueSections.forEach(sec => {
            sectionSelect.innerHTML += `<option value="${sec}">${sec}</option>`;
        });
        sectionSelect.value = currentVal;
    }

    // Populate SY dropdown dynamically
    const sySelect = document.getElementById('srSchoolYearFilter');
    if (sySelect) {
        const allStudents = allUsers.filter(u => u.role === 'student');
        const uniqueSYs = [...new Set(allStudents.map(s => s.schoolYear).filter(Boolean))].sort().reverse();
        const currentVal = sySelect.value;
        sySelect.innerHTML = '<option value="all">All School Years</option>';
        uniqueSYs.forEach(sy => {
            sySelect.innerHTML += `<option value="${sy}">${sy}</option>`;
        });
        sySelect.value = currentVal;
    }

    // Stats
    const statsContainer = document.getElementById('studentRecordsStats');
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

    // Table body
    const tbody = document.getElementById('studentRecordsBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--gray-500);">
            <div style="font-size:3rem;margin-bottom:1rem;">📚</div>
            <div style="font-size:1.1rem;font-weight:600;">No Students Found</div>
            <div style="font-size:0.85rem;">Try adjusting your filters</div>
        </td></tr>`;
        return;
    }

    // Sort by grade, then section, then name
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
        const statusStyle = isActive
            ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);'
            : 'background:rgba(156,163,175,0.15);color:#9ca3af;border:1px solid rgba(156,163,175,0.3);';
        const hasHistory = (s.gradeHistory || []).length > 0;
        const noSection = !s.section;
        const assignBtnStyle = noSection
            ? 'background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.35);'
            : 'background:rgba(99,102,241,0.12);color:var(--primary-400);border:1px solid rgba(99,102,241,0.25);';
        return `<tr>
            <td style="font-weight:500;color:var(--gray-100);">${s.firstName || ''} ${s.middleInitial ? s.middleInitial + '.' : ''} ${s.lastName || ''}</td>
            <td style="text-align:center;color:var(--gray-300);font-size:0.85rem;">${s.lrn || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.gradeLevel || s.grade || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.section || '<em style="color:var(--gray-600);">None</em>'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.schoolYear || 'N/A'}</td>
            <td style="text-align:center;"><span style="display:inline-flex;align-items:center;gap:0.3rem;${statusStyle}font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.3rem 0.65rem;border-radius:99px;">${isActive ? '● Active' : '○ Inactive'}</span></td>
            <td style="color:var(--gray-400);font-size:0.82rem;">${s.email || 'N/A'}</td>
            <td style="text-align:center;display:flex;gap:0.4rem;justify-content:center;flex-wrap:wrap;">
                <button onclick="openAssignSectionModal('${s.id}')"
                    style="${assignBtnStyle}border-radius:6px;padding:0.25rem 0.6rem;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
                    ✏️ ${noSection ? 'Assign' : 'Edit Section'}
                </button>
                <button onclick="viewStudentGradeHistory('${s.id}')"
                    style="background:${hasHistory ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)'};color:${hasHistory ? 'var(--primary-400)' : 'var(--gray-500)'};border:1px solid ${hasHistory ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:6px;padding:0.25rem 0.6rem;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
                    📋 ${hasHistory ? 'History (' + (s.gradeHistory || []).length + ')' : 'No History'}
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Student Records filter listeners
['srSchoolYearFilter', 'srGradeFilter', 'srSectionFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderStudentRecords);
});
const srSearchInput = document.getElementById('srSearchInput');
if (srSearchInput) {
    let srDebounce;
    srSearchInput.addEventListener('input', () => {
        clearTimeout(srDebounce);
        srDebounce = setTimeout(renderStudentRecords, 300);
    });
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
                loadUsers(),
                loadQuizzes(),
                loadSystemHealth(),
                loadRecentActivity(),
                loadActivityLogs()
            ]);
            updateStats();
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

// Make functions globally available
window.generateReport = generateReport;
window.generateRandomPassword = generateRandomPassword;
window.showAccountCreatedModal = showAccountCreatedModal;
window.closeAccountModal = closeAccountModal;
window.sendCredentialEmail = sendCredentialEmail;
window.copyCredentials = copyCredentials;
window.toggleUserStatus = toggleUserStatus;
window.viewUser = viewUser;

// ========================================
// School Year Interval & Grade Promotion
// ========================================

/**
 * Save the school year interval to Firestore system config.
 * Adds a Firestore doc: systemConfig/schoolYear with startDate, endDate, schoolYear string.
 */
async function setSchoolYear() {
    const startInput = document.getElementById('syStartDate');
    const endInput = document.getElementById('syEndDate');
    const syInput = document.getElementById('syLabel');
    if (!startInput || !endInput || !syInput) return;

    const start = startInput.value;
    const end = endInput.value;
    const label = syInput.value.trim();

    if (!start || !end || !label) {
        firebaseApp.showToast('Please fill in all School Year fields.', 'error');
        return;
    }
    if (new Date(start) >= new Date(end)) {
        firebaseApp.showToast('End date must be after start date.', 'error');
        return;
    }

    try {
        await firebaseApp.db.collection('systemConfig').doc('schoolYear').set({
            schoolYear: label,
            startDate: start,
            endDate: end,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: `${currentUser.firstName} ${currentUser.lastName}`
        });
        firebaseApp.showToast(`✅ School Year "${label}" saved (${start} → ${end})`, 'success');
        loadCurrentSchoolYear();
    } catch (err) {
        console.error('Error saving school year:', err);
        firebaseApp.showToast('Failed to save school year.', 'error');
    }
}

/**
 * Load the current school year from Firestore and display it in the UI.
 */
async function loadCurrentSchoolYear() {
    try {
        const doc = await firebaseApp.db.collection('systemConfig').doc('schoolYear').get();
        const statusEl = document.getElementById('currentSYStatus');
        if (!statusEl) return;
        if (!doc.exists) {
            statusEl.innerHTML = '<em style="color:var(--gray-400);">No school year configured yet.</em>';
            return;
        }
        const d = doc.data();
        const hasdates = d.startDate && d.endDate;
        const daysLeft = hasdates ? Math.ceil((new Date(d.endDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const isExpired = daysLeft !== null && daysLeft < 0;
        const dateRange = hasdates
            ? `<span style="color:var(--gray-400);font-size:0.85rem;">${d.startDate} → ${d.endDate}</span>`
            : `<span style="color:var(--gray-500);font-size:0.85rem;font-style:italic;">No dates configured — please set start/end dates above.</span>`;
        const daysTag = daysLeft !== null
            ? `<span style="padding:0.25rem 0.75rem;border-radius:20px;font-size:0.8rem;font-weight:600;
                background:${isExpired ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)'};
                color:${isExpired ? '#ef4444' : '#22c55e'};">
                ${isExpired ? '⚠️ Expired' : `✅ ${daysLeft} days left`}
              </span>`
            : '';
        statusEl.innerHTML = `
            <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">
                <span style="font-size:1.1rem;font-weight:700;color:var(--primary-300);">📅 ${d.schoolYear}</span>
                ${dateRange}
                ${daysTag}
                ${isExpired ? '<span style="color:#ef4444;font-size:0.82rem;font-weight:600;">→ Promotion recommended!</span>' : ''}
            </div>
        `;
    } catch (err) {
        console.error('Error loading school year:', err);
    }
}

// ========================================
// Moving Up (formerly Promote Students)
// ========================================

/**
 * Render students based on grade filter for Move Up selection
 */
function renderMoveUpStudents() {
    const grade = document.getElementById('moveUpGradeFilter')?.value;
    const container = document.getElementById('moveUpStudentsListContainer');
    const list = document.getElementById('moveUpStudentsList');

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
                <input type="checkbox" class="move-up-student-cb" value="${student.id}" style="width:16px;height:16px;cursor:pointer;margin-right:0.75rem;">
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.9rem;">${student.firstName} ${student.lastName}</div>
                    <div style="font-size:0.75rem;color:var(--gray-400);">Section: ${student.section || 'None'}</div>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('selectAllMoveUp').checked = false;
    container.style.display = 'block';
}

function toggleAllMoveUp(checked) {
    document.querySelectorAll('.move-up-student-cb').forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Move up selected active students:
 * - Saves current grade+section to gradeHistory array
 * - Increments grade by 1 (capped at 10 → 'Graduated')
 * - Clears section (secretary must re-assign sections)
 * - Updates schoolYear field to new school year
 */
async function moveUpStudents() {
    const newSYInput = document.getElementById('promotionTargetSY');
    const newSY = newSYInput ? newSYInput.value.trim() : '';
    if (!newSY) {
        firebaseApp.showToast('Please enter the new school year label (e.g. 2026-2027).', 'error');
        return;
    }

    const selectedIds = Array.from(document.querySelectorAll('.move-up-student-cb:checked')).map(cb => cb.value);

    if (selectedIds.length === 0) {
        firebaseApp.showToast('Please select at least one student to move up.', 'error');
        return;
    }

    showConfirmModal(
        '⚠️ Move Up Selected Students',
        `This will move ${selectedIds.length} selected student(s) up one grade level, archive their current grade & section, clear their section, and set school year to "${newSY}". This CANNOT be undone. Proceed?`,
        async () => {
            try {
                firebaseApp.showToast('⏳ Moving up students...', 'info');

                const batch = firebaseApp.db.batch();
                let count = 0;

                for (const studentId of selectedIds) {
                    const student = allUsers.find(u => u.id === studentId);
                    if (!student) continue;

                    const docRef = firebaseApp.db.collection('users').doc(studentId);
                    const rawGrade = student.gradeLevel || student.grade || '';

                    // Already graduated — just update their school year, keep everything else
                    if (rawGrade === 'Graduated') {
                        batch.update(docRef, { schoolYear: newSY });
                        count++;
                        continue;
                    }

                    const curGrade = parseInt(rawGrade) || 7;
                    const curSection = student.section || '';
                    const curSY = student.schoolYear || '';

                    const historyEntry = { grade: curGrade, section: curSection, schoolYear: curSY, promotedAt: new Date().toISOString() };

                    let newGrade = curGrade + 1;
                    let graduated = false;
                    if (newGrade > 10) { graduated = true; }

                    const updateData = {
                        gradeLevel: graduated ? 'Graduated' : String(newGrade),
                        grade: graduated ? 'Graduated' : String(newGrade),
                        section: '',
                        schoolYear: newSY,
                        gradeHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry)
                    };

                    batch.update(docRef, updateData);
                    count++;
                }

                await batch.commit();

                // Only update the global school year config if they moved up students
                await firebaseApp.db.collection('systemConfig').doc('schoolYear').set({
                    schoolYear: newSY,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                firebaseApp.showToast(`✅ ${count} student(s) moved up to ${newSY}! Sections cleared — please re-assign.`, 'success');

                // Reset UI
                document.getElementById('moveUpGradeFilter').value = '';
                document.getElementById('moveUpStudentsListContainer').style.display = 'none';

                await loadUsers();
                updateStats();
                loadCurrentSchoolYear();
            } catch (err) {
                console.error('Move up error:', err);
                firebaseApp.showToast('Failed to move up students. Please try again.', 'error');
            }
        },
        'Move Up',
        'linear-gradient(135deg,#d97706,#b45309)'
    );
}

/**
 * View the full grade history for a specific student.
 * Renders in a modal overlay with timeline style.
 */
async function viewStudentGradeHistory(studentId) {
    const student = allUsers.find(u => u.id === studentId);
    if (!student) return;

    const history = student.gradeHistory || [];
    const name = `${student.firstName} ${student.lastName}`;

    let historyHTML = '';
    if (history.length === 0) {
        historyHTML = '<p style="color:var(--gray-400);text-align:center;padding:1rem;">No grade history yet — this is the student\'s first school year.</p>';
    } else {
        const sorted = [...history].sort((a, b) => new Date(a.promotedAt) - new Date(b.promotedAt));
        historyHTML = `<div style="display:flex;flex-direction:column;gap:0.75rem;">` +
            sorted.map((h, i) => `
            <div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 1rem;border-radius:10px;background:rgba(255,255,255,0.06);border-left:4px solid var(--primary-500);">
                <div style="font-size:1.5rem;">📚</div>
                <div style="flex:1;">
                    <div style="font-weight:700;color:var(--gray-100);">Grade ${h.grade}${h.section ? ' — Section ' + h.section : ''}</div>
                    <div style="font-size:0.8rem;color:var(--gray-400);">School Year: ${h.schoolYear || '—'} · Promoted: ${h.promotedAt ? new Date(h.promotedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                </div>
                ${i === sorted.length - 1 ? '<span style="font-size:0.7rem;background:rgba(34,197,94,0.12);color:#22c55e;padding:0.2rem 0.5rem;border-radius:10px;font-weight:700;">Latest</span>' : ''}
            </div>`).join('') +
            `</div>`;
    }

    // Current status
    const curGrade = student.gradeLevel || student.grade || '—';
    const curSection = student.section || '—';
    const curSY = student.schoolYear || '—';

    const modal = document.createElement('div');
    modal.id = 'gradeHistoryModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
    modal.innerHTML = `
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);" onclick="document.getElementById('gradeHistoryModal').remove()"></div>
        <div style="position:relative;background:var(--surface-2,#1e293b);border-radius:16px;width:100%;max-width:560px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
            <div style="padding:1.5rem 1.75rem;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--gray-100);">📋 Grade History</h3>
                    <p style="margin:0.25rem 0 0;font-size:0.85rem;color:var(--gray-400);">${name}</p>
                </div>
                <button onclick="document.getElementById('gradeHistoryModal').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--gray-400);">✕</button>
            </div>
            <div style="padding:1.5rem 1.75rem;">
                <div style="padding:0.75rem 1rem;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);margin-bottom:1.25rem;">
                    <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--primary-400);margin-bottom:0.4rem;">Current</div>
                    <div style="font-weight:700;color:var(--gray-100);">Grade ${curGrade} ${curSection !== '—' ? '— Section ' + curSection : '(No section assigned)'}</div>
                    <div style="font-size:0.8rem;color:var(--gray-400);">School Year: ${curSY}</div>
                </div>
                <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--gray-500);margin-bottom:0.75rem;">Previous Grades</div>
                ${historyHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.setSchoolYear = setSchoolYear;
window.promoteAllStudents = promoteAllStudents;
window.viewStudentGradeHistory = viewStudentGradeHistory;
window.loadCurrentSchoolYear = loadCurrentSchoolYear;

// ========================================
// Shared Confirm Modal
// ========================================

function showConfirmModal(title, message, onConfirm, btnLabel = 'Confirm', btnGradient = null) {
    const modal = document.getElementById('confirmModal');
    if (!modal) { if (window.confirm(message)) { if (typeof onConfirm === 'function') onConfirm(); } return; }

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;

    const okBtn = document.getElementById('confirmModalOkBtn');
    okBtn.textContent = btnLabel;
    okBtn.style.background = btnGradient || 'linear-gradient(135deg,#ef4444,#b91c1c)';
    okBtn.style.border = 'none';

    const hdr = document.getElementById('confirmModalHeader');
    if (hdr) hdr.style.background = btnGradient || 'linear-gradient(135deg,#ef4444,#b91c1c)';

    // Swap to remove stale click handlers
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

// ========================================
// Bulk Import Students
// ========================================

/** Open the bulk import modal */
function openBulkImportModal() {
    document.getElementById('bulkImportText').value = '';
    document.getElementById('bulkPreviewArea').style.display = 'none';
    document.getElementById('bulkProgressArea').style.display = 'none';
    document.getElementById('bulkImportBtn').disabled = false;
    document.getElementById('bulkImportModal').classList.remove('hidden');
}

function closeBulkImportModal() {
    document.getElementById('bulkImportModal').classList.add('hidden');
}

/**
 * Parse the pasted CSV/TSV text into an array of student objects.
 * Expected columns: LRN, FirstName, MiddleInitial, LastName, Email, Password, Grade, Section
 * MiddleInitial is optional; if 7 columns are given it is omitted.
 */
function parseBulkCSV(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const overrideGrade = document.getElementById('bulkGrade')?.value || '';
    const overrideSection = document.getElementById('bulkSection')?.value?.trim() || '';
    const schoolYear = document.getElementById('bulkSchoolYear')?.value || '2025-2026';

    const students = [];
    lines.forEach((line, idx) => {
        // Support comma or tab delimiters
        const cols = line.includes('\t') ? line.split('\t') : line.split(',');
        const parts = cols.map(c => c.trim());

        let lrn, firstName, middleInitial, lastName, email, password, grade, section;

        if (parts.length >= 8) {
            [lrn, firstName, middleInitial, lastName, email, password, grade, section] = parts;
        } else if (parts.length === 7) {
            // No middle initial column
            [lrn, firstName, lastName, email, password, grade, section] = parts;
            middleInitial = '';
        } else {
            console.warn(`Bulk import: Row ${idx + 1} has only ${parts.length} columns — skipping.`);
            return;
        }

        // Override if set
        if (overrideGrade) grade = overrideGrade;
        if (overrideSection) section = overrideSection;

        students.push({ lrn, firstName, middleInitial, lastName, email, password, grade, section, schoolYear });
    });
    return students;
}

/** Render a preview table from the pasted data */
function previewBulkStudents() {
    const text = document.getElementById('bulkImportText').value;
    if (!text.trim()) {
        firebaseApp.showToast('Please paste student data first.', 'error');
        return;
    }

    const students = parseBulkCSV(text);
    if (students.length === 0) {
        firebaseApp.showToast('No valid rows found. Check the format.', 'error');
        return;
    }

    document.getElementById('bulkPreviewCount').textContent = students.length;
    document.getElementById('bulkPreviewBody').innerHTML = students.map((s, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${s.lrn || '—'}</td>
            <td>${s.firstName} ${s.middleInitial ? s.middleInitial + '. ' : ''}${s.lastName}</td>
            <td>${s.email}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${s.password}</td>
            <td>${s.grade || '—'}</td>
            <td>${s.section || '—'}</td>
        </tr>
    `).join('');
    document.getElementById('bulkPreviewArea').style.display = 'block';
}

/**
 * Import all students from the parsed CSV.
 * Uses the same secondary Firebase app pattern as the single-user create flow.
 */
async function importBulkStudents() {
    const text = document.getElementById('bulkImportText').value;
    if (!text.trim()) {
        firebaseApp.showToast('Please paste student data first.', 'error');
        return;
    }

    const students = parseBulkCSV(text);
    if (students.length === 0) {
        firebaseApp.showToast('No valid rows to import.', 'error');
        return;
    }

    const importBtn = document.getElementById('bulkImportBtn');
    importBtn.disabled = true;

    const progressArea = document.getElementById('bulkProgressArea');
    const progressBar = document.getElementById('bulkProgressBar');
    const progressLabel = document.getElementById('bulkProgressLabel');
    const summaryEl = document.getElementById('bulkResultSummary');
    progressArea.style.display = 'block';
    summaryEl.innerHTML = '';

    let success = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        progressLabel.textContent = `${i + 1} / ${students.length}`;
        progressBar.style.width = `${Math.round(((i + 1) / students.length) * 100)}%`;

        try {
            if (!s.email || !s.password) throw new Error('Missing email or password');

            // Use secondary Firebase app (same pattern as single-user create)
            const accountCreator = firebase.initializeApp(firebaseApp.config, `bulkCreator_${Date.now()}_${i}`);
            const tempAuth = accountCreator.auth();

            let uid;
            try {
                const userCred = await tempAuth.createUserWithEmailAndPassword(s.email, s.password);
                uid = userCred.user.uid;
                await tempAuth.signOut();
            } finally {
                await accountCreator.delete();
            }

            // Save user doc to Firestore
            const userData = {
                uid,
                email: s.email,
                firstName: s.firstName || '',
                middleInitial: s.middleInitial || '',
                lastName: s.lastName || '',
                role: 'student',
                lrn: s.lrn || '',
                grade: s.grade || '',
                gradeLevel: s.grade || '',
                section: s.section || '',
                schoolYear: s.schoolYear || '2025-2026',
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebaseApp.db.collection('users').doc(uid).set(userData);

            // Save LRN mapping
            if (s.lrn) {
                await firebaseApp.db.collection('lrnMapping').doc(s.lrn).set({ uid, email: s.email });
            }

            success++;
        } catch (err) {
            failed++;
            errors.push(`Row ${i + 1} (${s.email}): ${err.message}`);
        }
    }

    // Show results
    summaryEl.innerHTML = `
        <div style="color:#22c55e;font-weight:700;">✅ ${success} imported successfully</div>
        ${failed > 0 ? `<div style="color:#ef4444;font-weight:700;margin-top:0.3rem;">❌ ${failed} failed</div>` : ''}
        ${errors.map(e => `<div style="color:var(--gray-400);font-size:0.75rem;margin-top:0.15rem;">${e}</div>`).join('')}
    `;

    if (failed === 0) {
        firebaseApp.showToast(`✅ ${success} students imported!`, 'success');
        setTimeout(closeBulkImportModal, 1800);
    } else {
        firebaseApp.showToast(`⚠️ ${success} imported, ${failed} failed. See details.`, 'warning');
    }

    // Log activity
    if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
        await activityTracker.logActivity('bulk_students_imported', { success, failed });
    }

    await loadUsers();
    updateStats();
    importBtn.disabled = false;
}

window.openBulkImportModal = openBulkImportModal;
window.closeBulkImportModal = closeBulkImportModal;
window.previewBulkStudents = previewBulkStudents;
window.importBulkStudents = importBulkStudents;

// ========================================
// Assign Section (per-student)
// ========================================

/**
 * Open the Assign Section modal for a single student.
 */
function openAssignSectionModal(studentId) {
    const student = allUsers.find(u => u.id === studentId);
    if (!student) return;

    document.getElementById('assignSectionStudentId').value = studentId;
    document.getElementById('assignSectionStudentName').textContent =
        `${student.firstName || ''} ${student.middleInitial ? student.middleInitial + '. ' : ''}${student.lastName || ''}`;
    document.getElementById('assignSectionStudentMeta').textContent =
        `Grade ${student.gradeLevel || student.grade || '—'} · ${student.schoolYear || '—'}`;
    document.getElementById('assignSectionInput').value = student.section || '';
    document.getElementById('assignSectionModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('assignSectionInput').focus(), 100);
}

function closeAssignSectionModal() {
    document.getElementById('assignSectionModal').classList.add('hidden');
}

/**
 * Save the section entered in the Assign Section modal to Firestore.
 */
async function saveStudentSection() {
    const studentId = document.getElementById('assignSectionStudentId').value;
    const newSection = document.getElementById('assignSectionInput').value.trim();

    if (!studentId) return;
    if (!newSection) {
        firebaseApp.showToast('Please enter a section name.', 'error');
        return;
    }

    try {
        await firebaseApp.db.collection('users').doc(studentId).update({ section: newSection });
        firebaseApp.showToast(`✅ Section "${newSection}" saved!`, 'success');
        closeAssignSectionModal();
        await loadUsers();
        renderStudentRecords();
    } catch (err) {
        console.error('Error saving section:', err);
        firebaseApp.showToast('Failed to save section. Please try again.', 'error');
    }
}

window.openAssignSectionModal = openAssignSectionModal;
window.closeAssignSectionModal = closeAssignSectionModal;
window.saveStudentSection = saveStudentSection;

// ========================================
// Bulk Section Assigner (School Year tab)
// ========================================

/**
 * Render the list of students for the selected grade who have no section assigned.
 * Called by the grade dropdown onchange in the Bulk Section Assigner card.
 */
function renderUnassignedStudents(grade) {
    const container = document.getElementById('unassignedStudentsList');
    if (!container) return;

    if (!grade) {
        container.innerHTML = '<em>Select a grade to see students.</em>';
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
                <input type="checkbox" id="sSelectAllUnassigned" onchange="sToggleAllUnassigned(this)">
                <span>Select All</span>
            </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.6rem;max-height:220px;overflow-y:auto;padding-right:0.5rem;" id="sUnassignedCheckboxes">
            ${sorted.map(s => `
                <label style="display:flex;align-items:center;gap:0.4rem;background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:0.4rem 0.75rem;font-size:0.82rem;font-weight:500;cursor:pointer;transition:all 0.2s;">
                    <input type="checkbox" class="s-bulk-assign-checkbox" value="${s.id}">
                    ${s.firstName} ${s.lastName} ${s.section ? `<span style="font-size:0.7rem;opacity:0.7;">(Sec: ${s.section})</span>` : '<span style="font-size:0.7rem;opacity:0.7;color:#fbbf24;">(No section)</span>'}
                </label>`).join('')}
        </div>`;
}

/**
 * Assign the typed section to all unassigned students of the selected grade.
 */
async function bulkAssignSection() {
    const grade = document.getElementById('bulkAssignGrade')?.value;
    const section = document.getElementById('bulkAssignSection')?.value.trim();

    if (!grade) {
        firebaseApp.showToast('Please select a grade level.', 'error');
        return;
    }
    if (!section) {
        firebaseApp.showToast('Please enter a section name.', 'error');
        return;
    }

    // Collect IDs of checked students
    const checkedBoxes = Array.from(document.querySelectorAll('.s-bulk-assign-checkbox:checked'));
    const selectedIds = checkedBoxes.map(cb => cb.value);

    if (selectedIds.length === 0) {
        firebaseApp.showToast('Please select at least one student to assign the section to.', 'warning');
        return;
    }

    showConfirmModal(
        `📋 Bulk Assign Section`,
        `Assign section "${section}" to ${selectedIds.length} selected ${selectedIds.length === 1 ? 'student' : 'students'} in Grade ${grade}?`,
        async () => {
            try {
                const batch = firebaseApp.db.batch();
                selectedIds.forEach(id => {
                    const ref = firebaseApp.db.collection('users').doc(id);
                    batch.update(ref, { section });
                });
                await batch.commit();
                firebaseApp.showToast(`✅ Section "${section}" assigned to ${selectedIds.length} student(s)!`, 'success');
                document.getElementById('bulkAssignSection').value = '';
                await loadUsers();
                renderUnassignedStudents(grade);
                renderStudentRecords();
            } catch (err) {
                console.error('Bulk assign error:', err);
                firebaseApp.showToast('Failed to assign sections. Please try again.', 'error');
            }
        },
        'Assign Sections',
        'linear-gradient(135deg,#6366f1,#4f46e5)'
    );
}

// Helper to toggle all checkboxes in the Secretary Bulk Assigner
function sToggleAllUnassigned(source) {
    const checkboxes = document.querySelectorAll('.s-bulk-assign-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

window.renderUnassignedStudents = renderUnassignedStudents;
window.bulkAssignSection = bulkAssignSection;
window.sToggleAllUnassigned = sToggleAllUnassigned;

// ========================================
// Graduated Students
// ========================================

/**
 * Render the Graduated Students section.
 * Shows only students whose grade === 'Graduated'.
 */
function renderGraduatedStudents() {
    const syFilter = document.getElementById('gradSyFilter')?.value || 'all';
    const searchQuery = (document.getElementById('gradSearchInput')?.value || '').toLowerCase().trim();

    let graduated = allUsers.filter(u =>
        u.role === 'student' &&
        String(u.gradeLevel || u.grade || '') === 'Graduated'
    );

    // Populate SY dropdown dynamically
    const sySelect = document.getElementById('gradSyFilter');
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
            const lrn = (s.lrn || '').toLowerCase();
            return name.includes(searchQuery) || lrn.includes(searchQuery);
        });
    }

    // Stats
    const statsContainer = document.getElementById('graduatedStats');
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
    const tbody = document.getElementById('graduatedStudentsBody');
    if (!tbody) return;

    if (graduated.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--gray-500);">
            <div style="font-size:3rem;margin-bottom:1rem;">🎓</div>
            <div style="font-size:1.1rem;font-weight:600;">No Graduated Students Found</div>
            <div style="font-size:0.85rem;">Try adjusting your filters</div>
        </td></tr>`;
        return;
    }

    // Sort by name
    graduated.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    tbody.innerHTML = graduated.map(s => {
        const isActive = s.isActive !== false;
        const statusStyle = isActive
            ? 'background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);'
            : 'background:rgba(156,163,175,0.15);color:#9ca3af;border:1px solid rgba(156,163,175,0.3);';
        const hasHistory = (s.gradeHistory || []).length > 0;
        return `<tr>
            <td style="font-weight:500;color:var(--gray-100);">${s.firstName || ''} ${s.middleInitial ? s.middleInitial + '.' : ''} ${s.lastName || ''}</td>
            <td style="text-align:center;color:var(--gray-300);font-size:0.85rem;">${s.lrn || 'N/A'}</td>
            <td style="text-align:center;color:var(--gray-300);">${s.schoolYear || 'N/A'}</td>
            <td style="text-align:center;"><span style="display:inline-flex;align-items:center;gap:0.3rem;${statusStyle}font-size:0.72rem;font-weight:700;text-transform:uppercase;padding:0.3rem 0.65rem;border-radius:99px;">${isActive ? '● Active' : '○ Inactive'}</span></td>
            <td style="color:var(--gray-400);font-size:0.82rem;">${s.email || 'N/A'}</td>
            <td style="text-align:center;">
                <button onclick="viewStudentGradeHistory('${s.id}')"
                    style="background:${hasHistory ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)'};color:${hasHistory ? 'var(--primary-400)' : 'var(--gray-500)'};border:1px solid ${hasHistory ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:6px;padding:0.25rem 0.6rem;font-size:0.75rem;cursor:pointer;white-space:nowrap;">
                    📋 ${hasHistory ? 'History (' + (s.gradeHistory || []).length + ')' : 'No History'}
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Filter listeners for Graduated Students section
['gradSyFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderGraduatedStudents);
});
const gradSearchInput = document.getElementById('gradSearchInput');
if (gradSearchInput) {
    let gradDebounce;
    gradSearchInput.addEventListener('input', () => {
        clearTimeout(gradDebounce);
        gradDebounce = setTimeout(renderGraduatedStudents, 300);
    });
}

window.renderGraduatedStudents = renderGraduatedStudents;
