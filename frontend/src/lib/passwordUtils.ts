/**
 * Password utilities for Tagoloan Community College (TCC) LMS.
 * Provides CSPRNG-backed institutional password generation and strength evaluation.
 */

export interface PasswordStrength {
  label: string;
  color: string;
  score: number; // 0 to 100
}

const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes ambiguous 'I', 'O'
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz'; // Excludes ambiguous 'l'
const DIGIT_CHARS = '23456789';                      // Excludes ambiguous '0', '1'
const SPECIAL_CHARS = '!@#$%&*+?';
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS + SPECIAL_CHARS;

/**
 * Generates an unbiased random integer in [0, max) using Web Crypto CSPRNG
 * with rejection sampling to eliminate modulo bias.
 */
function getSecureRandomIndex(max: number): number {
  const randomBuffer = new Uint32Array(1);
  const maxValid = Math.floor(0x100000000 / max) * max;

  let value: number;
  do {
    window.crypto.getRandomValues(randomBuffer);
    value = randomBuffer[0];
  } while (value >= maxValid);

  return value % max;
}

function getRandomChar(charset: string): string {
  return charset[getSecureRandomIndex(charset.length)];
}

/**
 * Generates an institutional-grade high-entropy password.
 * Guarantees at least 2 uppercase, 2 lowercase, 2 digits, and 2 special symbols.
 */
export function generateStrongPassword(length = 12): string {
  const targetLength = Number.isFinite(length) ? Math.max(8, Math.floor(length)) : 12;

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

  while (characters.length < targetLength) {
    characters.push(getRandomChar(ALL_CHARS));
  }

  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = getSecureRandomIndex(i + 1);
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
    return { label: 'Not Set', color: 'var(--neutral-400)', score: 0 };
  }

  if (password.length < 8) {
    return {
      label: 'Too short (minimum 8 characters required)',
      color: '#ef4444',
      score: 20,
    };
  }

  let criteriaMet = 1; // Minimum 8-character policy satisfied
  if (password.length >= 12) criteriaMet += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) criteriaMet += 1;
  if (/\d/.test(password)) criteriaMet += 1;
  if (/[^A-Za-z0-9]/.test(password)) criteriaMet += 1;

  if (criteriaMet >= 5) {
    return { label: 'Very Strong • Institutional Grade', color: '#4ade80', score: 100 };
  }
  if (criteriaMet === 4) {
    return { label: 'Strong', color: '#22c55e', score: 80 };
  }
  if (criteriaMet === 3) {
    return { label: 'Moderate', color: '#fbbf24', score: 60 };
  }
  if (criteriaMet === 2) {
    return { label: 'Fair', color: '#f59e0b', score: 40 };
  }

  return { label: 'Weak (add uppercase, digits, or symbols)', color: '#ef4444', score: 25 };
}
