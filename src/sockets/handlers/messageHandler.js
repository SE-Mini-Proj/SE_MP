
const messagingService = require('../../services/messagingService');
const { publishMessage } = require('../../cache/redisPubSub');

function registerMessageHandler(io, socket) {
  socket.on('message:send', async (payload, callback) => {
    try {
      const { roomId, text, clientMsgId } = payload || {};

      if (typeof text !== 'string' || text.trim() === '') {
        const errorPayload = {
          code: 'BAD_REQUEST',
          message: 'Message text must be a non-empty string',
        };

        socket.emit('message:error', errorPayload);

        if (typeof callback === 'function') {
          callback({ error: errorPayload });
        }

        return;
      }

      const message = await messagingService.processMessage({
        roomId,
        text,
        senderId: socket.user?.id || socket.id,
        clientMsgId,
      });

      // Broadcast locally so messaging still works without Redis.
      if (roomId) {
        io.to(roomId).emit('message:receive', message);
      } else {
        io.emit('message:receive', message);
      }

      // Redis distributes the message to other application instances.
      // A Redis failure must not prevent local message delivery.
      try {
        await publishMessage(message);
      } catch (redisError) {
        console.error(
          '[Messaging] Redis publish failed; message was delivered locally:',
          redisError.message
        );
      }

      if (typeof callback === 'function') {
        callback({ status: 'ok', message });
      }
    } catch (err) {
      const errorPayload = {
        code: err.code || 'MESSAGE_PROCESSING_ERROR',
        message: err.message || 'Failed to process message',
      };

      socket.emit('message:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ error: errorPayload });
      }
    }
  });
}

module.exports = registerMessageHandler;