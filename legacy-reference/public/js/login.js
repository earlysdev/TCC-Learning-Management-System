/**
 * Login Page Logic
 * Handles authentication, CAPTCHA, and role redirection
 */

// ========================================
// CAPTCHA System
// ========================================
let captchaNum1 = 0;
let captchaNum2 = 0;
let captchaCorrectAnswer = 0;
let _resendCooldown = null;

function generateCaptcha() {
    // Generate numbers between 1-40 ensuring sum is always <= 100
    captchaNum1 = Math.floor(Math.random() * 40) + 1; // 1-40
    captchaNum2 = Math.floor(Math.random() * 40) + 1; // 1-40
    captchaCorrectAnswer = captchaNum1 + captchaNum2;

    document.getElementById('num1').textContent = captchaNum1;
    document.getElementById('num2').textContent = captchaNum2;

    // Reset input state
    const input = document.getElementById('captchaAnswer');
    input.value = '';
    input.classList.remove('valid', 'invalid');
}

// Generate CAPTCHA on page load
generateCaptcha();

// Real-time Validation for CAPTCHA
const captchaInputEl = document.getElementById('captchaAnswer');

captchaInputEl.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);

    // If empty, reset to neutral
    if (e.target.value === '') {
        e.target.classList.remove('valid', 'invalid');
        return;
    }

    // Strict Validation
    if (val === captchaCorrectAnswer) {
        // Correct -> Green
        e.target.classList.add('valid');
        e.target.classList.remove('invalid');
    } else {
        // Incorrect -> Red (Immediately)
        e.target.classList.add('invalid');
        e.target.classList.remove('valid');
    }
});

// Refresh CAPTCHA button
document.getElementById('refreshCaptcha').addEventListener('click', () => {
    generateCaptcha();
    firebaseApp.showToast('New security question generated', 'info');
});

// ========================================
// Input Validation
// ========================================

function validateLRN(lrn) {
    // LRN must be exactly 12 digits
    const lrnPattern = /^\d{12}$/;
    return lrnPattern.test(lrn);
}

function validateEmail(email) {
    // Email must contain @ symbol
    return email.includes('@') && email.indexOf('@') > 0 && email.indexOf('@') < email.length - 1;
}

function validateUsername(username) {
    // Check if it's LRN or email
    if (username.includes('@')) {
        return {
            isValid: validateEmail(username),
            type: 'email',
            error: 'Invalid email format. Email must contain @ symbol (e.g., name@domain.com)'
        };
    } else {
        return {
            isValid: validateLRN(username),
            type: 'lrn',
            error: 'Invalid LRN format. LRN must be exactly 12 digits (e.g., 123456789012)'
        };
    }
}

// ========================================
// Elements
// ========================================
const loginForm = document.getElementById('loginForm');
const verificationModal = document.getElementById('verificationModal');

const captchaInput = document.getElementById('captchaAnswer');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');
const rememberMeCheckbox = document.getElementById('rememberMe');
const togglePasswordBtn = document.getElementById('togglePassword');

// ========================================
// Password Visibility Toggle
// ========================================
let isPasswordVisible = false;

togglePasswordBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;

    if (isPasswordVisible) {
        passwordInput.type = 'text';
        togglePasswordBtn.innerHTML = `
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
            </svg>
        `;
        togglePasswordBtn.title = 'Hide Password';
    } else {
        passwordInput.type = 'password';
        togglePasswordBtn.innerHTML = `
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
            </svg>
        `;
        togglePasswordBtn.title = 'Show Password';
    }
});

// ========================================
// Remember Me Functionality
// ========================================

// Load saved credentials and check for active LNHS session cookie
window.addEventListener('DOMContentLoaded', () => {
    // ── Logout Toast ────────────────────────────────────────────────────
    const logoutReason = localStorage.getItem('lnhs-logout-reason');
    if (logoutReason) {
        const msg = logoutReason === 'idle' ? '⏰ Session expired for security. Please log in again.' : '🚪 You have been logged out.';
        firebaseApp.showToast(msg, 'success');
        localStorage.removeItem('lnhs-logout-reason');
    }

    // ── LNHS Cookie Auto-Login ──────────────────────────────────────────
    // If a valid session cookie exists, check if Firebase is still signed in.
    // If so, skip the login form entirely and redirect to the user's dashboard.
    if (typeof LNHSCookies !== 'undefined' && LNHSCookies.exists()) {
        const cookieUser = LNHSCookies.get();
        if (cookieUser && cookieUser.role) {
            // Show a brief loading indicator while we verify auth state
            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Restoring session...';
            }

            // Wait for Firebase to confirm the auth state
            const unsubscribe = firebaseApp.auth.onAuthStateChanged((firebaseUser) => {
                unsubscribe(); // Stop listening after first callback

                if (firebaseUser) {
                    // Firebase confirms we're still signed in — redirect immediately
                    firebaseApp.showToast(`👋 Welcome back, ${cookieUser.firstName}!`, 'success');
                    setTimeout(() => {
                        firebaseApp.redirectByRole(cookieUser.role);
                    }, 600);
                } else {
                    // Firebase session expired — clear stale cookie and show login form
                    LNHSCookies.clear();
                    localStorage.removeItem('currentUser');
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Sign In';
                    }
                }
            });
        }
    }

    // ── Remember Me: pre-fill credentials ──────────────────────────────
    const savedUsername = localStorage.getItem('rememberedUsername');
    const savedPassword = localStorage.getItem('rememberedPassword');
    const rememberMe = localStorage.getItem('rememberMe') === 'true';

    if (rememberMe && savedUsername) {
        usernameInput.value = savedUsername;
        rememberMeCheckbox.checked = true;

        // Only fill password if it exists (for security, we decrypt it)
        if (savedPassword) {
            passwordInput.value = atob(savedPassword); // Simple base64 decode
        }
    }
});


