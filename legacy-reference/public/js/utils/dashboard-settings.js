/**
 * Dashboard Settings Utility
 * Shared settings, refresh, dark mode, and password change logic for all dashboards.
 * Include AFTER firebase-config.js in any dashboard HTML.
 */

(function () {
    'use strict';

    const currentUser = firebaseApp.getCurrentUser();

    // ========================================
    // Theme (Dark/Light Mode)
    // ========================================

    function loadThemePreference() {
        // First check Firestore setting, fall back to localStorage
        const saved = localStorage.getItem('lms-theme');
        let isDark = saved !== 'light'; // default: dark

        // Also check user Firestore settings if available
        if (currentUser && currentUser.settings && typeof currentUser.settings.darkMode === 'boolean') {
            isDark = currentUser.settings.darkMode;
            // Sync localStorage
            localStorage.setItem('lms-theme', isDark ? 'dark' : 'light');
        }

        document.body.classList.toggle('light-mode', !isDark);

        const toggle = document.getElementById('darkModeToggle');
        if (toggle) toggle.checked = isDark;
    }

    function toggleDarkMode(isDark) {
        document.body.classList.toggle('light-mode', !isDark);
        localStorage.setItem('lms-theme', isDark ? 'dark' : 'light');

        // Persist to Firestore so preference syncs across devices
        try {
            if (currentUser && firebaseApp.db) {
                firebaseApp.db.collection('users').doc(currentUser.uid).update({
                    'settings.darkMode': isDark
                }).catch(e => console.warn('Theme persist error:', e));
            }
        } catch (e) { /* ignore */ }
    }

    // ========================================
    // Settings Modal
    // ========================================

    function openSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.add('hidden');

        // Clear password fields
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    function populateSettingsInfo() {
        if (!currentUser) return;

        const nameEl = document.getElementById('settingsFullName');
        const emailEl = document.getElementById('settingsEmail');
        const roleEl = document.getElementById('settingsRole');
        const dateEl = document.getElementById('settingsDateCreated');
        const lrnEl = document.getElementById('settingsLRN');
        const sectionEl = document.getElementById('settingsSection');

        if (nameEl) nameEl.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        if (emailEl) emailEl.textContent = currentUser.email || '—';

        // Role display with icon
        const roleIcons = {
            student: '🎓 Student',
            teacher: '👨‍🏫 Teacher',
            secretary: '📝 Secretary',
            principal: '🏢 Principal',
            developer: '🖥️ Developer'
        };
        if (roleEl) roleEl.textContent = roleIcons[currentUser.role] || currentUser.role || '—';

        // Date created
        if (dateEl) {
            if (currentUser.createdAt) {
                try {
                    const date = currentUser.createdAt.toDate ? currentUser.createdAt.toDate() : new Date(currentUser.createdAt);
                    dateEl.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                } catch (e) {
                    dateEl.textContent = '—';
                }
            }
        }

        // Student-specific fields
        if (lrnEl && currentUser.lrn) {
            lrnEl.textContent = currentUser.lrn;
        }
        if (sectionEl) {
            const grade = currentUser.gradeLevel || currentUser.grade || '';
            const section = currentUser.section || '';
            if (grade && section) {
                sectionEl.textContent = `Grade ${grade} - ${section}`;
            } else if (grade) {
                sectionEl.textContent = `Grade ${grade}`;
            }
        }
    }

    let _pwdOtpData = null;

    async function changePassword() {
        const currentPwd = document.getElementById('currentPassword')?.value;
        const newPwd = document.getElementById('newPassword')?.value;
        const confirmPwd = document.getElementById('confirmPassword')?.value;

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

            // Step 1: Re-authenticate to verify current password
            await user.reauthenticateWithCredential(credential);

            // Step 2: Generate OTP
            const otpCode = String(Math.floor(100000 + Math.random() * 900000));
            const otpExpiry = Date.now() + 10 * 60 * 1000;

            await firebaseApp.db.collection(firebaseApp.collections.users).doc(user.uid).update({
                passwordOtp: otpCode,
                passwordOtpExpiry: otpExpiry
            });

            const userName = currentUser?.firstName || 'User';
            const userEmail = user.email;
            try {
                if (typeof sendPasswordChangeOTP === 'function') {
                    await sendPasswordChangeOTP({ name: userName, email: userEmail, otpCode });
                    firebaseApp.showToast(`📧 Verification code sent to ${userEmail}`, 'success');
                } else {
                    console.warn('Password OTP (dev mode):', otpCode);
                    firebaseApp.showToast(`🔐 Code: ${otpCode} (dev mode — set up EmailJS OTP template)`, 'info');
                }
            } catch (emailErr) {
                console.warn('EmailJS OTP failed:', emailErr);
                firebaseApp.showToast(`🔐 Code: ${otpCode} (email failed — check EmailJS)`, 'info');
            }

            _pwdOtpData = { uid: user.uid, newPwd, email: userEmail, userName };
            showPasswordOtpUI();

        } catch (error) {
            console.error('Password change error:', error);
            if (error.code === 'auth/wrong-password') {
                firebaseApp.showToast('Current password is incorrect', 'error');
            } else if (error.code === 'auth/requires-recent-login') {
                firebaseApp.showToast('Please log out and log back in before changing your password', 'error');
            } else {
                firebaseApp.showToast('Failed to update password. Please try again or contact support.', 'error');
            }
        }
    }

    function showPasswordOtpUI() {
        const pwSection = document.querySelector('#settingsModal .settings-section:last-child');
        if (!pwSection) return;

        const existingOtpUI = document.getElementById('pwdOtpContainer');
        if (existingOtpUI) existingOtpUI.remove();

        const otpHTML = `
            <div id="pwdOtpContainer" style="margin-top:1rem;padding:1.25rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:12px;">
                <h4 style="margin:0 0 0.5rem;color:var(--gray-100);font-size:0.95rem;">🔐 Enter Verification Code</h4>
                <p style="font-size:0.85rem;color:var(--gray-400);margin:0 0 1rem;">A 6-digit code was sent to your email. Enter it below to confirm the password change.</p>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <input type="text" id="pwdOtpInput" class="form-input" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric" pattern="[0-9]*" style="flex:1;text-align:center;font-size:1.2rem;letter-spacing:0.3em;font-weight:700;">
                    <button class="btn btn-primary" onclick="verifyPasswordOtp()" style="white-space:nowrap;">✅ Verify</button>
                </div>
                <button class="btn btn-outline btn-sm" onclick="cancelPasswordOtp()" style="width:100%;margin-top:0.75rem;font-size:0.8rem;">Cancel</button>
            </div>
        `;
        pwSection.insertAdjacentHTML('beforeend', otpHTML);

        // Restrict OTP input to numbers only
        const otpInput = document.getElementById('pwdOtpInput');
        if (otpInput) {
            otpInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
            otpInput.addEventListener('paste', (e) => {
                setTimeout(() => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, '');
                }, 0);
            });
            otpInput.focus();
        }
    }

    async function verifyPasswordOtp() {
        const code = document.getElementById('pwdOtpInput')?.value?.trim();
        if (!code || code.length < 6) {
            firebaseApp.showToast('Please enter all 6 digits', 'error');
            return;
        }

        if (!_pwdOtpData) {
            firebaseApp.showToast('Session expired. Please try again.', 'error');
            cancelPasswordOtp();
            return;
        }

        try {
            const userDoc = await firebaseApp.db.collection(firebaseApp.collections.users).doc(_pwdOtpData.uid).get();
            const data = userDoc.data();

            if (!data.passwordOtp) {
                firebaseApp.showToast('No verification code found. Please try again.', 'error');
                cancelPasswordOtp();
                return;
            }
            if (Date.now() > data.passwordOtpExpiry) {
                firebaseApp.showToast('Code expired. Please restart the process.', 'error');
                cancelPasswordOtp();
                return;
            }
            if (code !== data.passwordOtp) {
                firebaseApp.showToast('Incorrect code. Please try again.', 'error');
                return;
            }

            // OTP verified — now update the password
            const user = firebaseApp.auth.currentUser;
            await user.updatePassword(_pwdOtpData.newPwd);

            // Clean up OTP fields
            await firebaseApp.db.collection(firebaseApp.collections.users).doc(_pwdOtpData.uid).update({
                passwordOtp: firebase.firestore.FieldValue.delete(),
                passwordOtpExpiry: firebase.firestore.FieldValue.delete()
            });

            firebaseApp.showToast('🔐 Password updated successfully!', 'success');
            _pwdOtpData = null;
            closeSettingsModal();

        } catch (error) {
            console.error('OTP verify error:', error);
            firebaseApp.showToast('Verification failed. Please try again.', 'error');
        }
    }

    function cancelPasswordOtp() {
        _pwdOtpData = null;
        const el = document.getElementById('pwdOtpContainer');
        if (el) el.remove();
    }

    // ========================================
    // Setup Event Listeners
    // ========================================

    function setupDashboardSettings() {
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettingsModal);
        }

        // Dark mode toggle
        const darkToggle = document.getElementById('darkModeToggle');
        if (darkToggle) {
            darkToggle.addEventListener('change', () => {
                toggleDarkMode(darkToggle.checked);
            });
        }

        // Populate settings info
        populateSettingsInfo();

        // Load theme
        loadThemePreference();

        // Setup password eye toggles
        setupPasswordToggles();

        // Setup password match indicator
        setupPasswordMatchIndicator();
    }

    /**
     * Add show/hide toggle buttons to password fields (matches login page style)
     */
    function setupPasswordToggles() {
        const pwdFields = ['currentPassword', 'newPassword', 'confirmPassword'];
        const eyeOpenSVG = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
        </svg>`;
        const eyeClosedSVG = `<svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
        </svg>`;

        pwdFields.forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;

            // Wrap input in a relative container if not already
            const parent = input.parentElement;
            if (!parent.style.position || parent.style.position === 'static') {
                parent.style.position = 'relative';
            }

            // Create SVG toggle button matching login page
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'password-toggle-btn';
            toggleBtn.innerHTML = eyeOpenSVG;
            toggleBtn.title = 'Show Password';
            toggleBtn.addEventListener('click', () => {
                if (input.type === 'password') {
                    input.type = 'text';
                    toggleBtn.innerHTML = eyeClosedSVG;
                    toggleBtn.title = 'Hide Password';
                } else {
                    input.type = 'password';
                    toggleBtn.innerHTML = eyeOpenSVG;
                    toggleBtn.title = 'Show Password';
                }
            });

            input.style.paddingRight = '45px';
            parent.appendChild(toggleBtn);
        });
    }

    /**
     * Real-time visual feedback: green when passwords match, red when they don't
     */
    function setupPasswordMatchIndicator() {
        const newPwd = document.getElementById('newPassword');
        const confirmPwd = document.getElementById('confirmPassword');
        if (!newPwd || !confirmPwd) return;

        function checkMatch() {
            const nVal = newPwd.value;
            const cVal = confirmPwd.value;

            // Only show indicator when both fields have content
            if (!nVal || !cVal) {
                confirmPwd.style.borderColor = '';
                confirmPwd.style.boxShadow = '';
                newPwd.style.borderColor = '';
                newPwd.style.boxShadow = '';
                return;
            }

            if (nVal === cVal) {
                confirmPwd.style.borderColor = '#66bb6a';
                confirmPwd.style.boxShadow = '0 0 0 2px rgba(102, 187, 106, 0.2)';
                newPwd.style.borderColor = '#66bb6a';
                newPwd.style.boxShadow = '0 0 0 2px rgba(102, 187, 106, 0.2)';
            } else {
                confirmPwd.style.borderColor = '#ef5350';
                confirmPwd.style.boxShadow = '0 0 0 2px rgba(239, 83, 80, 0.2)';
                newPwd.style.borderColor = '#ef5350';
                newPwd.style.boxShadow = '0 0 0 2px rgba(239, 83, 80, 0.2)';
            }
        }

        newPwd.addEventListener('input', checkMatch);
        confirmPwd.addEventListener('input', checkMatch);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupDashboardSettings);
    } else {
        setupDashboardSettings();
    }

    // Expose globally
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;
    window.changePassword = changePassword;
    window.verifyPasswordOtp = verifyPasswordOtp;
    window.cancelPasswordOtp = cancelPasswordOtp;

})();

// ========================================
// Password UI Helpers (inline HTML calls)
// ========================================

/**
 * Toggle password field visibility. Called by inline onclick on pw-eye-btn.
 * @param {string} fieldId - The id of the password input
 * @param {HTMLButtonElement} btn - The eye button element
 */
function togglePwVisibility(fieldId, btn) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.title = 'Hide Password';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
        btn.title = 'Show Password';
    }
}

/**
 * Update the password strength bar and label.
 * @param {string} value - Current password value
 */
function updatePwStrength(value) {
    const bar = document.getElementById('pwStrengthBar');
    const label = document.getElementById('pwStrengthLabel');
    if (!bar || !label) return;

    let strength = 0;
    if (value.length >= 6) strength++;
    if (value.length >= 10) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;

    const levels = [
        { pct: 0, color: 'transparent', text: '' },
        { pct: 20, color: '#ef4444', text: '🔴 Very Weak' },
        { pct: 40, color: '#f97316', text: '🟠 Weak' },
        { pct: 60, color: '#f59e0b', text: '🟡 Fair' },
        { pct: 80, color: '#22c55e', text: '🟢 Strong' },
        { pct: 100, color: '#10b981', text: '✅ Very Strong' }
    ];
    const lv = levels[strength] || levels[0];
    bar.style.width = lv.pct + '%';
    bar.style.backgroundColor = lv.color;
    label.textContent = lv.text;
    label.style.color = lv.color;
}

/**
 * Check if new password and confirm password match and show label.
 */
function checkPwMatch() {
    const newPwd = document.getElementById('newPassword');
    const confirmPwd = document.getElementById('confirmPassword');
    const matchLabel = document.getElementById('pwMatchLabel');
    if (!newPwd || !confirmPwd || !matchLabel) return;

    const nVal = newPwd.value;
    const cVal = confirmPwd.value;

    if (!cVal) { matchLabel.textContent = ''; return; }

    if (nVal === cVal) {
        matchLabel.textContent = '✅ Passwords match';
        matchLabel.style.color = '#22c55e';
        confirmPwd.style.borderColor = '#22c55e';
    } else {
        matchLabel.textContent = '❌ Passwords do not match';
        matchLabel.style.color = '#ef4444';
        confirmPwd.style.borderColor = '#ef4444';
    }
}
