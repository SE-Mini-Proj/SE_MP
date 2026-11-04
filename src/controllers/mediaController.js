const { pipeline } = require('node:stream');
const mediaService = require('../services/mediaService');
const { publishRoomEvent } = require('../cache/redisPubSub');
const logger = require('../services/loggerService');

function decodeFileName(headerValue) {
  if (!headerValue) return '';
  try {
    return decodeURIComponent(headerValue);
  } catch {
    const error = new Error('File name header is malformed');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

async function uploadRoomMedia(req, res, next) {
  try {
    const media = await mediaService.uploadToRoom({
      roomId: req.params.roomId,
      userId: req.user.id,
      fileName: decodeFileName(req.get('x-file-name')),
      contentType: req.get('content-type'),
      body: req.body,
    });

    const io = req.app.get('io');
    if (io) io.to(media.roomId).emit('media:shared', media);

    try {
      await publishRoomEvent({
        roomId: media.roomId,
        eventName: 'media:shared',
        payload: media,
      });
    } catch (error) {
      logger.error('media.room_event_publish_failed', 'Failed to publish room media event', {
        roomId: media.roomId,
        errorMessage: error.message,
      });
    }

    return res.status(201).json({ status: 'ok', media });
  } catch (error) {
    return next(error);
  }
}

async function listRoomMedia(req, res, next) {
  try {
    const media = await mediaService.listRoomMedia({
      roomId: req.params.roomId,
      userId: req.user.id,
    });

    return res.status(200).json({ status: 'ok', media });
  } catch (error) {
    return next(error);
  }
}

async function downloadMedia(req, res, next) {
  try {
    const { stream, media } = await mediaService.getMediaForDownload({
      mediaId: req.params.mediaId,
      userId: req.user.id,
    });

    res.attachment(media.fileName);
    res.set({
      'Content-Type': media.contentType,
      'Content-Length': String(media.size),
      'X-Content-Type-Options': 'nosniff',
    });

    pipeline(stream, res, (error) => {
      if (!error) return;
      if (res.headersSent) {
        logger.error('media.download_stream_failed', 'Media download stream failed', {
          mediaId: req.params.mediaId,
          errorMessage: error.message,
        });
        return;
      }
      return next(error);
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadRoomMedia,
  listRoomMedia,
  downloadMedia,
};
