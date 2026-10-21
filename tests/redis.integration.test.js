import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTimeout, clearTimeout } from 'node:timers';
import { createClient } from 'redis';

describe('Redis Pub/Sub Integration (Issue #3)', () => {
  let publisher;
  let subscriberA;
  let subscriberB;

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const channel = 'chat:test:issue-3';
  const timeoutMs = 5000;

  beforeAll(async () => {
    const options = {
      socket: {
        host: redisHost,
        port: redisPort,
        connectTimeout: 5000,
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
        console.error(`[Redis integration] ${name}:`, error.message);
      });
    }

    await Promise.all([
      publisher.connect(),
      subscriberA.connect(),
      subscriberB.connect(),
    ]);
  }, 15000);

  afterAll(async () => {
    for (const subscriber of [subscriberA, subscriberB]) {
      if (subscriber?.isReady) {
        await subscriber.unsubscribe();
      }
    }

    await Promise.all(
      [publisher, subscriberA, subscriberB].map(async (client) => {
        if (client?.isOpen) {
          await client.quit();
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
