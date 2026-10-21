/**
 * Screenshot Blocker
 * Prevents students from taking screenshots during quizzes
 * Detects and blocks various screenshot methods
 * Logs to Firestore securityLogs collection
 */

class ScreenshotBlocker {
    constructor() {
        this.isActive = false;
        this.blockedAttempts = 0;
        this._keyHandler = null;
        this._contextMenuHandler = null;
        this._pasteHandler = null;
        this._copyHandler = null;
        this._dragHandler = null;
        this._visibilityHandler = null;
        this._blurHandler = null;
        this._logQueue = [];
        this._isFlagged = false;
        this.init();
    }

    /**
     * Initialize screenshot blocker — call on any quiz page
     */
    init() {
        const path = window.location.pathname;
        const href = window.location.href;

        // Activate on quiz.html OR if the page has a quiz in progress indicator
        if (path.includes('quiz') || href.includes('quiz')) {
            this.activate();
        }
    }

    /**
     * Manually activate (call this when a quiz STARTS)
     */
    activate() {
        if (this.isActive) return;
        this.isActive = true;
        console.log('[ScreenshotBlocker] Activated');

        this.blockKeyboardShortcuts();
        this.blockContextMenu();
        this.detectScreenshotAttempts();
        this.addWatermark();
        this.monitorWindowFocus();
    }

    /**
     * Deactivate (call this when quiz ENDS or is submitted)
     */
    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;
        console.log('[ScreenshotBlocker] Deactivated');

        // Remove event listeners
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
        if (this._contextMenuHandler) document.removeEventListener('contextmenu', this._contextMenuHandler, true);
        if (this._pasteHandler) document.removeEventListener('paste', this._pasteHandler, true);
        if (this._copyHandler) document.removeEventListener('copy', this._copyHandler, true);
        if (this._dragHandler) document.removeEventListener('dragstart', this._dragHandler, true);
        if (this._visibilityHandler) document.removeEventListener('visibilitychange', this._visibilityHandler);
        if (this._blurHandler) window.removeEventListener('blur', this._blurHandler);

        // Remove watermark
        const watermark = document.getElementById('screenshotWatermark');
        if (watermark) watermark.remove();

