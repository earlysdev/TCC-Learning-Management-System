/**
 * Tab Monitor
 * Detects when students switch tabs/windows during quiz
 * Randomizes questions while preserving selected answers
 */

class TabMonitor {
    constructor() {
        this.isActive = false;
        this.tabChanges = 0;
        this.maxTabChanges = 3; // Warning threshold
        this.isQuizPage = window.location.pathname.includes('quiz.html');
        this.init();
    }

    /**
     * Initialize tab monitor
     */
    init() {
        if (!this.isQuizPage) return;

        // Activate monitoring
        this.activate();
    }

    /**
     * Activate tab monitoring
     */
    activate() {
        this.isActive = true;
        console.log('Tab monitor activated');

        // Monitor visibility changes
        this.monitorVisibility();

        // Monitor window focus
        this.monitorFocus();

        // Monitor fullscreen exit
        this.monitorFullscreen();
    }

    /**
     * Deactivate tab monitoring
     */
    deactivate() {
        this.isActive = false;
        console.log('Tab monitor deactivated');
    }

    /**
     * Monitor page visibility
     */
    monitorVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (!this.isActive) return;

            if (document.hidden) {
                // User switched tabs or minimized window
                this.handleTabChange('visibility_hidden');
            } else {
                // User returned to tab
                this.handleTabReturn();
            }
        });
    }

    /**
     * Monitor window focus
     */
    monitorFocus() {
        window.addEventListener('blur', () => {
            if (!this.isActive) return;
            this.handleTabChange('window_blur');
        });

        window.addEventListener('focus', () => {
            if (!this.isActive) return;
            this.handleTabReturn();
        });
    }

    /**
     * Monitor fullscreen changes
     */
    monitorFullscreen() {
        document.addEventListener('fullscreenchange', () => {
            if (!this.isActive) return;

            if (!document.fullscreenElement) {
                // User exited fullscreen
                this.handleTabChange('fullscreen_exit');
            }
        });
    }

    /**
     * Handle tab change event
     */
    async handleTabChange(reason) {
        this.tabChanges++;

        console.warn(`Tab change detected: ${reason} (Total: ${this.tabChanges})`);

        // Log the event
        await this.logTabChange(reason);

        // Show warning
        this.showWarning();

        // Randomize questions (but preserve answers)
        this.randomizeQuestions();

        // Check if exceeded max changes
        if (this.tabChanges >= this.maxTabChanges) {
            this.handleExcessiveTabChanges();
        }
    }

    /**
     * Handle tab return
     */
    handleTabReturn() {
        console.log('User returned to quiz tab');

        // Show return message
        if (window.firebaseApp && window.firebaseApp.showToast) {
            firebaseApp.showToast(
                'Welcome back! Questions have been randomized.',
                'info'
            );
        }
    }

    /**
     * Show warning to student
     */
    showWarning() {
        if (!window.firebaseApp || !window.firebaseApp.showToast) return;

        const remainingChanges = Math.max(0, this.maxTabChanges - this.tabChanges);

        if (this.tabChanges >= this.maxTabChanges) {
            firebaseApp.showToast(
                '⚠️ Tab switching detected! Questions randomized. This has been logged.',
                'error'
            );
        } else {
            firebaseApp.showToast(
                `⚠️ Tab switching detected! Questions randomized. (${remainingChanges} warnings remaining)`,
                'warning'
            );
        }
    }

    /**
     * Randomize questions while preserving answers
     */
    randomizeQuestions() {
        // Check if quiz.js has the randomization function
        if (typeof window.randomizeQuestions === 'function') {
            window.randomizeQuestions();
        } else if (typeof window.quizApp !== 'undefined' && typeof window.quizApp.randomizeQuestions === 'function') {
            window.quizApp.randomizeQuestions();
        } else {
            console.warn('Quiz randomization function not found');

            // Fallback: trigger custom event
            const event = new CustomEvent('randomizeQuestions', {
                detail: { reason: 'tab_change', preserveAnswers: true }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Handle excessive tab changes
     */
    async handleExcessiveTabChanges() {
        try {
            const user = firebaseApp.auth.currentUser;
            if (!user) return;

            const userData = firebaseApp.getCurrentUser();

            // Get real IP address
            let realIp = 'unknown';
            try {
                if (window.securityLogger && typeof window.securityLogger.getIPAddress === 'function') {
                    realIp = await window.securityLogger.getIPAddress();
                } else {
                    const response = await fetch('https://api.ipify.org?format=json');
                    const data = await response.json();
                    realIp = data.ip;
                }
            } catch (e) {
                console.warn('[TabMonitor] Failed to get real IP', e);
            }

            // Create security log
            const securityLog = {
                type: 'excessive_tab_changes',
                severity: 'high',
                description: `Student switched tabs ${this.tabChanges} times during quiz`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: user.uid,
                userName: userData ? `${userData.firstName} ${userData.lastName}` : 'Unknown',
                userEmail: user.email,
                page: window.location.pathname,
                tabChanges: this.tabChanges,
                ipAddress: realIp,
                resolved: false
            };

            await firebaseApp.db.collection('securityLogs').add(securityLog);

            // Notify administrators
            const notification = {
                recipientRole: 'teacher',
                type: 'security',
                title: '⚠️ Excessive Tab Switching Detected',
                message: `Student ${userData.firstName} ${userData.lastName} has switched tabs ${this.tabChanges} times during a quiz.`,
                severity: 'medium',
                isRead: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                relatedUserId: user.uid
            };

            await firebaseApp.db.collection('notifications').add(notification);

        } catch (error) {
            console.error('Error handling excessive tab changes:', error);
        }
    }

    /**
     * Log tab change event
     */
    async logTabChange(reason) {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;

            const user = firebaseApp.auth.currentUser;
            if (!user) return;

            const userData = firebaseApp.getCurrentUser();

            const activityLog = {
                userId: user.uid,
                userName: userData ? `${userData.firstName} ${userData.lastName}` : 'Unknown',
                role: userData ? userData.role : 'unknown',
                action: 'tab_change',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                page: window.location.pathname,
                details: {
                    reason: reason,
                    totalTabChanges: this.tabChanges,
                    quizId: this.getQuizId()
                }
            };

            await firebaseApp.db.collection('activityLogs').add(activityLog);

        } catch (error) {
            console.error('Error logging tab change:', error);
        }
    }

    /**
     * Get current quiz ID from URL
     */
    getQuizId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || 'unknown';
    }

    /**
     * Get tab changes count
     */
    getTabChanges() {
        return this.tabChanges;
    }

    /**
     * Reset tab changes counter
     */
    resetCounter() {
        this.tabChanges = 0;
    }

    /**
     * Set max tab changes threshold
     */
    setMaxTabChanges(max) {
        this.maxTabChanges = max;
    }

    /**
     * Check if monitoring is active
     */
    isMonitoring() {
        return this.isActive;
    }
}

// Initialize tab monitor
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tabMonitor = new TabMonitor();
    });
} else {
    window.tabMonitor = new TabMonitor();
}
