/**
 * Permissions System
 * Defines and enforces role-based permissions
 */

class PermissionsSystem {
    constructor() {
        this.permissions = this.definePermissions();
    }

    /**
     * Define permissions for each role
     */
    definePermissions() {
        return {
            student: {
                // Quiz permissions
                takeQuiz: true,
                viewOwnScores: true,
                viewOwnProgress: true,
                receiveRecommendations: true,

                // Restrictions
                createQuiz: false,
                editQuiz: false,
                deleteQuiz: false,
                viewAllScores: false,
                manageUsers: false,
                viewSecurityLogs: false,
                systemConfig: false,
                databaseAccess: false
            },

            teacher: {
                // Quiz permissions
                takeQuiz: false,
                createQuiz: true,
                editQuiz: true,
                deleteQuiz: true,
                viewAllScores: true,
                uploadFiles: true,
                generateQuizFromFile: true,
                scheduleQuiz: true,

                // Student management
                viewStudentProgress: true,
                viewStudentScores: true,
                sendNotifications: true,
                generateReports: true,

                // Restrictions
                manageTeachers: false,
                manageSecretary: false,
                managePrincipal: false,
                manageDeveloper: false,
                viewSecurityLogs: false,
                systemConfig: false,
                databaseAccess: false
            },

            secretary: {
                // User management
                viewAllUsers: true,
                manageStudents: true,
                manageTeachers: true,
                activateDeactivateAccounts: true,

                // Monitoring
                viewSystemHealth: true,
                viewPerformanceMetrics: true,
                generateReports: true,
                sendNotifications: true,
                viewActivityLogs: true,

                // Restrictions
                manageSecretary: false,
                managePrincipal: false,
                manageDeveloper: false,
                viewSecurityLogs: false,
                systemConfig: false,
                databaseAccess: false,
                createQuiz: false,
                deleteUsers: false
            },

            principal: {
                // FULL ACCESS
                viewAllUsers: true,
                manageStudents: true,
                manageTeachers: true,
                manageSecretary: true,
                managePrincipal: true,
                manageDeveloper: true,

                // Quiz management
                createQuiz: true,
                editQuiz: true,
                deleteQuiz: true,
                viewAllScores: true,

                // System access
                viewSecurityLogs: true,
                systemConfig: true,
                databaseAccess: true,
                viewActivityLogs: true,
                viewSystemHealth: true,

                // Advanced
                overridePermissions: true,
                emergencyControls: true,
                deleteUsers: true,
                sendNotifications: true,
                generateReports: true,
                viewAnalytics: true
            },

            developer: {
                // Security monitoring
                viewSecurityLogs: true,
                monitorServer: true,
                detectAttacks: true,
                manageLogs: true,

                // System access
                databaseAccess: true,
                systemConfig: true,
                backupManagement: true,

                // Notifications
                sendNotifications: true,
                notifyPrincipal: true,

                // Restrictions
                manageUsers: false,
                createQuiz: false,
                viewStudentData: false,
                viewScores: false
            }
        };
    }

    /**
     * Check if user has permission
     */
    hasPermission(userRole, permission) {
        if (!userRole || !this.permissions[userRole]) {
            return false;
        }

        return this.permissions[userRole][permission] === true;
    }

    /**
     * Check multiple permissions (AND logic)
     */
    hasAllPermissions(userRole, permissionsList) {
        return permissionsList.every(permission =>
            this.hasPermission(userRole, permission)
        );
    }

    /**
     * Check multiple permissions (OR logic)
     */
    hasAnyPermission(userRole, permissionsList) {
        return permissionsList.some(permission =>
            this.hasPermission(userRole, permission)
        );
    }

    /**
     * Get all permissions for a role
     */
    getRolePermissions(userRole) {
        return this.permissions[userRole] || {};
    }

    /**
     * Get allowed roles for a permission
     */
    getRolesWithPermission(permission) {
        const roles = [];

        for (const [role, permissions] of Object.entries(this.permissions)) {
            if (permissions[permission] === true) {
                roles.push(role);
            }
        }

        return roles;
    }

    /**
     * Check if user can manage another user
     */
    canManageUser(managerRole, targetRole) {
        // Principal can manage everyone
        if (managerRole === 'principal') {
            return true;
        }

        // Secretary can manage students and teachers
        if (managerRole === 'secretary') {
            return targetRole === 'student' || targetRole === 'teacher';
        }

        // No one else can manage users
        return false;
    }

    /**
     * Check if user can access page
     */
    canAccessPage(userRole, pageName) {
        const pagePermissions = {
            // Accept both .html names and clean URL slugs
            'student-dashboard.html': ['student'],
            'teacher-dashboard.html': ['teacher', 'principal'],
            'secretary-dashboard.html': ['secretary', 'principal'],
            'principal-dashboard.html': ['principal'],
            'developer-dashboard.html': ['developer', 'principal'],
            'quiz.html': ['student', 'teacher', 'principal'],
            // Clean URL slugs
            'student': ['student'],
            'teacher': ['teacher', 'principal'],
            'secretary': ['secretary', 'principal'],
            'principal': ['principal'],
            'developer': ['developer', 'principal'],
            'quiz': ['student', 'teacher', 'principal']
        };

        const allowedRoles = pagePermissions[pageName];
        if (!allowedRoles) {
            return true; // Public page
        }

        return allowedRoles.includes(userRole);
    }

    /**
     * Get dashboard URL for role
     */
    getDashboardUrl(userRole) {
        const dashboards = {
            student: '/student',
            teacher: '/teacher',
            secretary: '/secretary',
            principal: '/principal',
            developer: '/developer'
        };

        return dashboards[userRole] || '/';
    }

    /**
     * Validate action permission
     */
    async validateAction(action, details = {}) {
        try {
            const user = firebaseApp.getCurrentUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            const hasPermission = this.hasPermission(user.role, action);

            if (!hasPermission) {
                // Log unauthorized attempt
                // Note: securityLogger automatically handles fetching the real IP address
                if (window.securityLogger) {
                    await securityLogger.logUnauthorizedAccess(
                        action,
                        'action',
                        { userRole: user.role, ...details }
                    );
                }

                throw new Error(`Permission denied: ${action}`);
            }

            return true;

        } catch (error) {
            console.error('Permission validation error:', error);
            throw error;
        }
    }

    /**
     * Show permission denied message
     */
    showPermissionDenied(action) {
        if (window.firebaseApp && window.firebaseApp.showToast) {
            firebaseApp.showToast(
                `⛔ Permission denied: ${action}`,
                'error'
            );
        }
    }
}

// Initialize permissions system
window.permissionsSystem = new PermissionsSystem();
