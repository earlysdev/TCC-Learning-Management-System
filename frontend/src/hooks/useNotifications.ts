import { useState, useEffect, useCallback } from 'react';
import type { LmsNotification } from '../lib/types';
import { lmsFetch } from '../lib/api';

export function useNotifications() {
  const [notifications, setNotifications] = useState<LmsNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await lmsFetch<any>('/notifications?limit=20');
      const list: LmsNotification[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
            ? res.data
            : [];
      setNotifications(list);
      setUnreadCount(list.filter((n: LmsNotification) => !n.is_read).length);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id: number) => {
    try {
      await lmsFetch(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => (Array.isArray(prev) ? prev : []).map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const markAllRead = async () => {
    try {
      await lmsFetch('/notifications/mark-all-read', { method: 'POST' });
      setNotifications(prev => (Array.isArray(prev) ? prev : []).map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  };

  return { notifications, unreadCount, isLoading, markRead, markAllRead, refresh: fetchNotifications };
}

