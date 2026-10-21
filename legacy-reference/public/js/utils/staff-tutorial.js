/**
 * Staff Tutorial System
 * Guided walkthrough for Teacher, Secretary, and Principal dashboards.
 * Mirrors the student TutorialSystem pattern but adapted for staff roles.
 */

class StaffTutorialSystem {
    constructor(role) {
        this.role = role; // 'teacher' | 'secretary' | 'principal'
        this.currentStep = 0;
        this.steps = this._getSteps(role);
        this.overlay = null;
        this.modal = null;
        this.isActive = false;
    }

    _getSteps(role) {
        const STEPS = {
            teacher: [
                {
                    section: 'overview',
                    title: '👋 Welcome, Teacher!',
                    description: `This is your <strong>Teacher Dashboard</strong> — your command center for managing quizzes and tracking student progress.<br><br>
                        From here you can see:<br>
                        • <strong>Total Students</strong> enrolled<br>
                        • <strong>Active Quizzes</strong> you've published<br>
                        • <strong>Total Submissions</strong> received<br>
                        • <strong>Average Score</strong> for your class<br><br>
                        Use the left sidebar to navigate between sections.`
                },
                {
                    section: 'quizzes',
                    title: '📝 Creating & Managing Quizzes',
                    description: `The <strong>Quizzes</strong> section lets you create, publish, and manage quizzes for your students.<br><br>
                        You can:<br>
                        • <strong>Create Quiz</strong> — Build multiple-choice, identification, or true/false questions<br>
                        • <strong>Assign</strong> — Send to all students, a specific section, or individual students<br>
                        • <strong>Set Deadlines</strong> — Quizzes automatically become overdue when the deadline passes<br>
                        • <strong>Save as Draft</strong> — Work on quizzes before publishing<br><br>
                        <strong>Note:</strong> Your name appears on every quiz you create so students know who assigned it.`
                },
                {
                    section: 'students',
                    title: '👨‍🎓 Student Management',
                    description: `View all students assigned to you with their current performance.<br><br>
                        This section shows:<br>
                        • Student profiles and LRN numbers<br>
                        • Quiz completion rates per student<br>
                        • Average scores and performance tracking<br>
                        • Which students may need extra support`
                },
                {
                    section: 'analytics',
                    title: '📊 Analytics & AI Insights',
                    description: `Track your class performance with real-time analytics.<br><br>
                        You'll find:<br>
                        • <strong>Class Performance Chart</strong> — Average scores per quiz<br>
                        • <strong>Completion Rate</strong> — Doughnut chart of submitted vs pending<br>
                        • <strong>AI Insights</strong> — Automatically identifies struggling students, top performers, and hard quizzes<br><br>
                        Insights update automatically as students submit quizzes!`
                }
            ],

            secretary: [
                {
                    section: 'overview',
                    title: '👋 Welcome, Secretary!',
                    description: `This is your <strong>Secretary Dashboard</strong> — your central hub for creating accounts, tracking performance, and monitoring activity.<br><br>
                        The overview shows:<br>
                        • <strong>Total Users</strong> across all roles<br>
                        • <strong>Active Students</strong> and <strong>Teachers</strong><br>
                        • <strong>Recent Activity</strong> — Latest system events<br><br>
                        Navigate using the left sidebar.`
                },
                {
                    section: 'create-user',
                    title: '👥 Create Account',
                    description: `Create new user accounts for the system.<br><br>
                        You can:<br>
                        • <strong>Create Accounts</strong> for students and teachers<br>
                        • Student accounts require an <strong>LRN</strong>, <strong>Grade</strong>, <strong>Section</strong>, and <strong>School Year</strong><br>
                        • Teacher accounts do <strong>not</strong> need a school year<br><br>
                        Credentials can be safely copied and shared during account creation.`
                },
                {
                    section: 'student-records',
                    title: '📋 Student Records',
                    description: `View the complete roster of <strong>active students</strong> enrolled in the school.<br><br>
                        You can:<br>
                        • <strong>Filter</strong> by School Year, Grade, and Section<br>
                        • <strong>Search</strong> for specific students by name or LRN<br>
                        • <strong>Export</strong> the sorted records for administrative reference<br><br>
                        <em>Graduated students are shown in the separate 🎓 Graduated Students tab.</em>`
                },
                {
                    section: 'graduated',
                    title: '🎓 Graduated Students',
                    description: `View alumni who have completed Grade 10.<br><br>
                        Here you can:<br>
                        • <strong>Filter</strong> by graduation school year<br>
                        • <strong>Search</strong> by name or LRN<br>
                        • View the absolute complete <strong>Grade History</strong> for an alumnus<br><br>
                        Students are moved here automatically after being promoted.`
                },
                {
                    section: 'performance',
                    title: '📊 Performance Metrics',
                    description: `Monitor academic statistics and system usage.<br><br>
                        This section displays:<br>
                        • <strong>Average Student Score</strong> and <strong>Quiz Completion Rate</strong><br>
                        • Total active teachers and newly created quizzes<br>
                        • Detailed per-student submission statistics and averages`
                },
                {
                    section: 'activity',
                    title: '📋 Activity Logs',
                    description: `Monitor relevant system activity in real-time.<br><br>
                        Activity logs track <strong>all users</strong> across the system:<br>
                        • <strong>Login & Logout</strong> events<br>
                        • <strong>Quiz</strong> creation, updating, and submissions<br>
                        • <strong>User Management</strong> actions like password resets and bulk assignments<br><br>
                        Use the filter dropdown to narrow down specific activity types.`
                },
                {
                    section: 'school-year',
                    title: '📅 School Year Management',
                    description: `Manage the academic timeline and advance students.<br><br>
                        Here you can:<br>
                        • View the <strong>Current School Year</strong> details and interval<br>
                        • <strong>Define</strong> the bounds of a new school year<br>
                        • Use <strong>Promote All Students</strong> to push active students up one grade<br>
                        • Group unassigned students rapidly via the <strong>Bulk Section Assigner</strong>`
                }
            ],

            principal: [
                {
                    section: 'overview',
                    title: '🏢 Welcome, Principal!',
                    description: `This is your <strong>Principal Dashboard</strong> — complete system oversight and administration.<br><br>
                        The overview shows:<br>
                        • <strong>Total Students & Teachers</strong><br>
                        • <strong>Total Quizzes</strong> in the system<br>
                        • <strong>Security Alerts</strong> requiring attention<br>
                        • <strong>System Performance</strong> — avg scores, completion rates, active users<br>
                        • <strong>Recent Security Events</strong> and Notifications`
                },
                {
                    section: 'users',
                    title: '👥 User Management',
                    description: `View and manage all user accounts across the system.<br><br>
                        You can:<br>
                        • <strong>Filter</strong> by role (Teacher, Student, Secretary)<br>
                        • <strong>Create</strong>, <strong>Edit</strong>, and <strong>Delete</strong> accounts<br>
                        • <strong>Activate / Deactivate</strong> user access<br><br>
                        <strong>Note:</strong> Principal accounts are excluded from this view to protect admin accounts.`
                },
                {
                    section: 'student-records',
                    title: '📋 Student Records',
                    description: `View the complete roster of students enrolled in the school.<br><br>
                        You can:<br>
                        • <strong>Filter</strong> systematically by School Year, Grade, and Section<br>
                        • Quickly access total student populations within sections<br>
                        • <strong>Export</strong> the structured records for archiving and planning`
                },
                {
                    section: 'graduated',
                    title: '🎓 Graduated Students',
                    description: `View alumni who have completed Grade 10.<br><br>
                        Here you can:<br>
                        • <strong>Filter</strong> by graduation school year<br>
                        • <strong>Search</strong> by name or LRN<br>
                        • View the absolute complete <strong>Grade History</strong> for an alumnus<br><br>
                        Students are moved here automatically after being promoted.`
                },
                {
                    section: 'school-year',
                    title: '📅 School Year Management',
                    description: `Manage the academic calendar and student progression.<br><br>
                        This section lets you:<br>
                        • <strong>View the current School Year</strong> with a progress bar<br>
                        • <strong>Set the School Year Interval</strong> — label, start date, and end date<br>
                        • <strong>Promote All Students</strong> — advances all active students one grade, archives their history, and clears sections<br>
                        • <strong>Bulk Section Assigner</strong> — select students per grade using checkboxes and assign them to a section<br><br>
                        ⚠️ Promotion is <strong>irreversible</strong>. Grade 10 students become <em>Graduated</em>.`
                },
                {
                    section: 'quizzes',
                    title: '📝 Quiz Oversight',
                    description: `Monitor all quizzes created by teachers across the school.<br><br>
                        You can:<br>
                        • View all quizzes by status (Active, Archived, etc.)<br>
                        • See who created each quiz (teacher name)<br>
                        • Click <strong>View Details</strong> to see questions, submissions, and per-student scores<br>
                        • Track which quizzes have low participation`
                },
                {
                    section: 'security',
                    title: '🛡️ Security Monitoring',
                    description: `Real-time security logs for the entire system.<br><br>
                        Security logs include:<br>
                        • <strong>Critical, High, Medium, Low</strong> severity events<br>
                        • Failed login attempts<br>
                        • Account deactivation events<br>
                        • Suspicious access patterns<br><br>
                        Click <strong>Mark as Resolved</strong> to clear addressed security events.`
                },
                {
                    section: 'analytics',
                    title: '📈 System Analytics',
                    description: `System-wide performance analytics with trend data.<br><br>
                        Analytics shows:<br>
                        • <strong>Total Quizzes</strong>, <strong>Average Score</strong>, and <strong>Completion Rate</strong> across all classes<br>
                        • <strong>Performance Trends</strong> — Line chart showing weekly average scores over time<br><br>
                        The chart automatically updates as students submit more quizzes!`
                },
                {
                    section: 'activity',
                    title: '📋 Activity Logs',
                    description: `Monitor all low-level system activity across the entire platform in a scrollable view.<br><br>
                        Activity logs track <strong>everything</strong> in the system:<br>
                        • <strong>Account creations</strong>, edits, and deletions<br>
                        • <strong>Login & Logout</strong> patterns<br>
                        • <strong>Quiz</strong> creation, modification, and deletion events<br><br>
                        Use the detailed filtering tools to rapidly find specific system events.`
                }
            ]
        };
        return STEPS[role] || [];
    }

