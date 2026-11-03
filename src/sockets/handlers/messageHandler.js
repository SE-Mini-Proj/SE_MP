const messagingService = require('../../services/messagingService');
const { isUserOnline } = require('../../cache/presenceService');
const { publishMessage } = require('../../cache/redisPubSub');
const { enqueueOfflineMessage } = require('../../services/offlineMessageService');
const { notifyUser } = require('../../services/pushNotificationService');

function registerMessageHandler(io, socket, stopTyping = () => {}) {
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

      // Persist to database & sanitize (CHAT-F-040, CHAT-SR-004)
      const message = await messagingService.processMessage({
        roomId,
        recipientId,
        text,
        senderId: socket.user?.id || socket.id,
        clientMsgId,
        delivered: false,
      });

      // Stop the typing indicator once the message has been processed.
      if (roomId) {
        stopTyping(roomId);
      }

      // Deliver message (Room broadcast or Direct Message)
      if (roomId) {
        io.to(roomId).emit('message:receive', message);
        await messagingService.markMessageDelivered(message.messageId);
        message.delivered = true;
      } else {
        const recipientOnline = await isUserOnline(recipientId);
        Promise.resolve(notifyUser(recipientId, message)).catch((notificationError) => {
          console.error(
            '[Notifications] Failed to send direct-message push:',
            notificationError.message
          );
        });

        if (!recipientOnline) {
          await enqueueOfflineMessage(recipientId, message);
          // AC-CHAT-F-040: Message persisted in database before offline queue acknowledgment
          if (typeof callback === 'function') {
            callback({ status: 'queued', message });
          }
          return;
        }

        io.to(`user:${recipientId}`).emit('message:receive', message);
        await messagingService.markMessageDelivered(message.messageId);
        message.delivered = true;
      }

      try {
        await publishMessage(message);
      } catch (redisError) {
        console.error(
          '[Messaging] Redis publish failed after local delivery:',
          redisError.message
        );
      }

      // AC-CHAT-F-040: Every delivered message has a persisted record before acknowledgment
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
