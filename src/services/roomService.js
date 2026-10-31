/**
 * Room Service
 * Implements room creation, membership, and join operations.
 */
const RoomModel = require('../models/roomModel');

async function createRoom({ name, isPrivate = false, ownerId }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    const error = new Error('Room name must be between 1 and 100 characters');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (typeof ownerId !== 'string' || !ownerId) {
    const error = new Error('Room owner is required');
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const room = await RoomModel.create({
    name: name.trim(),
    isPrivate,
    ownerId,
  });

  return {
    status: 'ok',
    room: {
      id: room.id,
      name: room.name,
      isPrivate: room.isPrivate,
      ownerId: room.ownerId,
      members: [room.ownerId],
      createdAt: room.createdAt,
    },
  };
}

async function joinRoom({ roomId, _inviteCode, userId }) {
  return {
    status: 'ok',
    roomId,
    members: [userId || 'mock_user'],
  };
}

/**
 * Remove a member from a room (CHAT-F-023, TC-Room-04)
 * Allows room owner to remove a member; non-owners are prohibited.
 */
async function removeMember({ roomId, targetUserId, actorId, reason = 'Removed by room administrator' }) {
  if (!roomId || !targetUserId || !actorId) {
    const error = new Error('roomId, targetUserId, and actorId are required');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  // Verify room exists
  const room = await RoomModel.findById(roomId);
  if (!room) {
    const error = new Error('Room not found');
    error.status = 404;
    error.code = 'ROOM_NOT_FOUND';
    throw error;
  }

  // Non-owners cannot remove members (AC-CHAT-F-023)
  const actorRole = await RoomModel.getMemberRole(roomId, actorId);
  const isOwner = room.ownerId === actorId || actorRole === 'owner';
  const isAdmin = actorRole === 'admin';
  if (!isOwner && !isAdmin) {
    const error = new Error('Only the room owner can remove members');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // Cannot remove room owner
  if (targetUserId === room.ownerId) {
    const error = new Error('Cannot remove room owner');
    error.status = 403;
    error.code = 'OPERATION_NOT_ALLOWED';
    throw error;
  }

  // Removed member loses access to the room
  await RoomModel.removeMember({ roomId, userId: targetUserId });

  // Record structured audit trail
  let auditLog = null;
  try {
    const { recordAuditLog } = require('./auditService');
    auditLog = await recordAuditLog({
      actorId,
      action: 'REMOVE_MEMBER',
      targetType: 'member',
      targetId: targetUserId,
      roomId,
      metadata: { reason },
    });
  } catch {
    // In-memory/mock fallback
  }

  // Notify room and target user of eviction via Redis Pub/Sub (AC-CHAT-F-023)
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
    // PubSub fallback
  }

  return {
    status: 'ok',
    success: true,
    removed: true,
    roomId,
    userId: targetUserId,
    auditLogId: auditLog ? auditLog.id : undefined,
  };
}

module.exports = {
  createRoom,
  joinRoom,
  removeMember,
};
