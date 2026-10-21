/**
 * Student Tutorial System
 * Provides a guided walkthrough of the student dashboard for first-time users.
 */

class TutorialSystem {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                section: 'overview',
                title: 'Welcome to Student Dashboard!',
                description: `This is the <strong>first thing you'll see</strong> when you log in.<br><br>
                    Here you can see:<br>
                    • <strong>Total Quizzes</strong> - All quizzes assigned to you<br>
                    • <strong>Completed Quizzes</strong> - Quizzes you've finished<br>
                    • <strong>Pending Quizzes</strong> - Quizzes waiting for you<br><br>
                    Below that is your <strong>Recent Performance</strong> showing your latest quiz results,
                    and <strong>Upcoming Deadlines</strong> for quizzes that are almost due.`,
                element: '#overviewSection',
            },
            {
                section: 'quizzes',
                title: 'My Quizzes 📝',
                description: `This section shows <strong>all existing quizzes</strong> provided by your teachers.<br><br>
                    You'll see three tabs:<br>
                    • <strong>Active</strong> - Current quizzes you can take right now<br>
                    • <strong>Overdue</strong> - Quizzes you missed (view-only unless rescheduled)<br>
                    • <strong>Finished</strong> - All quiz results for analytics and scores<br><br>
                    <strong>Note:</strong> You must answer <strong>every question</strong> before you can submit — no blank answers allowed!`,
                element: '#quizzesSection',
            },
            {
                section: 'quizhistory',
                title: 'My Quizzes History 📚',
                description: `View quizzes taken in <strong>previous school years</strong> or grades.<br><br>
                    What you can do here:<br>
                    • <strong>Filter</strong> by your past grade levels<br>
                    • <strong>Review</strong> your academic history and past quiz results<br>
                    • Track your long-term progress across different school years`,
                element: '#quizhistorySection',
            },
            {
                section: 'scores',
                title: 'My Scores 🎯',
                description: `This section displays <strong>every score</strong> from quizzes you've taken.<br><br>
                    Important notes:<br>
                    • Overdue quizzes are <strong>not counted</strong> in your overall performance<br>
                    • You can see detailed breakdowns of each quiz<br>
                    • Track your progress over time<br>
                    • Compare your performance across different subjects`,
                element: '#scoresSection',
            },
            {
                section: 'recommendations',
                title: 'AI Recommendations 🤖',
                description: `Get <strong>personalized study tips</strong> powered by AI!<br><br>
                    How it works:<br>
                    • AI analyzes your quiz performance<br>
                    • Provides recommendations to improve<br>
                    • Helps you understand mistakes<br>
                    • Suggests areas to focus on<br><br>
                    <strong>Note:</strong> Recommendations appear <strong>after you complete a quiz</strong>.
                    Each quiz has different recommendations based on your answers.`,
                element: '#recommendationsSection',
            }
        ];

        this.overlay = null;
        this.modal = null;
        this.isActive = false;
    }

    // ========================================
    // Initialize Tutorial
    // ========================================

    async init() {
        // Fast local check — if localStorage says done, skip immediately
        const localDone = localStorage.getItem('hasSeenTutorial');
        if (localDone === 'true') {
            this.addHelpButton();
            return;
        }

        // Firestore check — tutorial only runs for NEW accounts
        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                const userDoc = await firebaseApp.db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    if (data.tutorialCompleted === true) {
                        localStorage.setItem('hasSeenTutorial', 'true');
                        this.addHelpButton();
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('[Tutorial] Firestore check failed, falling back to localStorage:', e);
        }

        // New account — auto-start tutorial
        setTimeout(() => this.start(), 1200);
        this.addHelpButton();
    }

    // ========================================
    // Add Help Button
    // ========================================

    addHelpButton() {
        if (document.getElementById('tutorialHelpBtn')) return; // prevent duplicates
        const helpBtn = document.createElement('button');
        helpBtn.id = 'tutorialHelpBtn';
        helpBtn.className = 'tutorial-help-btn';
        helpBtn.innerHTML = '❓ Help';
        helpBtn.onclick = () => this.start();
        document.body.appendChild(helpBtn);
    }

    // ========================================
    // Start Tutorial
    // ========================================

    start() {
        this.currentStep = 0;
        this.isActive = true;
        this.createOverlay();
        this.showStep(0);
    }

    // ========================================
    // Create Overlay
    // ========================================

    createOverlay() {
        // Remove any stale overlays/modals
        document.querySelectorAll('.staff-tutorial-overlay, .staff-tutorial-modal, .tutorial-overlay, .tutorial-modal').forEach(el => el.remove());

        // Transparent overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'staff-tutorial-overlay';
        document.body.appendChild(this.overlay);

        // Side panel
        this.modal = document.createElement('div');
        this.modal.className = 'staff-tutorial-modal';
        document.body.appendChild(this.modal);
    }

    // ========================================
    // Show Step
    // ========================================

    showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) return;

        const step = this.steps[stepIndex];
        this.currentStep = stepIndex;

        this.highlightElement(step.element);

        this.modal.innerHTML = `
            <div class="tutorial-content">
                <div class="tutorial-header">
                    <h2>${step.title}</h2>
                    <button class="tutorial-close" onclick="tutorialSystem.end()">✕</button>
                </div>
                <div class="tutorial-body">
                    <p>${step.description}</p>
                </div>
                <div class="tutorial-footer">
                    <div class="tutorial-progress">
                        <span class="step-indicator">${stepIndex + 1} / ${this.steps.length}</span>
                        <div class="progress-dots">
                            ${this.steps.map((_, i) => `<span class="dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''}"></span>`).join('')}
                        </div>
                    </div>
                    <div class="tutorial-actions">
                        ${stepIndex > 0 ? `<button class="btn btn-outline" onclick="tutorialSystem.previousStep()">← Prev</button>` : ''}
                        ${stepIndex < this.steps.length - 1
                            ? `<button class="btn btn-primary" onclick="tutorialSystem.nextStep()">Next →</button>`
                            : `<button class="btn btn-primary" onclick="tutorialSystem.finish()">Finish ✓</button>`
                        }
                    </div>
                </div>
                ${stepIndex === 0 ? `
                    <div class="tutorial-option">
                        <button class="btn btn-link" onclick="tutorialSystem.dontRemind()">🚫 Don't Remind Me</button>
                    </div>
                ` : ''}
            </div>
        `;

        this.navigateToSection(step.section);
    }

    // ========================================
    // Highlight Element
    // ========================================

    highlightElement(selector) {
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        const element = document.querySelector(selector);
        if (element) {
            element.classList.add('tutorial-highlight');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ========================================
    // Position Modal
    // ========================================

    async dontRemind() {
        localStorage.setItem('hasSeenTutorial', 'true');

        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                await firebaseApp.db.collection('users').doc(user.uid).update({
                    tutorialCompleted: true
                });
            }
        } catch (e) {
            console.warn('[Tutorial] Could not save dontRemind to Firestore:', e);
        }

        this.end();
        if (window.firebaseApp) {
            firebaseApp.showToast('Tutorial hidden. Click ❓ Help anytime to view it again.', 'info');
        }
    }

    // ========================================
    // Navigate to Section
    // ========================================

    navigateToSection(sectionName) {
        const navItem = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
        if (navItem) navItem.click();
    }

    // ========================================
    // Navigation
    // ========================================

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        }
    }

    previousStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    // ========================================
    // Finish Tutorial
    // ========================================

    async finish() {
        localStorage.setItem('hasSeenTutorial', 'true');

        // Mark tutorialCompleted in Firestore so it never re-runs on any device
        try {
            const user = firebaseApp.auth.currentUser;
            if (user) {
                await firebaseApp.db.collection('users').doc(user.uid).update({
                    tutorialCompleted: true
                });
            }
        } catch (e) {
            console.warn('[Tutorial] Could not save tutorialCompleted to Firestore:', e);
        }

        this.end();

        if (window.firebaseApp) {
            firebaseApp.showToast('Tutorial completed! You can replay it anytime using the Help button.', 'success');
        }
    }

    // ========================================
    // End Tutorial
    // ========================================

    end() {
        this.isActive = false;

        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });

        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (this.modal) { this.modal.remove(); this.modal = null; }
        
        document.querySelectorAll('.staff-tutorial-overlay, .staff-tutorial-modal').forEach(el => el.remove());
    }

    // ========================================
    // Reset Tutorial
    // ========================================

    reset() {
        localStorage.removeItem('hasSeenTutorial');
        this.start();
    }
}

// ========================================
// Initialize Tutorial System
// ========================================

const tutorialSystem = new TutorialSystem();

// Auto-initialize ONLY on the Student Dashboard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const path = window.location.pathname;
        if (path.includes('student-dashboard') || path === '/student' || path.endsWith('/student')) {
            tutorialSystem.init();
        }
    });
} else {
    const path = window.location.pathname;
    if (path.includes('student-dashboard') || path === '/student' || path.endsWith('/student')) {
        tutorialSystem.init();
    }
}

// Make globally available
window.tutorialSystem = tutorialSystem;