        // Restore body filter in case it was blurred
        document.body.style.filter = '';
    }

    /**
     * Block keyboard shortcuts for screenshots
     */
    blockKeyboardShortcuts() {
        this._keyHandler = (e) => {
            if (!this.isActive) return;

            // Print Screen
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                this.handleBlockedAttempt('PrintScreen key');
                return false;
            }

            // Windows: Win + Shift + S (Snipping Tool)
            if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.handleBlockedAttempt('Win+Shift+S Snipping Tool');
                return false;
            }

            // Mac: Cmd + Shift + 3/4/5
            if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
                e.preventDefault();
                this.handleBlockedAttempt('Mac screenshot shortcut');
                return false;
            }

            // Ctrl+P (Print)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                this.handleBlockedAttempt('Print command (Ctrl+P)');
                return false;
            }

            // F12 (DevTools) — log it but allow if developer
            if (e.key === 'F12') {
                e.preventDefault();
                this.handleBlockedAttempt('Developer Tools (F12)');
                return false;
            }

            // Ctrl+Shift+I (DevTools)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                this.handleBlockedAttempt('Developer Tools (Ctrl+Shift+I)');
                return false;
            }

            // Ctrl+U (View Source)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
                e.preventDefault();
                this.handleBlockedAttempt('View Source (Ctrl+U)');
                return false;
            }
        };

        document.addEventListener('keydown', this._keyHandler, true);
    }

    /**
     * Block right-click context menu
     */
    blockContextMenu() {
        this._contextMenuHandler = (e) => {
            if (!this.isActive) return;
            e.preventDefault();
            this.handleBlockedAttempt('Right-click context menu');

            if (window.firebaseApp && window.firebaseApp.showToast) {
                firebaseApp.showToast('Right-click is disabled during quizzes', 'warning');
            }
            return false;
        };

        document.addEventListener('contextmenu', this._contextMenuHandler, true);
    }

    /**
     * Detect screenshot attempts via clipboard & drag
     */
    detectScreenshotAttempts() {
        // Paste: detect image paste (screenshot pasted into page)
        this._pasteHandler = (e) => {
            if (!this.isActive) return;
            const items = e.clipboardData ? e.clipboardData.items : [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    this.handleBlockedAttempt('Clipboard image paste detected');
                    return false;
                }
            }
        };

        // Copy: log selective copying of quiz content
        this._copyHandler = (e) => {
            if (!this.isActive) return;
            e.preventDefault();
            this.handleBlockedAttempt('Text copy attempt (Ctrl+C)');
            return false;
        };

        // Drag: prevent dragging quiz content
        this._dragHandler = (e) => {
            if (!this.isActive) return;
            e.preventDefault();
            this.handleBlockedAttempt('Drag attempt on quiz content');
            return false;
        };

        document.addEventListener('paste', this._pasteHandler, true);
        document.addEventListener('copy', this._copyHandler, true);
        document.addEventListener('dragstart', this._dragHandler, true);
    }

    /**
     * Add a subtle watermark overlay with user ID
     */
    addWatermark() {
        const existing = document.getElementById('screenshotWatermark');
        if (existing) existing.remove();

        const watermark = document.createElement('div');
        watermark.id = 'screenshotWatermark';
        watermark.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            z-index: 9998;
            background-image: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 100px,
                rgba(255, 0, 0, 0.03) 100px,
                rgba(255, 0, 0, 0.03) 200px
            );
        `;

        // Add user info watermark text
        const user = window.firebaseApp ? firebaseApp.getCurrentUser() : null;
        if (user) {
            const userLabel = document.createElement('div');
            userLabel.style.cssText = `
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%) rotate(-30deg);
                font-size: 36px;
                color: rgba(255, 0, 0, 0.04);
                font-weight: 900;
                white-space: nowrap;
                user-select: none;
                pointer-events: none;
                font-family: monospace;
            `;
            userLabel.textContent = `${user.firstName} ${user.lastName} • ${user.email}`;
            watermark.appendChild(userLabel);
        }

        document.body.appendChild(watermark);
    }

    /**
     * Monitor window focus — blur content when tab switches
     */
    monitorWindowFocus() {
        this._visibilityHandler = () => {
            if (!this.isActive) return;
            if (document.hidden) {
                // Tab switched away
                this.handleBlockedAttempt('Tab/window hidden', 'tab_switch');
                document.body.style.filter = 'blur(8px)';
            } else {
                document.body.style.filter = '';
            }
        };

        // Only log window blur if it's an actual window switch, not just a modal/dropdown click
        let blurTimeout;
        this._blurHandler = () => {
            if (!this.isActive) return;
            blurTimeout = setTimeout(() => {
                if (document.visibilityState !== 'hidden') {
                    // Window truly blurred (not just tabbing to another app)
                    this.handleBlockedAttempt('Browser window lost focus', 'tab_switch');
                }
            }, 300);
        };

        const clearBlur = () => clearTimeout(blurTimeout);

        document.addEventListener('visibilitychange', this._visibilityHandler);
        window.addEventListener('blur', this._blurHandler);
        window.addEventListener('focus', clearBlur);
    }

    /**
     * Handle a blocked screenshot attempt
     */
    handleBlockedAttempt(method, type = 'screenshot') {
        this.blockedAttempts++;
        console.warn(`[ScreenshotBlocker] Attempt #${this.blockedAttempts} blocked: ${method}`);

        // Log to Firestore
        this.logSecurityEvent(method);

        // Warn the user with appropriate message based on event type
        if (window.firebaseApp && window.firebaseApp.showToast) {
            if (type === 'tab_switch') {
                firebaseApp.showToast(
                    `⚠️ Tab switching detected! Leaving the quiz page is not allowed.`,
                    'error'
                );
            } else {
                firebaseApp.showToast(
                    `⚠️ Screenshots are not allowed during quizzes`,
                    'error'
                );
            }
        }

        // Flag after 3 attempts
        if (this.blockedAttempts >= 3 && !this._isFlagged) {
            this._isFlagged = true;
            this.flagForReview();
        }
    }

    /**
     * Log security event to Firestore securityLogs collection
     */
    async logSecurityEvent(method) {
        try {
            // Ensure Firebase is ready
            if (!window.firebaseApp || !window.firebaseApp.db) {
                console.warn('[ScreenshotBlocker] Firebase not ready, queuing log');
                this._logQueue.push(method);
                return;
            }

            const authUser = window.firebase && firebase.auth
                ? firebase.auth().currentUser
                : null;

            if (!authUser) {
                console.warn('[ScreenshotBlocker] No authenticated user, skipping log');
                return;
            }

            const userData = firebaseApp.getCurrentUser();
            const quizId = this._getActiveQuizId();

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
                console.warn('[ScreenshotBlocker] Failed to get real IP', e);
            }

            const securityLog = {
                type: 'screenshot_attempt',
                severity: 'medium',
                description: `Screenshot/capture attempt blocked: ${method}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: authUser.uid,
                userName: userData
                    ? `${userData.firstName} ${userData.lastName}`
                    : authUser.displayName || 'Unknown',
                userEmail: authUser.email,
                userRole: userData ? userData.role : 'student',
                page: window.location.pathname,
                method: method,
                totalAttempts: this.blockedAttempts,
                quizId: quizId,
                resolved: false,
                ipAddress: realIp // Now correctly fetched real IP
            };

            await firebaseApp.db.collection('securityLogs').add(securityLog);
            console.log('[ScreenshotBlocker] Security event logged to Firestore');

            // Flush any queued logs
            if (this._logQueue.length > 0) {
                for (const queuedMethod of this._logQueue) {
                    await firebaseApp.db.collection('securityLogs').add({
                        ...securityLog,
                        method: queuedMethod,
                        description: `Screenshot/capture attempt blocked: ${queuedMethod} (queued)`
                    });
                }
                this._logQueue = [];
            }

        } catch (error) {
            console.error('[ScreenshotBlocker] Error logging security event:', error);
        }
    }

    /**
     * Get current active quiz ID from the URL or page
     */
    _getActiveQuizId() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('id')) return urlParams.get('id');
        if (urlParams.has('quizId')) return urlParams.get('quizId');

        // Try to get from a data attribute on the page
        const quizEl = document.querySelector('[data-quiz-id]');
        if (quizEl) return quizEl.dataset.quizId;

        return 'unknown';
    }

    /**
     * Flag user for review after multiple attempts — notifies principal
     */
    async flagForReview() {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;

            const authUser = firebase.auth().currentUser;
            if (!authUser) return;

            const userData = firebaseApp.getCurrentUser();
            const name = userData
                ? `${userData.firstName} ${userData.lastName}`
                : authUser.displayName || 'Unknown Student';

            const notification = {
                recipientRole: 'principal',
                type: 'security_alert',
                title: '⚠️ Multiple Screenshot Attempts Detected',
                message: `Student ${name} (${authUser.email}) has attempted to capture the screen ${this.blockedAttempts} times during a quiz. Their session has been flagged for review.`,
                severity: 'high',
                isRead: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                relatedUserId: authUser.uid,
                relatedUserName: name,
                relatedUserEmail: authUser.email,
                totalAttempts: this.blockedAttempts
            };

            await firebaseApp.db.collection('notifications').add(notification);
            console.warn('[ScreenshotBlocker] User flagged for review — notification sent to principal');

            // Show a stern warning to the student
            if (window.firebaseApp && window.firebaseApp.showToast) {
                firebaseApp.showToast(
                    '🚨 Your repeated screenshot attempts have been reported to the administrator.',
                    'error'
                );
            }

        } catch (error) {
            console.error('[ScreenshotBlocker] Error flagging for review:', error);
        }
    }

    /**
     * Get current blocked attempts count
     */
    getBlockedAttempts() {
        return this.blockedAttempts;
    }

    /**
     * Reset counter (e.g., after quiz resets)
     */
    resetCounter() {
        this.blockedAttempts = 0;
        this._isFlagged = false;
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.screenshotBlocker = new ScreenshotBlocker();
    });
} else {
    window.screenshotBlocker = new ScreenshotBlocker();
}
