/**
 * Activity Tracker
 * Tracks and displays user activity timestamps
 * Shows "Last Active" on user profiles
 */

class ActivityTracker {
    constructor() {
        this.activityInterval = null;
        this.init();
    }

    /**
     * Initialize activity tracker
     */
    init() {
        // Update activity display if element exists
        this.updateActivityDisplay();

        // Refresh every minute
        this.activityInterval = setInterval(() => {
            this.updateActivityDisplay();
        }, 60000); // 1 minute
    }

    /**
     * Update activity display on page
     */
    async updateActivityDisplay() {
        const activityElement = document.getElementById('lastActivityTime');
        if (!activityElement) return;

        try {
            const user = firebaseApp.auth.currentUser;
            if (!user) return;

            const userDoc = await firebaseApp.db.collection('users').doc(user.uid).get();
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            if (userData.lastActive) {
                const lastActive = userData.lastActive.toDate();
                const timeAgo = this.getTimeAgo(lastActive);
                activityElement.textContent = timeAgo;
                activityElement.title = lastActive.toLocaleString();
            }

        } catch (error) {
            console.error('Error updating activity display:', error);
        }
    }

    /**
     * Get "time ago" string
     */
    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        let interval = seconds / 31536000;
        if (interval > 1) {
            return Math.floor(interval) + ' years ago';
        }

        interval = seconds / 2592000;
        if (interval > 1) {
            return Math.floor(interval) + ' months ago';
        }

        interval = seconds / 86400;
        if (interval > 1) {
            return Math.floor(interval) + ' days ago';
        }

        interval = seconds / 3600;
        if (interval > 1) {
            return Math.floor(interval) + ' hours ago';
        }

        interval = seconds / 60;
        if (interval > 1) {
            return Math.floor(interval) + ' minutes ago';
        }

        if (seconds < 10) {
            return 'Just now';
        }

        return Math.floor(seconds) + ' seconds ago';
    }

    /**
     * Log specific activity
     */
    async logActivity(action, details = {}) {
        try {
            if (!window.firebaseApp || !window.firebaseApp.db) return;

            const user = firebaseApp.auth.currentUser;
            if (!user) return;

            const userData = firebaseApp.getCurrentUser();

            const activityLog = {
                userId: user.uid,
                userName: userData ? `${userData.firstName} ${userData.lastName}` : 'Unknown',
                role: userData ? userData.role : 'unknown',
                action: action,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                details: details
            };


            await firebaseApp.db.collection('activityLogs').add(activityLog);

        } catch (error) {
            console.error('Error logging activity:', error);
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
     * Get activity history for a user
     */
    async getActivityHistory(userId, limit = 50) {
        try {
            const snapshot = await firebaseApp.db.collection('activityLogs')
                .where('userId', '==', userId)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error('Error getting activity history:', error);
            return [];
        }
    }

    /**
     * Get recent activity for all users (admin only)
     */
    async getRecentActivity(limit = 100) {
        try {
            const snapshot = await firebaseApp.db.collection('activityLogs')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error('Error getting recent activity:', error);
            return [];
        }
    }

    /**
     * Clean up old activity logs (older than 90 days)
     */
    async cleanupOldLogs() {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const snapshot = await firebaseApp.db.collection('activityLogs')
                .where('timestamp', '<', ninetyDaysAgo)
                .get();

            const batch = firebaseApp.db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Cleaned up ${snapshot.size} old activity logs`);

        } catch (error) {
            console.error('Error cleaning up logs:', error);
        }
    }

    /**
     * Destroy tracker
     */
    destroy() {
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
        }
    }
}

// Initialize activity tracker
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.activityTracker = new ActivityTracker();
    });
} else {
    window.activityTracker = new ActivityTracker();
}
