const express = require('express');
const { createRoom, joinRoom } = require('../controllers/roomController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', authenticateJWT, createRoom);
router.post('/:roomId/join', authenticateJWT, joinRoom);

module.exports = router;
