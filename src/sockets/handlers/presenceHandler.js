/* global setTimeout, clearTimeout */
const {
  registerSession,
  removeSession,
} = require('../../cache/presenceService');

const {
  INSTANCE_ID,
  publishPresenceEvent,
  publishRoomEvent,
  publishMessage,
} = require('../../cache/redisPubSub');

const {
  drainOfflineMessages,
} = require('../../services/offlineMessageService');

const TYPING_TIMEOUT_MS = 3000;

function registerPresenceHandler(io, socket) {
  const userId = socket.user?.id || socket.id;
  const typingTimers = new Map();

  function publishTypingEvent(roomId, isTyping) {
    const payload = {
      userId,
      isTyping,
      roomId,
    };

    socket.to(roomId).emit('typing:update', payload);

    Promise.resolve(
      publishRoomEvent({
        roomId,
        eventName: 'typing:update',
        payload,
      })
    ).catch((error) => {
      console.error(
        '[Presence] Failed to publish typing event:',
        error.message
      );
    });
  }

  function stopTyping(roomId) {
    if (!roomId) {
      return;
    }

    const timer = typingTimers.get(roomId);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    typingTimers.delete(roomId);

    publishTypingEvent(roomId, false);
  }

  registerSession({
    userId,
    socketId: socket.id,
    instanceId: INSTANCE_ID,
  })
    .then(async (session) => {
      try {
        const queuedMessages = await drainOfflineMessages(userId);

        for (const message of queuedMessages) {
          io.to(`user:${userId}`).emit('message:receive', message);

          try {
            await publishMessage(message);
          } catch (error) {
            console.error(
              '[Messaging] Queued message was delivered locally but Redis publish failed:',
              error.message
            );
          }
        }
      } catch (error) {
        console.error(
          `[Messaging] Failed to drain offline messages for ${userId}:`,
          error.message
        );
      }

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
      console.error(
        '[Presence] Failed to register session:',
        error.message
      );
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
      console.error(
        '[Presence] Failed to publish room join:',
        error.message
      );
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

    // Notify other room members before leaving.
    stopTyping(roomId);

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
      console.error(
        '[Presence] Failed to publish room leave:',
        error.message
      );
    }

    if (typeof callback === 'function') {
      callback({ status: 'ok', roomId });
    }
  });

  socket.on('typing:start', ({ roomId } = {}) => {
    // Typing updates are allowed only in a room this socket has joined.
    if (!roomId || !socket.rooms.has(roomId)) {
      return;
    }

    const previousTimer = typingTimers.get(roomId);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    publishTypingEvent(roomId, true);

    const timer = setTimeout(() => {
      stopTyping(roomId);
    }, TYPING_TIMEOUT_MS);

    typingTimers.set(roomId, timer);
  });

  socket.on('typing:stop', ({ roomId } = {}) => {
    stopTyping(roomId);
  });

  socket.on('disconnecting', () => {
    for (const roomId of [...typingTimers.keys()]) {
      stopTyping(roomId);
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
      console.error(
        '[Presence] Failed to clean up session:',
        error.message
      );
    }
  });

  return stopTyping;
}

module.exports = registerPresenceHandler;
