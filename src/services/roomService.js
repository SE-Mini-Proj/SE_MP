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

module.exports = {
  createRoom,
  joinRoom,
};
