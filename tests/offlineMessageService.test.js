const { describe, it, expect } = require('@jest/globals');

jest.mock('../src/cache/redisClient', () => {
  const queues = new Map();
  const redis = {
    isReady: true,
    rPush: jest.fn(async (key, value) => {
      const queue = queues.get(key) || [];
      queue.push(value);
      queues.set(key, queue);
      return queue.length;
    }),
    multi: jest.fn(() => {
      let queueKey;
      return {
        lRange(key) {
          queueKey = key;
          return this;
        },
        del(key) {
          queueKey = key;
          return this;
        },
        async exec() {
          const messages = queues.get(queueKey) || [];
          queues.delete(queueKey);
          return [messages, messages.length ? 1 : 0];
        },
      };
    }),
  };

  return { getRedisClient: () => redis };
});

const {
  enqueueOfflineMessage,
  drainOfflineMessages,
} = require('../src/services/offlineMessageService');

describe('Offline message queue', () => {
  it('drains queued messages in FIFO order and clears the recipient queue', async () => {
    const first = { messageId: 'msg-1', text: 'First' };
    const second = { messageId: 'msg-2', text: 'Second' };

    await enqueueOfflineMessage('user-1', first);
    await enqueueOfflineMessage('user-1', second);

    await expect(drainOfflineMessages('user-1')).resolves.toEqual([first, second]);
    await expect(drainOfflineMessages('user-1')).resolves.toEqual([]);
  });
});
