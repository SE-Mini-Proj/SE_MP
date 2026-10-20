const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const roomRoutes = require('./roomRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/rooms', roomRoutes);

module.exports = router;
