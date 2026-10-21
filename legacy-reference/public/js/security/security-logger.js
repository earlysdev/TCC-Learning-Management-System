/**
 * Security Logger
 * Centralized security event logging system
 * For Developer and Principal dashboards
 */

class SecurityLogger {
    constructor() {
        this.init();
    }

    /**
     * Initialize security logger
     */
    init() {
        console.log('Security logger initialized');
    }

    /**
     * Log security event
     */
    async logEvent(type, severity, description, details = {}) {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) {
                console.error('Firebase not initialized');
                return null;
            }

            const user = firebaseApp.auth.currentUser;
            const userData = firebaseApp.getCurrentUser();

            const securityLog = {
                type: type,
                severity: severity,
                description: description,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: user ? user.uid : 'anonymous',
                userName: userData ? `${userData.firstName} ${userData.lastName}` : 'Unknown',
                userEmail: user ? user.email : 'unknown',
                userRole: userData ? userData.role : 'unknown',
                ipAddress: await this.getIPAddress(),
                userAgent: navigator.userAgent,
                page: window.location.pathname,
                details: details,
                resolved: false
            };

            const docRef = await firebaseApp.db.collection('securityLogs').add(securityLog);

            console.log(`Security event logged: ${type} (${severity})`);

            // If high or critical severity, notify administrators
            if (severity === 'high' || severity === 'critical') {
                await this.notifyAdministrators(type, description, severity);
            }

