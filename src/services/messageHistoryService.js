const { Buffer } = require('node:buffer');
const MessageModel = require('../models/messageModel');
const RoomModel = require('../models/roomModel');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function encodeCursor(message) {
  return Buffer.from(JSON.stringify({
    createdAt: message.createdAt,
    id: message.id,
  })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    if (typeof cursor !== 'string' || !cursor.length) {
      throw new Error('Invalid cursor');
    }

    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);

    if (
      !parsed ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      !UUID_PATTERN.test(parsed.id || '')
    ) {
      throw new Error('Invalid cursor');
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    throw createError(400, 'INVALID_CURSOR', 'Before must be a valid pagination cursor');
  }
}

async function getRoomMessageHistory({ roomId, userId, limit, before }) {
  if (!roomId || !userId) {
    throw createError(400, 'VALIDATION_ERROR', 'Room ID and user ID are required');
  }

  const room = await RoomModel.findById(roomId);

  if (!room) {
    throw createError(404, 'ROOM_NOT_FOUND', 'Room not found');
  }

  const role = await RoomModel.getMemberRole(roomId, userId);

  if (!role) {
    throw createError(403, 'FORBIDDEN', 'You are not a member of this room');
  }

  const pageLimit = limit === undefined ? DEFAULT_LIMIT : Number(limit);

  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > MAX_LIMIT) {
    throw createError(
      400,
      'INVALID_LIMIT',
      `Limit must be an integer between 1 and ${MAX_LIMIT}`
    );
  }

  const cursor = before === undefined ? null : decodeCursor(before);

  const messages = await MessageModel.findByRoomId({
    roomId,
    limit: pageLimit + 1,
    before: cursor,
  });

  const hasMore = messages.length > pageLimit;
  const pageMessages = hasMore ? messages.slice(1) : messages;

  return {
    messages: pageMessages,
    pagination: {
      limit: pageLimit,
      hasMore,
      nextCursor: hasMore && pageMessages.length
        ? encodeCursor(pageMessages[0])
        : null,
    },
  };
}

module.exports = {
  getRoomMessageHistory,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
