
const { Server } = require('socket.io');
const config = require('../config');
const registerMessageHandler = require('./handlers/messageHandler');
const registerPresenceHandler = require('./handlers/presenceHandler');
const {
  CHANNELS,
} = require('../cache/redisPubSub');

function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization;

    const userId =
      socket.handshake.auth?.userId ||
      socket.handshake.query?.userId;

    socket.user = {
      id: userId || `user_${socket.id.substring(0, 6)}`,
      authenticated: Boolean(token),
    };

    next();
  });

  async function handleRedisEvent(channel, event) {
    if (channel === CHANNELS.MESSAGES) {
      // Ignore messages published by this instance.
      // Its message handler already broadcasts them locally.
      if (event.originInstanceId === require('../cache/redisPubSub').INSTANCE_ID) {
        return;
      }

      if (event.roomId) {
        io.to(event.roomId).emit('message:receive', event);
      } else {
        io.emit('message:receive', event);
      }

      return;
    }

    if (channel === CHANNELS.ROOM_EVENTS) {
      if (!event.eventName || !event.payload) {
        return;
      }

      if (event.roomId) {
        io.to(event.roomId).emit(event.eventName, event.payload);
      }

      return;
    }

    if (channel === CHANNELS.PRESENCE) {
      if (!event.eventName || !event.payload) {
        return;
      }

      io.emit(event.eventName, event.payload);
    }
  }

  io.on('connection', (socket) => {
    if (config.nodeEnv !== 'test') {
      console.log(
        `[WebSocket] Client connected: ${socket.id} (User: ${socket.user.id})`
      );
    }

    socket.emit('connection:ack', {
      status: 'connected',
      socketId: socket.id,
      user: socket.user,
      timestamp: new Date().toISOString(),
    });

    // Register message and presence handlers.
    // The presence handler automatically registers the session.
    registerMessageHandler(io, socket);
    registerPresenceHandler(io, socket);
  });

  return {
    io,
    handleRedisEvent,
  };
}

module.exports = { initializeSocket };