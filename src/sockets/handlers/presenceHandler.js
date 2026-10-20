function registerPresenceHandler(io, socket) {
  // Join room event
  socket.on('room:join', ({ roomId }, callback) => {
    if (roomId) {
      socket.join(roomId);
      socket.to(roomId).emit('user:joined', {
        userId: socket.user?.id || socket.id,
        roomId,
        timestamp: new Date().toISOString(),
      });
      if (typeof callback === 'function') callback({ status: 'ok', roomId });
    }
  });

  // Leave room event
  socket.on('room:leave', ({ roomId }, callback) => {
    if (roomId) {
      socket.leave(roomId);
      socket.to(roomId).emit('user:left', {
        userId: socket.user?.id || socket.id,
        roomId,
        timestamp: new Date().toISOString(),
      });
      if (typeof callback === 'function') callback({ status: 'ok', roomId });
    }
  });

  // Typing indicator
  socket.on('typing:start', ({ roomId }) => {
    const target = roomId ? socket.to(roomId) : socket.broadcast;
    target.emit('typing:update', {
      userId: socket.user?.id || socket.id,
      isTyping: true,
      roomId,
    });
  });

  socket.on('typing:stop', ({ roomId }) => {
    const target = roomId ? socket.to(roomId) : socket.broadcast;
    target.emit('typing:update', {
      userId: socket.user?.id || socket.id,
      isTyping: false,
      roomId,
    });
  });

  // Disconnect handler
  socket.on('disconnect', (reason) => {
    io.emit('user:offline', {
      userId: socket.user?.id || socket.id,
      reason,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = registerPresenceHandler;