// Toggle Remember Me
rememberMeCheckbox.addEventListener('change', (e) => {
    if (!e.target.checked) {
        // Clear saved credentials when unchecked
        localStorage.removeItem('rememberedUsername');
        localStorage.removeItem('rememberedPassword');
        localStorage.removeItem('rememberMe');
        firebaseApp.showToast('Remember Me disabled. Credentials cleared.', 'info');
    }
});


// Login Form Submit
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const userCaptchaAnswer = parseInt(captchaInput.value);

    // Show loading state
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verifying...';
    hideError();

    try {
        // Step 1: Verify CAPTCHA
        if (isNaN(userCaptchaAnswer) || userCaptchaAnswer !== captchaCorrectAnswer) {
            generateCaptcha(); // Generate new question
            firebaseApp.showToast('❌ Incorrect security answer! Try the new question.', 'error');
            throw new Error('Incorrect security answer. Please solve the new math problem.');
        }

        // Step 2: Validate username format
        const validation = validateUsername(username);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        loginBtn.textContent = 'Signing in...';

        // Step 3: Determine if username is email or LRN
        const isEmail = validation.type === 'email';
        let email = username;
        let userData = null;

        // If LRN, look up email from Firestore
        // Stage 1: check lrnMapping collection (fast direct lookup)
        // Stage 2: fallback — query users collection where lrn == username
        if (!isEmail) {
            loginBtn.textContent = 'Signing in...';
            const lrnDoc = await firebaseApp.db.collection('lrnMapping').doc(username).get();

            if (lrnDoc.exists) {
                email = lrnDoc.data().email;
            } else {
                // Fallback: search users collection by lrn field
                const userQuery = await firebaseApp.db.collection(firebaseApp.collections.users)
                    .where('lrn', '==', username)
                    .limit(1)
                    .get();

                if (userQuery.empty) {
                    throw new Error('Incorrect email/LRN or password. Please try again.');
                }

                const userRecord = userQuery.docs[0].data();
                email = userRecord.email;

                // Backfill lrnMapping so next login is instant
                try {
                    await firebaseApp.db.collection('lrnMapping').doc(username).set({ email: userRecord.email });
                } catch (e) { /* non-critical, ignore */ }
            }
        }


        // Step 4: Sign in with Firebase Auth
        localStorage.setItem('lnhs_remember_me', rememberMeCheckbox.checked.toString());
        const userCredential = await firebaseApp.auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Step 5: Get user data from Firestore to determine role
        const userDoc = await firebaseApp.db.collection(firebaseApp.collections.users).doc(user.uid).get();

        if (!userDoc.exists) {
            await firebaseApp.auth.signOut();
            throw new Error('User account not properly configured. Please contact administration.');
        }

        userData = userDoc.data();
        const userRole = userData.role;

        // Step 6: Check if user is active (only block if explicitly deactivated)
        if (userData.isActive === false) {
            await firebaseApp.auth.signOut();
            throw new Error('Your account has been deactivated. Please contact administration.');
        }

        // Step 7: OTP Verification for students
        // Only require OTP if student has NOT yet verified (emailVerified !== true in Firestore)
        if (userRole === 'student' && userData.emailVerified !== true) {
            // Generate 6-digit OTP and store in Firestore (expires in 10 min)
            const otpCode = String(Math.floor(100000 + Math.random() * 900000));
            const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

            await firebaseApp.db.collection(firebaseApp.collections.users).doc(user.uid).update({
                otpCode: otpCode,
                otpExpiry: otpExpiry
            });

            // Try to send via EmailJS (may fail if template not set up yet)
            const studentName = userData.firstName || 'Student';
            const studentEmail = email;
            try {
                if (typeof sendOTPEmail === 'function') {
                    await sendOTPEmail({ name: studentName, email: studentEmail, otpCode });
                    firebaseApp.showToast(`📧 Verification code sent to ${studentEmail}`, 'success');
                } else {
                    // EmailJS template not configured yet — show code in toast for testing
                    console.warn('OTP (dev mode):', otpCode);
                    firebaseApp.showToast(`🔐 Code: ${otpCode} (dev mode — set up EmailJS OTP template)`, 'info');
                }
            } catch (emailErr) {
                console.warn('EmailJS OTP failed, showing dev toast:', emailErr);
                firebaseApp.showToast(`🔐 Code: ${otpCode} (email failed — check EmailJS OTP template)`, 'info');
            }

            // Store pending data for OTP verification
            window._otpPendingUserId = user.uid;
            window._otpPendingEmail = studentEmail;
            window._otpPendingRole = userRole;
            window._otpPendingUserData = userData;

            // Show OTP modal
            showOTPModal(studentEmail);
            return;
        }

        // Step 8: Device Verification — check if this IP is a known device
        loginBtn.textContent = 'Checking device...';
        let currentIP = 'unknown';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            currentIP = ipData.ip;
        } catch (ipErr) {
            console.warn('IP lookup failed:', ipErr);
        }

        let lnhsDeviceId = localStorage.getItem('lnhs_device_id');
        if (!lnhsDeviceId) {
            lnhsDeviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('lnhs_device_id', lnhsDeviceId);
        }

        if (true) {
            // Check Firestore for known devices using device fingerprint
            const knownDevicesRef = firebaseApp.db.collection('users').doc(user.uid).collection('knownDevices');
            const knownDeviceDoc = await knownDevicesRef.doc(lnhsDeviceId).get();

            let isKnownNetwork = false;
            // Check if IP is recognized as a known network
            if (!knownDeviceDoc.exists && currentIP && currentIP !== 'unknown') {
                const networkCheck = await knownDevicesRef.where('ipAddress', '==', currentIP).limit(1).get();
                if (!networkCheck.empty) {
                    isKnownNetwork = true;
                    // Auto-verify this new device since it's on a trusted network
                    try {
                        await knownDevicesRef.doc(lnhsDeviceId).set({
                            ipAddress: currentIP,
                            userAgent: navigator.userAgent,
                            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
                            autoVerifiedByNetwork: true
                        });
                    } catch (err) {
                        console.warn('Silent device register failed:', err);
                    }
                }
            }

            if (!knownDeviceDoc.exists && !isKnownNetwork) {
                // Unrecognized device AND unknown network — require verification
                const dvCode = String(Math.floor(100000 + Math.random() * 900000));
                const dvExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

                await firebaseApp.db.collection('users').doc(user.uid).update({
                    deviceVerifyCode: dvCode,
                    deviceVerifyExpiry: dvExpiry
                });

                const userName = userData.firstName || 'User';
                const userEmail = email;
                const loginTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
                const deviceInfo = navigator.userAgent.substring(0, 100);

                // Try to send device verification email
                try {
                    if (typeof sendDeviceVerificationEmail === 'function') {
                        await sendDeviceVerificationEmail({
                            name: userName,
                            email: userEmail,
                            verificationCode: dvCode,
                            deviceIP: currentIP,
                            deviceInfo: deviceInfo,
                            loginTime: loginTime
                        });
                        firebaseApp.showToast(`📧 Device verification code sent to ${userEmail}`, 'info');
                    } else {
                        console.warn('Device verify code (dev mode):', dvCode);
                        firebaseApp.showToast(`🔐 Code: ${dvCode} (dev mode — set up EmailJS device template)`, 'info');
                    }
                } catch (dvEmailErr) {
                    console.warn('Device verification email failed:', dvEmailErr);
                    firebaseApp.showToast(`🔐 Code: ${dvCode} (email failed — check EmailJS device template)`, 'info');
                }

                // Log unrecognized device to security logs + notify developer
                try {
                    await firebaseApp.db.collection('securityLogs').add({
                        type: 'unrecognized_device',
                        severity: 'medium',
                        description: `Unrecognized device login attempt by ${userName} (${userEmail}) from IP: ${currentIP}`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        userId: user.uid,
                        userName: `${userData.firstName} ${userData.lastName}`,
                        userEmail: userEmail,
                        userRole: userRole,
                        ipAddress: currentIP,
                        userAgent: navigator.userAgent,
                        resolved: false
                    });
                    // Notify developer dashboard
                    await firebaseApp.db.collection('notifications').add({
                        recipientRole: 'developer',
                        type: 'security',
                        title: '🖥️ Unrecognized Device Login',
                        message: `${userData.firstName} ${userData.lastName} (${userRole}) logged in from unrecognized IP: ${currentIP}`,
                        severity: 'medium',
                        isRead: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (logErr) {
                    console.warn('Security log failed (non-critical):', logErr);
                }

                // Store pending data for device verification
                window._dvPendingUserId = user.uid;
                window._dvPendingEmail = userEmail;
                window._dvPendingRole = userRole;
                window._dvPendingUserData = userData;
                window._dvPendingIP = currentIP;
                window._dvPendingDeviceId = lnhsDeviceId;
                window._dvPendingUsername = username;
                window._dvPendingPassword = password;

                // Show device verification modal
                showDeviceVerifyModal(userEmail);
                return;
            }
        }

        // Success! Known device — redirect to appropriate dashboard
        firebaseApp.establishLocalSession(firebaseApp.auth.currentUser, userData);
        firebaseApp.showToast(`✅ Welcome back, ${userData.firstName}!`, 'success');

        // Save credentials if Remember Me is checked
        if (rememberMeCheckbox.checked) {
            localStorage.setItem('rememberedUsername', username);
            localStorage.setItem('rememberedPassword', btoa(password)); // Simple base64 encode
            localStorage.setItem('rememberMe', 'true');
        } else {
            // Clear saved credentials if Remember Me is not checked
            localStorage.removeItem('rememberedUsername');
            localStorage.removeItem('rememberedPassword');
            localStorage.removeItem('rememberMe');
        }

        setTimeout(() => {
            // Use the centralized redirect function
            if (typeof firebaseApp.redirectByRole === 'function') {
                firebaseApp.redirectByRole(userRole);
            } else {
                // Fallback if function not available
                window.location.href = firebaseApp.getRoute(userRole) || firebaseApp.getRoute('home');
            }
        }, 1000);


    } catch (error) {
        console.error('Login error:', error);

        let message = 'Login failed. Please try again.';

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = 'Incorrect email/LRN or password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Incorrect email/LRN or password. Please try again.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Too many failed attempts. Please try again later.';
        } else if (error.code === 'auth/user-disabled') {
            message = 'This account has been disabled. Please contact administration.';
        } else if (error.message && !error.message.includes('auth/') && !error.message.includes('Firebase')) {
            // Only show custom error messages (like "account deactivated"), not raw Firebase errors
            message = error.message;
        }

        // Generate a new CAPTCHA on failed login attempt
        generateCaptcha();

        showError(message);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
});

