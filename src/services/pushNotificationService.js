const crypto = require('node:crypto');
const fs = require('node:fs');
const DeviceTokenModel = require('../models/deviceTokenModel');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
let cachedAccessTokenAccount = null;

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function getServiceAccount() {
  const rawAccount = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const accountPath = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (!rawAccount && !accountPath) return null;

  let account;
  try {
    account = JSON.parse(
      rawAccount || fs.readFileSync(accountPath, 'utf8')
    );
  } catch (error) {
    throw new Error(`FCM service account configuration is invalid: ${error.message}`);
  }

  const projectId = process.env.FCM_PROJECT_ID || account.project_id;
  if (!projectId || !account.client_email || !account.private_key) {
    throw new Error('FCM service account requires project_id, client_email, and private_key');
  }

  return { ...account, project_id: projectId };
}

async function getAccessToken(account) {
  const accountKey = crypto
    .createHash('sha256')
    .update(`${account.project_id}:${account.client_email}:${account.private_key}`)
    .digest('hex');
  if (
    cachedAccessToken
    && cachedAccessTokenAccount === accountKey
    && Date.now() < cachedAccessTokenExpiresAt - 60_000
  ) {
    return cachedAccessToken;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const assertionHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionClaims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedAssertion = `${assertionHeader}.${assertionClaims}`;
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(unsignedAssertion),
    account.private_key
  ).toString('base64url');
  const response = await globalThis.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedAssertion}.${signature}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM OAuth token request failed with HTTP ${response.status}`);
  }

  const result = await response.json();
  if (typeof result.access_token !== 'string' || !result.access_token) {
    throw new Error('FCM OAuth response did not contain an access token');
  }

  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  cachedAccessTokenAccount = accountKey;
  return cachedAccessToken;
}

async function sendToDevice(account, accessToken, token, message) {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`;
  const response = await globalThis.fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: 'New direct message',
          body: message.text.slice(0, 180),
        },
        data: {
          type: 'direct_message',
          senderId: String(message.senderId),
          recipientId: String(message.recipientId),
          messageId: String(message.messageId),
        },
      },
    }),
  });

  if (response.ok) return true;

  const result = await response.json().catch(() => null);
  const errorCode = result?.error?.details?.find(
    (detail) => detail.errorCode
  )?.errorCode;

  if (errorCode === 'UNREGISTERED') {
    return false;
  }

  throw new Error(`FCM send failed with HTTP ${response.status}`);
}

async function notifyUser(userId, message) {
  const tokens = await DeviceTokenModel.findByUserId(userId);
  if (tokens.length === 0) return { sent: 0 };

  const account = getServiceAccount();
  if (!account) {
    throw new Error('FCM is not configured; set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_FILE');
  }

  const accessToken = await getAccessToken(account);
  const results = await Promise.allSettled(
    tokens.map((token) => sendToDevice(account, accessToken, token, message))
  );
  const invalidTokens = [];
  const failures = [];
  let sent = 0;

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failures.push(result.reason);
    } else if (result.value) {
      sent++;
    } else {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await DeviceTokenModel.deleteInvalid(invalidTokens);
  }

  if (failures.length) {
    throw new Error(`FCM failed to send to ${failures.length} device(s): ${failures[0].message}`);
  }

  return { sent, removedInvalidTokens: invalidTokens.length };
}

async function registerDevice({ userId, token }) {
  if (typeof token !== 'string' || token.trim().length < 20 || token.length > 4096) {
    const error = new Error('A valid FCM device token is required');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  await DeviceTokenModel.upsert({ userId, token: token.trim() });
}

async function unregisterDevice({ userId, token }) {
  if (typeof token !== 'string' || !token.trim()) {
    const error = new Error('A device token is required');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return DeviceTokenModel.delete({ userId, token: token.trim() });
}

module.exports = {
  notifyUser,
  registerDevice,
  unregisterDevice,
};
