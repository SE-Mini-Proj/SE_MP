const { performance } = require('node:perf_hooks');
const { clearInterval, setInterval, setTimeout } = require('node:timers');
const { io } = require('socket.io-client');
const db = require('../../src/db');
const { generateToken } = require('../../src/services/authService');
const { isUserOnline } = require('../../src/cache/presenceService');
const { connectRedis, closeRedis } = require('../../src/cache/redisClient');

const target = process.env.PERF_TARGET || 'http://localhost:3000';
const senderUsername = process.env.PERF_SENDER_USERNAME || 'alice';
const recipientUsername = process.env.PERF_RECIPIENT_USERNAME || 'bob';
const durationSeconds = Number(process.env.PERF_DURATION_SECONDS || 60);
const messagesPerSecond = Number(process.env.PERF_MESSAGES_PER_SECOND || 10);
const maxLatencyMs = Number(process.env.PERF_MAX_P95_MS || 1000);
const drainTimeoutMs = Number(process.env.PERF_DRAIN_TIMEOUT_MS || 10000);

function assertConfig() {
  for (const [name, value] of Object.entries({
    PERF_DURATION_SECONDS: durationSeconds,
    PERF_MESSAGES_PER_SECOND: messagesPerSecond,
    PERF_MAX_P95_MS: maxLatencyMs,
    PERF_DRAIN_TIMEOUT_MS: drainTimeoutMs,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
  }

  if (senderUsername === recipientUsername) {
    throw new Error('PERF_SENDER_USERNAME and PERF_RECIPIENT_USERNAME must be different users');
  }
}

async function getTestUsers() {
  const result = await db.query(
    `SELECT id, username, email
     FROM users
     WHERE username = ANY($1::text[]);`,
    [[senderUsername, recipientUsername]]
  );
  const usersByName = new Map(result.rows.map((user) => [user.username, user]));
  const sender = usersByName.get(senderUsername);
  const recipient = usersByName.get(recipientUsername);

  if (!sender || !recipient) {
    throw new Error(
      `Load-test users "${senderUsername}" and "${recipientUsername}" must exist; run npm run db:seed or configure PERF_SENDER_USERNAME and PERF_RECIPIENT_USERNAME`
    );
  }

  return { sender, recipient };
}

function connectSocket(user) {
  const { token } = generateToken(user);
  const socket = io(target, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Timed out connecting ${user.username} to ${target}`));
    }, 10000);

    socket.once('connection:ack', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });
  });
}

async function waitForOnlineUser(userId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await isUserOnline(userId)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    'Recipient presence did not become available; make sure the app Redis service is connected'
  );
}

function percentile(samples, ratio) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}

async function waitForPending(pending, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (pending.size && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function run() {
  assertConfig();
  let senderSocket;
  let recipientSocket;
  const pending = new Map();
  const latencies = [];
  const failures = [];
  let sequence = 0;
  let interval;

  try {
    const { sender, recipient } = await getTestUsers();
    await connectRedis();
    senderSocket = await connectSocket(sender);
    recipientSocket = await connectSocket(recipient);
    await waitForOnlineUser(recipient.id);

    recipientSocket.on('message:receive', (message) => {
      const startedAt = pending.get(message.clientMsgId);
      if (startedAt === undefined) return;
      pending.delete(message.clientMsgId);
      latencies.push(performance.now() - startedAt);
    });

    senderSocket.on('message:error', (error) => {
      failures.push(error.message || 'Socket message error');
    });

    const intervalMs = 1000 / messagesPerSecond;
    interval = setInterval(() => {
      const clientMsgId = `perf-${process.pid}-${sequence++}`;
      pending.set(clientMsgId, performance.now());
      senderSocket.emit(
        'message:send',
        {
          recipientId: recipient.id,
          clientMsgId,
          text: 'CHAT-NF-001 direct-message latency sample',
        },
        (response) => {
          if (response?.error) {
            pending.delete(clientMsgId);
            failures.push(response.error.message || 'Message send failed');
          }
        }
      );
    }, intervalMs);

    await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));
    clearInterval(interval);
    interval = null;
    await waitForPending(pending, drainTimeoutMs);

    const expected = sequence;
    const lost = pending.size;
    if (latencies.length) {
      console.log(`Messages sent: ${expected}`);
      console.log(`Messages received: ${latencies.length}`);
      console.log(`Messages timed out: ${lost}`);
      console.log(`Latency p50: ${percentile(latencies, 0.50).toFixed(2)} ms`);
      console.log(`Latency p95: ${percentile(latencies, 0.95).toFixed(2)} ms`);
      console.log(`Latency p99: ${percentile(latencies, 0.99).toFixed(2)} ms`);
      console.log(`Latency max: ${Math.max(...latencies).toFixed(2)} ms`);
      console.log(`Acceptance threshold (p95): ${maxLatencyMs} ms`);
    } else {
      console.error('No direct messages were received during the load test.');
    }

    if (failures.length) {
      console.error(`Message errors (${failures.length}): ${failures.slice(0, 5).join('; ')}`);
    }

    if (
      !latencies.length
      || lost > 0
      || failures.length > 0
      || percentile(latencies, 0.95) > maxLatencyMs
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (interval) clearInterval(interval);
    if (senderSocket) senderSocket.disconnect();
    if (recipientSocket) recipientSocket.disconnect();
    const cleanupResults = await Promise.allSettled([
      closeRedis(),
      db.closePool(),
    ]);
    cleanupResults
      .filter((result) => result.status === 'rejected')
      .forEach((result) => {
        console.error(`[Socket latency test] Cleanup failed: ${result.reason.message}`);
      });
  }
}

run().catch((error) => {
  console.error(`[Socket latency test] ${error.message}`);
  process.exitCode = 1;
});
