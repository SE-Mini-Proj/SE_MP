
const { randomUUID } = require('crypto');
const {
  getPublisherClient,
  getSubscriberClient,
} = require('./redisClient');

const INSTANCE_ID = randomUUID();

const CHANNELS = {
  MESSAGES: 'chat:messages',
  ROOM_EVENTS: 'chat:room-events',
  PRESENCE: 'chat:presence',
};

let initialized = false;
let eventHandler = null;

async function publishEvent(channel, event) {
  const publisher = getPublisherClient();

  if (!publisher.isReady) {
    throw new Error('Redis publisher is not ready');
  }

  const envelope = {
    ...event,
    originInstanceId: INSTANCE_ID,
  };

  await publisher.publish(channel, JSON.stringify(envelope));
}

async function publishMessage(message) {
  await publishEvent(CHANNELS.MESSAGES, message);
}

async function publishRoomEvent(event) {
  await publishEvent(CHANNELS.ROOM_EVENTS, event);
}

async function publishPresenceEvent(event) {
  await publishEvent(CHANNELS.PRESENCE, event);
}

async function initializePubSub(handler) {
  if (initialized) {
    return;
  }

  if (typeof handler !== 'function') {
    throw new TypeError('A Pub/Sub event handler function is required');
  }

  const subscriber = getSubscriberClient();

  if (!subscriber.isReady) {
    throw new Error('Redis subscriber is not ready');
  }

  eventHandler = handler;

  for (const channel of Object.values(CHANNELS)) {
    await subscriber.subscribe(channel, (message) => {
      let event;

      try {
        event = JSON.parse(message);
      } catch (error) {
        console.error(
          `[Redis Pub/Sub] Invalid JSON received on ${channel}:`,
          error.message
        );
        return;
      }

      if (event.originInstanceId === INSTANCE_ID) {
        return;
      }

      if (eventHandler) {
        Promise.resolve(eventHandler(channel, event)).catch((error) => {
          console.error(
            `[Redis Pub/Sub] Event handler failed for ${channel}:`,
            error.message
          );
        });
      }
    });
  }

  initialized = true;
  console.log('[Redis Pub/Sub] Subscribed to all application channels');
}

async function closePubSub() {
  initialized = false;
  eventHandler = null;

  const subscriber = getSubscriberClient();

  if (subscriber.isReady) {
    for (const channel of Object.values(CHANNELS)) {
      await subscriber.unsubscribe(channel);
    }
  }
}

module.exports = {
  INSTANCE_ID,
  CHANNELS,
  publishMessage,
  publishRoomEvent,
  publishPresenceEvent,
  initializePubSub,
  closePubSub,
};