// Forgot Password — Open Modal
document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPasswordModal();
});

function openForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    modal.style.display = 'flex';
    document.getElementById('forgotPasswordInput').value = '';
    const msgEl = document.getElementById('forgotPasswordMsg');
    msgEl.style.display = 'none';
    msgEl.textContent = '';
    // Reset resend row
    const resendRow = document.getElementById('forgotResendRow');
    if (resendRow) resendRow.style.display = 'none';
    // Pre-fill from main username input if it has a value
    const currentUsername = usernameInput.value.trim();
    if (currentUsername) {
        document.getElementById('forgotPasswordInput').value = currentUsername;
    }
    setTimeout(() => document.getElementById('forgotPasswordInput').focus(), 100);
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').style.display = 'none';
    // Clear any resend cooldown
    if (_resendCooldown) { clearInterval(_resendCooldown); _resendCooldown = null; }
    const resendRow = document.getElementById('forgotResendRow');
    if (resendRow) resendRow.style.display = 'none';
}

// Close on backdrop click
document.getElementById('forgotPasswordModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('forgotPasswordModal')) {
        closeForgotPasswordModal();
    }
});

async function submitForgotPassword() {
    const input = document.getElementById('forgotPasswordInput').value.trim();
    const btn = document.getElementById('forgotPasswordSubmitBtn');
    const msgEl = document.getElementById('forgotPasswordMsg');

    if (!input) {
        showForgotMsg('Please enter your email or LRN.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        let emailToReset = input;

        // If it looks like an LRN (12 digits), look up the email first
        if (/^\d{12}$/.test(input)) {
            const lrnDoc = await firebaseApp.db.collection('lrnMapping').doc(input).get();
            if (!lrnDoc.exists) {
                showForgotMsg('❌ No account found with this LRN. Please check and try again.', 'error');
                return;
            }
            emailToReset = lrnDoc.data().email;
        } else if (!input.includes('@')) {
            showForgotMsg('❌ Please enter a valid email address or 12-digit LRN.', 'error');
            return;
        }

        await firebaseApp.auth.sendPasswordResetEmail(emailToReset);
        showForgotMsg('✅ Password reset email sent! Check your inbox (and spam folder).', 'success');
        btn.textContent = 'Sent!';
        // Store email for resend and show resend row
        window._forgotResetEmail = emailToReset;
        const resendRow = document.getElementById('forgotResendRow');
        if (resendRow) resendRow.style.display = 'block';
        startForgotResendCooldown();

    } catch (error) {
        console.error('Password reset error:', error);
        if (error.code === 'auth/user-not-found') {
            showForgotMsg('❌ No account found with this email. Please check and try again.', 'error');
        } else {
            showForgotMsg('❌ Failed to send reset email. Please try again later.', 'error');
        }
    } finally {
        if (btn.textContent !== 'Sent!') {
            btn.disabled = false;
            btn.textContent = 'Send Reset Link';
        }
    }
}

function showForgotMsg(text, type) {
    const msgEl = document.getElementById('forgotPasswordMsg');
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    if (type === 'success') {
        msgEl.style.background = 'rgba(34,197,94,0.1)';
        msgEl.style.color = '#22c55e';
        msgEl.style.border = '1px solid rgba(34,197,94,0.3)';
    } else {
        msgEl.style.background = 'rgba(239,68,68,0.1)';
        msgEl.style.color = '#ef4444';
        msgEl.style.border = '1px solid rgba(239,68,68,0.3)';
    }
}

// Make functions globally available
window.openForgotPasswordModal = openForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.submitForgotPassword = submitForgotPassword;
window.resendForgotPassword = resendForgotPassword;

// Resend forgot password email with cooldown
async function resendForgotPassword() {
    const email = window._forgotResetEmail;
    if (!email) {
        showForgotMsg('Please enter your email first.', 'error');
        return;
    }
    const resendBtn = document.getElementById('forgotResendBtn');
    if (resendBtn) { resendBtn.disabled = true; resendBtn.textContent = 'Sending...'; }
    try {
        await firebaseApp.auth.sendPasswordResetEmail(email);
        showForgotMsg('✅ Password reset email re-sent! Check your inbox.', 'success');
        startForgotResendCooldown();
    } catch (error) {
        showForgotMsg('❌ Failed to resend. Please try again later.', 'error');
    } finally {
        if (resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Resend Email'; }
    }
}

function startForgotResendCooldown() {
    const resendBtn = document.getElementById('forgotResendBtn');
    const timerSpan = document.getElementById('forgotResendTimer');
    if (!resendBtn || !timerSpan) return;
    let seconds = 60;
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    timerSpan.style.display = 'inline';
    timerSpan.textContent = ` (${seconds}s)`;
    if (_resendCooldown) clearInterval(_resendCooldown);
    _resendCooldown = setInterval(() => {
        seconds--;
        timerSpan.textContent = ` (${seconds}s)`;
        if (seconds <= 0) {
            clearInterval(_resendCooldown);
            _resendCooldown = null;
            resendBtn.disabled = false;
            resendBtn.style.opacity = '1';
            timerSpan.style.display = 'none';
        }
    }, 1000);
}

// Email Verification
function showVerificationModal() {
    loginForm.classList.add('hidden');
    verificationModal.classList.remove('hidden');
}

const resendVerificationBtn = document.getElementById('resendVerification');
if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener('click', async () => {
        try {
            await firebaseApp.auth.currentUser.sendEmailVerification();
            firebaseApp.showToast('Verification email sent!', 'success');
        } catch (error) {
            firebaseApp.showToast('Failed to send verification email', 'error');
        }
    });
}

const closeVerificationBtn = document.getElementById('closeVerification');
if (closeVerificationBtn) {
    closeVerificationBtn.addEventListener('click', async () => {
        await firebaseApp.auth.signOut();
        verificationModal.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });
}



// Error Handling
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

// ========================================
// OTP Verification Flow
// ========================================

function showOTPModal(email) {
    loginForm.classList.add('hidden');
    const modal = document.getElementById('otpModal');
    modal.classList.remove('hidden');

    // Show masked email hint
    const hint = document.getElementById('otpEmailHint');
    if (hint && email) {
        const [local, domain] = email.split('@');
        const masked = local.length > 3
            ? local.substring(0, 2) + '***' + local.slice(-1) + '@' + domain
            : '***@' + domain;
        hint.textContent = `A 6-digit code was sent to ${masked}. Check your inbox.`;
    }

    // Wire OTP digit inputs
    initOTPInputs();

    // Focus first digit
    setTimeout(() => document.getElementById('otp0')?.focus(), 100);
}

function initOTPInputs() {
    const digits = Array.from({ length: 6 }, (_, i) => document.getElementById(`otp${i}`));

    digits.forEach((input, idx) => {
        input.value = '';
        input.classList.remove('filled', 'error');

        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val.slice(-1); // keep only 1 digit
            e.target.classList.toggle('filled', val.length > 0);
            if (val && idx < 5) digits[idx + 1].focus();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                digits[idx - 1].focus();
                digits[idx - 1].value = '';
                digits[idx - 1].classList.remove('filled');
            }
        });

        // Handle paste on any digit
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            pasted.split('').slice(0, 6).forEach((ch, i) => {
                if (digits[i]) {
                    digits[i].value = ch;
                    digits[i].classList.add('filled');
                }
            });
            digits[Math.min(pasted.length, 5)].focus();
        });
    });
}

