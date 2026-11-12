/**
 * Password utilities for Tagoloan Community College (TCC) LMS.
 * Provides high-entropy institutional password generation and strength evaluation.
 */

export interface PasswordStrength {
  label: string;
  color: string;
  score: number;   // 0 to 100 or 0 to 5 for UI meters
  percent: number; // 0 to 100 for progress bar width
}

const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes confusing 'I', 'O'
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz'; // Excludes confusing 'l'
const DIGIT_CHARS = '23456789';                      // Excludes confusing '0', '1'
const SPECIAL_CHARS = '!@#$%&*+?';
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS + SPECIAL_CHARS;

function getRandomChar(charset: string): string {
  const index = Math.floor(Math.random() * charset.length);
  return charset[index];
}

/**
 * Generates an institutional-grade high-entropy password.
 * Guarantees at least 2 uppercase, 2 lowercase, 2 digits, and 2 special symbols.
 */
export function generateStrongPassword(length = 12): string {
  const targetLength = Math.max(8, length);

  // Guarantee inclusion of all required character types
  const characters: string[] = [
    getRandomChar(UPPERCASE_CHARS),
    getRandomChar(UPPERCASE_CHARS),
    getRandomChar(LOWERCASE_CHARS),
    getRandomChar(LOWERCASE_CHARS),
    getRandomChar(DIGIT_CHARS),
    getRandomChar(DIGIT_CHARS),
    getRandomChar(SPECIAL_CHARS),
    getRandomChar(SPECIAL_CHARS),
  ];

  // Fill the remainder up to target length
  while (characters.length < targetLength) {
    characters.push(getRandomChar(ALL_CHARS));
  }

  // Fisher-Yates shuffle to randomize positions
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = characters[i];
    characters[i] = characters[j];
    characters[j] = temp;
  }

  return characters.join('');
}

/**
 * Evaluates password complexity for institutional security compliance.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { label: 'Not Set', color: 'var(--neutral-400)', score: 0, percent: 0 };
  }

  let criteriaMet = 0;
  if (password.length >= 8) criteriaMet += 1;
  if (password.length >= 12) criteriaMet += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) criteriaMet += 1;
  if (/\d/.test(password)) criteriaMet += 1;
  if (/[^A-Za-z0-9]/.test(password)) criteriaMet += 1;

  if (criteriaMet >= 5) {
    return {
      label: 'Very Strong • Institutional Grade',
      color: '#4ade80',
      score: 100,
      percent: 100,
    };
  }

  if (criteriaMet >= 4) {
    return {
      label: 'Strong',
      color: '#22c55e',
      score: 80,
      percent: 80,
    };
  }

  if (criteriaMet >= 3) {
    return {
      label: 'Moderate',
      color: '#fbbf24',
      score: 60,
      percent: 60,
    };
  }

  if (criteriaMet >= 2) {
    return {
      label: 'Fair',
      color: '#f59e0b',
      score: 40,
      percent: 40,
    };
  }

  return {
    label: 'Weak (minimum 8 characters required)',
    color: '#ef4444',
    score: 20,
    percent: 20,
  };
}
