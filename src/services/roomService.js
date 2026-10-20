/**
 * Room Service Skeleton
 * Implements room creation, membership, and join operations.
 */
async function createRoom({ name, isPrivate = false, ownerId }) {
  return {
    status: 'ok',
    room: {
      id: 'room_' + Date.now(),
      name,
      isPrivate,
      ownerId: ownerId || 'mock_owner',
      members: [ownerId || 'mock_owner'],
      createdAt: new Date().toISOString(),
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
