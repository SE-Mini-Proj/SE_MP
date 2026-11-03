const express = require('express');
const config = require('../config');
const mediaController = require('../controllers/mediaController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

const router = express.Router();
const parseRawUpload = express.raw({
  type: '*/*',
  limit: config.media.maxFileSizeBytes,
});

router.post('/rooms/:roomId', authenticateJWT, parseRawUpload, mediaController.uploadRoomMedia);
router.get('/rooms/:roomId', authenticateJWT, mediaController.listRoomMedia);
router.get('/:mediaId/download', authenticateJWT, mediaController.downloadMedia);

module.exports = router;
