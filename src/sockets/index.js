const { Server } = require('socket.io');
const config = require('../config');
const registerMessageHandler = require('./handlers/messageHandler');
const registerPresenceHandler = require('./handlers/presenceHandler');

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

  // Connection Handshake Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;

    // Attach user information to socket context
    socket.user = {
      id: userId || `user_${socket.id.substring(0, 6)}`,
      authenticated: Boolean(token),
    };

    next();
  });

  io.on('connection', (socket) => {
    if (config.nodeEnv !== 'test') {
      console.log(`[WebSocket] Client connected: ${socket.id} (User: ${socket.user.id})`);
    }

    // Acknowledge connection
    socket.emit('connection:ack', {
      status: 'connected',
      socketId: socket.id,
      user: socket.user,
      timestamp: new Date().toISOString(),
    });

    // Broadcast user online event
    socket.broadcast.emit('user:online', {
      userId: socket.user.id,
      timestamp: new Date().toISOString(),
    });

    // Register event modules
    registerMessageHandler(io, socket);
    registerPresenceHandler(io, socket);
  });

  return io;
}

module.exports = { initializeSocket };
