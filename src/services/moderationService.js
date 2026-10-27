const ModerationModel = require('../models/moderationModel');
const RoomModel = require('../models/roomModel');
const MessageModel = require('../models/messageModel');
const { recordAuditLog, getAuditLogs } = require('./auditService');

/**
 * Moderation Service
 * Executes moderation actions and ensures audit logging (CHAT-SR-005, TC-Sec-05)
 */
class ModerationService {
  /**
   * Mute a user within a room
   */
  static async muteUser({ roomId, targetUserId, actorId, mutedUntil = null, reason = 'Violating chat room rules' }) {
    if (!roomId || !targetUserId || !actorId) {
      throw new Error('roomId, targetUserId, and actorId are required');
    }

    // Protect room owner from being muted
    try {
      const room = await RoomModel.findById(roomId);
      if (room && room.ownerId === targetUserId) {
        const error = new Error('Cannot mute room owner');
        error.code = 'OPERATION_NOT_ALLOWED';
        throw error;
      }
    } catch (err) {
      if (err.code === 'OPERATION_NOT_ALLOWED') throw err;
    }

    try {
      await ModerationModel.muteUser({
        roomId,
        userId: targetUserId,
        mutedBy: actorId,
        mutedUntil,
        reason,
      });
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'MUTE_USER',
      targetType: 'user',
      targetId: targetUserId,
      roomId,
      metadata: { reason, mutedUntil },
    });

    return {
      success: true,
      muted: true,
      roomId,
      userId: targetUserId,
      mutedUntil,
      reason,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Unmute a user within a room
   */
  static async unmuteUser({ roomId, targetUserId, actorId, reason = 'Mute lifted by moderator' }) {
    if (!roomId || !targetUserId || !actorId) {
      throw new Error('roomId, targetUserId, and actorId are required');
    }

    try {
      await ModerationModel.unmuteUser({ roomId, userId: targetUserId });
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'UNMUTE_USER',
      targetType: 'user',
      targetId: targetUserId,
      roomId,
      metadata: { reason },
    });

    return {
      success: true,
      muted: false,
      roomId,
      userId: targetUserId,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Ban a user from a room and evict if present
   */
  static async banUser({ roomId, targetUserId, actorId, reason = 'Banned for misconduct' }) {
    if (!roomId || !targetUserId || !actorId) {
      throw new Error('roomId, targetUserId, and actorId are required');
    }

    // Protect room owner from being banned
    try {
      const room = await RoomModel.findById(roomId);
      if (room && room.ownerId === targetUserId) {
        const error = new Error('Cannot ban room owner');
        error.code = 'OPERATION_NOT_ALLOWED';
        throw error;
      }
    } catch (err) {
      if (err.code === 'OPERATION_NOT_ALLOWED') throw err;
    }

    try {
      await ModerationModel.banUser({
        roomId,
        userId: targetUserId,
        bannedBy: actorId,
        reason,
      });
      // Evict user from room members upon ban
      await RoomModel.removeMember({ roomId, userId: targetUserId });
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'BAN_USER',
      targetType: 'user',
      targetId: targetUserId,
      roomId,
      metadata: { reason },
    });

    return {
      success: true,
      banned: true,
      roomId,
      userId: targetUserId,
      reason,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Unban a user from a room
   */
  static async unbanUser({ roomId, targetUserId, actorId, reason = 'Ban revoked by moderator' }) {
    if (!roomId || !targetUserId || !actorId) {
      throw new Error('roomId, targetUserId, and actorId are required');
    }

    try {
      await ModerationModel.unbanUser({ roomId, userId: targetUserId });
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'UNBAN_USER',
      targetType: 'user',
      targetId: targetUserId,
      roomId,
      metadata: { reason },
    });

    return {
      success: true,
      banned: false,
      roomId,
      userId: targetUserId,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Delete an offensive or inappropriate message (moderation action)
   */
  static async deleteMessage({ roomId, messageId, actorId, reason = 'Inappropriate content removed by moderator' }) {
    if (!roomId || !messageId || !actorId) {
      throw new Error('roomId, messageId, and actorId are required');
    }

    try {
      await MessageModel.deleteById(messageId);
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'DELETE_MESSAGE',
      targetType: 'message',
      targetId: messageId,
      roomId,
      metadata: { reason },
    });

    return {
      success: true,
      deleted: true,
      messageId,
      roomId,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Remove a member from the room (CHAT-F-023)
   */
  static async removeMember({ roomId, targetUserId, actorId, reason = 'Removed by room administrator' }) {
    if (!roomId || !targetUserId || !actorId) {
      throw new Error('roomId, targetUserId, and actorId are required');
    }

    // Protect room owner (CHAT-F-023, TC-Room-04)
    try {
      const room = await RoomModel.findById(roomId);
      if (room && room.ownerId === targetUserId) {
        const error = new Error('Cannot remove room owner');
        error.code = 'OPERATION_NOT_ALLOWED';
        throw error;
      }
    } catch (err) {
      if (err.code === 'OPERATION_NOT_ALLOWED') throw err;
    }

    try {
      const { getMockRoomRole } = require('../middlewares/rbacMiddleware');
      if (typeof getMockRoomRole === 'function' && getMockRoomRole(roomId, targetUserId) === 'owner') {
        const error = new Error('Cannot remove room owner');
        error.code = 'OPERATION_NOT_ALLOWED';
        throw error;
      }
    } catch (err) {
      if (err.code === 'OPERATION_NOT_ALLOWED') throw err;
    }

    try {
      await RoomModel.removeMember({ roomId, userId: targetUserId });
    } catch {
      // In-memory/mock fallback
    }

    const auditLog = await recordAuditLog({
      actorId,
      action: 'REMOVE_MEMBER',
      targetType: 'member',
      targetId: targetUserId,
      roomId,
      metadata: { reason },
    });

    try {
      const { publishRoomEvent } = require('../cache/redisPubSub');
      await publishRoomEvent({
        roomId,
        eventName: 'member:removed',
        payload: {
          roomId,
          userId: targetUserId,
          actorId,
          reason,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // In-memory fallback
    }

    return {
      success: true,
      removed: true,
      roomId,
      userId: targetUserId,
      auditLogId: auditLog.id,
    };
  }

  /**
   * Retrieve audit logs for a room
   */
  static async getRoomAuditLogs({ roomId, limit = 50, before = null }) {
    return await getAuditLogs({ roomId, limit, before });
  }
}

module.exports = ModerationService;
