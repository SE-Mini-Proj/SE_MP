const { Readable } = require('node:stream');
const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config');
const { generateToken } = require('../src/services/authService');

jest.mock('../src/models/mediaModel', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  listByRoomId: jest.fn(),
}));

jest.mock('../src/models/roomModel', () => ({
  findById: jest.fn(),
  getMemberRole: jest.fn(),
}));

jest.mock('../src/services/objectStorageService', () => ({
  putObject: jest.fn(),
  getObject: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('../src/cache/redisPubSub', () => ({
  publishRoomEvent: jest.fn().mockResolvedValue(undefined),
}));

const MediaModel = require('../src/models/mediaModel');
const RoomModel = require('../src/models/roomModel');
const objectStorageService = require('../src/services/objectStorageService');
const { publishRoomEvent } = require('../src/cache/redisPubSub');

const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RECIPIENT_ID = '44444444-4444-4444-8444-444444444444';
const MEDIA_ID = '33333333-3333-4333-8333-333333333333';
const FILE_BODY = Buffer.from('fake image bytes');

function mediaRow(values = {}) {
  return {
    id: MEDIA_ID,
    room_id: ROOM_ID,
    uploader_id: USER_ID,
    uploader_name: 'Test User',
    storage_key: `rooms/${ROOM_ID}/${MEDIA_ID}`,
    file_name: 'photo.png',
    content_type: 'image/png',
    file_size: FILE_BODY.length,
    created_at: '2026-11-03T10:00:00.000Z',
    ...values,
  };
}

describe('Room media sharing (AC-CHAT-F-050, TC-Media-01)', () => {
  let io;
  const token = generateToken({ id: USER_ID, username: 'Test User' }).token;
  const recipientToken = generateToken({
    id: RECIPIENT_ID,
    username: 'Recipient',
  }).token;

  beforeEach(() => {
    jest.clearAllMocks();
    RoomModel.findById.mockResolvedValue({ id: ROOM_ID });
    RoomModel.getMemberRole.mockResolvedValue('member');
    MediaModel.create.mockResolvedValue(mediaRow());
    MediaModel.findById.mockResolvedValue(mediaRow());
    MediaModel.listByRoomId.mockResolvedValue([mediaRow()]);
    objectStorageService.putObject.mockResolvedValue(undefined);
    objectStorageService.deleteObject.mockResolvedValue(undefined);
    objectStorageService.getObject.mockResolvedValue(Readable.from([FILE_BODY]));
    io = {
      to: jest.fn(() => ({ emit: jest.fn() })),
    };
    app.set('io', io);
  });

  it('stores an allowed upload and makes it visible and downloadable to room members', async () => {
    const upload = await request(app)
      .post(`/api/media/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'photo.png')
      .send(FILE_BODY);

    expect(upload.status).toBe(201);
    expect(upload.body.media).toMatchObject({
      id: MEDIA_ID,
      roomId: ROOM_ID,
      uploaderId: USER_ID,
      fileName: 'photo.png',
      contentType: 'image/png',
      size: FILE_BODY.length,
      downloadUrl: `/api/media/${MEDIA_ID}/download`,
    });
    expect(objectStorageService.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: FILE_BODY,
        contentType: 'image/png',
      })
    );
    expect(MediaModel.create).toHaveBeenCalled();
    expect(publishRoomEvent).toHaveBeenCalledWith(expect.objectContaining({
      roomId: ROOM_ID,
      eventName: 'media:shared',
    }));

    const listing = await request(app)
      .get(`/api/media/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${recipientToken}`);
    expect(listing.status).toBe(200);
    expect(listing.body.media).toHaveLength(1);

    const download = await request(app)
      .get(`/api/media/${MEDIA_ID}/download`)
      .set('Authorization', `Bearer ${recipientToken}`)
      .buffer(true);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/^image\/png/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.body).toEqual(FILE_BODY);
  });

  it('rejects uploads from users who are not room members', async () => {
    RoomModel.getMemberRole.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/media/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .set('X-File-Name', 'photo.png')
      .send(FILE_BODY);

    expect(response.status).toBe(403);
    expect(objectStorageService.putObject).not.toHaveBeenCalled();
  });

  it('enforces the configured upload size limit', async () => {
    const previousLimit = config.media.maxFileSizeBytes;
    config.media.maxFileSizeBytes = 4;

    try {
      const response = await request(app)
        .post(`/api/media/rooms/${ROOM_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/png')
        .set('X-File-Name', 'photo.png')
        .send(FILE_BODY);

      expect(response.status).toBe(413);
      expect(response.body.code).toBe('FILE_TOO_LARGE');
      expect(objectStorageService.putObject).not.toHaveBeenCalled();
    } finally {
      config.media.maxFileSizeBytes = previousLimit;
    }
  });

  it('rejects uploads with disallowed file extensions', async () => {
    const response = await request(app)
      .post(`/api/media/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/x-msdownload')
      .set('X-File-Name', 'malware.exe')
      .send(Buffer.from('test executable'));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(response.body.message).toBeTruthy();
    expect(objectStorageService.putObject).not.toHaveBeenCalled();
    expect(MediaModel.create).not.toHaveBeenCalled();
  });

  it('rejects uploads when MIME type does not match the file extension', async () => {
    const response = await request(app)
      .post(`/api/media/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/jpeg')
      .set('X-File-Name', 'photo.png')
      .send(FILE_BODY);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(response.body.message).toBeTruthy();
    expect(objectStorageService.putObject).not.toHaveBeenCalled();
    expect(MediaModel.create).not.toHaveBeenCalled();
  });

  it('returns a clear JSON error when Express rejects an oversized request', async () => {
    const previousLimit = config.media.maxFileSizeBytes;
    config.media.maxFileSizeBytes = 4;

    try {
      const response = await request(app)
        .post(`/api/media/rooms/${ROOM_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'image/png')
        .set('X-File-Name', 'photo.png')
        .send(Buffer.alloc(1024, 'a'));

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the configured upload size limit',
      });
      expect(objectStorageService.putObject).not.toHaveBeenCalled();
      expect(MediaModel.create).not.toHaveBeenCalled();
    } finally {
      config.media.maxFileSizeBytes = previousLimit;
    }
  });
});
