const crypto = require('crypto');
const RoomModel = require('../models/roomModel');

function createServiceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Create a room and register its owner as the initial member.
 */
async function createRoom({ name, isPrivate = false, ownerId }) {
  if (
    typeof name !== 'string'
    || !name.trim()
    || name.trim().length > 100
  ) {
    throw createServiceError(
      400,
      'VALIDATION_ERROR',
      'Room name must be between 1 and 100 characters'
    );
  }

  if (typeof ownerId !== 'string' || !ownerId) {
    throw createServiceError(
      401,
      'UNAUTHORIZED',
      'Room owner is required'
    );
  }

  if (typeof isPrivate !== 'boolean') {
    throw createServiceError(
      400,
      'VALIDATION_ERROR',
      'isPrivate must be a boolean'
    );
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

/**
 * Generate a private-room invitation.
 * Only the room owner or an administrator may generate invitations.
 */
async function createRoomInvite({
  roomId,
  userId,
  userRole,
  expiresInHours = 24,
}) {
  if (!roomId || !userId) {
    throw createServiceError(
      400,
      'VALIDATION_ERROR',
      'Room ID and user ID are required'
    );
  }

  const room = await RoomModel.findById(roomId);

  if (!room) {
    throw createServiceError(404, 'NOT_FOUND', 'Room not found');
  }

  if (!room.isPrivate) {
    throw createServiceError(
      400,
      'INVALID_ROOM_TYPE',
      'Invitations can only be created for private rooms'
    );
  }

  const role = await RoomModel.getMemberRole(roomId, userId);

  if (
    role !== 'owner'
    && role !== 'admin'
    && userRole !== 'admin'
  ) {
    throw createServiceError(
      403,
      'FORBIDDEN',
      'Only the room owner or an administrator can create invitations'
    );
  }

  if (
    !Number.isFinite(expiresInHours)
    || expiresInHours <= 0
    || expiresInHours > 168
  ) {
    throw createServiceError(
      400,
      'VALIDATION_ERROR',
      'Invitation expiry must be between 0 and 168 hours'
    );
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const expiresAt = new Date(
    Date.now() + expiresInHours * 60 * 60 * 1000
  );

  const invitation = await RoomModel.createInvite({
    roomId,
    tokenHash,
    createdBy: userId,
    expiresAt,
  });

  if (!invitation) {
    throw createServiceError(
      404,
      'NOT_FOUND',
      'Private room not found'
    );
  }

  return {
    status: 'ok',
    invitation: {
      id: invitation.id,
      roomId: invitation.room_id,
      token,
      expiresAt: invitation.expires_at,
    },
  };
}

/**
 * Join a public room or join a private room using a valid invitation.
 */
async function joinRoom({ roomId, inviteCode, userId }) {
  if (!roomId || typeof roomId !== 'string') {
    throw createServiceError(
      400,
      'VALIDATION_ERROR',
      'Room ID is required'
    );
  }

  if (!userId || typeof userId !== 'string') {
    throw createServiceError(
      401,
      'UNAUTHORIZED',
      'Authenticated user is required'
    );
  }

  const room = await RoomModel.findById(roomId);

  if (!room) {
    throw createServiceError(404, 'NOT_FOUND', 'Room not found');
  }

  if (room.isPrivate) {
    if (typeof inviteCode !== 'string' || !inviteCode.trim()) {
      throw createServiceError(
        403,
        'INVITE_REQUIRED',
        'A valid invitation token is required to join this private room'
      );
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(inviteCode.trim())
      .digest('hex');

    const invitation = await RoomModel.findValidInvite({
      roomId,
      tokenHash,
    });

    if (!invitation) {
      throw createServiceError(
        403,
        'INVALID_INVITE',
        'The invitation token is invalid, expired, or revoked'
      );
    }
  }

  await RoomModel.addMember({
    roomId,
    userId,
    role: 'member',
  });

  const members = await RoomModel.getRoomMembers(roomId);

  return {
    status: 'ok',
    roomId,
    members,
  };
}

module.exports = {
  createRoom,
  createRoomInvite,
  joinRoom,
};
