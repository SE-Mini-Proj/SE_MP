const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../config');
const MediaModel = require('../models/mediaModel');
const RoomModel = require('../models/roomModel');
const objectStorageService = require('./objectStorageService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FILE_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
]);

function createError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function toMediaDto(media) {
  return {
    id: media.id,
    roomId: media.room_id,
    uploaderId: media.uploader_id,
    uploaderName: media.uploader_name || null,
    fileName: media.file_name,
    contentType: media.content_type,
    size: Number(media.file_size),
    createdAt: media.created_at,
    downloadUrl: `/api/media/${media.id}/download`,
  };
}

function normalizeFileName(fileName) {
  if (typeof fileName !== 'string') return '';
  return path.posix.basename(fileName.replace(/[\\/\0]/g, '_'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255);
}

async function assertRoomMembership(roomId, userId) {
  if (!UUID_PATTERN.test(roomId || '')) {
    throw createError(400, 'VALIDATION_ERROR', 'A valid room ID is required');
  }

  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw createError(404, 'ROOM_NOT_FOUND', 'Room not found');
  }

  if (!await RoomModel.getMemberRole(roomId, userId)) {
    throw createError(403, 'FORBIDDEN', 'You are not a member of this room');
  }
}

function validateUpload({ fileName, contentType, body }) {
  const name = normalizeFileName(fileName);
  if (!name || !Buffer.isBuffer(body) || body.length === 0) {
    throw createError(400, 'INVALID_FILE', 'A non-empty file is required');
  }

  if (body.length > config.media.maxFileSizeBytes) {
    throw createError(413, 'FILE_TOO_LARGE', 'File exceeds the configured upload size limit');
  }

  const expectedType = ALLOWED_FILE_TYPES.get(path.extname(name).toLowerCase());
  if (!expectedType || contentType !== expectedType) {
    throw createError(
      415,
      'UNSUPPORTED_FILE_TYPE',
      'Only supported image and document file types can be uploaded'
    );
  }

  return name;
}

async function uploadToRoom({ roomId, userId, fileName, contentType, body }) {
  const normalizedFileName = validateUpload({ fileName, contentType, body });
  await assertRoomMembership(roomId, userId);

  const storageKey = `rooms/${roomId}/${crypto.randomUUID()}`;
  await objectStorageService.putObject({
    key: storageKey,
    body,
    contentType,
  });

  let media;
  try {
    media = await MediaModel.create({
      roomId,
      uploaderId: userId,
      storageKey,
      fileName: normalizedFileName,
      contentType,
      size: body.length,
    });
  } catch (error) {
    try {
      await objectStorageService.deleteObject({ key: storageKey });
    } catch (cleanupError) {
      console.error('[Media] Failed to remove unreferenced object:', cleanupError.message);
    }
    throw error;
  }

  return toMediaDto(media);
}

async function listRoomMedia({ roomId, userId }) {
  await assertRoomMembership(roomId, userId);
  const media = await MediaModel.listByRoomId(roomId);
  return media.map(toMediaDto);
}

async function getMediaForDownload({ mediaId, userId }) {
  if (!UUID_PATTERN.test(mediaId || '')) {
    throw createError(400, 'VALIDATION_ERROR', 'A valid media ID is required');
  }

  const media = await MediaModel.findById(mediaId);
  if (!media) {
    throw createError(404, 'MEDIA_NOT_FOUND', 'File not found');
  }

  await assertRoomMembership(media.room_id, userId);
  const object = await objectStorageService.getObject({ key: media.storage_key });

  return {
    stream: object,
    media: toMediaDto(media),
  };
}

module.exports = {
  uploadToRoom,
  listRoomMedia,
  getMediaForDownload,
  toMediaDto,
};