function getOTPValue() {
    return Array.from({ length: 6 }, (_, i) => document.getElementById(`otp${i}`)?.value || '').join('');
}

function setOTPError(msg) {
    const errEl = document.getElementById('otpError');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';

    // Shake the inputs
    const digits = Array.from({ length: 6 }, (_, i) => document.getElementById(`otp${i}`));
    digits.forEach(d => { d.classList.add('error'); setTimeout(() => d.classList.remove('error'), 1500); });
}

async function verifyOTP() {
    const code = getOTPValue();
    if (code.length < 6) {
        setOTPError('Please enter all 6 digits.');
        return;
    }

    const btn = document.getElementById('verifyOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    document.getElementById('otpError').style.display = 'none';

    try {
        const uid = window._otpPendingUserId;
        if (!uid) throw new Error('Session expired. Please log in again.');

        // Fetch current OTP from Firestore
        const userDoc = await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).get();
        const data = userDoc.data();

        if (!data.otpCode) throw new Error('No verification code found. Please request a new one.');
        if (Date.now() > data.otpExpiry) {
            setOTPError('Code expired. Click "Resend Code" to get a new one.');
            return;
        }
        if (code !== data.otpCode) {
            setOTPError('Incorrect code. Please try again.');
            return;
        }

        // ✅ Code correct — mark verified, clear OTP fields
        await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).update({
            emailVerified: true,
            otpCode: firebase.firestore.FieldValue.delete(),
            otpExpiry: firebase.firestore.FieldValue.delete()
        });

        const userData = window._otpPendingUserData || {};
        const userRole = window._otpPendingRole || 'student';
        const userEmail = window._otpPendingEmail || '';

        // Device verification check after OTP
        let currentIP = 'unknown';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            currentIP = ipData.ip;
        } catch (ipErr) {
            console.warn('IP lookup failed:', ipErr);
        }

        let lnhsDeviceId = localStorage.getItem('lnhs_device_id');
        if (!lnhsDeviceId) {
            lnhsDeviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('lnhs_device_id', lnhsDeviceId);
        }

        if (true) {
            const knownDevicesRef = firebaseApp.db.collection('users').doc(uid).collection('knownDevices');
            const knownDeviceDoc = await knownDevicesRef.doc(lnhsDeviceId).get();

            let isKnownNetwork = false;
            // Check if IP is recognized as a known network
            if (!knownDeviceDoc.exists && currentIP && currentIP !== 'unknown') {
                const networkCheck = await knownDevicesRef.where('ipAddress', '==', currentIP).limit(1).get();
                if (!networkCheck.empty) {
                    isKnownNetwork = true;
                    // Auto-verify this new device since it's on a trusted network
                    try {
                        await knownDevicesRef.doc(lnhsDeviceId).set({
                            ipAddress: currentIP,
                            userAgent: navigator.userAgent,
                            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
                            autoVerifiedByNetwork: true
                        });
                    } catch (err) {
                        console.warn('Silent device register failed:', err);
                    }
                }
            }

            if (!knownDeviceDoc.exists && !isKnownNetwork) {
                // Hide OTP modal, show device verify modal
                window._dvPendingDeviceId = lnhsDeviceId;
                document.getElementById('otpModal').classList.add('hidden');

                // Generate device verification code
                const dvCode = String(Math.floor(100000 + Math.random() * 900000));
                const dvExpiry = Date.now() + 10 * 60 * 1000;

                await firebaseApp.db.collection('users').doc(uid).update({
                    deviceVerifyCode: dvCode,
                    deviceVerifyExpiry: dvExpiry
                });

                const loginTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
                try {
                    if (typeof sendDeviceVerificationEmail === 'function') {
                        await sendDeviceVerificationEmail({
                            name: userData.firstName || 'Student',
                            email: userEmail,
                            verificationCode: dvCode,
                            deviceIP: currentIP,
                            deviceInfo: navigator.userAgent.substring(0, 100),
                            loginTime
                        });
                        firebaseApp.showToast(`📧 Device verification code sent to verify your device`, 'info');
                    } else {
                        firebaseApp.showToast(`🔐 Code: ${dvCode} (dev mode — set up EmailJS device template)`, 'info');
                    }
                } catch (dvErr) {
                    firebaseApp.showToast(`🔐 Code: ${dvCode} (email failed — check EmailJS device template)`, 'info');
                }

                // Store pending data for device verification
                window._dvPendingUserId = uid;
                window._dvPendingEmail = userEmail;
                window._dvPendingRole = userRole;
                window._dvPendingUserData = userData;
                window._dvPendingIP = currentIP;
                window._dvPendingDeviceId = lnhsDeviceId;

                showDeviceVerifyModal(userEmail);
                return;
            }
        }

        // Known device — proceed to redirect
        firebaseApp.establishLocalSession(firebaseApp.auth.currentUser, userData);
        firebaseApp.showToast(`✅ Account verified! Welcome, ${userData.firstName || 'Student'}!`, 'success');

        setTimeout(() => {
            firebaseApp.redirectByRole(userRole);
        }, 1000);

    } catch (err) {
        console.error('OTP verify error:', err);
        setOTPError(err.message || 'Verification failed. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify Code';
    }
}

