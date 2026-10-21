/**
 * Navigation Guard
 * Protects routes and ensures users can only access authorized pages
 * Provides user-friendly navigation flow
 */

class NavigationGuard {
    constructor() {
        this.currentPage = window.location.pathname.split('/').pop();
        this.init();
    }

    /**
     * Initialize navigation guard
     */
    init() {
        // Check authentication and permissions
        this.checkAccess();

        // Add navigation helpers
        this.addBreadcrumbs();

        // Monitor navigation
        this.monitorNavigation();
    }

    /**
     * Check if user can access current page
     */
    async checkAccess() {
        try {
            // Public pages that don't require authentication
            const publicPages = [
                'index.html', 'login.html', '', '/'
            ];
            const cleanPath = window.location.pathname.replace(/\/$/, '') || '/';
            const isPublic = publicPages.includes(this.currentPage) ||
                cleanPath === '/' ||
                cleanPath === '/login' ||
                cleanPath === '/home' ||
                cleanPath === '/portal' ||
                this.currentPage === '';

            if (isPublic) {
                return true;
            }

            // Wait for Firebase Auth to be ready
            await new Promise((resolve) => {
                if (firebaseApp && firebaseApp.auth) {
                    const unsubscribe = firebaseApp.auth.onAuthStateChanged((user) => {
                        unsubscribe();
                        resolve(user);
                    });
                } else {
                    // If Firebase not loaded yet, wait a bit
                    setTimeout(resolve, 500);
                }
            });

            // Check if user is authenticated
            const user = firebaseApp.auth.currentUser;
            if (!user) {
                this.redirectToLogin();
                return false;
            }

            // Get user data from sessionStorage (faster than Firestore)
            const userData = firebaseApp.getCurrentUser();
            if (!userData) {
                // Wait a bit for sessionStorage to be populated
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryUserData = firebaseApp.getCurrentUser();

                if (!retryUserData) {
                    this.redirectToLogin();
                    return false;
                }
            }

            const currentUserData = userData || firebaseApp.getCurrentUser();

            // Check if user has permission to access this page
            const canAccess = permissionsSystem.canAccessPage(currentUserData.role, this.currentPage);

            if (!canAccess) {
                this.redirectToDashboard(currentUserData.role);
                return false;
            }

            // Log page access
            if (window.activityTracker) {
                await activityTracker.logActivity('page_access', {
                    page: this.currentPage
                });
            }

            return true;

        } catch (error) {
            console.error('Access check error:', error);
            // Don't redirect on error - let the page's own protectPage handle it
            return true;
        }
    }

    /**
     * Redirect to login page
     */
    redirectToLogin() {
        const loginPath = (window.firebaseApp && window.firebaseApp.getRoute)
            ? window.firebaseApp.getRoute('login')
            : 'login.html'; // safe fallback before firebaseApp loads
        setTimeout(() => {
            window.location.href = loginPath;
        }, 1000);
    }

    /**
     * Redirect to appropriate dashboard
     */
    redirectToDashboard(userRole) {
        const dashboardUrl = permissionsSystem.getDashboardUrl(userRole);

        if (window.firebaseApp && window.firebaseApp.showToast) {
            firebaseApp.showToast('Redirecting to your dashboard...', 'info');
        }

        setTimeout(() => {
            window.location.href = dashboardUrl;
        }, 1000);
    }

    /**
     * Add breadcrumb navigation
     */
    addBreadcrumbs() {
        const breadcrumbContainer = document.getElementById('breadcrumbs');
        if (!breadcrumbContainer) return;

        const breadcrumbs = this.getBreadcrumbs();

        breadcrumbContainer.innerHTML = breadcrumbs.map((crumb, index) => {
            if (index === breadcrumbs.length - 1) {
                // Current page - not clickable
                return `<span class="breadcrumb-current">${crumb.label}</span>`;
            } else {
                // Previous pages - clickable
                return `<a href="${crumb.url}" class="breadcrumb-link">${crumb.label}</a>`;
            }
        }).join(' <span class="breadcrumb-separator">›</span> ');
    }

