const { createClient } = require('redis');
const config = require('../config');
const logger = require('../services/loggerService');

let redisClient = null;
let publisherClient = null;
let subscriberClient = null;

const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;

function createRedisClient(clientName) {
  const client = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: 5000,

      reconnectStrategy(retries) {
        if (retries > MAX_RETRIES) {
          logger.error('redis.reconnection_failed', 'Maximum reconnection attempts reached', {
            clientName,
            retries,
          });

          return new Error('Maximum Redis reconnection attempts reached');
        }

        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * (2 ** (retries - 1)),
          MAX_RETRY_DELAY_MS
        );

        logger.warn('redis.reconnecting', 'Redis reconnection scheduled', {
          clientName,
          delayMs: delay,
          attempt: retries,
        });

        return delay;
      },
    },
  });

  client.on('error', (error) => {
    logger.error('redis.error', 'Redis client error', {
      clientName,
      errorName: error.name,
      errorMessage: error.message,
    });
  });

  client.on('connect', () => {
    logger.info('redis.connecting', 'Redis client connecting', { clientName });
  });

  client.on('ready', () => {
    logger.info('redis.ready', 'Redis client ready', { clientName });
  });

  client.on('reconnecting', () => {
    logger.warn('redis.reconnecting', 'Redis client reconnecting', { clientName });
  });

  client.on('end', () => {
    logger.info('redis.disconnected', 'Redis client connection closed', { clientName });
  });

  return client;
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient('general');
  }

  return redisClient;
}

function getPublisherClient() {
  if (!publisherClient) {
    publisherClient = createRedisClient('publisher');
  }

  return publisherClient;
}

function getSubscriberClient() {
  if (!subscriberClient) {
    subscriberClient = createRedisClient('subscriber');
  }

  return subscriberClient;
}

async function connectRedis() {
  const clients = [
    getRedisClient(),
    getPublisherClient(),
    getSubscriberClient(),
  ];

  await Promise.all(
    clients.map(async (client) => {
      if (!client.isOpen) {
        await client.connect();
      }
    })
  );
}

async function checkRedisConnection() {
  try {
    const client = getRedisClient();

    if (!client.isReady) {
      return {
        connected: false,
        status: 'not_ready',
      };
    }

    const start = Date.now();
    const response = await client.ping();

    return {
      connected: response === 'PONG',
      status: response === 'PONG' ? 'ready' : 'unhealthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      connected: false,
      status: 'unhealthy',
      error: error.message,
    };
  }
}

async function closeRedis() {
  const clients = [
    redisClient,
    publisherClient,
    subscriberClient,
  ];

  await Promise.all(
    clients.filter(Boolean).map(async (client) => {
      if (client.isOpen) {
        await client.quit();
      }
    })
  );

  redisClient = null;
  publisherClient = null;
  subscriberClient = null;
}

module.exports = {
  getRedisClient,
  getPublisherClient,
  getSubscriberClient,
  connectRedis,
  checkRedisConnection,
  closeRedis,
};