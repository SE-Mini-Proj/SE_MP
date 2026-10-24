const http = require('http');
const app = require('./app');
const config = require('./config');
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
      if (config.redis && config.redis.enabled !== false) {
        // Connect all Redis clients before accepting application traffic.
        await connectRedis();

        // Subscribe to Redis events for cross-instance communication.
        await initializePubSub(handleRedisEvent);

        console.log('[Server] Redis clients connected successfully');
        console.log('[Server] Redis Pub/Sub initialized successfully');
      } else {
        console.log('[Server] Redis disabled; running in standalone mode');
      }
    } catch (error) {
      console.warn(
        `[Server Warning] Redis initialization failed: ${error.message}. Running in standalone mode.`
      );
      try {
        await closePubSub();
        await closeRedis();
      } catch {
        // Ignore cleanup error on failed init
      }
    }

    server.listen(config.port, () => {
      console.log(
        `[Server] Real-Time Chat Server running on http://localhost:${config.port}`
      );
      console.log(`[Server] Environment: ${config.nodeEnv}`);
      console.log(
        `[Server] WebSocket Gateway initialized on port ${config.port}`
      );
    });
  }

  startServer();
}

let isShuttingDown = false;

async function handleShutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `\n[Server] Received ${signal}. Closing HTTP, WebSocket, Redis, and Database connections...`
  );

  try {
    await closePubSub();
  } catch (error) {
    console.error(
      '[Server Error] Error closing Redis Pub/Sub:',
      error.message
    );
  }

  try {
    await closeRedis();
  } catch (error) {
    console.error(
      '[Server Error] Error closing Redis connections:',
      error.message
    );
  }

  try {
    const { closePool } = require('./db');
    await closePool();
  } catch (error) {
    console.error(
      '[Server Error] Error closing database pool:',
      error.message
    );
  }

  if (io) {
    io.close();
  }

  if (!server.listening) {
    process.exit(0);
    return;
  }

  server.close(() => {
    console.log('[Server] Server shut down gracefully.');
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