// Note: _resendCooldown is declared at the top of the file

async function resendOTP() {
    if (_resendCooldown) return; // already cooling down

    const btn = document.getElementById('resendOtpBtn');
    const timerEl = document.getElementById('resendTimer');
    const countdownEl = document.getElementById('resendCountdown');

    btn.disabled = true;
    timerEl.style.display = 'inline';

    let seconds = 60;
    countdownEl.textContent = seconds;
    _resendCooldown = setInterval(() => {
        seconds--;
        countdownEl.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(_resendCooldown);
            _resendCooldown = null;
            btn.disabled = false;
            timerEl.style.display = 'none';
        }
    }, 1000);

    try {
        const uid = window._otpPendingUserId;
        const email = window._otpPendingEmail;
        const userData = window._otpPendingUserData || {};

        if (!uid) throw new Error('Session lost. Please log in again.');

        const newCode = String(Math.floor(100000 + Math.random() * 900000));
        const newExpiry = Date.now() + 10 * 60 * 1000;

        await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).update({
            otpCode: newCode,
            otpExpiry: newExpiry
        });

        if (typeof sendOTPEmail === 'function') {
            await sendOTPEmail({ name: userData.firstName || 'Student', email, otpCode: newCode });
            firebaseApp.showToast('📧 New code sent! Check your inbox.', 'success');
        } else {
            console.warn('OTP resend (dev mode):', newCode);
            firebaseApp.showToast(`🔐 New code: ${newCode} (dev mode)`, 'info');
        }

        // Clear inputs
        initOTPInputs();
        document.getElementById('otp0')?.focus();
        document.getElementById('otpError').style.display = 'none';

    } catch (err) {
        console.error('Resend OTP error:', err);
        firebaseApp.showToast('Failed to resend code. Please try again.', 'error');
    }
}

