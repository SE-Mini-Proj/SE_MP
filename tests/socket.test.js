const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initializeSocket } = require('../src/sockets');

describe('WebSocket Gateway - Socket.IO Integration', () => {
  let server;
  let socketServer;
  let serverPort;
  let clientSocket;

  beforeAll(async () => {
    server = http.createServer(app);
    socketServer = initializeSocket(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (socketServer) {
      await new Promise((resolve) => socketServer.close(resolve));
    }
  });

  it('should connect and receive connection:ack event', async () => {
    await new Promise((resolve, reject) => {
      clientSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
        auth: { token: 'mock_jwt_for_test', userId: 'user_tester_1' },
        transports: ['websocket'],
      });

      clientSocket.on('connection:ack', (ack) => {
        expect(ack.status).toBe('connected');
        expect(ack.user.id).toBe('user_tester_1');
        expect(ack).toHaveProperty('timestamp');
        resolve();
      });

      clientSocket.on('connect_error', (err) => reject(err));
    });
  }, 10000);

  it('should echo or broadcast sent messages via message:receive', async () => {
    const testPayload = {
      text: 'Hello, Antigravity Chat!',
      clientMsgId: 'client_msg_12345',
    };

    await new Promise((resolve) => {
      clientSocket.on('message:receive', (receivedMsg) => {
        expect(receivedMsg.text).toBe(testPayload.text);
        expect(receivedMsg.clientMsgId).toBe(testPayload.clientMsgId);
        expect(receivedMsg).toHaveProperty('messageId');
        expect(receivedMsg).toHaveProperty('timestamp');
        resolve();
      });

      clientSocket.emit('message:send', testPayload);
    });
  }, 10000);
});
