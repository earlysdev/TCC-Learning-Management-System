import { useEffect, useState, useCallback, useRef } from 'react';
import type { UserRole } from '../lib/types';

interface UseIdleTimeoutProps {
  role?: UserRole;
  onTimeout: () => void;
  timeoutMinutes?: number;
  warningMinutes?: number;
}

export function useIdleTimeout({ 
  role, 
  onTimeout, 
  timeoutMinutes = 10,
  warningMinutes = 9 
}: UseIdleTimeoutProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warningRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const isExempt = role === 'teacher' || role === 'secretary' || role === 'dean' || role === 'developer';

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startTimers = useCallback(() => {
    if (isExempt) return;

    clearAllTimers();
    setShowWarning(false);
    
    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds((timeoutMinutes - warningMinutes) * 60);
      
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearAllTimers();
            onTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
    }, warningMinutes * 60 * 1000);

    timeoutRef.current = setTimeout(() => {
      clearAllTimers();
      onTimeout();
    }, timeoutMinutes * 60 * 1000);

  }, [isExempt, timeoutMinutes, warningMinutes, onTimeout, clearAllTimers]);

  useEffect(() => {
    if (isExempt) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => {
      if (!showWarning) {
        startTimers();
      }
    };

    startTimers();

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      clearAllTimers();
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [isExempt, startTimers, showWarning, clearAllTimers]);

  const stayActive = useCallback(() => {
    startTimers();
  }, [startTimers]);

  return { showWarning, remainingSeconds, stayActive };
}