function cancelOTP() {
    // Sign out and return to login form
    firebaseApp.auth.signOut().catch(() => { });
    window._otpPendingUserId = null;
    window._otpPendingEmail = null;
    window._otpPendingRole = null;
    window._otpPendingUserData = null;
    if (_resendCooldown) { clearInterval(_resendCooldown); _resendCooldown = null; }

    document.getElementById('otpModal').classList.add('hidden');
    loginForm.classList.remove('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
}

// Global logout for desktop-only blocker (Principal / Developer dashboards)
window.droLogout = function () {
    const auth = window.firebase?.auth ? window.firebase.auth() : null;
    if (auth) {
        auth.signOut().then(() => { window.location.href = 'login.html'; }).catch(() => { window.location.href = 'login.html'; });
    } else {
        window.location.href = 'login.html';
    }
};

// Make OTP functions global
window.verifyOTP = verifyOTP;
window.resendOTP = resendOTP;
window.cancelOTP = cancelOTP;

// ========================================
// Device Verification Flow
// ========================================

let _dvResendCooldown = null;

function showDeviceVerifyModal(email) {
    loginForm.classList.add('hidden');
    const modal = document.getElementById('deviceVerifyModal');
    modal.classList.remove('hidden');

    // Show masked email hint
    const hint = document.getElementById('deviceVerifyHint');
    if (hint && email) {
        const [local, domain] = email.split('@');
        const masked = local.length > 3
            ? local.substring(0, 2) + '***' + local.slice(-1) + '@' + domain
            : '***@' + domain;
        hint.textContent = `We detected a login from an unrecognized device. A verification code was sent to ${masked}.`;
    }

    // Wire device verification digit inputs
    initDeviceVerifyInputs();
    setTimeout(() => document.getElementById('dv0')?.focus(), 100);
}

function initDeviceVerifyInputs() {
    const digits = Array.from({ length: 6 }, (_, i) => document.getElementById(`dv${i}`));

    digits.forEach((input, idx) => {
        input.value = '';
        input.classList.remove('filled', 'error');

        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val.slice(-1);
            e.target.classList.toggle('filled', val.length > 0);
            if (val && idx < 5) digits[idx + 1].focus();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                digits[idx - 1].focus();
                digits[idx - 1].value = '';
                digits[idx - 1].classList.remove('filled');
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            pasted.split('').slice(0, 6).forEach((ch, i) => {
                if (digits[i]) {
                    digits[i].value = ch;
                    digits[i].classList.add('filled');
                }
            });
            digits[Math.min(pasted.length, 5)].focus();
        });
    });
}

