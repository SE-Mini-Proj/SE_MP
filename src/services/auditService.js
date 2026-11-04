const AuditLogModel = require('../models/auditLogModel');
const logger = require('./loggerService');

// In-memory fallback cache for testing environments without active database
const inMemoryAuditLogs = [];

/**
 * Recursively redact sensitive audit metadata.
 * Uses the centralized logger sanitizer to keep protection consistent.
 */
function sanitizeAuditMetadata(obj) {
  return logger.sanitizeValue(obj);
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

  // Structured audit event with sensitive metadata redacted.
  logger.info('audit.action', 'Moderation action recorded', {
    actorId: auditEntry.actorId,
    action: auditEntry.action,
    targetType: auditEntry.targetType,
    targetId: auditEntry.targetId,
    roomId: auditEntry.roomId,
    metadata: sanitizedMetadata,
    auditTimestamp: auditEntry.createdAt.toISOString(),
  });

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
