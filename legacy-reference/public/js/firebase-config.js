// ========================================
// Firebase Configuration
// ========================================

// Your Firebase configuration from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyBQh1Uz1K8L85A99tW36hnYFDhzhuYV4J8",
    authDomain: "lapasan-learningms.firebaseapp.com",
    projectId: "lapasan-learningms",
    storageBucket: "lapasan-learningms.firebasestorage.app",
    messagingSenderId: "577244091322",
    appId: "1:577244091322:web:8fed9df6c6bd4fec2f0383"
};

// Initialize Firebase (v8 compat syntax)
let app, auth, db;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    // Set persistence to LOCAL so auth survives browser restarts on the same browser
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => {
        console.warn('[LNHS] Could not set auth persistence:', e);
    });

    // initialized
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
}

// ========================================
// Firestore Collections
// ========================================

const collections = {
    users: 'users',
    quizzes: 'quizzes',
    quizResults: 'quizResults',
    quizAttempts: 'quizAttempts', // Track individual attempts (for retakes)
    aiRecommendations: 'aiRecommendations',
    announcements: 'announcements', // Teacher announcements
    notifications: 'notifications', // System notifications
    analytics: 'analytics' // Pre-computed analytics data
};

// ========================================
// Auth State Observer
// ========================================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // auth state: signed in

        // Store user info in localStorage (persists across browser restarts)
        try {
            const userDoc = await db.collection(collections.users).doc(user.uid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();

                // Prevent establishing local session if OTP or Device is not yet verified!
                const isStudent = userData.role === 'student';
                const needsOTP = isStudent && userData.emailVerified !== true;
                
                let needsDeviceVerify = false;
                let lnhsDeviceId = localStorage.getItem('lnhs_device_id');
                if (lnhsDeviceId) {
                    const knownDeviceDoc = await db.collection(collections.users).doc(user.uid).collection('knownDevices').doc(lnhsDeviceId).get();
                    if (!knownDeviceDoc.exists) {
                        needsDeviceVerify = true;
                    }
                } else {
                    needsDeviceVerify = true;
                }

                if (needsOTP || needsDeviceVerify) {
                    // Stop here! User must complete verification in login.js first.
                    localStorage.removeItem('currentUser');
                    sessionStorage.removeItem('currentUser');
                    if (typeof LNHSCookies !== 'undefined') {
                        LNHSCookies.clear();
                    }
                    return;
                }

                establishLocalSession(user, userData);
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    } else {
        // auth state: signed out — clear everything
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');

        // Clear LNHS session cookie
        if (typeof LNHSCookies !== 'undefined') {
            LNHSCookies.clear();
        }
    }
});

// ========================================
// Session Management
// ========================================

/**
 * Establish the local session after all verifications pass
 */
function establishLocalSession(user, userData) {
    const sessionData = {
        uid: user.uid,
        email: user.email,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        emailVerified: user.emailVerified || userData.emailVerified || true,
        grade: userData.grade || null,
        section: userData.section || null,
        lrn: userData.lrn || null,
        createdAt: userData.createdAt
            ? (userData.createdAt.toDate ? userData.createdAt.toDate().toISOString() : userData.createdAt)
            : null
    };

    const rememberMe = localStorage.getItem('lnhs_remember_me') !== 'false';

    if (rememberMe) {
        localStorage.setItem('currentUser', JSON.stringify(sessionData));
    } else {
        sessionStorage.setItem('currentUser', JSON.stringify(sessionData));
    }

    if (typeof LNHSCookies !== 'undefined') {
        LNHSCookies.set(sessionData, rememberMe);
    }
}

/**
 * Get current user from localStorage (persists across browser restarts).
 * Falls back to reading the LNHS cookie if localStorage is empty.
 */
function getCurrentUser() {
    // Primary: sessionStorage then localStorage
    const fromStorage = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
    if (fromStorage) {
        try { return JSON.parse(fromStorage); } catch (e) { /* fall through */ }
    }
    // Fallback: cookie (in case localStorage was cleared)
    if (typeof LNHSCookies !== 'undefined') {
        return LNHSCookies.get();
    }
    return null;
}

/**
 * Check if user is authenticated
 * Note: We primarily rely on sessionStorage for immediate UI state to prevent
 * redirects while Firebase SDK is initializing. Backend rules still protect data.
 */
function isAuthenticated() {
    return getCurrentUser() !== null;
}

