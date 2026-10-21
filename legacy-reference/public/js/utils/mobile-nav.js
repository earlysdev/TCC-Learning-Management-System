/**
 * Mobile Navigation Handler
 * Shared across all dashboards for responsive sidebar
 */

(function () {
    'use strict';

    /**
     * Inject mobile topbar and overlay if not already present
     */
    function initMobileNav() {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');

        if (!sidebar || !mainContent) return;

        // Add sidebar ID for toggling
        if (!sidebar.id) sidebar.id = 'sidebar';

        // Create overlay if not exists
        if (!document.getElementById('sidebarOverlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.id = 'sidebarOverlay';
            overlay.onclick = toggleMobileSidebar;
            document.querySelector('.dashboard-container').prepend(overlay);
        }

        // Create mobile topbar if not exists
        if (!document.querySelector('.mobile-topbar')) {
            const topbar = document.createElement('div');
            topbar.className = 'mobile-topbar';
            topbar.innerHTML = `
                <button class="hamburger-btn" id="hamburgerBtn" onclick="toggleMobileSidebar()">
                    <span></span><span></span><span></span>
                </button>
                <h2 class="mobile-title">LNHS LMS</h2>
                <div class="user-avatar mobile-avatar" style="width:36px;height:36px;font-size:0.75rem;">
                    <span>${document.querySelector('#userInitials')?.textContent || '?'}</span>
                </div>
            `;
            mainContent.prepend(topbar);
        }

        // Close sidebar when nav items clicked on mobile
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeMobileSidebar();
                }
            });
        });
    }

    /**
     * Toggle sidebar open/close on mobile
     */
    window.toggleMobileSidebar = function () {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.toggle('sidebar-open');
        if (overlay) overlay.classList.toggle('overlay-visible');
    };

    /**
     * Close sidebar on mobile
     */
    window.closeMobileSidebar = function () {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('sidebar-open');
        if (overlay) overlay.classList.remove('overlay-visible');
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileNav);
    } else {
        initMobileNav();
    }
})();
