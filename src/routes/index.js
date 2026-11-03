const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');
const mediaRoutes = require('./mediaRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);
router.use('/media', mediaRoutes);

module.exports = router;
