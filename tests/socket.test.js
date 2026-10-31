const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const { setTimeout, clearTimeout } = require('node:timers');
const { performance } = require('node:perf_hooks');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initializeSocket } = require('../src/sockets');
const { generateToken } = require('../src/services/authService');
const messagingService = require('../src/services/messagingService');

jest.mock('../src/cache/redisPubSub', () => ({
  INSTANCE_ID: 'test-instance',
  CHANNELS: {
    MESSAGES: 'chat:messages',
    ROOM_EVENTS: 'chat:room-events',
    PRESENCE: 'chat:presence',
  },
  publishMessage: jest.fn().mockResolvedValue(undefined),
  publishRoomEvent: jest.fn().mockResolvedValue(undefined),
  publishPresenceEvent: jest.fn().mockResolvedValue(undefined),
  initializePubSub: jest.fn().mockResolvedValue(undefined),
  closePubSub: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/cache/presenceService', () => ({
  registerSession: jest.fn().mockResolvedValue({
    userId: 'user_tester_1',
    socketId: 'test-socket',
    instanceId: 'test-instance',
    connectedAt: new Date().toISOString(),
    isFirstSession: true,
  }),
  removeSession: jest.fn().mockResolvedValue({
    removed: true,
    userOnline: false,
    results: [],
  }),
  getUserSessions: jest.fn().mockResolvedValue([]),
  isUserOnline: jest.fn().mockResolvedValue(true),
  getOnlineUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/offlineMessageService', () => {
  const queues = new Map();
  return {
    enqueueOfflineMessage: jest.fn(async (recipientId, message) => {
      const queue = queues.get(recipientId) || [];
      queue.push(message);
      queues.set(recipientId, queue);
    }),
    drainOfflineMessages: jest.fn(async (recipientId) => {
      const queue = queues.get(recipientId) || [];
      queues.delete(recipientId);
      return queue;
    }),
  };
});

const { isUserOnline } = require('../src/cache/presenceService');

describe('WebSocket Gateway - Socket.IO Integration', () => {
  let server;
  let socketServer;
  let serverPort;
  let clientSocket;

  beforeAll(async () => {
    server = http.createServer(app);
    socketServer = initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }

    if (socketServer && socketServer.io) {
      await new Promise((resolve) => socketServer.io.close(resolve));
    } else if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('should connect with a valid JWT and receive connection-ack', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: generateToken({
            id: 'user_tester_1',
            email: 'tester@example.com',
            username: 'tester',
          }).token,
        },
        transports: ['websocket'],
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for connection-ack'));
      }, 10000);

      clientSocket.once('connection-ack', (ack) => {
        clearTimeout(timeout);

        try {
          expect(ack.status).toBe('connected');
          expect(ack.user.id).toBe('user_tester_1');
          expect(ack.user.authenticated).toBe(true);
          expect(ack).toHaveProperty('timestamp');
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      clientSocket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }, 15000);


  it('should reject a connection without a JWT', async () => {
    const unauthenticatedClient = ioClient(
      `http://127.0.0.1:${serverPort}`,
      {
        transports: ['websocket'],
        reconnection: false,
      }
    );

    try {
      const error = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for authentication rejection')),
          5000
        );

        unauthenticatedClient.once('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Unauthenticated client unexpectedly connected'));
        });

        unauthenticatedClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          resolve(err);
        });
      });

      expect(error.message).toMatch(/Authentication required/);
    } finally {
      unauthenticatedClient.disconnect();
    }
  }, 10000);

  it('should reject an invalid JWT', async () => {
    const unauthenticatedClient = ioClient(
      `http://127.0.0.1:${serverPort}`,
      {
        auth: { token: 'not-a-valid-jwt' },
        transports: ['websocket'],
        reconnection: false,
      }
    );

    try {
      const error = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for authentication rejection')),
          5000
        );

        unauthenticatedClient.once('connect', () => {
          clearTimeout(timeout);
          reject(new Error('Client with invalid JWT unexpectedly connected'));
        });

        unauthenticatedClient.once('connect_error', (err) => {
          clearTimeout(timeout);
          resolve(err);
        });
      });

      expect(error.message).toMatch(/Invalid or expired authentication token/);
    } finally {
      unauthenticatedClient.disconnect();
    }
  }, 10000);

  it('should reject socket events after the JWT expires', async () => {
    const expiringClient = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: {
        token: generateToken({
          id: 'user_expiring',
          email: 'expiring@example.com',
          username: 'expiring',
        }, 1).token,
      },
      transports: ['websocket'],
      reconnection: false,
    });

    try {
      await new Promise((resolve, reject) => {
        expiringClient.once('connect', resolve);
        expiringClient.once('connect_error', reject);
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const authError = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the authentication error')),
          5000
        );
        expiringClient.once('auth:error', (error) => {
          clearTimeout(timeout);
          resolve(error);
        });
      });
      expiringClient.emit('message:send', { text: 'must not be processed' });

      await expect(authError).resolves.toMatchObject({ code: 'INVALID_TOKEN' });
    } finally {
      expiringClient.disconnect();
    }
  }, 10000);

  it('delivers a direct message to the online recipient within one second', async () => {
    const testPayload = {
      text: 'Hello, Antigravity Chat!',
      clientMsgId: 'client_msg_12345',
      recipientId: 'user_recipient',
    };
    const recipientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: {
        token: generateToken({
          id: testPayload.recipientId,
          email: 'recipient@example.com',
          username: 'recipient',
        }).token,
      },
      transports: ['websocket'],
    });
    const senderReceivedMessage = jest.fn();
    clientSocket.on('message:receive', senderReceivedMessage);

    try {
      await new Promise((resolve, reject) => {
        recipientSocket.once('connection:ack', resolve);
        recipientSocket.once('connect_error', reject);
      });

      const delivery = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for direct message delivery')),
          1000
        );
        recipientSocket.once('message:receive', (message) => {
          clearTimeout(timeout);
          resolve(message);
        });
      });
      const startedAt = performance.now();
      clientSocket.emit('message:send', testPayload);
      const receivedMessage = await delivery;
      const latencyMs = performance.now() - startedAt;

      expect(latencyMs).toBeLessThan(1000);
      expect(receivedMessage).toMatchObject({
        text: testPayload.text,
        clientMsgId: testPayload.clientMsgId,
        recipientId: testPayload.recipientId,
        senderId: 'user_tester_1',
      });
      expect(receivedMessage).toHaveProperty('messageId');
      expect(receivedMessage).toHaveProperty('timestamp');

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(senderReceivedMessage).not.toHaveBeenCalled();
    } finally {
      clientSocket.off('message:receive', senderReceivedMessage);
      recipientSocket.disconnect();
    }
  }, 15000);

  it('queues offline direct messages and delivers them in order on reconnect', async () => {
    const recipientId = 'user_offline_recipient';
    isUserOnline.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    const sendMessage = (clientMsgId, text) => new Promise((resolve, reject) => {
      clientSocket.emit(
        'message:send',
        { recipientId, clientMsgId, text },
        (response) => {
          if (response.error) reject(new Error(response.error.message));
          else resolve(response);
        }
      );
    });

    const firstQueued = await sendMessage('offline-1', 'First message');
    const secondQueued = await sendMessage('offline-2', 'Second message');
    expect(firstQueued.status).toBe('queued');
    expect(secondQueued.status).toBe('queued');

    const receivedMessages = [];
    const recipientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: {
        token: generateToken({
          id: recipientId,
          email: 'offline@example.com',
          username: 'offline',
        }).token,
      },
      transports: ['websocket'],
    });

    try {
      const allMessagesReceived = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for queued messages')),
          5000
        );
        recipientSocket.on('message:receive', (message) => {
          receivedMessages.push(message);
          if (receivedMessages.length === 2) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      await new Promise((resolve, reject) => {
        recipientSocket.once('connection:ack', resolve);
        recipientSocket.once('connect_error', reject);
      });
      await allMessagesReceived;

      expect(receivedMessages.map((message) => message.clientMsgId))
        .toEqual(['offline-1', 'offline-2']);
      expect(receivedMessages.map((message) => message.text))
        .toEqual(['First message', 'Second message']);
    } finally {
      recipientSocket.disconnect();
    }
  }, 15000);

  const connectTypingObserver = async () => {
    const observer = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: {
        token: generateToken({
          id: 'typing_observer',
          email: 'typing-observer@example.com',
          username: 'typing_observer',
        }).token,
      },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      observer.once('connection:ack', resolve);
      observer.once('connect_error', reject);
    });

    return observer;
  };

  const joinTypingRoom = async (socket, roomId) => {
    socket.emit('room:join', { roomId });
    await new Promise((resolve) => setTimeout(resolve, 150));
  };

  it('broadcasts typing indicators and stops them explicitly', async () => {
    const roomId = 'typing-explicit-stop-room';
    const observer = await connectTypingObserver();

    try {
      await joinTypingRoom(clientSocket, roomId);
      await joinTypingRoom(observer, roomId);

      const started = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:start')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('typing:start', { roomId });

      const startEvent = await started;
      expect(startEvent).toMatchObject({
        roomId,
        userId: 'user_tester_1',
        isTyping: true,
      });

      const stopped = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:stop')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('typing:stop', { roomId });

      const stopEvent = await stopped;
      expect(stopEvent).toMatchObject({
        roomId,
        userId: 'user_tester_1',
        isTyping: false,
      });
    } finally {
      observer.disconnect();
    }
  }, 15000);

  it('automatically stops the typing indicator after inactivity', async () => {
    const roomId = 'typing-inactivity-room';
    const observer = await connectTypingObserver();

    try {
      await joinTypingRoom(clientSocket, roomId);
      await joinTypingRoom(observer, roomId);

      const events = [];
      const stopped = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Typing indicator did not stop automatically')),
          6000
        );

        observer.on('typing:update', (event) => {
          events.push(event);

          if (event.isTyping === false) {
            clearTimeout(timeout);
            resolve(event);
          }
        });
      });

      clientSocket.emit('typing:start', { roomId });

      const stopEvent = await stopped;

      expect(events.some((event) => event.isTyping === true)).toBe(true);
      expect(stopEvent).toMatchObject({
        roomId,
        userId: 'user_tester_1',
        isTyping: false,
      });
    } finally {
      observer.disconnect();
    }
  }, 10000);

  it('stops the typing indicator when the user leaves the room', async () => {
    const roomId = 'typing-leave-room';
    const observer = await connectTypingObserver();

    try {
      await joinTypingRoom(clientSocket, roomId);
      await joinTypingRoom(observer, roomId);

      const started = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:start')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('typing:start', { roomId });
      await started;

      const stopped = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:stop on room leave')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('room:leave', { roomId });

      const stopEvent = await stopped;
      expect(stopEvent).toMatchObject({
        roomId,
        userId: 'user_tester_1',
        isTyping: false,
      });
    } finally {
      observer.disconnect();
    }
  }, 15000);

  it('stops the typing indicator when the user sends a room message', async () => {
    const roomId = 'typing-send-message-room';
    const observer = await connectTypingObserver();
    const processMessageSpy = jest
      .spyOn(messagingService, 'processMessage')
      .mockResolvedValue({
        messageId: 'typing-test-message',
        roomId,
        senderId: 'user_tester_1',
        text: 'Hello from typing test',
        timestamp: new Date().toISOString(),
      });

    try {
      await joinTypingRoom(clientSocket, roomId);
      await joinTypingRoom(observer, roomId);

      const started = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:start')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit('typing:start', { roomId });
      await started;

      const stopped = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for typing:stop after message')),
          5000
        );
        observer.once('typing:update', (event) => {
          clearTimeout(timeout);
          resolve(event);
        });
      });

      clientSocket.emit(
        'message:send',
        {
          roomId,
          text: 'Hello from typing test',
          clientMsgId: 'typing-test-client-message',
        },
        (response) => {
          if (response && response.error) {
            // The typing-stop event is still checked below.
          }
        }
      );

      const stopEvent = await stopped;
      expect(stopEvent).toMatchObject({
        roomId,
        userId: 'user_tester_1',
        isTyping: false,
      });

      expect(processMessageSpy).toHaveBeenCalled();
    } finally {
      processMessageSpy.mockRestore();
      observer.disconnect();
    }
  }, 15000);

  describe('TC-Room-03: Broadcast message to room members (CHAT-F-022)', () => {
    let clientA;
    let clientB;
    let clientC;

    beforeAll(async () => {
      clientA = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: generateToken({
            id: 'user_room_a',
            email: 'user_a@example.com',
            username: 'user_a',
          }).token,
        },
        transports: ['websocket'],
      });

      clientB = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: generateToken({
            id: 'user_room_b',
            email: 'user_b@example.com',
            username: 'user_b',
          }).token,
        },
        transports: ['websocket'],
      });

      clientC = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: {
          token: generateToken({
            id: 'user_room_c',
            email: 'user_c@example.com',
            username: 'user_c',
          }).token,
        },
        transports: ['websocket'],
      });

      await Promise.all([
        new Promise((res, rej) => {
          clientA.once('connection:ack', res);
          clientA.once('connect_error', rej);
        }),
        new Promise((res, rej) => {
          clientB.once('connection:ack', res);
          clientB.once('connect_error', rej);
        }),
        new Promise((res, rej) => {
          clientC.once('connection:ack', res);
          clientC.once('connect_error', rej);
        }),
      ]);
    });

    afterAll(() => {
      if (clientA) clientA.disconnect();
      if (clientB) clientB.disconnect();
      if (clientC) clientC.disconnect();
    });

    it('broadcasts room message to all connected members in that room (AC-CHAT-F-022)', async () => {
      const targetRoom = 'room_general';
      const otherRoom = 'room_random';

      await new Promise((res) => clientA.emit('room:join', { roomId: targetRoom }, res));
      await new Promise((res) => clientB.emit('room:join', { roomId: targetRoom }, res));
      await new Promise((res) => clientC.emit('room:join', { roomId: otherRoom }, res));

      const clientCReceived = jest.fn();
      clientC.on('message:receive', clientCReceived);

      const aReceivePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('clientA did not receive broadcast')), 2000);
        clientA.once('message:receive', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      const bReceivePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('clientB did not receive broadcast')), 2000);
        clientB.once('message:receive', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      const startedAt = performance.now();
      const sendPromise = new Promise((resolve, reject) => {
        clientA.emit(
          'message:send',
          {
            roomId: targetRoom,
            text: 'Hello group!',
            clientMsgId: 'client-group-1',
          },
          (response) => {
            if (response && response.error) reject(new Error(response.error.message));
            else resolve(response);
          }
        );
      });

      const [sendResult, msgA, msgB] = await Promise.all([
        sendPromise,
        aReceivePromise,
        bReceivePromise,
      ]);
      const latencyMs = performance.now() - startedAt;

      expect(latencyMs).toBeLessThan(1000);
      expect(sendResult.status).toBe('ok');
      expect(msgA).toMatchObject({
        roomId: targetRoom,
        senderId: 'user_room_a',
        text: 'Hello group!',
        clientMsgId: 'client-group-1',
      });
      expect(msgB).toMatchObject({
        roomId: targetRoom,
        senderId: 'user_room_a',
        text: 'Hello group!',
        clientMsgId: 'client-group-1',
      });
      expect(msgA).toHaveProperty('messageId');
      expect(msgA).toHaveProperty('timestamp');

      await new Promise((res) => setTimeout(res, 50));
      expect(clientCReceived).not.toHaveBeenCalled();
      clientC.off('message:receive', clientCReceived);
    });

    it('does not deliver broadcast to a member who left the room', async () => {
      const targetRoom = 'room_general';

      await new Promise((res) => clientB.emit('room:leave', { roomId: targetRoom }, res));

      const bReceived = jest.fn();
      clientB.on('message:receive', bReceived);

      const aReceivePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('clientA did not receive broadcast')), 2000);
        clientA.once('message:receive', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      await new Promise((resolve, reject) => {
        clientA.emit(
          'message:send',
          {
            roomId: targetRoom,
            text: 'Are you still there?',
            clientMsgId: 'client-group-2',
          },
          (response) => {
            if (response && response.error) reject(new Error(response.error.message));
            else resolve(response);
          }
        );
      });

      const msgA = await aReceivePromise;
      expect(msgA.text).toBe('Are you still there?');

      await new Promise((res) => setTimeout(res, 50));
      expect(bReceived).not.toHaveBeenCalled();
      clientB.off('message:receive', bReceived);
    });

    it('sanitizes malicious markup in room messages before broadcast (CHAT-SR-004)', async () => {
      const targetRoom = 'room_general';

      await new Promise((res) => clientB.emit('room:join', { roomId: targetRoom }, res));

      const bReceivePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('clientB did not receive broadcast')), 2000);
        clientB.once('message:receive', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      clientA.emit('message:send', {
        roomId: targetRoom,
        text: '<script>alert("XSS")</script><b>Safe Text</b>',
        clientMsgId: 'client-group-xss',
      });

      const msgB = await bReceivePromise;
      expect(msgB.text).not.toContain('<script>');
      expect(msgB.text).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;&lt;b&gt;Safe Text&lt;&#x2F;b&gt;');
    });
  });


});