/**
 * Check if user has specific role
 */
function hasRole(role) {
    const user = getCurrentUser();
    return user && user.role === role;
}

/**
/**
 * Resolve route path — works for both file:// (local) and https:// (production)
 * Local:      returns relative .html paths  (e.g. 'login.html')
 * Production: returns clean URL slugs       (e.g. '/login')
 */
function getRoute(name) {
    const isLocal = window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
    const map = {
        home: isLocal ? 'index.html' : '/',
        login: isLocal ? 'login.html' : '/login',
        student: isLocal ? 'student-dashboard.html' : '/student',
        teacher: isLocal ? 'teacher-dashboard.html' : '/teacher',
        secretary: isLocal ? 'secretary-dashboard.html' : '/secretary',
        principal: isLocal ? 'principal-dashboard.html' : '/principal',
        developer: isLocal ? 'developer-dashboard.html' : '/developer',
        quiz: isLocal ? 'quiz.html' : '/quiz'
    };
    return map[name] || (isLocal ? 'index.html' : '/');
}

/**
 * Redirect based on user role
 */
function redirectByRole(role) {
    const roleToRoute = {
        student: 'student',
        teacher: 'teacher',
        secretary: 'secretary',
        principal: 'principal',
        developer: 'developer'
    };
    window.location.href = getRoute(roleToRoute[role] || 'home');
}

/**
 * Protect page - redirect if not authenticated or wrong role
 * @param {string|string[]|null} requiredRole - Single role string, array of allowed roles, or null for any authenticated user
 */
function protectPage(requiredRole = null) {
    const user = getCurrentUser();

    if (!isAuthenticated()) {
        window.location.href = getRoute('login');
        return false;
    }

    // If requiredRole is specified, check if user has the required role
    if (requiredRole) {
        // Support both single role and array of roles
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

        if (!allowedRoles.includes(user.role)) {
            // User doesn't have required role, redirect to their dashboard
            redirectByRole(user.role);
            return false;
        }
    }

    return true;
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) { return 'N/A'; }
}

/**
 * Format timestamp to readable date and time
 */
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) { return 'N/A'; }
}

/**
 * Calculate quiz status based on deadline
 */
function getQuizStatus(deadline, isCompleted) {
    if (isCompleted) return 'finished';

    if (!deadline) return 'active'; // No deadline = always active

    try {
        const now = new Date();
        const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);

        if (deadlineDate < now) return 'overdue';
        return 'active';
    } catch (e) {
        return 'active';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // 1. Get or create the toast container
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: flex-end; /* Align to right */
            gap: 12px; /* Space between toasts */
            pointer-events: none; /* Let clicks pass through empty space */
        `;
        document.body.appendChild(container);
    }

    // 2. Create the toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Define colors
    const colors = {
        error: '#ef5350',
        success: '#66bb6a',
        info: '#5c6bc0',
        warning: '#ffa726'
    };

    const bgColor = colors[type] || colors.info;

    // 3. Style the toast
    toast.style.cssText = `
        padding: 16px 24px;
        background: ${bgColor};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        min-width: 300px;
        pointer-events: auto; /* Make toast clickable */
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 500;
    `;

    // 4. Add to container
    container.appendChild(toast);

    // 5. Trigger animation (next frame)
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    // 6. Remove after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';

        // Remove from DOM after transition
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
            // Clean up container if empty
            if (container.children.length === 0) {
                container.remove();
            }
        }, 400);
    }, 4000); // Increased duration slightly
}

// ========================================
// Cross-Tab Logout Detection
// ========================================
// When a user logs out from one tab, automatically log out all other tabs.
// The 'storage' event fires when localStorage is modified from a DIFFERENT tab.
window.addEventListener('storage', (e) => {
    if (e.key === 'lnhs-logout-reason' && e.newValue) {
        // Another tab triggered a logout — sign out this tab too
        console.log('[LNHS] Logout detected from another tab, signing out...');
        auth.signOut().then(() => {
            window.location.href = getRoute('login');
        }).catch(() => {
            window.location.href = getRoute('login');
        });
    }
});

// Export for use in other files
window.firebaseApp = {
    app,
    auth,
    db,
    collections,
    getCurrentUser,
    isAuthenticated,
    hasRole,
    getRoute,
    redirectByRole,
    protectPage,
    formatDate,
    formatDateTime,
    getQuizStatus,
    showToast,
    establishLocalSession
};
