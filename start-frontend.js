const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/rooms', (req, res) => {
  res.json({
    rooms: [
      { id: 'general', name: 'general', topic: 'Global team discussion and updates' },
      { id: 'announcements', name: 'announcements', topic: 'Official product releases and alerts' },
      { id: 'room_engineering_uuid', name: 'engineering', topic: 'Architecture, PRs, and security (RBAC Demo)' },
      { id: 'random', name: 'random', topic: 'Casual banter, coffee breaks, and memes' },
    ],
  });
});

app.post('/api/rooms', (req, res) => {
  const { name, isPrivate } = req.body;
  res.json({
    room: {
      id: `room_${Date.now()}`,
      name: name || 'new-channel',
      isPrivate: Boolean(isPrivate),
      topic: 'Channel created by user',
    },
  });
});

app.get('/api/audit-logs', (req, res) => {
  res.json({
    logs: [
      {
        id: 'audit_1',
        action: 'MUTE_USER',
        actor_id: 'user_owner_uuid',
        actor_name: 'Alice (Owner)',
        target_id: 'user_bad_actor_uuid',
        target_name: 'BadActor',
        details: { reason: 'Disruptive behavior', duration: '15m' },
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'audit_2',
        action: 'DELETE_MESSAGE',
        actor_id: 'user_moderator_uuid',
        actor_name: 'Bob (Moderator)',
        target_id: 'msg_spam_99',
        details: { reason: 'Spam violation' },
        created_at: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  socket.emit('connection:ack', { timestamp: new Date().toISOString() });

  socket.on('message:send', (data, ack) => {
    const msg = {
      messageId: `msg_${Date.now()}`,
      clientMsgId: data.clientMsgId,
      roomId: data.roomId || 'general',
      senderId: socket.handshake.query?.userId || 'user_owner_uuid',
      text: data.text,
      timestamp: new Date().toISOString(),
      delivered: true,
    };
    io.emit('message:receive', msg);
    if (typeof ack === 'function') {
      ack({ status: 'ok', message: msg });
    }
  });

  socket.on('typing:start', (data) => {
    socket.broadcast.emit('typing:update', {
      userId: socket.handshake.query?.userId || 'user_owner_uuid',
      isTyping: true,
      roomId: data?.roomId,
    });
  });

  socket.on('typing:stop', (data) => {
    socket.broadcast.emit('typing:update', {
      userId: socket.handshake.query?.userId || 'user_owner_uuid',
      isTyping: false,
      roomId: data?.roomId,
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
================================================================
🚀 HyperChat Frontend & Live Real-Time Gateway is RUNNING!
👉 Access URL: http://localhost:${PORT}
================================================================
`);
});

