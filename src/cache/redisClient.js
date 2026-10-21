const { createClient } = require('redis');
const config = require('../config');

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
          console.error(
            `[Redis] ${clientName}: Maximum reconnection attempts reached`
          );

          return new Error('Maximum Redis reconnection attempts reached');
        }

        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * (2 ** (retries - 1)),
          MAX_RETRY_DELAY_MS
        );

        console.warn(
          `[Redis] ${clientName}: Reconnecting in ${delay}ms (attempt ${retries})`
        );

        return delay;
      },
    },
  });

  client.on('error', (error) => {
    console.error(`[Redis] ${clientName} error:`, error.message);
  });

  client.on('connect', () => {
    console.log(`[Redis] ${clientName} connecting`);
  });

  client.on('ready', () => {
    console.log(`[Redis] ${clientName} ready`);
  });

  client.on('reconnecting', () => {
    console.warn(`[Redis] ${clientName} reconnecting`);
  });

  client.on('end', () => {
    console.log(`[Redis] ${clientName} connection closed`);
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