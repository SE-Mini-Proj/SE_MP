
const messagingService = require('../../services/messagingService');
const { isUserOnline } = require('../../cache/presenceService');
const { publishMessage } = require('../../cache/redisPubSub');
const { enqueueOfflineMessage } = require('../../services/offlineMessageService');

function registerMessageHandler(io, socket,stopTyping = () => {}) {
  socket.on('message:send', async (payload, callback) => {
    try {
      const { roomId, recipientId, text, clientMsgId } = payload || {};

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

      if (roomId && recipientId) {
        const errorPayload = {
          code: 'BAD_REQUEST',
          message: 'A message must target either a room or one recipient',
        };
        socket.emit('message:error', errorPayload);
        if (typeof callback === 'function') callback({ error: errorPayload });
        return;
      }

      if (!roomId && (typeof recipientId !== 'string' || !recipientId.trim())) {
        const errorPayload = {
          code: 'BAD_REQUEST',
          message: 'recipientId is required for a direct message',
        };
        socket.emit('message:error', errorPayload);
        if (typeof callback === 'function') callback({ error: errorPayload });
        return;
      }

      const message = await messagingService.processMessage({
        roomId,
        recipientId,
        text,
        senderId: socket.user?.id || socket.id,
        clientMsgId,
      });
      // Stop the typing indicator once the message has been processed.
         if (roomId) {
         stopTyping(roomId);
      }
      if (roomId) {
        io.to(roomId).emit('message:receive', message);
      } else {
        const recipientOnline = await isUserOnline(recipientId);
        if (!recipientOnline) {
          await enqueueOfflineMessage(recipientId, message);
          if (typeof callback === 'function') {
            callback({ status: 'queued', message });
          }
          return;
        }

        io.to(`user:${recipientId}`).emit('message:receive', message);
      }

      try {
        await publishMessage(message);
      } catch (redisError) {
        console.error(
          '[Messaging] Redis publish failed after local delivery:',
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
