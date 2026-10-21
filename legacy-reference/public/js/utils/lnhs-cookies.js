/**
 * LNHS Cookie Session Manager
 * Cookie Name: LNHS_DO_NOT_SHARE_THIS_INFORMATION
 *
 * Stores the authenticated user's session data in a secure browser cookie
 * so that users don't need to log in again when reopening the same browser.
 *
 * ⚠️  WARNING: Do NOT share this cookie with anyone. It contains
 *    your session credentials and can grant access to your account.
 */

const LNHSCookies = (() => {
    const COOKIE_NAME = 'LNHS_DO_NOT_SHARE_THIS_INFORMATION';
    const COOKIE_EXPIRY_DAYS = 30;

    /**
     * Encode user data safely as a base64 string.
     * @param {Object} data
     * @returns {string}
     */
    function encode(data) {
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
        } catch (e) {
            console.error('[LNHSCookies] Encode error:', e);
            return null;
        }
    }

    /**
     * Decode the cookie value back to an object.
     * @param {string} value
     * @returns {Object|null}
     */
    function decode(value) {
        try {
            return JSON.parse(decodeURIComponent(escape(atob(value))));
        } catch (e) {
            console.warn('[LNHSCookies] Decode error (cookie may be corrupted):', e);
            return null;
        }
    }

    /**
     * Set the session cookie with user data.
     * Stores: uid, role, email, firstName, lastName, grade, section, lrn
     * @param {Object} userData
     * @param {boolean} rememberMe - If false, creates a session cookie that clears on browser close
     */
    function set(userData, rememberMe = true) {
        if (!userData) return;

        const encoded = encode({
            uid: userData.uid,
            role: userData.role,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            emailVerified: userData.emailVerified || false,
            grade: userData.grade || null,
            section: userData.section || null,
            lrn: userData.lrn || null,
            _ts: Date.now() // timestamp to detect stale cookies
        });

        if (!encoded) return;

        // Build cookie string
        let cookieStr = `${COOKIE_NAME}=${encoded}`;
        
        if (rememberMe) {
            const expires = new Date();
            expires.setDate(expires.getDate() + COOKIE_EXPIRY_DAYS);
            cookieStr += `; expires=${expires.toUTCString()}`;
        }
        cookieStr += `; path=/`;
        cookieStr += `; SameSite=Strict`;

        // Add Secure flag only on HTTPS (not for local file:// testing)
        if (window.location.protocol === 'https:') {
            cookieStr += `; Secure`;
        }

        document.cookie = cookieStr;
    }

    /**
     * Get the session data from the cookie.
     * @returns {Object|null} Parsed user data, or null if no valid cookie exists.
     */
    function get() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, ...valueParts] = cookie.trim().split('=');
            if (name === COOKIE_NAME) {
                const value = valueParts.join('='); // Handle = signs in base64
                return decode(value);
            }
        }
        return null;
    }

    /**
     * Clear (delete) the session cookie. Called on logout.
     */
    function clear() {
        // Set expiry in the past to delete the cookie
        document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
    }

    /**
     * Check if a valid session cookie exists.
     * @returns {boolean}
     */
    function exists() {
        return get() !== null;
    }

    // Expose public API
    return { set, get, clear, exists, COOKIE_NAME };
})();

// Make globally accessible
window.LNHSCookies = LNHSCookies;
