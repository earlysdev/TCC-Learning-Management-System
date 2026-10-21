/**
 * EmailJS Configuration for LNHS LMS
 * Sends account credentials via SMTP automatically
 */

const EMAIL_CONFIG = {
    SERVICE_ID: 'service_k4svl3f',
    DEVICE_SERVICE_ID: 'service_bj5mg9s',
    TEMPLATE_ID: 'template_owpn7wb',
    PUBLIC_KEY: 'A9cP8HbkFOEEZkSBc',
    DEVICE_PUBLIC_KEY: '3pfC3xpXUGCFXc7z_',
    SCHOOL_NAME: 'Tagoloan Community College',
    SYSTEM_NAME: 'LNHS Learning Management System'
};

/**
 * Initialize EmailJS on page load
 */
function initEmailJS() {
    try {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
            console.log('✅ EmailJS initialized successfully');
            return true;
        } else {
            console.warn('⚠️ EmailJS SDK not loaded');
            return false;
        }
    } catch (error) {
        console.error('EmailJS init error:', error);
        return false;
    }
}

/**
 * Send account credentials email via SMTP
 * @param {Object} credentials - { name, email, password, role, lrn }
 * @returns {Promise<boolean>} - True if email sent successfully
 */
async function sendAccountEmail(credentials) {
    if (typeof emailjs === 'undefined') {
        console.warn('EmailJS SDK not loaded — falling back to mailto');
        return fallbackMailto(credentials);
    }

    // Make sure EmailJS is initialized
    try {
        emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
    } catch (e) {
        // Already initialized, ignore
    }

    try {
        const templateParams = {
            to_name: credentials.name,
            to_email: credentials.email,
            user_email: credentials.email,
            role: credentials.role.charAt(0).toUpperCase() + credentials.role.slice(1),
            password: credentials.password,
            lrn_line: credentials.lrn ? `LRN: ${credentials.lrn}` : '',
            login_method: credentials.lrn
                ? `LRN (${credentials.lrn}) or Email (${credentials.email})`
                : `Email (${credentials.email})`,
            school_name: EMAIL_CONFIG.SCHOOL_NAME,
            system_name: EMAIL_CONFIG.SYSTEM_NAME
        };

        const response = await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            EMAIL_CONFIG.TEMPLATE_ID,
            templateParams
        );

        console.log('✅ Email sent successfully:', response.status, response.text);
        return true;

    } catch (error) {
        console.error('❌ Failed to send email:', error);
        throw error;
    }
}

/**
 * Fallback: Open mailto link if EmailJS fails
 */
function fallbackMailto(credentials) {
    const cred = credentials;
    const subject = `Your ${EMAIL_CONFIG.SYSTEM_NAME} Account Credentials`;

    let body = `Dear ${cred.name},\n\n`;
    body += `Welcome to the ${EMAIL_CONFIG.SYSTEM_NAME}!\n\n`;
    body += `Your account has been successfully created. Below are your login credentials:\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `  ACCOUNT CREDENTIALS\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    body += `  Full Name: ${cred.name}\n`;
    body += `  Role: ${cred.role.charAt(0).toUpperCase() + cred.role.slice(1)}\n`;

    if (cred.lrn) {
        body += `  LRN: ${cred.lrn}\n`;
    }

    body += `  Email: ${cred.email}\n`;
    body += `  Password: ${cred.password}\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    body += `HOW TO LOGIN:\n`;
    body += `1. Go to the LMS login page\n`;

    if (cred.lrn) {
        body += `2. Enter your LRN (${cred.lrn}) or Email (${cred.email})\n`;
    } else {
        body += `2. Enter your Email (${cred.email})\n`;
    }

    body += `3. Enter your Password\n`;
    body += `4. Solve the security question\n`;
    body += `5. Click "Sign In"\n\n`;
    body += `IMPORTANT REMINDERS:\n`;
    body += `• Please change your password after your first login.\n`;
    body += `• Do NOT share your credentials with anyone.\n`;
    body += `• If you forget your password, use the "Forgot Password" link.\n\n`;
    body += `Best regards,\n`;
    body += `${EMAIL_CONFIG.SCHOOL_NAME}\n`;
    body += `LMS Administration Team`;

    const mailtoLink = `mailto:${encodeURIComponent(cred.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');

    return false;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initEmailJS();
});

const EMAIL_OTP_TEMPLATE_ID = 'template_ytmgzom'; // Must match EmailJS dashboard

let emailInitialized = false;

function initEmailJS() {
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS SDK not loaded.');
        return false;
    }

    if (!emailInitialized) {
        try {
            emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
            emailInitialized = true;
        } catch (e) {
            console.warn('EmailJS already initialized.');
        }
    }

    return true;
}

