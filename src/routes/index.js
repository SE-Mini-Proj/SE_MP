const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const mediaRoutes = require('./mediaRoutes');
const notificationRoutes = require('./notificationRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/media', mediaRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
