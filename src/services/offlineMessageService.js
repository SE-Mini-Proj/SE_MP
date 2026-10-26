const { getRedisClient } = require('../cache/redisClient');

const QUEUE_PREFIX = 'chat:offline-messages:';

function getReadyRedisClient() {
  const redis = getRedisClient();
  if (!redis.isReady) {
    throw new Error('Redis is not ready');
  }
  return redis;
}

async function enqueueOfflineMessage(recipientId, message) {
  if (typeof recipientId !== 'string' || !recipientId) {
    throw new TypeError('recipientId is required to queue a message');
  }

  const redis = getReadyRedisClient();
  await redis.rPush(
    `${QUEUE_PREFIX}${recipientId}`,
    JSON.stringify(message)
  );
}

async function drainOfflineMessages(recipientId) {
  if (typeof recipientId !== 'string' || !recipientId) {
    throw new TypeError('recipientId is required to drain messages');
  }

  const redis = getReadyRedisClient();
  const queueKey = `${QUEUE_PREFIX}${recipientId}`;
  const [serializedMessages] = await redis
    .multi()
    .lRange(queueKey, 0, -1)
    .del(queueKey)
    .exec();
  const messages = [];

  for (const serializedMessage of serializedMessages) {
    try {
      messages.push(JSON.parse(serializedMessage));
    } catch (error) {
      console.error(
        `[Messaging] Invalid queued message for recipient ${recipientId}:`,
        error.message
      );
      throw error;
    }
  }

  return messages;
}

module.exports = {
  enqueueOfflineMessage,
  drainOfflineMessages,
};
