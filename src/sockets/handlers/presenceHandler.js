const {
  registerSession,
  removeSession,
} = require('../../cache/presenceService');

const {
  INSTANCE_ID,
  publishPresenceEvent,
  publishRoomEvent,
} = require('../../cache/redisPubSub');

function registerPresenceHandler(io, socket) {
  const userId = socket.user?.id || socket.id;

  registerSession({
    userId,
    socketId: socket.id,
    instanceId: INSTANCE_ID,
  })
    .then(async (session) => {
      if (session.isFirstSession) {
        await publishPresenceEvent({
          eventName: 'user:online',
          payload: {
            userId,
            timestamp: session.connectedAt,
          },
        });
      }
    })
    .catch((error) => {
      console.error('[Presence] Failed to register session:', error.message);
    });

  socket.on('room:join', async ({ roomId } = {}, callback) => {
    if (!roomId) {
      if (typeof callback === 'function') {
        callback({
          error: {
            code: 'BAD_REQUEST',
            message: 'roomId is required',
          },
        });
      }
      return;
    }

    socket.join(roomId);

    const payload = {
      userId,
      roomId,
      timestamp: new Date().toISOString(),
    };

    socket.to(roomId).emit('user:joined', payload);

    try {
      await publishRoomEvent({
        roomId,
        eventName: 'user:joined',
        payload,
      });
    } catch (error) {
      console.error('[Presence] Failed to publish room join:', error.message);
    }

    if (typeof callback === 'function') {
      callback({ status: 'ok', roomId });
    }
  });

  socket.on('room:leave', async ({ roomId } = {}, callback) => {
    if (!roomId) {
      if (typeof callback === 'function') {
        callback({
          error: {
            code: 'BAD_REQUEST',
            message: 'roomId is required',
          },
        });
      }
      return;
    }

    socket.leave(roomId);

    const payload = {
      userId,
      roomId,
      timestamp: new Date().toISOString(),
    };

    socket.to(roomId).emit('user:left', payload);

    try {
      await publishRoomEvent({
        roomId,
        eventName: 'user:left',
        payload,
      });
    } catch (error) {
      console.error('[Presence] Failed to publish room leave:', error.message);
    }

    if (typeof callback === 'function') {
      callback({ status: 'ok', roomId });
    }
  });

  socket.on('typing:start', ({ roomId } = {}) => {
    const payload = {
      userId,
      isTyping: true,
      roomId,
    };

    const target = roomId ? socket.to(roomId) : socket.broadcast;
    target.emit('typing:update', payload);

    if (roomId) {
      publishRoomEvent({
        roomId,
        eventName: 'typing:update',
        payload,
      }).catch((error) => {
        console.error('[Presence] Failed to publish typing event:', error.message);
      });
    }
  });

  socket.on('typing:stop', ({ roomId } = {}) => {
    const payload = {
      userId,
      isTyping: false,
      roomId,
    };

    const target = roomId ? socket.to(roomId) : socket.broadcast;
    target.emit('typing:update', payload);

    if (roomId) {
      publishRoomEvent({
        roomId,
        eventName: 'typing:update',
        payload,
      }).catch((error) => {
        console.error('[Presence] Failed to publish typing event:', error.message);
      });
    }
  });

  socket.on('disconnect', async (reason) => {
    try {
      const result = await removeSession({
        userId,
        socketId: socket.id,
      });

      if (!result.userOnline) {
        await publishPresenceEvent({
          eventName: 'user:offline',
          payload: {
            userId,
            reason,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error('[Presence] Failed to clean up session:', error.message);
    }
  });
}

module.exports = registerPresenceHandler;
