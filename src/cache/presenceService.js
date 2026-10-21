
const { getRedisClient } = require('./redisClient');

const SESSION_PREFIX = 'chat:session:';
const USER_SESSIONS_PREFIX = 'chat:user:sessions:';
const ONLINE_USERS_KEY = 'chat:online-users';

const SESSION_TTL_SECONDS = 86400;

function getSessionKey(socketId) {
  return `${SESSION_PREFIX}${socketId}`;
}

function getUserSessionsKey(userId) {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

function ensureRedisReady() {
  const redis = getRedisClient();

  if (!redis.isReady) {
    throw new Error('Redis is not ready');
  }

  return redis;
}

async function getUserSessions(userId) {
  const redis = ensureRedisReady();
  const userSessionsKey = getUserSessionsKey(userId);
  const socketIds = await redis.sMembers(userSessionsKey);

  const sessions = [];

  for (const socketId of socketIds) {
    const sessionKey = getSessionKey(socketId);
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      await redis.sRem(userSessionsKey, socketId);
      continue;
    }

    try {
      sessions.push(JSON.parse(sessionData));
    } catch (error) {
      console.error(
        `[Presence] Invalid session data for socket ${socketId}:`,
        error.message
      );

      await redis.del(sessionKey);
      await redis.sRem(userSessionsKey, socketId);
    }
  }

  // Keep the online-users index consistent with the surviving sessions.
  if (sessions.length === 0) {
    await redis.del(userSessionsKey);
    await redis.sRem(ONLINE_USERS_KEY, userId);
  } else {
    await redis.sAdd(ONLINE_USERS_KEY, userId);
  }

  return sessions;
}

async function registerSession({ userId, socketId, instanceId }) {
  const redis = ensureRedisReady();

  if (!userId || !socketId || !instanceId) {
    throw new Error('userId, socketId, and instanceId are required');
  }

  // Clean expired session references before determining whether this
  // is the user's first active session.
  const existingSessions = await getUserSessions(userId);
  const isFirstSession = existingSessions.length === 0;

  const sessionKey = getSessionKey(socketId);
  const userSessionsKey = getUserSessionsKey(userId);

  const session = {
    userId,
    socketId,
    instanceId,
    connectedAt: new Date().toISOString(),
  };

  const multi = redis.multi();

  multi.set(sessionKey, JSON.stringify(session), {
    EX: SESSION_TTL_SECONDS,
  });

  multi.sAdd(userSessionsKey, socketId);
  multi.expire(userSessionsKey, SESSION_TTL_SECONDS);
  multi.sAdd(ONLINE_USERS_KEY, userId);

  await multi.exec();

  return {
    ...session,
    isFirstSession,
  };
}

async function removeSession({ userId, socketId }) {
  const redis = ensureRedisReady();

  if (!userId || !socketId) {
    throw new Error('userId and socketId are required');
  }

  const userSessionsKey = getUserSessionsKey(userId);
  const sessionKey = getSessionKey(socketId);

  const multi = redis.multi();
  multi.del(sessionKey);
  multi.sRem(userSessionsKey, socketId);

  const results = await multi.exec();

  // Remove expired references and check whether another active session
  // remains for this user.
  const remainingSessions = await getUserSessions(userId);
  const userOnline = remainingSessions.length > 0;

  if (!userOnline) {
    await redis.del(userSessionsKey);
    await redis.sRem(ONLINE_USERS_KEY, userId);
  }

  return {
    removed: true,
    userOnline,
    remainingSessionCount: remainingSessions.length,
    results,
  };
}

async function isUserOnline(userId) {
  const sessions = await getUserSessions(userId);
  return sessions.length > 0;
}

async function getOnlineUsers() {
  const redis = ensureRedisReady();
  const userIds = await redis.sMembers(ONLINE_USERS_KEY);
  const onlineUsers = [];

  for (const userId of userIds) {
    if (await isUserOnline(userId)) {
      onlineUsers.push(userId);
    }
  }

  return onlineUsers;
}

module.exports = {
  registerSession,
  removeSession,
  getUserSessions,
  isUserOnline,
  getOnlineUsers,
};