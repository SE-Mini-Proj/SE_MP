const express = require('express');
const { authenticateJWT } = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.post('/devices', authenticateJWT, notificationController.registerDevice);
router.delete('/devices', authenticateJWT, notificationController.unregisterDevice);

module.exports = router;