    /**
     * Get breadcrumbs for current page
     */
    getBreadcrumbs() {
        const breadcrumbs = [
            { label: 'Home', url: 'index.html' }
        ];

        const pageMap = {
            'student-dashboard.html': { label: 'Student Dashboard', parent: null },
            'teacher-dashboard.html': { label: 'Teacher Dashboard', parent: null },
            'secretary-dashboard.html': { label: 'Secretary Dashboard', parent: null },
            'principal-dashboard.html': { label: 'Principal Dashboard', parent: null },
            'developer-dashboard.html': { label: 'Developer Dashboard', parent: null },
            'quiz.html': { label: 'Quiz', parent: 'student-dashboard.html' },
            'login.html': { label: 'Login', parent: null }
        };

        const currentPageInfo = pageMap[this.currentPage];
        if (!currentPageInfo) return breadcrumbs;

        // Add parent breadcrumb if exists
        if (currentPageInfo.parent) {
            const parentInfo = pageMap[currentPageInfo.parent];
            if (parentInfo) {
                breadcrumbs.push({
                    label: parentInfo.label,
                    url: currentPageInfo.parent
                });
            }
        }

        // Add current page
        breadcrumbs.push({
            label: currentPageInfo.label,
            url: this.currentPage
        });

        return breadcrumbs;
    }

