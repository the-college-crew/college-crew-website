/**
 * Rules-based password strength. Deliberately no dependency (no zxcvbn) — a
 * transparent, predictable checklist that runs identically on the client
 * (live meter) and the server (enforcement), so the two never disagree.
 */

export const MIN_PASSWORD_LENGTH = 10;

/** Minimum score (0-4) a password must reach to be accepted at signup. */
export const MIN_ACCEPTED_SCORE = 3;

// A tiny blocklist of the most common passwords + obvious brand words. Not a
// full dictionary — proportional to a pilot. Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "letmein",
  "iloveyou",
  "admin123",
  "welcome1",
  "welcome123",
  "collegecrew",
  "homegrown",
]);

export type PasswordChecks = {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
  notCommon: boolean;
};

export type PasswordStrength = {
  /** 0 (empty/very weak) .. 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong";
  checks: PasswordChecks;
  /** True when the password satisfies the minimum accepted score + length. */
  acceptable: boolean;
};

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

export function evaluatePassword(password: string): PasswordStrength {
  const checks: PasswordChecks = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
    notCommon: password.length > 0 && !COMMON_PASSWORDS.has(password.toLowerCase()),
  };

  // Variety = how many character classes are present.
  const variety = [checks.lower, checks.upper, checks.number, checks.symbol].filter(
    Boolean,
  ).length;

  let score: number;
  if (!password || password.length < MIN_PASSWORD_LENGTH || !checks.notCommon) {
    // Length gate and the common-password blocklist cap the score hard.
    score = password.length === 0 ? 0 : 1;
  } else {
    // Length is met and it's not a known-common password: score by variety,
    // with a bonus for longer passphrases.
    score = variety; // 1..4
    if (password.length >= 16 && variety >= 2) score = Math.min(4, score + 1);
    score = Math.max(1, score);
  }

  const clamped = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  return {
    score: clamped,
    label: LABELS[clamped],
    checks,
    acceptable: checks.length && checks.notCommon && clamped >= MIN_ACCEPTED_SCORE,
  };
}
