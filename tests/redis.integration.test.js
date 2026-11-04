const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { setTimeout, clearTimeout } = require('node:timers');
const { createClient } = require('redis');

describe('Redis Pub/Sub Integration (Issue #3)', () => {
  let publisher;
  let subscriberA;
  let subscriberB;
  let redisAvailable = false;

  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const channel = 'chat:test:issue-3';
  const timeoutMs = 5000;

  beforeAll(async () => {
    const options = {
      socket: {
        host: redisHost,
        port: redisPort,
        connectTimeout: 4000,
        reconnectStrategy: false,
      },
    };

    publisher = createClient(options);
    subscriberA = createClient(options);
    subscriberB = createClient(options);

    for (const [name, client] of [
      ['publisher', publisher],
      ['subscriber A', subscriberA],
      ['subscriber B', subscriberB],
    ]) {
      client.on('error', (error) => {
        console.warn(`[Redis integration] ${name}:`, error.message);
      });
    }

    try {
      await Promise.all([
        publisher.connect(),
        subscriberA.connect(),
        subscriberB.connect(),
      ]);
      redisAvailable = true;
    } catch (err) {
      console.warn(`[Redis integration] Could not connect to Redis at ${redisHost}:${redisPort} (${err.message}). Test will skip.`);
      redisAvailable = false;
    }
  }, 10000);

  afterAll(async () => {
    if (!redisAvailable) return;

    for (const subscriber of [subscriberA, subscriberB]) {
      if (subscriber?.isReady) {
        await subscriber.unsubscribe().catch(() => {});
      }
    }

    await Promise.all(
      [publisher, subscriberA, subscriberB].map(async (client) => {
        if (client?.isOpen) {
          await client.quit().catch(() => {});
        }
      })
    );
  });

  function receiveOne(subscriber, targetChannel) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting on ${targetChannel}`));
      }, timeoutMs);

      subscriber.subscribe(targetChannel, (message) => {
        clearTimeout(timer);

        try {
          resolve(JSON.parse(message));
        } catch (error) {
          reject(error);
        }
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  it('delivers a published event to a separate subscriber', async () => {
    if (!redisAvailable) {
      console.warn('Skipping test: Redis instance is not reachable in this environment.');
      return;
    }

    const event = {
      eventName: 'test:cross-instance',
      payload: {
        message: 'Redis Pub/Sub integration works',
      },
      originInstanceId: 'test-instance-A',
    };

    const received = receiveOne(subscriberB, channel);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await publisher.publish(channel, JSON.stringify(event));

    const result = await received;

    expect(result.eventName).toBe('test:cross-instance');
    expect(result.payload.message).toBe(
      'Redis Pub/Sub integration works'
    );
    expect(result.originInstanceId).toBe('test-instance-A');
  }, 10000);

  it('delivers a room event to multiple subscribers', async () => {
    if (!redisAvailable) {
      console.warn('Skipping test: Redis instance is not reachable in this environment.');
      return;
    }

    const testChannel = `${channel}:room`;

    const receivedA = receiveOne(subscriberA, testChannel);
    const receivedB = receiveOne(subscriberB, testChannel);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const roomEvent = {
      roomId: 'room-integration-test',
      eventName: 'user:joined',
      payload: {
        userId: 'user-integration-test',
      },
    };

    await publisher.publish(testChannel, JSON.stringify(roomEvent));

    const [resultA, resultB] = await Promise.all([
      receivedA,
      receivedB,
    ]);

    expect(resultA.roomId).toBe('room-integration-test');
    expect(resultB.roomId).toBe('room-integration-test');
    expect(resultA.eventName).toBe('user:joined');
    expect(resultB.payload.userId).toBe('user-integration-test');
  }, 10000);
});
