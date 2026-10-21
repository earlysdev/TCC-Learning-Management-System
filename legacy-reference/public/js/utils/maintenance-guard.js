/**
 * Maintenance Mode Guard
 * 
 * Checks Firestore `systemSettings/config` for maintenanceMode flag.
 * If enabled, blocks Student and Teacher roles with a full-screen overlay.
 * Secretary, Principal, and Developer are exempt.
 * 
 * Load this AFTER firebase-config.js on any dashboard that should respect maintenance mode.
 */

(function () {
    'use strict';

    // Roles that are EXEMPT from maintenance mode
    const EXEMPT_ROLES = ['secretary', 'principal', 'developer', 'admin'];

    async function checkMaintenanceMode() {
        try {
            // Wait for Firebase auth state
            const user = await new Promise((resolve) => {
                const unsub = firebase.auth().onAuthStateChanged((u) => {
                    unsub();
                    resolve(u);
                });
            });

            if (!user) return; // Not logged in, auth guards handle this

            // Get user role from Firestore
            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(user.uid)
                .get();

            if (!userDoc.exists) return;

            const role = (userDoc.data().role || '').toLowerCase();

            // Exempt roles skip maintenance check
            if (EXEMPT_ROLES.includes(role)) return;

            // Check maintenance mode setting
            const settingsDoc = await firebase.firestore()
                .collection('systemSettings')
                .doc('config')
                .get();

            if (!settingsDoc.exists) return;

            const settings = settingsDoc.data();

            if (settings.maintenanceMode === true) {
                showMaintenanceOverlay(role, userDoc.data());
            }

        } catch (error) {
            console.warn('Maintenance check failed:', error);
            // Don't block access if check fails
        }
    }

    function showMaintenanceOverlay(role, userData) {
        const roleName = role.charAt(0).toUpperCase() + role.slice(1);
        const dashboardName = `${roleName} Dashboard`;
        const firstName = userData.firstName || 'User';

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'maintenanceOverlay';
        overlay.innerHTML = `
            <div class="maint-container">
                <div class="maint-glow"></div>
                <div class="maint-icon-wrap">
                    <div class="maint-icon">🔧</div>
                    <div class="maint-icon-ring"></div>
                </div>
                <h1 class="maint-title">System Under Maintenance</h1>
                <p class="maint-subtitle">
                    Hey <strong>${firstName}</strong>, the <strong>${dashboardName}</strong> is currently undergoing 
                    scheduled maintenance to improve your experience.
                </p>
                <div class="maint-card">
                    <div class="maint-card-row">
                        <span class="maint-card-icon">🛠️</span>
                        <div>
                            <strong>What's happening?</strong>
                            <p>Our development team is performing system upgrades and optimizations.</p>
                        </div>
                    </div>
                    <div class="maint-card-row">
                        <span class="maint-card-icon">⏱️</span>
                        <div>
                            <strong>When will it be back?</strong>
                            <p>The system will be restored shortly. Please check back later.</p>
                        </div>
                    </div>
                    <div class="maint-card-row">
                        <span class="maint-card-icon">📧</span>
                        <div>
                            <strong>Need help?</strong>
                            <p>Contact your secretary or school principal for assistance.</p>
                        </div>
                    </div>
                </div>
                <div class="maint-status">
                    <span class="maint-status-dot"></span>
                    <span>Maintenance in progress — all features temporarily disabled</span>
                </div>
                <button class="maint-logout-btn" onclick="firebase.auth().signOut().then(()=>window.location.href='login.html').catch(()=>window.location.href='login.html')">
                    🚪 Logout & Return Later
                </button>
            </div>
        `;

        // Create styles
        const style = document.createElement('style');
        style.textContent = `
            #maintenanceOverlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 99999;
                background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                animation: maintFadeIn 0.6s ease;
                overflow-y: auto;
            }

            @keyframes maintFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .maint-container {
                text-align: center;
                max-width: 560px;
                padding: 2.5rem 2rem;
                position: relative;
            }

            .maint-glow {
                position: absolute;
                top: -100px;
                left: 50%;
                transform: translateX(-50%);
                width: 400px;
                height: 400px;
                background: radial-gradient(circle, rgba(124, 58, 237, 0.15) 0%, transparent 70%);
                pointer-events: none;
            }

            .maint-icon-wrap {
                position: relative;
                display: inline-block;
                margin-bottom: 1.5rem;
            }

            .maint-icon {
                font-size: 4.5rem;
                animation: maintBounce 2s ease-in-out infinite;
                position: relative;
                z-index: 1;
            }

            .maint-icon-ring {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100px;
                height: 100px;
                border: 2px solid rgba(139, 92, 246, 0.3);
                border-radius: 50%;
                animation: maintRing 3s ease-in-out infinite;
            }

            @keyframes maintBounce {
                0%, 100% { transform: translateY(0) rotate(0deg); }
                25% { transform: translateY(-8px) rotate(-5deg); }
                75% { transform: translateY(-4px) rotate(5deg); }
            }

            @keyframes maintRing {
                0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
                50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
            }

            .maint-title {
                font-size: 2rem;
                font-weight: 800;
                color: #e2e8f0;
                margin: 0 0 0.75rem;
                letter-spacing: -0.025em;
            }

            .maint-subtitle {
                font-size: 1.05rem;
                color: #94a3b8;
                margin: 0 0 2rem;
                line-height: 1.6;
            }

            .maint-subtitle strong {
                color: #c4b5fd;
            }

            .maint-card {
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(139, 92, 246, 0.2);
                border-radius: 16px;
                padding: 1.25rem 1.5rem;
                margin-bottom: 1.5rem;
                text-align: left;
                backdrop-filter: blur(10px);
            }

            .maint-card-row {
                display: flex;
                align-items: flex-start;
                gap: 0.85rem;
                padding: 0.75rem 0;
                border-bottom: 1px solid rgba(148, 163, 184, 0.08);
            }

            .maint-card-row:last-child {
                border-bottom: none;
            }

            .maint-card-icon {
                font-size: 1.3rem;
                flex-shrink: 0;
                margin-top: 0.1rem;
            }

            .maint-card-row strong {
                display: block;
                color: #e2e8f0;
                font-size: 0.9rem;
                margin-bottom: 0.2rem;
            }

            .maint-card-row p {
                color: #64748b;
                font-size: 0.82rem;
                margin: 0;
                line-height: 1.45;
            }

            .maint-status {
                display: inline-flex;
                align-items: center;
                gap: 0.6rem;
                background: rgba(245, 158, 11, 0.1);
                border: 1px solid rgba(245, 158, 11, 0.25);
                border-radius: 100px;
                padding: 0.6rem 1.25rem;
                color: #fbbf24;
                font-size: 0.82rem;
                font-weight: 600;
                margin-bottom: 1.5rem;
            }

            .maint-status-dot {
                width: 8px;
                height: 8px;
                background: #f59e0b;
                border-radius: 50%;
                animation: maintPulse 1.5s ease-in-out infinite;
                box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
            }

            @keyframes maintPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.4; transform: scale(1.2); }
            }

            .maint-logout-btn {
                display: inline-block;
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2));
                border: 1px solid rgba(139, 92, 246, 0.4);
                color: #c4b5fd;
                padding: 0.85rem 2.5rem;
                border-radius: 100px;
                font-size: 0.95rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                letter-spacing: 0.02em;
            }

            .maint-logout-btn:hover {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(99, 102, 241, 0.35));
                border-color: rgba(139, 92, 246, 0.6);
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(139, 92, 246, 0.3);
            }

            @media (max-width: 640px) {
                .maint-container {
                    padding: 2rem 1.25rem;
                }
                .maint-title {
                    font-size: 1.5rem;
                }
                .maint-subtitle {
                    font-size: 0.9rem;
                }
                .maint-icon {
                    font-size: 3.5rem;
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        // Prevent scrolling behind overlay
        document.body.style.overflow = 'hidden';
    }

    // Run check when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkMaintenanceMode);
    } else {
        checkMaintenanceMode();
    }
})();
