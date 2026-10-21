import { useEffect, useState, useCallback, useRef } from 'react';
import type { UserRole } from '../lib/types';

interface UseIdleTimeoutProps {
  role?: UserRole;
  onTimeout: () => void;
  timeoutMinutes?: number;
  warningMinutes?: number;
  countdownSeconds?: number;
}

export function useIdleTimeout({
  role,
  onTimeout,
  timeoutMinutes = 2,
  warningMinutes = 1,
  countdownSeconds = 60,
}: UseIdleTimeoutProps) {
  const [showWarning, setShowWarning] = useState(false);
  const effectiveCountdown =
    timeoutMinutes > warningMinutes
      ? Math.round((timeoutMinutes - warningMinutes) * 60)
      : countdownSeconds;

  const [remainingSeconds, setRemainingSeconds] = useState(effectiveCountdown);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const warningOpenedAtRef = useRef<number>(0);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const isExempt =
    role === 'teacher' ||
    role === 'secretary' ||
    role === 'dean' ||
    role === 'developer';

  const clearAllTimers = useCallback(() => {
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = undefined;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = undefined;
    }
  }, []);

  const startTimers = useCallback(() => {
    if (isExempt) return;

    clearAllTimers();
    setShowWarning(false);
    setRemainingSeconds(effectiveCountdown);

    warningRef.current = setTimeout(() => {
      warningOpenedAtRef.current = Date.now();
      setShowWarning(true);
      setRemainingSeconds(effectiveCountdown);

      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearAllTimers();
            setShowWarning(false);
            onTimeoutRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningMinutes * 60 * 1000);
  }, [isExempt, warningMinutes, effectiveCountdown, clearAllTimers]);

  useEffect(() => {
    if (isExempt) return;

    const events = [
      'mousemove',
      'mouseover',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ];

    let lastReset = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      // Ignore synthetic events in the first 350ms right as the modal mounts
      if (warningOpenedAtRef.current > 0 && now - warningOpenedAtRef.current < 350) {
        return;
      }
      // If the warning modal is open, any mouse move/hover or key press immediately closes it
      if (warningOpenedAtRef.current > 0) {
        warningOpenedAtRef.current = 0;
        lastReset = now;
        startTimers();
        return;
      }
      // Throttle normal activity timer resets to once every 400ms
      if (now - lastReset >= 400) {
        lastReset = now;
        startTimers();
      }
    };

    startTimers();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearAllTimers();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isExempt, startTimers, clearAllTimers]);

  const stayActive = useCallback(() => {
    warningOpenedAtRef.current = 0;
    startTimers();
  }, [startTimers]);

  return { showWarning, remainingSeconds, stayActive };
}
