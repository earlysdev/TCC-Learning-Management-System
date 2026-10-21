/**
 * LNHS Session Manager
 * Premium idle timeout with unique popup design
 * Tracks LNHS-Session IDs, enforces 10-min idle for students only
 * Teachers, Secretaries, Principals, and Developers are EXEMPT
 */

class SessionManager {
    constructor() {
        this.IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
        this.WARNING_TIME = 1 * 60 * 1000;  // Warning at 1 minutes
        this.COUNTDOWN_INTERVAL = null;
        this.idleTimer = null;
        this.warningTimer = null;
        this.lastActivity = Date.now();
        this.isWarningShown = false;
        this.sessionId = this.generateLNHSSessionId();
        this.isExempt = false;

        // Exempt roles from idle timeout
        this.exemptRoles = ['teacher', 'secretary', 'principal', 'developer'];

        this.init();
    }

    /**
     * Generate unique LNHS-Session ID
     */
    generateLNHSSessionId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();
        return `LNHS-${timestamp}-${random}`;
    }

    /**
     * Initialize session manager
     */
    init() {
        // Check if user role is exempt
        if (window.firebaseApp) {
            const currentUser = firebaseApp.getCurrentUser();
            if (currentUser && this.exemptRoles.includes(currentUser.role)) {
                this.isExempt = true;
                console.log(`[Session] ${currentUser.role} is Exempt from Idle Timeout`);
            }
        }

        // Inject popup CSS
        this.injectStyles();

        // Track user activity
        this.trackActivity();

        // Start idle timer (only for non-exempt users)
        if (!this.isExempt) {
            this.resetIdleTimer();
        }

        // Update last activity in Firestore periodically
        this.startActivitySync();

        // Listen for auth state changes
        if (window.firebaseApp && window.firebaseApp.auth) {
            firebaseApp.auth.onAuthStateChanged((user) => {
                if (user) {
                    this.createSession(user.uid);
                } else {
                    this.endSession();
                }
            });
        }

        // Store session ID in localStorage
        localStorage.setItem('lnhs-session-id', this.sessionId);

        console.log(`[Session] Initialized: ${this.sessionId}`);
    }

    /**
     * Inject the unique idle timeout popup styles
     */
    injectStyles() {
        if (document.getElementById('lnhs-session-styles')) return;

        const style = document.createElement('style');
        style.id = 'lnhs-session-styles';
        style.textContent = `
            /* ========================================
               LNHS SESSION TIMEOUT POPUP
               Unique premium glassmorphism design
               ======================================== */

            .lnhs-session-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(10, 10, 30, 0.85);
                backdrop-filter: blur(12px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: lnhs-fadeIn 0.3s ease-out;
            }

            @keyframes lnhs-fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes lnhs-slideUp {
                from { opacity: 0; transform: translateY(40px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes lnhs-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            @keyframes lnhs-countdown-ring {
                from { stroke-dashoffset: 0; }
                to { stroke-dashoffset: 283; }
            }

            @keyframes lnhs-shimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
            }

            .lnhs-session-popup {
                background: linear-gradient(145deg, #1a1a3e 0%, #0f0f2a 50%, #1a0a2e 100%);
                border: 1px solid rgba(102, 126, 234, 0.25);
                border-radius: 24px;
                width: 90%;
                max-width: 440px;
                overflow: hidden;
                box-shadow:
                    0 0 60px rgba(102, 126, 234, 0.15),
                    0 25px 50px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05);
                animation: lnhs-slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                position: relative;
            }

            .lnhs-session-popup::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle at 70% 30%, rgba(102, 126, 234, 0.06) 0%, transparent 50%);
                pointer-events: none;
            }

            .lnhs-popup-header {
                padding: 2rem 2rem 0.5rem;
                text-align: center;
                position: relative;
            }

            .lnhs-popup-icon-ring {
                position: relative;
                width: 100px;
                height: 100px;
                margin: 0 auto 1rem;
            }

            .lnhs-popup-icon-ring svg {
                width: 100%;
                height: 100%;
                transform: rotate(-90deg);
            }

            .lnhs-ring-bg {
                fill: none;
                stroke: rgba(255, 255, 255, 0.08);
                stroke-width: 4;
            }

            .lnhs-ring-fill {
                fill: none;
                stroke: #667eea;
                stroke-width: 4;
                stroke-linecap: round;
                transition: stroke-dashoffset 1s linear;
                filter: drop-shadow(0 0 8px rgba(102, 126, 234, 0.5));
            }

            .lnhs-ring-fill.warning {
                stroke: #f59e0b;
                filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.5));
            }

            .lnhs-ring-fill.danger {
                stroke: #ef4444;
                filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.5));
                animation: lnhs-pulse 1s infinite;
            }

            .lnhs-countdown-value {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 1.75rem;
                font-weight: 800;
                color: white;
                font-family: 'Inter', monospace;
            }

            .lnhs-popup-title {
                font-size: 1.4rem;
                font-weight: 700;
                color: white;
                margin: 0 0 0.25rem;
                font-family: 'Poppins', sans-serif;
            }

            .lnhs-popup-subtitle {
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.5);
                margin: 0;
                letter-spacing: 0.02em;
            }

            .lnhs-popup-body {
                padding: 1.5rem 2rem;
                text-align: center;
            }

            .lnhs-popup-message {
                font-size: 0.95rem;
                color: rgba(255, 255, 255, 0.75);
                line-height: 1.6;
                margin: 0 0 0.75rem;
            }

            .lnhs-session-id {
                display: inline-block;
                padding: 0.35rem 0.75rem;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                font-family: 'Inter', monospace;
                font-size: 0.7rem;
                color: rgba(255, 255, 255, 0.4);
                letter-spacing: 0.05em;
                margin-top: 0.5rem;
            }

            .lnhs-popup-actions {
                padding: 0 2rem 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }

            .lnhs-btn-continue {
                padding: 0.85rem 1.5rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 14px;
                font-size: 1rem;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Inter', sans-serif;
                position: relative;
                overflow: hidden;
            }

            .lnhs-btn-continue::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
                background-size: 200% 100%;
                animation: lnhs-shimmer 2s infinite;
            }

            .lnhs-btn-continue:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
            }

            .lnhs-btn-logout {
                padding: 0.65rem 1.5rem;
                background: transparent;
                color: rgba(255, 255, 255, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                font-size: 0.85rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Inter', sans-serif;
            }

            .lnhs-btn-logout:hover {
                background: rgba(239, 68, 68, 0.15);
                border-color: rgba(239, 68, 68, 0.4);
                color: #ef4444;
            }

            .lnhs-remember-row {
                padding: 0 2rem 1.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .lnhs-remember-row input[type="checkbox"] {
                accent-color: #667eea;
                width: 16px;
                height: 16px;
                cursor: pointer;
            }

            .lnhs-remember-row label {
                font-size: 0.8rem;
                color: rgba(255, 255, 255, 0.45);
                cursor: pointer;
            }

            /* Responsive */
            @media (max-width: 480px) {
                .lnhs-session-popup {
                    width: 95%;
                    border-radius: 20px;
                }

                .lnhs-popup-header,
                .lnhs-popup-body,
                .lnhs-popup-actions,
                .lnhs-remember-row {
                    padding-left: 1.5rem;
                    padding-right: 1.5rem;
                }

                .lnhs-popup-title {
                    font-size: 1.2rem;
                }

                .lnhs-popup-icon-ring {
                    width: 80px;
                    height: 80px;
                }

                .lnhs-countdown-value {
                    font-size: 1.4rem;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Track user activity events
     */
    trackActivity() {
        const events = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart',
            'click'
        ];

        events.forEach(event => {
            document.addEventListener(event, () => {
                this.updateActivity();
            }, true);
        });
    }

    /**
     * Update last activity timestamp
     */
    updateActivity() {
        this.lastActivity = Date.now();

        if (!this.isExempt) {
            this.resetIdleTimer();
        }

        // Hide warning if shown
        if (this.isWarningShown) {
            this.hideWarning();
        }
    }

    /**
     * Reset idle timer
     */
    resetIdleTimer() {
        if (this.isExempt) return;

        // Clear existing timers
        if (this.idleTimer) clearTimeout(this.idleTimer);
        if (this.warningTimer) clearTimeout(this.warningTimer);

        // Set warning timer (9 minutes)
        this.warningTimer = setTimeout(() => {
            this.showWarning();
        }, this.WARNING_TIME);

        // Set logout timer (10 minutes)
        this.idleTimer = setTimeout(() => {
            this.handleIdleTimeout();
        }, this.IDLE_TIMEOUT);
    }

    /**
     * Show the unique premium warning popup
     */
    showWarning() {
        if (this.isExempt) return;
        if (this.isWarningShown) return;

        this.isWarningShown = true;
        this.countdownSeconds = 60;

        // Build the popup HTML
        const overlay = document.createElement('div');
        overlay.id = 'lnhsSessionOverlay';
        overlay.className = 'lnhs-session-overlay';

        const circumference = 2 * Math.PI * 45; // radius = 45

        overlay.innerHTML = `
            <div class="lnhs-session-popup">
                <div class="lnhs-popup-header">
                    <div class="lnhs-popup-icon-ring">
                        <svg viewBox="0 0 100 100">
                            <circle class="lnhs-ring-bg" cx="50" cy="50" r="45"/>
                            <circle class="lnhs-ring-fill" id="lnhsCountdownRing" cx="50" cy="50" r="45"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="0"/>
                        </svg>
                        <span class="lnhs-countdown-value" id="lnhsCountdownText">0:60</span>
                    </div>
                    <h2 class="lnhs-popup-title">⏰ Session Expiring</h2>
                    <p class="lnhs-popup-subtitle">Press any key or move your cursor to continue</p>
                </div>

                <div class="lnhs-popup-body">
                    <p class="lnhs-popup-message">
                        You've been inactive for a while. Your session will end automatically to protect your account.
                    </p>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Start countdown animation
        this.startCountdown(circumference);

        // Add "Press any key or move cursor" logic
        const resetByAction = (e) => {
            if (this.isWarningShown) {
                this.updateActivity();
                this.hideWarning();
            }
            window.removeEventListener('mousemove', resetByAction);
            window.removeEventListener('keydown', resetByAction);
        };

        window.addEventListener('mousemove', resetByAction);
        window.addEventListener('keydown', resetByAction);
    }

    /**
     * Start the visual countdown
     */
    startCountdown(circumference) {
        const ring = document.getElementById('lnhsCountdownRing');
        const text = document.getElementById('lnhsCountdownText');

        if (!ring || !text) return;

        this.countdownSeconds = 60;

        this.COUNTDOWN_INTERVAL = setInterval(() => {
            this.countdownSeconds--;

            if (this.countdownSeconds <= 0) {
                clearInterval(this.COUNTDOWN_INTERVAL);
                return;
            }

            // Update text
            const mins = Math.floor(this.countdownSeconds / 60);
            const secs = this.countdownSeconds % 60;
            text.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

            // Update ring
            const progress = (60 - this.countdownSeconds) / 60;
            ring.style.strokeDashoffset = circumference * progress;

            // Color changes
            if (this.countdownSeconds <= 15) {
                ring.classList.remove('warning');
                ring.classList.add('danger');
            } else if (this.countdownSeconds <= 30) {
                ring.classList.add('warning');
            }
        }, 1000);
    }

    /**
     * Hide warning modal
     */
    hideWarning() {
        this.isWarningShown = false;

        if (this.COUNTDOWN_INTERVAL) {
            clearInterval(this.COUNTDOWN_INTERVAL);
            this.COUNTDOWN_INTERVAL = null;
        }

        const overlay = document.getElementById('lnhsSessionOverlay');
        if (overlay) {
            overlay.style.animation = 'lnhs-fadeIn 0.2s ease-out reverse';
            setTimeout(() => overlay.remove(), 200);
        }
    }

    /**
     * Handle idle timeout
     */
    async handleIdleTimeout() {
        console.log('[Session] Idle timeout - logging out');

        await this.logActivity('auto_logout', {
            reason: 'idle_timeout',
            idleTime: this.IDLE_TIMEOUT,
            sessionId: this.sessionId
        });

        await this.logout();
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            this.hideWarning();

            if (window.firebaseApp && window.firebaseApp.auth) {
                await this.endSession();

                // Set reason for login page toast
                localStorage.setItem('lnhs-logout-reason', 'idle');
                await firebaseApp.auth.signOut();

                localStorage.removeItem('lnhs-session-id');

                setTimeout(() => {
                    window.location.href = firebaseApp.getRoute('login');
                }, 800);
            }
        } catch (error) {
            console.error('[Session] Logout error:', error);
            window.location.href = (window.firebaseApp && window.firebaseApp.getRoute)
                ? firebaseApp.getRoute('login')
                : 'login.html';
        }
    }

    /**
     * Create session in Firestore
     */
    async createSession(userId) {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;

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
                console.warn('[SessionManager] IP lookup failed', e);
            }

            const sessionData = {
                userId: userId,
                sessionId: this.sessionId,
                loginTime: firebase.firestore.FieldValue.serverTimestamp(),
                lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
                ipAddress: realIp,
                userAgent: navigator.userAgent,
                isActive: true,
                isExempt: this.isExempt
            };

            await firebaseApp.db.collection('sessions').doc(this.sessionId).set(sessionData);

            await firebaseApp.db.collection('users').doc(userId).update({
                sessionId: this.sessionId,
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error('[Session] Error creating session:', error);
        }
    }

    /**
     * End session in Firestore
     */
    async endSession() {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;
            if (!this.sessionId) return;

            await firebaseApp.db.collection('sessions').doc(this.sessionId).update({
                isActive: false,
                logoutTime: firebase.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error('[Session] Error ending session:', error);
        }
    }

    /**
     * Start periodic activity sync to Firestore
     */
    startActivitySync() {
        setInterval(async () => {
            try {
                if (!window.firebaseApp || !window.firebaseApp.auth) return;
                const user = firebaseApp.auth.currentUser;
                if (!user) return;

                await firebaseApp.db.collection('sessions').doc(this.sessionId).update({
                    lastActivity: firebase.firestore.FieldValue.serverTimestamp()
                });

                await firebaseApp.db.collection('users').doc(user.uid).update({
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });

            } catch (error) {
                // Silent fail for periodic sync
            }
        }, 30000);
    }

    /**
     * Log user activity
     */
    async logActivity(action, details = {}) {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;

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
                console.warn('[SessionManager] IP lookup failed', e);
            }

            const activityLog = {
                userId: user.uid,
                userName: userData ? `${userData.firstName} ${userData.lastName}` : 'Unknown',
                role: userData ? userData.role : 'unknown',
                action: action,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ipAddress: realIp,
                userAgent: navigator.userAgent,
                details: details
            };

            await firebaseApp.db.collection('activityLogs').add(activityLog);

        } catch (error) {
            console.error('[Session] Error logging activity:', error);
        }
    }

    /**
     * Get user's IP address
     * NOTE: External IP lookup removed — it was triggering Chrome security warnings.
     * IP resolution should be done server-side (e.g., Firebase Cloud Functions) if needed.
     */
    async getIPAddress() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Get time until logout
     */
    getTimeUntilLogout() {
        const timeSinceActivity = Date.now() - this.lastActivity;
        const timeRemaining = this.IDLE_TIMEOUT - timeSinceActivity;
        return Math.max(0, timeRemaining);
    }

    /**
     * Format time remaining
     */
    formatTimeRemaining() {
        const ms = this.getTimeUntilLogout();
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Initialize session manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Check for "remember me" setting and adjust timeout
        const remembered = localStorage.getItem('lnhs-remember-me') === 'true';
        window.sessionManager = new SessionManager();
        if (remembered) {
            window.sessionManager.IDLE_TIMEOUT = 30 * 60 * 1000;
            window.sessionManager.WARNING_TIME = 29 * 60 * 1000;
            window.sessionManager.resetIdleTimer();
        }
    });
} else {
    const remembered = localStorage.getItem('lnhs-remember-me') === 'true';
    window.sessionManager = new SessionManager();
    if (remembered) {
        window.sessionManager.IDLE_TIMEOUT = 30 * 60 * 1000;
        window.sessionManager.WARNING_TIME = 29 * 60 * 1000;
        window.sessionManager.resetIdleTimer();
    }
}
