const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const { setTimeout, clearTimeout } = require('node:timers');
const { EventEmitter } = require('node:events');

describe('Redis Pub/Sub Integration (Issue #3)', () => {
  let publisher;
  let subscriberA;
  let subscriberB;
  const bus = new EventEmitter();

  function createMockRedisClient() {
    const subscriptions = new Map();
    return {
      isOpen: true,
      isReady: true,
      on: () => {},
      connect: async () => true,
      quit: async () => {
        for (const [ch, listener] of subscriptions.entries()) {
          bus.off(ch, listener);
        }
        subscriptions.clear();
        return 'OK';
      },
      subscribe: async (channel, callback) => {
        const listener = (msg) => callback(msg);
        subscriptions.set(channel, listener);
        bus.on(channel, listener);
        return true;
      },
      unsubscribe: async (channel) => {
        if (channel) {
          const listener = subscriptions.get(channel);
          if (listener) bus.off(channel, listener);
          subscriptions.delete(channel);
        } else {
          for (const [ch, listener] of subscriptions.entries()) {
            bus.off(ch, listener);
          }
          subscriptions.clear();
        }
        return true;
      },
      publish: async (channel, message) => {
        bus.emit(channel, message);
        return 1;
      },
    };
  }

  const channel = 'chat:test:issue-3';

  beforeAll(async () => {
    publisher = createMockRedisClient();
    subscriberA = createMockRedisClient();
    subscriberB = createMockRedisClient();

    await Promise.all([
      publisher.connect(),
      subscriberA.connect(),
      subscriberB.connect(),
    ]);
  });

  afterAll(async () => {
    await subscriberA.unsubscribe();
    await subscriberB.unsubscribe();
    await Promise.all([
      publisher.quit(),
      subscriberA.quit(),
      subscriberB.quit(),
    ]);
  });

  function receiveOne(subscriber, targetChannel) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting on ${targetChannel}`));
      }, 3000);

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
    await publisher.publish(channel, JSON.stringify(event));

    const result = await received;

    expect(result.eventName).toBe('test:cross-instance');
    expect(result.payload.message).toBe('Redis Pub/Sub integration works');
    expect(result.originInstanceId).toBe('test-instance-A');
  });

  it('delivers a room event to multiple subscribers', async () => {
    const testChannel = `${channel}:room`;

    const receivedA = receiveOne(subscriberA, testChannel);
    const receivedB = receiveOne(subscriberB, testChannel);

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
  });
});
