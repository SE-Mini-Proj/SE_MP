const http = require('http');
const app = require('./app');
const config = require('./config');
const { initializeSocket } = require('./sockets');

const server = http.createServer(app);
const io = initializeSocket(server);

// Store io instance on app for access in route handlers if needed
app.set('io', io);

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.port, () => {
    console.log(`[Server] Real-Time Chat Server running on http://localhost:${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] WebSocket Gateway initialized on port ${config.port}`);
  });
}

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Closing HTTP and WebSocket connections...`);
  server.close(() => {
    console.log('[Server] Server shut down gracefully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { server, app, io };