function getDeviceVerifyCode() {
    return Array.from({ length: 6 }, (_, i) => document.getElementById(`dv${i}`)?.value || '').join('');
}

function setDeviceVerifyError(msg) {
    const errEl = document.getElementById('deviceVerifyError');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? 'block' : 'none';
    const digits = Array.from({ length: 6 }, (_, i) => document.getElementById(`dv${i}`));
    digits.forEach(d => { d.classList.add('error'); setTimeout(() => d.classList.remove('error'), 1500); });
}

async function verifyDevice() {
    const code = getDeviceVerifyCode();
    if (code.length < 6) {
        setDeviceVerifyError('Please enter all 6 digits.');
        return;
    }

    const btn = document.getElementById('verifyDeviceBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    document.getElementById('deviceVerifyError').style.display = 'none';

    try {
        const uid = window._dvPendingUserId;
        if (!uid) throw new Error('Session expired. Please log in again.');

        // Check code from Firestore
        const userDoc = await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).get();
        const data = userDoc.data();

        if (!data.deviceVerifyCode) throw new Error('No verification code found. Please request a new one.');
        if (Date.now() > data.deviceVerifyExpiry) {
            setDeviceVerifyError('Code expired. Click "Resend Code" to get a new one.');
            return;
        }
        if (code !== data.deviceVerifyCode) {
            setDeviceVerifyError('Incorrect code. Please try again.');
            return;
        }

        // ✅ Code correct — add device fingerprint to known devices, clear code, redirect
        const ip = window._dvPendingIP || 'unknown';
        const deviceId = window._dvPendingDeviceId;
        if (deviceId) {
            await firebaseApp.db.collection('users').doc(uid).collection('knownDevices').doc(deviceId).set({
                ipAddress: ip,
                userAgent: navigator.userAgent,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUsed: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Clear verification fields
        await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).update({
            deviceVerifyCode: firebase.firestore.FieldValue.delete(),
            deviceVerifyExpiry: firebase.firestore.FieldValue.delete()
        });

        const userData = window._dvPendingUserData || {};
        const userRole = window._dvPendingRole || 'student';
        firebaseApp.establishLocalSession(firebaseApp.auth.currentUser, userData);
        firebaseApp.showToast(`✅ Device verified! Welcome, ${userData.firstName || 'User'}!`, 'success');

        // Save credentials if Remember Me is checked
        const username = window._dvPendingUsername;
        const password = window._dvPendingPassword;
        if (rememberMeCheckbox.checked && username && password) {
            localStorage.setItem('rememberedUsername', username);
            localStorage.setItem('rememberedPassword', btoa(password));
            localStorage.setItem('rememberMe', 'true');
        }

        setTimeout(() => {
            if (typeof firebaseApp.redirectByRole === 'function') {
                firebaseApp.redirectByRole(userRole);
            } else {
                window.location.href = firebaseApp.getRoute(userRole) || firebaseApp.getRoute('home');
            }
        }, 1000);

    } catch (err) {
        console.error('Device verify error:', err);
        setDeviceVerifyError(err.message || 'Verification failed. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify Device';
    }
}

async function resendDeviceCode() {
    if (_dvResendCooldown) return;

    const btn = document.getElementById('resendDeviceCodeBtn');
    const timerEl = document.getElementById('deviceResendTimer');
    const countdownEl = document.getElementById('deviceResendCountdown');

    btn.disabled = true;
    timerEl.style.display = 'inline';

    let seconds = 60;
    countdownEl.textContent = seconds;
    _dvResendCooldown = setInterval(() => {
        seconds--;
        countdownEl.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(_dvResendCooldown);
            _dvResendCooldown = null;
            btn.disabled = false;
            timerEl.style.display = 'none';
        }
    }, 1000);

    try {
        const uid = window._dvPendingUserId;
        const email = window._dvPendingEmail;
        const userData = window._dvPendingUserData || {};
        const ip = window._dvPendingIP || 'unknown';

        if (!uid) throw new Error('Session lost. Please log in again.');

        const newCode = String(Math.floor(100000 + Math.random() * 900000));
        const newExpiry = Date.now() + 10 * 60 * 1000;

        await firebaseApp.db.collection(firebaseApp.collections.users).doc(uid).update({
            deviceVerifyCode: newCode,
            deviceVerifyExpiry: newExpiry
        });

        const loginTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

        if (typeof sendDeviceVerificationEmail === 'function') {
            await sendDeviceVerificationEmail({
                name: userData.firstName || 'User',
                email,
                verificationCode: newCode,
                deviceIP: ip,
                deviceInfo: navigator.userAgent.substring(0, 100),
                loginTime
            });
            firebaseApp.showToast('📧 New device code sent! Check your inbox.', 'success');
        } else {
            console.warn('Device verify resend (dev mode):', newCode);
            firebaseApp.showToast(`🔐 New code: ${newCode} (dev mode)`, 'info');
        }

        initDeviceVerifyInputs();
        document.getElementById('dv0')?.focus();
        document.getElementById('deviceVerifyError').style.display = 'none';

    } catch (err) {
        console.error('Resend device code error:', err);
        firebaseApp.showToast('Failed to resend code. Please try again.', 'error');
    }
}

function cancelDeviceVerify() {
    firebaseApp.auth.signOut().catch(() => { });
    window._dvPendingUserId = null;
    window._dvPendingEmail = null;
    window._dvPendingRole = null;
    window._dvPendingUserData = null;
    window._dvPendingIP = null;
    window._dvPendingUsername = null;
    window._dvPendingPassword = null;
    if (_dvResendCooldown) { clearInterval(_dvResendCooldown); _dvResendCooldown = null; }

    document.getElementById('deviceVerifyModal').classList.add('hidden');
    loginForm.classList.remove('hidden');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
}

window.verifyDevice = verifyDevice;
window.resendDeviceCode = resendDeviceCode;
window.cancelDeviceVerify = cancelDeviceVerify;
