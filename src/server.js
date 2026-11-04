const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./services/loggerService');
const { initializeSocket } = require('./sockets');

const {
  connectRedis,
  closeRedis,
} = require('./cache/redisClient');

const {
  initializePubSub,
  closePubSub,
} = require('./cache/redisPubSub');

const server = http.createServer(app);
const { io, handleRedisEvent } = initializeSocket(server);

app.set('io', io);

if (process.env.NODE_ENV !== 'test') {
  async function startServer() {
    try {
      // Connect all Redis clients before accepting application traffic.
      await connectRedis();

      // Subscribe to Redis events for cross-instance communication.
      await initializePubSub(handleRedisEvent);

      server.listen(config.port, () => {
        logger.info('server.started', 'Real-Time Chat Server started', {
          port: config.port,
          environment: config.nodeEnv,
        });
        logger.info('server.websocket_ready', 'WebSocket Gateway initialized', {
          port: config.port,
        });
        logger.info('server.redis_connected', 'Redis clients connected successfully');
        logger.info('server.pubsub_initialized', 'Redis Pub/Sub initialized successfully');
      });
    } catch (error) {
      logger.error('server.initialization_failed', 'Server initialization failed', {
        errorName: error.name,
        errorMessage: error.message,
      });

      try {
        await closePubSub();
      } catch (cleanupError) {
        logger.error('server.cleanup_failed', 'Failed to close Redis Pub/Sub', {
          errorMessage: cleanupError.message,
        });
      }

      try {
        await closeRedis();
      } catch (cleanupError) {
        logger.error('server.cleanup_failed', 'Failed to close Redis clients', {
          errorMessage: cleanupError.message,
        });
      }

      process.exitCode = 1;
    }
  }

  startServer();
}

let isShuttingDown = false;

async function handleShutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info('server.shutdown_started', 'Server shutdown initiated', {
    signal,
  });

  try {
    await closePubSub();
  } catch (error) {
    logger.error('server.shutdown_failed', 'Failed to close Redis Pub/Sub', {
      errorMessage: error.message,
    });
  }

  try {
    await closeRedis();
  } catch (error) {
    logger.error('server.shutdown_failed', 'Failed to close Redis connections', {
      errorMessage: error.message,
    });
  }

  try {
    const { closePool } = require('./db');
    await closePool();
  } catch (error) {
    logger.error('server.shutdown_failed', 'Failed to close database pool', {
      errorMessage: error.message,
    });
  }

  if (io) {
    io.close();
  }

  if (!server.listening) {
    process.exit(0);
    return;
  }

  server.close(() => {
    logger.info('server.shutdown_complete', 'Server shut down gracefully');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = {
  server,
  app,
  io,
};