async function sendOTPEmail({ name, email, otpCode }) {

    if (!initEmailJS()) return false;

    if (!EMAIL_CONFIG?.SERVICE_ID || !EMAIL_CONFIG?.PUBLIC_KEY) {
        console.error('❌ EMAIL_CONFIG is missing SERVICE_ID or PUBLIC_KEY');
        return false;
    }

    if (!email || !otpCode) {
        console.error('❌ Missing email or OTP code');
        return false;
    }

    const templateParams = {
        to_name: name || 'Student',
        to_email: email,
        otp_code: otpCode,
        school_name: EMAIL_CONFIG.SCHOOL_NAME || 'Tagoloan Community College',
        expiry_minutes: '10'
    };

    try {
        const response = await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            EMAIL_OTP_TEMPLATE_ID,
            templateParams
        );

        console.log('✅ OTP email sent successfully:', response.status);
        return true;

    } catch (error) {

        if (error?.status === 422) {
            console.error(`❌ EmailJS 422 Error:`);
        } else {
            console.error('❌ Failed to send OTP email:', error);
        }

        throw error;
    }
}

// Expose globally
window.sendOTPEmail = sendOTPEmail;

const EMAIL_PASSWORD_OTP_TEMPLATE_ID = 'template_22zr5zu';

async function sendPasswordChangeOTP({ name, email, otpCode }) {
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS SDK not loaded.');
        return false;
    }

    if (!email || !otpCode) {
        console.error('❌ Missing email or OTP code');
        return false;
    }

    // Switch to second account
    emailjs.init(EMAIL_CONFIG.DEVICE_PUBLIC_KEY);

    const templateParams = {
        to_name: name || 'User',
        to_email: email,
        otp_code: otpCode,
        OtpCode: otpCode, // User specified this variable name
        message: otpCode, // Fallback
        school_name: EMAIL_CONFIG.SCHOOL_NAME || 'Tagoloan Community College',
        expiry_minutes: '10'
    };

    try {
        const response = await emailjs.send(
            EMAIL_CONFIG.DEVICE_SERVICE_ID,
            EMAIL_PASSWORD_OTP_TEMPLATE_ID,
            templateParams
        );
        console.log('✅ Password change OTP sent:', response.status);
        return true;
    } catch (error) {
        console.error('❌ Failed to send password change OTP:', error);
        throw error;
    } finally {
        // Restore original account
        emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
    }
}

window.sendPasswordChangeOTP = sendPasswordChangeOTP;

const EMAIL_DEVICE_VERIFY_TEMPLATE_ID = 'template_ke3qmln'; // Replace with actual template ID from EmailJS dashboard

async function sendDeviceVerificationEmail({ name, email, verificationCode, deviceIP, deviceInfo, loginTime }) {
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS SDK not loaded.');
        return false;
    }

    if (!email || !verificationCode) {
        console.error('❌ Missing email or verification code for device verification');
        return false;
    }

    // Re-initialize EmailJS with the second account's public key
    emailjs.init(EMAIL_CONFIG.DEVICE_PUBLIC_KEY);

    const templateParams = {
        to_name: name || 'User',
        to_email: email,
        verification_code: verificationCode,
        device_ip: deviceIP || 'Unknown',
        device_info: deviceInfo || navigator.userAgent,
        school_name: EMAIL_CONFIG.SCHOOL_NAME || 'Tagoloan Community College',
        login_time: loginTime || new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    };

    try {
        const response = await emailjs.send(
            EMAIL_CONFIG.DEVICE_SERVICE_ID,
            EMAIL_DEVICE_VERIFY_TEMPLATE_ID,
            templateParams
        );

        console.log('✅ Device verification email sent:', response.status);
        return true;

    } catch (error) {
        if (error?.status === 422) {
            console.error(
                `❌ EmailJS 422 Error for device verification:

The template "${EMAIL_DEVICE_VERIFY_TEMPLATE_ID}" does not exist
or is missing required variables.

Required variables:
- {{to_name}}
- {{to_email}}
- {{verification_code}}
- {{device_ip}}
- {{device_info}}
- {{school_name}}
- {{login_time}}

Fix:
1. Go to https://dashboard.emailjs.com/admin/templates
2. Create or open template "${EMAIL_DEVICE_VERIFY_TEMPLATE_ID}"
3. Ensure all variables above exist
4. Save & publish the template
                `
            );
        } else {
            console.error('❌ Failed to send device verification email:', error);
        }
        throw error;
    } finally {
        // Restore the original public key so OTP/account emails still work
        emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
    }
}

window.sendDeviceVerificationEmail = sendDeviceVerificationEmail;

