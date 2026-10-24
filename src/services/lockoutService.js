/**
 * Account Lockout & Security Audit Service
 * Requirement: CHAT-F-003 (Issue #13)
 *
 * Enforces account lockout after repeated failed login attempts
 * and records security audit logs.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store: identifier -> { failedAttempts: number, lockedUntil: number | null }
const attemptsStore = new Map();

/**
 * Audit logger for authentication security events.
 * AC-CHAT-F-003: Audit log entry recorded on lockout.
 *
 * @param {string} event - Event name
 * @param {object} details - Event metadata
 */
function recordAuditLog(event, details) {
  const timestamp = new Date().toISOString();
  console.warn(
    `[Audit Log] [${timestamp}] Event: ${event} | Details: ${JSON.stringify(details)}`
  );
}

/**
 * Check if an identifier is locked out.
 * Throws HTTP 429 error if currently locked.
 *
 * @param {string} identifier - Email or username
 */
function checkLockout(identifier) {
  if (!identifier) return;
  const key = identifier.toLowerCase();
  const record = attemptsStore.get(key);

  if (!record) return;

  const now = Date.now();
  if (record.lockedUntil) {
    if (record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      recordAuditLog('ACCOUNT_LOCKOUT_ATTEMPT', {
        identifier: key,
        remainingSeconds,
        action: 'login_rejected_locked',
      });

      const error = new Error('Too many attempts. Account is locked. Please try again after 5 minutes.');
      error.status = 429;
      error.code = 'ACCOUNT_LOCKED';
      error.remainingSeconds = remainingSeconds;
      throw error;
    } else {
      // Lockout duration has expired, reset state
      attemptsStore.delete(key);
    }
  }
}

/**
 * Record a failed login attempt. Locks account if 5 consecutive failures reached.
 *
 * @param {string} identifier - Email or username
 */
function recordFailedAttempt(identifier) {
  if (!identifier) return;
  const key = identifier.toLowerCase();
  const now = Date.now();

  const record = attemptsStore.get(key) || { failedAttempts: 0, lockedUntil: null };
  record.failedAttempts += 1;

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    recordAuditLog('ACCOUNT_LOCKED', {
      identifier: key,
      consecutiveFailures: record.failedAttempts,
      durationMs: LOCKOUT_DURATION_MS,
      action: 'account_locked_5_minutes',
    });
  } else {
    recordAuditLog('LOGIN_FAILED', {
      identifier: key,
      consecutiveFailures: record.failedAttempts,
      action: 'failure_recorded',
    });
  }

  attemptsStore.set(key, record);
}

/**
 * Reset failed attempts upon successful login.
 *
 * @param {string} identifier - Email or username
 */
function resetFailedAttempts(identifier) {
  if (!identifier) return;
  attemptsStore.delete(identifier.toLowerCase());
}

/**
 * Get the current lockout status for an identifier.
 *
 * @param {string} identifier - Email or username
 * @returns {{ isLocked: boolean, failedAttempts: number, remainingSeconds: number }}
 */
function getLockoutStatus(identifier) {
  if (!identifier) return { isLocked: false, failedAttempts: 0, remainingSeconds: 0 };
  const key = identifier.toLowerCase();
  const record = attemptsStore.get(key);

  if (!record) return { isLocked: false, failedAttempts: 0, remainingSeconds: 0 };

  const now = Date.now();
  const isLocked = Boolean(record.lockedUntil && record.lockedUntil > now);
  const remainingSeconds = isLocked ? Math.ceil((record.lockedUntil - now) / 1000) : 0;

  return {
    isLocked,
    failedAttempts: record.failedAttempts,
    remainingSeconds,
  };
}

/**
 * Clear all lockout state (used primarily in test suites).
 */
function clearAllLockouts() {
  attemptsStore.clear();
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  getLockoutStatus,
  clearAllLockouts,
  recordAuditLog,
};
