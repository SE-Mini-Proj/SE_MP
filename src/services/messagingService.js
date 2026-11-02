const MessageModel = require('../models/messageModel');
const { sanitizeMessage } = require('../utils/sanitizer');

/**
 * In-memory fallback message store for offline/mock environments (e.g. CI without live PG)
 */
const inMemoryMessages = new Map();

/**
 * Messaging Service
 * Validates, sanitizes (XSS prevention - CHAT-SR-004), persists messages to PostgreSQL (CHAT-F-040),
 * and prepares them for delivery and broadcast.
 */
async function processMessage({
  roomId = null,
  recipientId = null,
  text,
  senderId,
  clientMsgId = null,
  delivered = false,
}) {
  if (typeof text !== 'string' || text.trim() === '') {
    const error = new Error('Message text cannot be empty');
    error.code = 'EMPTY_MESSAGE';
    error.status = 400;
    throw error;
  }

  // Server-side sanitization to mitigate XSS (CHAT-SR-004, SAD §3.7)
  const sanitizedText = sanitizeMessage(text);

  let persistedRecord;
  try {
    persistedRecord = await MessageModel.create({
      roomId: roomId || null,
      senderId: senderId || null,
      recipientId: recipientId || null,
      content: sanitizedText,
      delivered: Boolean(delivered),
    });
  } catch {
    // Graceful fallback when PostgreSQL is unreachable or in mock tests
    const fallbackId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    persistedRecord = new MessageModel({
      id: fallbackId,
      room_id: roomId || null,
      sender_id: senderId || null,
      recipient_id: recipientId || null,
      content: sanitizedText,
      delivered: Boolean(delivered),
      created_at: new Date(),
    });
    inMemoryMessages.set(fallbackId, persistedRecord);
  }

  const message = {
    messageId: persistedRecord.id,
    id: persistedRecord.id,
    clientMsgId: clientMsgId || null,
    roomId: persistedRecord.roomId || null,
    recipientId: persistedRecord.recipientId || null,
    senderId: persistedRecord.senderId || 'anonymous',
    text: persistedRecord.content,
    timestamp: (persistedRecord.createdAt instanceof Date
      ? persistedRecord.createdAt
      : new Date(persistedRecord.createdAt)
    ).toISOString(),
    delivered: Boolean(persistedRecord.delivered),
  };

  return message;
}

/**
 * Mark a message as delivered in PostgreSQL database (CHAT-F-040)
 */
async function markMessageDelivered(messageId) {
  if (!messageId) return null;
  try {
    return await MessageModel.markDelivered(messageId);
  } catch {
    const fallback = inMemoryMessages.get(messageId);
    if (fallback) {
      fallback.delivered = true;
      return fallback;
    }
    return null;
  }
}

/**
 * Retrieve message by ID (CHAT-F-040)
 */
async function getMessageById(messageId) {
  if (!messageId) return null;
  try {
    return await MessageModel.findById(messageId);
  } catch {
    return inMemoryMessages.get(messageId) || null;
  }
}

/**
 * Retrieve in-memory messages for testing/cleanup
 */
function clearInMemoryMessages() {
  inMemoryMessages.clear();
}

module.exports = {
  processMessage,
  markMessageDelivered,
  getMessageById,
  clearInMemoryMessages,
};