            return docRef.id;

        } catch (error) {
            console.error('Error logging security event:', error);
            return null;
        }
    }

    /**
     * Log authentication attempt
     */
    async logAuthAttempt(success, email, reason = '') {
        const type = success ? 'auth_success' : 'auth_failure';
        const severity = success ? 'low' : 'medium';
        const description = success
            ? `Successful login: ${email}`
            : `Failed login attempt: ${email} - ${reason}`;

        return await this.logEvent(type, severity, description, {
            email: email,
            success: success,
            reason: reason
        });
    }

    /**
     * Log suspicious activity
     */
    async logSuspiciousActivity(activityType, description, details = {}) {
        return await this.logEvent(
            'suspicious_activity',
            'high',
            description,
            { activityType, ...details }
        );
    }

    /**
     * Log data breach attempt
     */
    async logBreachAttempt(description, details = {}) {
        return await this.logEvent(
            'breach_attempt',
            'critical',
            description,
            details
        );
    }

    /**
     * Log malicious script detection
     */
    async logMaliciousScript(scriptContent, source, details = {}) {
        return await this.logEvent(
            'malicious_script',
            'critical',
            `Malicious script detected from: ${source}`,
            { scriptContent, source, ...details }
        );
    }

    /**
     * Log unauthorized access attempt
     */
    async logUnauthorizedAccess(resource, action, details = {}) {
        return await this.logEvent(
            'unauthorized_access',
            'high',
            `Unauthorized ${action} attempt on: ${resource}`,
            { resource, action, ...details }
        );
    }

    /**
     * Log rate limit violation
     */
    async logRateLimitViolation(endpoint, requestCount, details = {}) {
        return await this.logEvent(
            'rate_limit_violation',
            'medium',
            `Rate limit exceeded on ${endpoint}: ${requestCount} requests`,
            { endpoint, requestCount, ...details }
        );
    }

    /**
     * Notify administrators of security events
     */
    async notifyAdministrators(type, description, severity) {
        try {
            // Notify Principal
            await this.createNotification('principal', type, description, severity);

            // Notify Developer
            await this.createNotification('developer', type, description, severity);

        } catch (error) {
            console.error('Error notifying administrators:', error);
        }
    }

    /**
     * Create notification
     */
    async createNotification(recipientRole, type, message, severity) {
        try {
            const notification = {
                recipientRole: recipientRole,
                type: 'security',
                title: this.getNotificationTitle(type, severity),
                message: message,
                severity: severity,
                isRead: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebaseApp.db.collection('notifications').add(notification);

        } catch (error) {
            console.error('Error creating notification:', error);
        }
    }

    /**
     * Get notification title based on type and severity
     */
    getNotificationTitle(type, severity) {
        const severityEmoji = {
            'low': 'ℹ️',
            'medium': '⚠️',
            'high': '🚨',
            'critical': '🔴'
        };

        const emoji = severityEmoji[severity] || '⚠️';

        const titles = {
            'auth_failure': 'Failed Login Attempt',
            'suspicious_activity': 'Suspicious Activity Detected',
            'breach_attempt': 'Data Breach Attempt',
            'malicious_script': 'Malicious Script Detected',
            'unauthorized_access': 'Unauthorized Access Attempt',
            'rate_limit_violation': 'Rate Limit Exceeded',
            'screenshot_attempt': 'Screenshot Attempt',
            'excessive_tab_changes': 'Excessive Tab Switching'
        };

        return `${emoji} ${titles[type] || 'Security Alert'}`;
    }

    /**
     * Get security logs (for admin dashboards)
     */
    async getLogs(filters = {}) {
        try {
            let query = firebaseApp.db.collection('securityLogs');

            // Apply filters
            if (filters.type) {
                query = query.where('type', '==', filters.type);
            }

            if (filters.severity) {
                query = query.where('severity', '==', filters.severity);
            }

            if (filters.userId) {
                query = query.where('userId', '==', filters.userId);
            }

            if (filters.resolved !== undefined) {
                query = query.where('resolved', '==', filters.resolved);
            }

            if (filters.startDate) {
                query = query.where('timestamp', '>=', filters.startDate);
            }

            if (filters.endDate) {
                query = query.where('timestamp', '<=', filters.endDate);
            }

            // Order and limit
            query = query.orderBy('timestamp', 'desc');

            if (filters.limit) {
                query = query.limit(filters.limit);
            }

            const snapshot = await query.get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error('Error getting security logs:', error);
            return [];
        }
    }

    /**
     * Mark log as resolved
     */
    async resolveLog(logId, resolvedBy) {
        try {
            await firebaseApp.db.collection('securityLogs').doc(logId).update({
                resolved: true,
                resolvedBy: resolvedBy,
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Security log ${logId} marked as resolved`);

        } catch (error) {
            console.error('Error resolving log:', error);
        }
    }

    /**
     * Get security statistics
     */
    async getStatistics(days = 7) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const logs = await this.getLogs({ startDate });

            const stats = {
                total: logs.length,
                bySeverity: {
                    low: 0,
                    medium: 0,
                    high: 0,
                    critical: 0
                },
                byType: {},
                resolved: 0,
                unresolved: 0
            };

            logs.forEach(log => {
                // Count by severity
                if (stats.bySeverity[log.severity] !== undefined) {
                    stats.bySeverity[log.severity]++;
                }

                // Count by type
                if (!stats.byType[log.type]) {
                    stats.byType[log.type] = 0;
                }
                stats.byType[log.type]++;

                // Count resolved/unresolved
                if (log.resolved) {
                    stats.resolved++;
                } else {
                    stats.unresolved++;
                }
            });

            return stats;

        } catch (error) {
            console.error('Error getting security statistics:', error);
            return null;
        }
    }

    /**
     * Get user's IP address
     */
    async getIPAddress() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Clean up old logs (older than specified days)
     */
    async cleanupOldLogs(days = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const snapshot = await firebaseApp.db.collection('securityLogs')
                .where('timestamp', '<', cutoffDate)
                .where('resolved', '==', true)
                .get();

            const batch = firebaseApp.db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Cleaned up ${snapshot.size} old security logs`);

            return snapshot.size;

        } catch (error) {
            console.error('Error cleaning up logs:', error);
            return 0;
        }
    }
}

// Initialize security logger
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.securityLogger = new SecurityLogger();
    });
} else {
    window.securityLogger = new SecurityLogger();
}
