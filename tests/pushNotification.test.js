const crypto = require('node:crypto');
const { afterEach, describe, expect, it, jest } = require('@jest/globals');

jest.mock('../src/models/deviceTokenModel', () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
  findByUserId: jest.fn(),
  delete: jest.fn(),
  deleteInvalid: jest.fn(),
}));

const DeviceTokenModel = require('../src/models/deviceTokenModel');
const {
  notifyUser,
  registerDevice,
  unregisterDevice,
} = require('../src/services/pushNotificationService');

describe('FCM push notification service (CHAT-F-061, TC-Notif-02)', () => {
  const originalFetch = globalThis.fetch;
  const originalAccount = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const originalProjectId = process.env.FCM_PROJECT_ID;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalAccount === undefined) delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    else process.env.FCM_SERVICE_ACCOUNT_JSON = originalAccount;
    if (originalProjectId === undefined) delete process.env.FCM_PROJECT_ID;
    else process.env.FCM_PROJECT_ID = originalProjectId;
    jest.clearAllMocks();
  });

  it('registers and removes a user-owned FCM device token', async () => {
    DeviceTokenModel.delete.mockResolvedValue(true);

    await registerDevice({ userId: 'recipient-1', token: 'fcm-registration-token-123456789' });
    expect(DeviceTokenModel.upsert).toHaveBeenCalledWith({
      userId: 'recipient-1',
      token: 'fcm-registration-token-123456789',
    });

    await expect(unregisterDevice({
      userId: 'recipient-1',
      token: 'fcm-registration-token-123456789',
    })).resolves.toBe(true);
    expect(DeviceTokenModel.delete).toHaveBeenCalledWith({
      userId: 'recipient-1',
      token: 'fcm-registration-token-123456789',
    });
  });

  it('dispatches the direct message to registered devices using FCM HTTP v1', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: 'chat-test-project',
      client_email: 'chat-push@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
    delete process.env.FCM_PROJECT_ID;
    DeviceTokenModel.findByUserId.mockResolvedValue(['fcm-registration-token-123456789']);
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'oauth-access-token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'projects/chat-test-project/messages/123' }),
      });

    await expect(notifyUser('recipient-1', {
      senderId: 'sender-1',
      recipientId: 'recipient-1',
      messageId: 'message-1',
      text: 'Hello from the chat',
    })).resolves.toEqual({ sent: 1, removedInvalidTokens: 0 });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const fcmRequest = globalThis.fetch.mock.calls[1];
    expect(fcmRequest[0]).toBe(
      'https://fcm.googleapis.com/v1/projects/chat-test-project/messages:send'
    );
    expect(JSON.parse(fcmRequest[1].body)).toMatchObject({
      message: {
        token: 'fcm-registration-token-123456789',
        notification: {
          title: 'New direct message',
          body: 'Hello from the chat',
        },
        data: {
          type: 'direct_message',
          senderId: 'sender-1',
          recipientId: 'recipient-1',
          messageId: 'message-1',
        },
      },
    });
  });

  it('does not request FCM credentials when the recipient has no registered device', async () => {
    DeviceTokenModel.findByUserId.mockResolvedValue([]);
    globalThis.fetch = jest.fn();

    await expect(notifyUser('recipient-1', {
      senderId: 'sender-1',
      recipientId: 'recipient-1',
      messageId: 'message-1',
      text: 'Hello',
    })).resolves.toEqual({ sent: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
