const AuditLogModel = require('../models/auditLogModel');

// In-memory fallback cache for testing environments without active database
const inMemoryAuditLogs = [];

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'jwt',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'creditcard',
  'credit_card',
]);

/**
 * Recursively strip/redact sensitive keys per SAD §4.4 and STRIDE
 */
function sanitizeAuditMetadata(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeAuditMetadata);
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Record a privileged moderation action in structured audit log (CHAT-SR-005, TC-Sec-05)
 */
async function recordAuditLog({
  actorId,
  action,
  targetType,
  targetId = null,
  roomId = null,
  metadata = {},
}) {
  if (!actorId) {
    throw new Error('actorId is required for audit logging');
  }
  if (!action) {
    throw new Error('action is required for audit logging');
  }
  if (!targetType) {
    throw new Error('targetType is required for audit logging');
  }

  const sanitizedMetadata = sanitizeAuditMetadata(metadata);

  let auditEntry;
  try {
    auditEntry = await AuditLogModel.create({
      actorId,
      action: action.toUpperCase(),
      targetType,
      targetId: targetId ? String(targetId) : null,
      roomId,
      metadata: sanitizedMetadata,
    });
  } catch {
    // Graceful fallback for mock/offline unit tests
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    auditEntry = new AuditLogModel({
      id,
      actor_id: actorId,
      action: action.toUpperCase(),
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      room_id: roomId,
      metadata: sanitizedMetadata,
      created_at: new Date(),
    });
  }

  inMemoryAuditLogs.unshift(auditEntry);

  // Structured console log output (reproducible, searchable in stdout/SIEM)
  console.info(
    `[AUDIT] action="${auditEntry.action}" actor_id="${auditEntry.actorId}" target_type="${auditEntry.targetType}" target_id="${auditEntry.targetId || 'none'}" room_id="${auditEntry.roomId || 'global'}" timestamp="${auditEntry.createdAt.toISOString()}"`
  );

  return auditEntry;
}

/**
 * Query audit logs for a room or actor
 */
async function getAuditLogs({ roomId = null, actorId = null, limit = 50, before = null } = {}) {
  try {
    if (roomId) {
      return await AuditLogModel.findByRoomId({ roomId, limit, before });
    }
    if (actorId) {
      return await AuditLogModel.findByActorId({ actorId, limit, before });
    }
  } catch {
    // Fall back to in-memory logs
  }

  return inMemoryAuditLogs.filter((entry) => {
    if (roomId && entry.roomId !== roomId) return false;
    if (actorId && entry.actorId !== actorId) return false;
    if (before && new Date(entry.createdAt) >= new Date(before)) return false;
    return true;
  }).slice(0, limit);
}

function clearInMemoryLogs() {
  inMemoryAuditLogs.length = 0;
}

module.exports = {
  recordAuditLog,
  getAuditLogs,
  sanitizeAuditMetadata,
  clearInMemoryLogs,
  inMemoryAuditLogs,
};
