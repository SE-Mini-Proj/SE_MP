const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes');
const { requestLogger } = require('./middlewares/loggerMiddleware');
const { enforceTls } = require('./middlewares/tlsMiddleware');
const { xssSanitizerMiddleware } = require('./middlewares/xssMiddleware');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// TLS Enforcement (Issue #6, CHAT-SR-001)
app.use(enforceTls);

// Standard middlewares
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(xssSanitizerMiddleware);
app.use(requestLogger);

// Static assets for browser test UI
app.use(express.static(path.join(process.cwd(), 'public')));

// Root landing route
app.get('/', (req, res) => {
  res.json({
    name: 'Real-Time Chat Application API',
    version: '1.0.0',
    documentation: '/api/health',
    status: 'running',
  });
});

// Mount API routes
app.use('/api', apiRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