    // ========================================
    // Initialize
    // ========================================

    async init() {
        const localKey = `hasSeenTutorial_${this.role}`;
        if (localStorage.getItem(localKey) === 'true') {
            this.addHelpButton();
            return;
        }

        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                const doc = await firebaseApp.db.collection('users').doc(user.uid).get();
                if (doc.exists && doc.data()[`tutorialCompleted_${this.role}`] === true) {
                    localStorage.setItem(localKey, 'true');
                    this.addHelpButton();
                    return;
                }
            }
        } catch (e) {
            console.warn('[StaffTutorial] Firestore check failed:', e);
        }

        // New account — auto-start after short delay
        setTimeout(() => this.start(), 1500);
        this.addHelpButton();
    }

    addHelpButton() {
        if (document.getElementById('staffTutorialHelpBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'staffTutorialHelpBtn';
        btn.className = 'tutorial-help-btn';
        btn.innerHTML = '❓ Help';
        btn.onclick = () => this.start();
        document.body.appendChild(btn);
    }

    start() {
        this.currentStep = 0;
        this.isActive = true;
        this._createOverlay();
        this._showStep(0);
    }

    _createOverlay() {
        document.querySelectorAll('.staff-tutorial-overlay, .staff-tutorial-modal, .tutorial-overlay, .tutorial-modal').forEach(el => el.remove());

        // Transparent overlay — dashboard stays fully visible for staff
        this.overlay = document.createElement('div');
        this.overlay.className = 'staff-tutorial-overlay';
        document.body.appendChild(this.overlay);

        // Side panel — all positioning handled by CSS (.staff-tutorial-modal)
        this.modal = document.createElement('div');
        this.modal.className = 'staff-tutorial-modal';
        document.body.appendChild(this.modal);
    }

    _showStep(index) {
        if (index < 0 || index >= this.steps.length) return;
        const step = this.steps[index];
        this.currentStep = index;

        // Highlight section
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        const sectionEl = document.getElementById(`${step.section}Section`);
        if (sectionEl) sectionEl.classList.add('tutorial-highlight');

        // Navigate to section
        const navItem = document.querySelector(`.nav-item[data-section="${step.section}"]`);
        if (navItem) navItem.click();

        this.modal.innerHTML = `
            <div class="tutorial-content">
                <div class="tutorial-header">
                    <h2>${step.title}</h2>
                    <button class="tutorial-close" onclick="staffTutorial.end()">✕</button>
                </div>
                <div class="tutorial-body">
                    <p>${step.description}</p>
                </div>
                <div class="tutorial-footer">
                    <div class="tutorial-progress">
                        <span class="step-indicator">${index + 1} / ${this.steps.length}</span>
                        <div class="progress-dots">
                            ${this.steps.map((_, i) => `<span class="dot ${i === index ? 'active' : ''} ${i < index ? 'completed' : ''}"></span>`).join('')}
                        </div>
                    </div>
                    <div class="tutorial-actions">
                        ${index > 0 ? `<button class="btn btn-outline" onclick="staffTutorial.prev()">← Prev</button>` : ''}
                        ${index < this.steps.length - 1
                ? `<button class="btn btn-primary" onclick="staffTutorial.next()">Next →</button>`
                : `<button class="btn btn-primary" onclick="staffTutorial.finish()">Finish ✓</button>`
            }
                    </div>
                </div>
                ${index === 0 ? `
                    <div class="tutorial-option">
                        <button class="btn btn-link" onclick="staffTutorial.dontRemind()">🚫 Don't Remind Me</button>
                    </div>
                ` : ''}
            </div>
        `;
    }

    next() { if (this.currentStep < this.steps.length - 1) this._showStep(this.currentStep + 1); }
    prev() { if (this.currentStep > 0) this._showStep(this.currentStep - 1); }

    async finish() {
        const localKey = `hasSeenTutorial_${this.role}`;
        localStorage.setItem(localKey, 'true');

        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                await firebaseApp.db.collection('users').doc(user.uid).update({
                    [`tutorialCompleted_${this.role}`]: true
                });
            }
        } catch (e) {
            console.warn('[StaffTutorial] Could not save completion to Firestore:', e);
        }

        this.end();
        if (window.firebaseApp) {
            firebaseApp.showToast('Tutorial complete! Click ❓ Help anytime to replay it.', 'success');
        }
    }

    async dontRemind() {
        const localKey = `hasSeenTutorial_${this.role}`;
        localStorage.setItem(localKey, 'true');

        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                await firebaseApp.db.collection('users').doc(user.uid).update({
                    [`tutorialCompleted_${this.role}`]: true
                });
            }
        } catch (e) {
            console.warn('[StaffTutorial] Could not save dontRemind to Firestore:', e);
        }

        this.end();
        if (window.firebaseApp) {
            firebaseApp.showToast('Tutorial hidden. Click ❓ Help anytime to view it again.', 'info');
        }
    }

    end() {
        this.isActive = false;
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (this.modal) { this.modal.remove(); this.modal = null; }
        // Clean up any stale staff overlay/modal elements
        document.querySelectorAll('.staff-tutorial-overlay, .staff-tutorial-modal').forEach(el => el.remove());
    }

    reset() {
        localStorage.removeItem(`hasSeenTutorial_${this.role}`);
        this.start();
    }
}

// ========================================
// Auto-Initialize on correct dashboard
// ========================================

let staffTutorial = null;

function initStaffTutorial(role) {
    staffTutorial = new StaffTutorialSystem(role);
    staffTutorial.init();
    window.staffTutorial = staffTutorial;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const path = window.location.pathname;
        if (path.includes('teacher-dashboard') || path === '/teacher' || path.endsWith('/teacher')) initStaffTutorial('teacher');
        else if (path.includes('secretary-dashboard') || path === '/secretary' || path.endsWith('/secretary')) initStaffTutorial('secretary');
        else if (path.includes('principal-dashboard') || path === '/principal' || path.endsWith('/principal')) initStaffTutorial('principal');
    });
} else {
    const path = window.location.pathname;
    if (path.includes('teacher-dashboard') || path === '/teacher' || path.endsWith('/teacher')) initStaffTutorial('teacher');
    else if (path.includes('secretary-dashboard') || path === '/secretary' || path.endsWith('/secretary')) initStaffTutorial('secretary');
    else if (path.includes('principal-dashboard') || path === '/principal' || path.endsWith('/principal')) initStaffTutorial('principal');
}