    /**
     * Monitor navigation events
     */
    monitorNavigation() {
        // Monitor all link clicks
        document.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http')) return;

            // Log navigation
            if (window.activityTracker) {
                await activityTracker.logActivity('navigation', {
                    from: this.currentPage,
                    to: href
                });
            }
        });

        // Monitor back/forward navigation
        window.addEventListener('popstate', async () => {
            if (window.activityTracker) {
                await activityTracker.logActivity('browser_navigation', {
                    page: window.location.pathname
                });
            }
        });
    }

    /**
     * Navigate to page (with permission check)
     */
    async navigateTo(url, checkPermission = true) {
        try {
            if (checkPermission) {
                const user = firebaseApp.getCurrentUser();
                if (!user) {
                    this.redirectToLogin();
                    return false;
                }

                const pageName = url.split('/').pop();
                const canAccess = permissionsSystem.canAccessPage(user.role, pageName);

                if (!canAccess) {
                    if (window.firebaseApp && window.firebaseApp.showToast) {
                        firebaseApp.showToast('You do not have permission to access this page', 'error');
                    }
                    return false;
                }
            }

            // Log navigation
            if (window.activityTracker) {
                await activityTracker.logActivity('programmatic_navigation', {
                    from: this.currentPage,
                    to: url
                });
            }

            window.location.href = url;
            return true;

        } catch (error) {
            console.error('Navigation error:', error);
            return false;
        }
    }

    /**
     * Get navigation menu items for current user
     */
    getNavigationItems(userRole) {
        const allItems = {
            student: [
                { label: 'Dashboard', url: 'student-dashboard.html', icon: '📊' },
                { label: 'Quizzes', url: 'student-dashboard.html#quizzes', icon: '📝' },
                { label: 'Scores', url: 'student-dashboard.html#scores', icon: '🎯' },
                { label: 'Recommendations', url: 'student-dashboard.html#recommendations', icon: '🤖' }
            ],
            teacher: [
                { label: 'Dashboard', url: 'teacher-dashboard.html', icon: '📊' },
                { label: 'Create Quiz', url: 'teacher-dashboard.html#create', icon: '➕' },
                { label: 'My Quizzes', url: 'teacher-dashboard.html#quizzes', icon: '📝' },
                { label: 'Students', url: 'teacher-dashboard.html#students', icon: '👥' },
                { label: 'Analytics', url: 'teacher-dashboard.html#analytics', icon: '📈' }
            ],
            secretary: [
                { label: 'Dashboard', url: 'secretary-dashboard.html', icon: '📊' },
                { label: 'Users', url: 'secretary-dashboard.html#users', icon: '👥' },
                { label: 'Performance', url: 'secretary-dashboard.html#performance', icon: '📈' },
                { label: 'Reports', url: 'secretary-dashboard.html#reports', icon: '📄' },
                { label: 'System Health', url: 'secretary-dashboard.html#health', icon: '💚' }
            ],
            principal: [
                { label: 'Dashboard', url: 'principal-dashboard.html', icon: '📊' },
                { label: 'All Users', url: 'principal-dashboard.html#users', icon: '👥' },
                { label: 'Security', url: 'principal-dashboard.html#security', icon: '🔒' },
                { label: 'Analytics', url: 'principal-dashboard.html#analytics', icon: '📈' },
                { label: 'Settings', url: 'principal-dashboard.html#settings', icon: '⚙️' }
            ],
            developer: [
                { label: 'Dashboard', url: 'developer-dashboard.html', icon: '📊' },
                { label: 'Security Logs', url: 'developer-dashboard.html#logs', icon: '🔒' },
                { label: 'Server Status', url: 'developer-dashboard.html#server', icon: '🖥️' },
                { label: 'Monitoring', url: 'developer-dashboard.html#monitoring', icon: '📡' },
                { label: 'Backups', url: 'developer-dashboard.html#backups', icon: '💾' }
            ]
        };

        return allItems[userRole] || [];
    }

    /**
     * Show navigation help/tutorial
     */
    showNavigationHelp() {
        const user = firebaseApp.getCurrentUser();
        if (!user) return;

        const helpContent = {
            student: `
                <h3>Welcome to Your Dashboard!</h3>
                <p>Here's how to navigate:</p>
                <ul>
                    <li><strong>Dashboard:</strong> View your overview and statistics</li>
                    <li><strong>Quizzes:</strong> Take available quizzes</li>
                    <li><strong>Scores:</strong> Check your quiz results</li>
                    <li><strong>Recommendations:</strong> Get AI-powered study tips</li>
                </ul>
            `,
            teacher: `
                <h3>Welcome to Teacher Dashboard!</h3>
                <p>Here's what you can do:</p>
                <ul>
                    <li><strong>Create Quiz:</strong> Build new quizzes or upload files</li>
                    <li><strong>My Quizzes:</strong> Manage your quizzes</li>
                    <li><strong>Students:</strong> Monitor student progress</li>
                    <li><strong>Analytics:</strong> View performance reports</li>
                </ul>
            `,
            secretary: `
                <h3>Welcome to Secretary Dashboard!</h3>
                <p>Your responsibilities:</p>
                <ul>
                    <li><strong>Users:</strong> Manage student and teacher accounts</li>
                    <li><strong>Performance:</strong> Monitor system performance</li>
                    <li><strong>Reports:</strong> Generate and view reports</li>
                    <li><strong>System Health:</strong> Check system status</li>
                </ul>
            `,
            principal: `
                <h3>Welcome to Principal Dashboard!</h3>
                <p>You have full system access:</p>
                <ul>
                    <li><strong>All Users:</strong> Manage all user accounts</li>
                    <li><strong>Security:</strong> View security logs and alerts</li>
                    <li><strong>Analytics:</strong> School-wide analytics</li>
                    <li><strong>Settings:</strong> System configuration</li>
                </ul>
            `,
            developer: `
                <h3>Welcome to Developer Dashboard!</h3>
                <p>System security and monitoring:</p>
                <ul>
                    <li><strong>Security Logs:</strong> Monitor security events</li>
                    <li><strong>Server Status:</strong> Check server health</li>
                    <li><strong>Monitoring:</strong> Real-time system monitoring</li>
                    <li><strong>Backups:</strong> Manage database backups</li>
                </ul>
            `
        };

        const content = helpContent[user.role] || '<p>Navigation help not available</p>';

        // Show modal or toast
        if (window.firebaseApp && window.firebaseApp.showToast) {
            firebaseApp.showToast('Check the help section for navigation tips', 'info');
        }

        // You can implement a modal here
        // navigation help rendered in modal if available
    }
}

// Initialize navigation guard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.navigationGuard = new NavigationGuard();
    });
} else {
    window.navigationGuard = new NavigationGuard();
}
